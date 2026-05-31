package sync

import (
	"context"
	"log"
	"sync"

	"github.com/nats-io/nats.go"

	"config-sync/internal/store"
	"config-sync/internal/webhook"
)

type ConfigChangeListener func(key string, entry *store.ConfigEntry)

type ConflictListener func(conflict *store.ConflictEntry)

type SyncManager struct {
	store            *store.NATSStore
	webhook          *webhook.WebhookNotifier
	listeners        []ConfigChangeListener
	conflictListeners []ConflictListener
	mu               sync.RWMutex
	watcher          nats.KeyWatcher
	ctx              context.Context
	cancel           context.CancelFunc
	localCache       map[string]*store.ConfigEntry
	cacheMu          sync.RWMutex
}

func NewSyncManager(ctx context.Context, s *store.NATSStore, w *webhook.WebhookNotifier) *SyncManager {
	childCtx, cancel := context.WithCancel(ctx)

	return &SyncManager{
		store:      s,
		webhook:    w,
		ctx:        childCtx,
		cancel:     cancel,
		localCache: make(map[string]*store.ConfigEntry),
	}
}

func (m *SyncManager) AddListener(listener ConfigChangeListener) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.listeners = append(m.listeners, listener)
}

func (m *SyncManager) AddConflictListener(listener ConflictListener) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.conflictListeners = append(m.conflictListeners, listener)
}

func (m *SyncManager) notifyListeners(key string, entry *store.ConfigEntry) {
	m.mu.RLock()
	listeners := make([]ConfigChangeListener, len(m.listeners))
	copy(listeners, m.listeners)
	m.mu.RUnlock()

	for _, listener := range listeners {
		go listener(key, entry)
	}
}

func (m *SyncManager) notifyConflictListeners(conflict *store.ConflictEntry) {
	m.mu.RLock()
	listeners := make([]ConflictListener, len(m.conflictListeners))
	copy(listeners, m.conflictListeners)
	m.mu.RUnlock()

	for _, listener := range listeners {
		go listener(conflict)
	}
}

func (m *SyncManager) updateLocalCache(entry *store.ConfigEntry) {
	m.cacheMu.Lock()
	defer m.cacheMu.Unlock()

	if entry == nil {
		return
	}

	existing, exists := m.localCache[entry.Key]
	if !exists || entry.Version > existing.Version {
		m.localCache[entry.Key] = entry
	}
}

func (m *SyncManager) getLocalCache(key string) *store.ConfigEntry {
	m.cacheMu.RLock()
	defer m.cacheMu.RUnlock()

	if entry, ok := m.localCache[key]; ok {
		cached := *entry
		return &cached
	}
	return nil
}

func (m *SyncManager) GetLocalCache() map[string]*store.ConfigEntry {
	m.cacheMu.RLock()
	defer m.cacheMu.RUnlock()

	result := make(map[string]*store.ConfigEntry, len(m.localCache))
	for k, v := range m.localCache {
		cached := *v
		result[k] = &cached
	}
	return result
}

func (m *SyncManager) StartWatching(subject string) error {
	watcher, err := m.store.Watch(subject, func(key string, entry *store.ConfigEntry) {
		localEntry := m.getLocalCache(key)

		if entry != nil && localEntry != nil {
			if localEntry.Version > entry.Version {
				log.Printf("WARNING: Split-brain detected for key '%s': local version %d > remote version %d", key, localEntry.Version, entry.Version)

				conflict := &store.ConflictEntry{
					Key:           key,
					Type:          store.ConflictTypeUpdate,
					LocalVersion:  localEntry.Version,
					RemoteVersion: entry.Version,
					LocalEntry:    localEntry,
					RemoteEntry:   entry,
					CreatedAt:     entry.UpdatedAt,
				}

				resolvedEntry, resolveErr := m.store.DetectAndResolveConflict(key, localEntry, entry)
				if resolveErr != nil {
					log.Printf("ERROR: Conflict resolution failed for key '%s': %v", key, resolveErr)
					m.notifyConflictListeners(conflict)
					return
				}

				if resolvedEntry != nil && resolvedEntry.Version == localEntry.Version {
					log.Printf("INFO: Conflict resolved in favor of local version %d for key '%s'", localEntry.Version, key)
					_, err := m.store.PutWithVersion(key, localEntry.Value, "conflict-resolution", entry.Version)
					if err != nil {
						log.Printf("ERROR: Failed to push local version: %v", err)
					}
				}
			}
		}

		if entry != nil {
			m.updateLocalCache(entry)
		} else {
			m.cacheMu.Lock()
			delete(m.localCache, key)
			m.cacheMu.Unlock()
		}

		m.notifyListeners(key, entry)

		if m.webhook != nil {
			event := "config.updated"
			if entry == nil {
				event = "config.deleted"
			}
			go m.webhook.Notify(m.ctx, event, key, entry)
		}
	})

	if err != nil {
		return err
	}

	m.watcher = watcher

	configs, err := m.store.GetAll()
	if err != nil {
		log.Printf("WARNING: Failed to load initial configs: %v", err)
	} else {
		for i := range configs {
			m.updateLocalCache(&configs[i])
		}
		log.Printf("Loaded %d configs into local cache", len(configs))
	}

	return nil
}

func (m *SyncManager) Stop() {
	m.cancel()
	if m.watcher != nil {
		m.watcher.Stop()
	}
}

func (m *SyncManager) GetAllConfigs() ([]store.ConfigEntry, error) {
	return m.store.GetAll()
}

func (m *SyncManager) SetMergeStrategy(strategy store.MergeStrategy) {
	m.store.SetMergeStrategy(strategy)
}

func (m *SyncManager) GetConflicts() []store.ConflictEntry {
	return m.store.GetConflicts()
}

func (m *SyncManager) ResolveConflict(key string, chooseLocal bool, updatedBy string) (uint64, error) {
	revision, err := m.store.ResolveConflict(key, chooseLocal, updatedBy)
	if err != nil {
		return 0, err
	}

	m.cacheMu.Lock()
	delete(m.localCache, key)
	m.cacheMu.Unlock()

	return revision, nil
}

func (m *SyncManager) UpdateConfig(key string, value []byte, updatedBy string) (uint64, error) {
	localEntry := m.getLocalCache(key)

	var expectedRevision uint64
	if localEntry != nil {
		expectedRevision = localEntry.Version
	}

	revision, err := m.store.PutWithVersion(key, value, updatedBy, expectedRevision)
	if err != nil {
		return 0, err
	}

	sensitive := false
	encrypted := false
	if localEntry != nil {
		sensitive = localEntry.Sensitive
		encrypted = localEntry.Encrypted
	}

	m.cacheMu.Lock()
	m.localCache[key] = &store.ConfigEntry{
		Key:       key,
		Value:     value,
		Version:   revision,
		UpdatedBy: updatedBy,
		Sensitive: sensitive,
		Encrypted: encrypted,
	}
	m.cacheMu.Unlock()

	return revision, nil
}
