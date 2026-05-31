package store

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/nats-io/nats.go"

	"config-sync/internal/crypto"
)

const (
	MetaEncrypted   = "x-config-encrypted"
	MetaKeyID       = "x-config-key-id"
	MetaSensitive   = "x-config-sensitive"
)

type ConfigEntry struct {
	Key       string            `json:"key"`
	Value     json.RawMessage   `json:"value"`
	Version   uint64            `json:"version"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
	UpdatedBy string            `json:"updated_by"`
	Meta      map[string]string `json:"meta,omitempty"`
	Encrypted bool              `json:"encrypted,omitempty"`
	Sensitive bool              `json:"sensitive,omitempty"`
}

type HistoryEntry struct {
	Key       string          `json:"key"`
	Value     json.RawMessage `json:"value"`
	Version   uint64          `json:"version"`
	Operation string          `json:"operation"`
	Timestamp time.Time       `json:"timestamp"`
	UpdatedBy string          `json:"updated_by"`
	Encrypted bool            `json:"encrypted,omitempty"`
}

type ConflictType string

const (
	ConflictTypeUpdate   ConflictType = "update_conflict"
	ConflictTypeDelete   ConflictType = "delete_conflict"
	ConflictTypeRollback ConflictType = "rollback_conflict"
)

type ConflictEntry struct {
	Key           string       `json:"key"`
	Type          ConflictType `json:"type"`
	LocalVersion  uint64       `json:"local_version"`
	RemoteVersion uint64       `json:"remote_version"`
	LocalEntry    *ConfigEntry `json:"local_entry,omitempty"`
	RemoteEntry   *ConfigEntry `json:"remote_entry,omitempty"`
	Resolved      bool         `json:"resolved"`
	ResolvedAt    *time.Time   `json:"resolved_at,omitempty"`
	ResolvedBy    string       `json:"resolved_by,omitempty"`
	ResolvedTo    uint64       `json:"resolved_to,omitempty"`
	CreatedAt     time.Time    `json:"created_at"`
}

type MergeStrategy string

const (
	MergeStrategyLastWriteWins MergeStrategy = "last_write_wins"
	MergeStrategyRemoteWins    MergeStrategy = "remote_wins"
	MergeStrategyLocalWins     MergeStrategy = "local_wins"
	MergeStrategyManual        MergeStrategy = "manual"
)

type ConflictHandler func(conflict *ConflictEntry) (*ConfigEntry, error)

type NATSStore struct {
	nc              *nats.Conn
	js              nats.JetStreamContext
	kv              nats.KeyValue
	ctx             context.Context
	conflicts       map[string]*ConflictEntry
	conflictsMu     sync.RWMutex
	mergeStrategy   MergeStrategy
	conflictHandler ConflictHandler
	encryptor       crypto.Encryptor
	encryptByDefault bool
}

func NewNATSStore(ctx context.Context, natsURL, bucket string) (*NATSStore, error) {
	nc, err := nats.Connect(natsURL)
	if err != nil {
		return nil, fmt.Errorf("connect nats: %w", err)
	}

	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("create jetstream context: %w", err)
	}

	kv, err := js.KeyValue(bucket)
	if err != nil {
		kv, err = js.CreateKeyValue(&nats.KeyValueConfig{
			Bucket:       bucket,
			Description:  "Distributed config sync store",
			MaxValueSize: 1 * 1024 * 1024,
			History:      100,
			TTL:          0,
			MaxBytes:     100 * 1024 * 1024,
			Storage:      nats.FileStorage,
			Replicas:     1,
		})
		if err != nil {
			nc.Close()
			return nil, fmt.Errorf("create kv bucket: %w", err)
		}
	}

	return &NATSStore{
		nc:              nc,
		js:              js,
		kv:              kv,
		ctx:             ctx,
		conflicts:       make(map[string]*ConflictEntry),
		mergeStrategy:   MergeStrategyLastWriteWins,
	}, nil
}

func NewNATSStoreWithEncryption(ctx context.Context, natsURL, bucket string, encryptor crypto.Encryptor, encryptByDefault bool) (*NATSStore, error) {
	store, err := NewNATSStore(ctx, natsURL, bucket)
	if err != nil {
		return nil, err
	}

	store.encryptor = encryptor
	store.encryptByDefault = encryptByDefault
	return store, nil
}

func (s *NATSStore) SetMergeStrategy(strategy MergeStrategy) {
	s.conflictsMu.Lock()
	defer s.conflictsMu.Unlock()
	s.mergeStrategy = strategy
}

func (s *NATSStore) SetConflictHandler(handler ConflictHandler) {
	s.conflictsMu.Lock()
	defer s.conflictsMu.Unlock()
	s.conflictHandler = handler
}

func (s *NATSStore) SetEncryptor(encryptor crypto.Encryptor) {
	s.encryptor = encryptor
}

func (s *NATSStore) Close() {
	if s.nc != nil {
		s.nc.Close()
	}
}

func (s *NATSStore) Put(key string, value []byte, updatedBy string) (uint64, error) {
	return s.PutWithVersion(key, value, updatedBy, 0)
}

func (s *NATSStore) PutWithVersion(key string, value []byte, updatedBy string, expectedRevision uint64) (uint64, error) {
	existing, _ := s.kv.Get(key)
	sensitive := false
	if existing != nil {
		var existingEntry ConfigEntry
		if err := json.Unmarshal(existing.Value(), &existingEntry); err == nil {
			if existingEntry.Meta != nil {
				if v, ok := existingEntry.Meta[MetaSensitive]; ok && v == "true" {
					sensitive = true
				}
			}
			if existingEntry.Sensitive {
				sensitive = true
			}
		}
	}
	return s.PutWithOptions(key, value, updatedBy, expectedRevision, sensitive)
}

func (s *NATSStore) PutSensitive(key string, value []byte, updatedBy string) (uint64, error) {
	return s.PutWithOptions(key, value, updatedBy, 0, true)
}

func (s *NATSStore) PutWithOptions(key string, value []byte, updatedBy string, expectedRevision uint64, sensitive bool) (uint64, error) {
	now := time.Now().UTC()

	var existing *ConfigEntry
	existingEntry, err := s.kv.Get(key)
	if err == nil && existingEntry != nil {
		if err := json.Unmarshal(existingEntry.Value(), &existing); err != nil {
			existing = nil
		}
	}

	entry := ConfigEntry{
		Key:       key,
		Value:     value,
		CreatedAt: now,
		UpdatedAt: now,
		UpdatedBy: updatedBy,
		Meta:      make(map[string]string),
		Encrypted: false,
		Sensitive: sensitive,
	}

	if existing != nil {
		entry.CreatedAt = existing.CreatedAt
		if existing.Meta != nil {
			for k, v := range existing.Meta {
				entry.Meta[k] = v
			}
		}
		sensitive = sensitive || existing.Sensitive
		entry.Sensitive = sensitive
	}

	shouldEncrypt := sensitive
	if !shouldEncrypt && existing != nil {
		if existing.Meta != nil {
			if v, ok := existing.Meta[MetaSensitive]; ok && v == "true" {
				shouldEncrypt = true
			}
		}
	}
	if !shouldEncrypt && s.encryptByDefault {
		shouldEncrypt = true
	}

	if shouldEncrypt {
		entry.Sensitive = true
		entry.Meta[MetaSensitive] = "true"
	}

	if shouldEncrypt && s.encryptor != nil {
		encrypted, encErr := s.encryptor.Encrypt(value, key)
		if encErr != nil {
			return 0, fmt.Errorf("encrypt value: %w", encErr)
		}
		entry.Value = json.RawMessage(fmt.Sprintf(`"%s"`, encrypted))
		entry.Encrypted = true
		entry.Meta[MetaEncrypted] = "true"
		entry.Meta[MetaKeyID] = key
	}

	data, err := json.Marshal(entry)
	if err != nil {
		return 0, fmt.Errorf("marshal entry: %w", err)
	}

	var revision uint64
	if expectedRevision > 0 {
		revision, err = s.kv.Update(key, data, expectedRevision)
		if err != nil {
			return 0, fmt.Errorf("update kv with version %d: %w", expectedRevision, err)
		}
	} else {
		revision, err = s.kv.Put(key, data)
		if err != nil {
			return 0, fmt.Errorf("put kv: %w", err)
		}
	}

	return revision, nil
}

func (s *NATSStore) Get(key string) (*ConfigEntry, error) {
	entry, err := s.kv.Get(key)
	if err != nil {
		return nil, fmt.Errorf("get kv: %w", err)
	}

	var configEntry ConfigEntry
	if err := json.Unmarshal(entry.Value(), &configEntry); err != nil {
		return nil, fmt.Errorf("unmarshal entry: %w", err)
	}

	configEntry.Version = entry.Revision()

	if configEntry.Encrypted && s.encryptor != nil {
		if encryptedVal, ok := configEntry.Meta[MetaEncrypted]; ok && encryptedVal == "true" {
			var encryptedStr string
			if err := json.Unmarshal(configEntry.Value, &encryptedStr); err == nil {
				decrypted, decErr := s.encryptor.Decrypt(encryptedStr, key)
				if decErr == nil {
					configEntry.Value = json.RawMessage(decrypted)
					configEntry.Encrypted = false
				}
			}
		}
	}

	return &configEntry, nil
}

func (s *NATSStore) GetAll() ([]ConfigEntry, error) {
	keys, err := s.kv.Keys()
	if err != nil {
		if err == nats.ErrNoKeysFound {
			return []ConfigEntry{}, nil
		}
		return nil, fmt.Errorf("list keys: %w", err)
	}

	var entries []ConfigEntry
	for _, key := range keys {
		entry, err := s.Get(key)
		if err != nil {
			continue
		}
		entries = append(entries, *entry)
	}

	return entries, nil
}

func (s *NATSStore) Delete(key string) error {
	if err := s.kv.Delete(key); err != nil {
		return fmt.Errorf("delete kv: %w", err)
	}
	return nil
}

func (s *NATSStore) History(key string) ([]HistoryEntry, error) {
	history, err := s.kv.History(key)
	if err != nil {
		return nil, fmt.Errorf("get history: %w", err)
	}

	var entries []HistoryEntry
	for _, h := range history {
		var configEntry ConfigEntry
		if err := json.Unmarshal(h.Value(), &configEntry); err != nil {
			continue
		}

		value := configEntry.Value
		encrypted := configEntry.Encrypted

		if encrypted && s.encryptor != nil {
			if encryptedVal, ok := configEntry.Meta[MetaEncrypted]; ok && encryptedVal == "true" {
				var encryptedStr string
				if err := json.Unmarshal(configEntry.Value, &encryptedStr); err == nil {
					decrypted, decErr := s.encryptor.Decrypt(encryptedStr, key)
					if decErr == nil {
						value = json.RawMessage(decrypted)
						encrypted = false
					}
				}
			}
		}

		op := "update"
		if h.Operation() == nats.KeyValueDelete {
			op = "delete"
		} else if h.Operation() == nats.KeyValuePurge {
			op = "purge"
		}

		entries = append(entries, HistoryEntry{
			Key:       key,
			Value:     value,
			Version:   h.Revision(),
			Operation: op,
			Timestamp: h.Created(),
			UpdatedBy: configEntry.UpdatedBy,
			Encrypted: encrypted,
		})
	}

	return entries, nil
}

func (s *NATSStore) GetVersion(key string, revision uint64) (*ConfigEntry, error) {
	history, err := s.kv.History(key)
	if err != nil {
		return nil, fmt.Errorf("get history: %w", err)
	}

	for _, h := range history {
		if h.Revision() == revision {
			var configEntry ConfigEntry
			if err := json.Unmarshal(h.Value(), &configEntry); err != nil {
				return nil, fmt.Errorf("unmarshal entry: %w", err)
			}
			configEntry.Version = h.Revision()

			if configEntry.Encrypted && s.encryptor != nil {
				if encryptedVal, ok := configEntry.Meta[MetaEncrypted]; ok && encryptedVal == "true" {
					var encryptedStr string
					if err := json.Unmarshal(configEntry.Value, &encryptedStr); err == nil {
						decrypted, decErr := s.encryptor.Decrypt(encryptedStr, key)
						if decErr == nil {
							configEntry.Value = json.RawMessage(decrypted)
							configEntry.Encrypted = false
						}
					}
				}
			}

			return &configEntry, nil
		}
	}

	return nil, fmt.Errorf("revision %d not found", revision)
}

func (s *NATSStore) Rollback(key string, revision uint64, updatedBy string) (uint64, error) {
	historyEntry, err := s.GetVersion(key, revision)
	if err != nil {
		return 0, fmt.Errorf("get version: %w", err)
	}

	currentEntry, err := s.Get(key)
	if err != nil {
		return 0, fmt.Errorf("get current version: %w", err)
	}

	now := time.Now().UTC()
	rollbackEntry := ConfigEntry{
		Key:       key,
		Value:     historyEntry.Value,
		CreatedAt: historyEntry.CreatedAt,
		UpdatedAt: now,
		UpdatedBy: updatedBy,
		Meta:      historyEntry.Meta,
		Sensitive: historyEntry.Sensitive,
	}

	if rollbackEntry.Meta == nil {
		rollbackEntry.Meta = make(map[string]string)
	}
	rollbackEntry.Meta["rolled_back_from"] = fmt.Sprintf("%d", revision)
	rollbackEntry.Meta["previous_version"] = fmt.Sprintf("%d", currentEntry.Version)

	if rollbackEntry.Sensitive {
		rollbackEntry.Meta[MetaSensitive] = "true"
	}

	if rollbackEntry.Sensitive && s.encryptor != nil {
		encrypted, encErr := s.encryptor.Encrypt(historyEntry.Value, key)
		if encErr != nil {
			return 0, fmt.Errorf("encrypt rollback value: %w", encErr)
		}
		rollbackEntry.Value = json.RawMessage(fmt.Sprintf(`"%s"`, encrypted))
		rollbackEntry.Encrypted = true
		rollbackEntry.Meta[MetaEncrypted] = "true"
		rollbackEntry.Meta[MetaKeyID] = key
	}

	data, err := json.Marshal(rollbackEntry)
	if err != nil {
		return 0, fmt.Errorf("marshal rollback entry: %w", err)
	}

	newRevision, err := s.kv.Update(key, data, currentEntry.Version)
	if err != nil {
		return 0, fmt.Errorf("rollback update: %w", err)
	}

	return newRevision, nil
}

func (s *NATSStore) DetectAndResolveConflict(key string, localEntry *ConfigEntry, remoteEntry *ConfigEntry) (*ConfigEntry, error) {
	if localEntry == nil && remoteEntry == nil {
		return nil, nil
	}

	if localEntry == nil && remoteEntry != nil {
		return remoteEntry, nil
	}

	if localEntry != nil && remoteEntry == nil {
		return localEntry, nil
	}

	if localEntry.Version == remoteEntry.Version {
		return remoteEntry, nil
	}

	if localEntry.UpdatedAt.Equal(remoteEntry.UpdatedAt) {
		if localEntry.Version > remoteEntry.Version {
			return localEntry, nil
		}
		return remoteEntry, nil
	}

	s.conflictsMu.Lock()
	strategy := s.mergeStrategy
	handler := s.conflictHandler
	s.conflictsMu.Unlock()

	if handler != nil {
		conflict := &ConflictEntry{
			Key:           key,
			Type:          ConflictTypeUpdate,
			LocalVersion:  localEntry.Version,
			RemoteVersion: remoteEntry.Version,
			LocalEntry:    localEntry,
			RemoteEntry:   remoteEntry,
			CreatedAt:     time.Now().UTC(),
		}

		resolved, err := handler(conflict)
		if err != nil {
			return nil, fmt.Errorf("conflict handler error: %w", err)
		}
		if resolved != nil {
			return resolved, nil
		}
	}

	switch strategy {
	case MergeStrategyLastWriteWins:
		if localEntry.UpdatedAt.After(remoteEntry.UpdatedAt) {
			return localEntry, nil
		}
		return remoteEntry, nil

	case MergeStrategyLocalWins:
		return localEntry, nil

	case MergeStrategyRemoteWins:
		return remoteEntry, nil

	case MergeStrategyManual:
		s.recordConflict(key, localEntry, remoteEntry)
		return remoteEntry, nil

	default:
		if localEntry.UpdatedAt.After(remoteEntry.UpdatedAt) {
			return localEntry, nil
		}
		return remoteEntry, nil
	}
}

func (s *NATSStore) recordConflict(key string, localEntry, remoteEntry *ConfigEntry) {
	s.conflictsMu.Lock()
	defer s.conflictsMu.Unlock()

	s.conflicts[key] = &ConflictEntry{
		Key:           key,
		Type:          ConflictTypeUpdate,
		LocalVersion:  localEntry.Version,
		RemoteVersion: remoteEntry.Version,
		LocalEntry:    localEntry,
		RemoteEntry:   remoteEntry,
		CreatedAt:     time.Now().UTC(),
	}
}

func (s *NATSStore) GetConflicts() []ConflictEntry {
	s.conflictsMu.RLock()
	defer s.conflictsMu.RUnlock()

	conflicts := make([]ConflictEntry, 0, len(s.conflicts))
	for _, c := range s.conflicts {
		conflicts = append(conflicts, *c)
	}
	return conflicts
}

func (s *NATSStore) ResolveConflict(key string, chooseLocal bool, updatedBy string) (uint64, error) {
	s.conflictsMu.Lock()
	conflict, exists := s.conflicts[key]
	if !exists {
		s.conflictsMu.Unlock()
		return 0, fmt.Errorf("no conflict for key '%s'", key)
	}
	s.conflictsMu.Unlock()

	var chosenEntry *ConfigEntry
	if chooseLocal {
		chosenEntry = conflict.LocalEntry
	} else {
		chosenEntry = conflict.RemoteEntry
	}

	if chosenEntry == nil {
		return 0, fmt.Errorf("chosen entry is nil")
	}

	currentEntry, err := s.Get(key)
	if err != nil {
		return 0, fmt.Errorf("get current entry: %w", err)
	}

	revision, err := s.PutWithVersion(key, chosenEntry.Value, updatedBy, currentEntry.Version)
	if err != nil {
		return 0, fmt.Errorf("resolve conflict: %w", err)
	}

	s.conflictsMu.Lock()
	now := time.Now().UTC()
	if c, ok := s.conflicts[key]; ok {
		c.Resolved = true
		c.ResolvedAt = &now
		c.ResolvedBy = updatedBy
		c.ResolvedTo = revision
	}
	s.conflictsMu.Unlock()

	return revision, nil
}

func (s *NATSStore) ClearConflict(key string) {
	s.conflictsMu.Lock()
	defer s.conflictsMu.Unlock()
	delete(s.conflicts, key)
}

func (s *NATSStore) Watch(subject string, handler func(key string, entry *ConfigEntry)) (nats.KeyWatcher, error) {
	watcher, err := s.kv.Watch(subject)
	if err != nil {
		return nil, fmt.Errorf("create watcher: %w", err)
	}

	go func() {
		for entry := range watcher.Updates() {
			if entry == nil {
				continue
			}

			if entry.Operation() == nats.KeyValueDelete || entry.Operation() == nats.KeyValuePurge {
				handler(entry.Key(), nil)
				continue
			}

			var configEntry ConfigEntry
			if err := json.Unmarshal(entry.Value(), &configEntry); err != nil {
				continue
			}
			configEntry.Version = entry.Revision()

			if configEntry.Encrypted && s.encryptor != nil {
				if encryptedVal, ok := configEntry.Meta[MetaEncrypted]; ok && encryptedVal == "true" {
					var encryptedStr string
					if err := json.Unmarshal(configEntry.Value, &encryptedStr); err == nil {
						decrypted, decErr := s.encryptor.Decrypt(encryptedStr, entry.Key())
						if decErr == nil {
							configEntry.Value = json.RawMessage(decrypted)
							configEntry.Encrypted = false
						}
					}
				}
			}

			handler(entry.Key(), &configEntry)
		}
	}()

	return watcher, nil
}
