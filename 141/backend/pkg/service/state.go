package service

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/dapr-wasm-state/pkg/monitor"
	"github.com/dapr-wasm-state/pkg/store"
	"github.com/dapr-wasm-state/pkg/wasm"
)

type StateService struct {
	store         store.StateStore
	pluginManager *wasm.PluginManager
	metrics       *monitor.Metrics
	activePlugin  string

	mu              sync.RWMutex
	wasmSemaphore   chan struct{}
	maxConcurrency  int
	singleTimeout   time.Duration
	bulkTimeout     time.Duration
}

type StateServiceConfig struct {
	MaxConcurrency int
	SingleTimeout  time.Duration
	BulkTimeout    time.Duration
}

func NewStateService(s store.StateStore, pm *wasm.PluginManager) *StateService {
	return NewStateServiceWithConfig(s, pm, StateServiceConfig{
		MaxConcurrency: 10,
		SingleTimeout:  1 * time.Second,
		BulkTimeout:    5 * time.Second,
	})
}

func NewStateServiceWithConfig(s store.StateStore, pm *wasm.PluginManager, config StateServiceConfig) *StateService {
	if config.MaxConcurrency <= 0 {
		config.MaxConcurrency = 10
	}
	if config.SingleTimeout <= 0 {
		config.SingleTimeout = 1 * time.Second
	}
	if config.BulkTimeout <= 0 {
		config.BulkTimeout = 5 * time.Second
	}

	return &StateService{
		store:           s,
		pluginManager:   pm,
		metrics:         monitor.GetMetrics(),
		wasmSemaphore:   make(chan struct{}, config.MaxConcurrency),
		maxConcurrency:  config.MaxConcurrency,
		singleTimeout:   config.SingleTimeout,
		bulkTimeout:     config.BulkTimeout,
	}
}

func (s *StateService) SetActivePlugin(pluginID string) {
	s.activePlugin = pluginID
}

func (s *StateService) GetActivePlugin() string {
	return s.activePlugin
}

func (s *StateService) Get(ctx context.Context, key string) ([]byte, error) {
	start := time.Now()
	success := true
	defer func() {
		s.metrics.RecordOperation(monitor.OpGet, time.Since(start), success)
	}()

	processedKey := key
	pluginHooks, err := s.getHooks()
	if err != nil {
		success = false
		return nil, err
	}

	if pluginHooks != nil && pluginHooks.BeforeGet != nil {
		beforeCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
		defer cancel()
		processedKey, err = pluginHooks.BeforeGet(key)
		_ = beforeCtx
		if err != nil {
			success = false
			return nil, err
		}
	}

	value, err := s.store.Get(ctx, processedKey)
	if err != nil {
		success = false
		return nil, err
	}

	if pluginHooks != nil && pluginHooks.AfterGet != nil {
		afterCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
		defer cancel()
		value, err = pluginHooks.AfterGet(key, value)
		_ = afterCtx
		if err != nil {
			success = false
			return nil, err
		}
	}

	return value, nil
}

func (s *StateService) Set(ctx context.Context, key string, value []byte) error {
	start := time.Now()
	success := true
	defer func() {
		s.metrics.RecordOperation(monitor.OpSet, time.Since(start), success)
	}()

	processedKey := key
	processedValue := value

	pluginHooks, err := s.getHooks()
	if err != nil {
		success = false
		return err
	}

	if pluginHooks != nil && pluginHooks.BeforeSet != nil {
		beforeCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
		defer cancel()
		processedKey, processedValue, err = pluginHooks.BeforeSet(key, value)
		_ = beforeCtx
		if err != nil {
			success = false
			return err
		}
	}

	err = s.store.Set(ctx, processedKey, processedValue)
	if err != nil {
		success = false
		return err
	}

	if pluginHooks != nil && pluginHooks.AfterSet != nil {
		afterCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
		defer cancel()
		if err = pluginHooks.AfterSet(key, value); err != nil {
			cancel()
			success = false
			return err
		}
		cancel()
		_ = afterCtx
	}

	return nil
}

func (s *StateService) Delete(ctx context.Context, key string) error {
	start := time.Now()
	success := true
	defer func() {
		s.metrics.RecordOperation(monitor.OpDelete, time.Since(start), success)
	}()

	processedKey := key

	pluginHooks, err := s.getHooks()
	if err != nil {
		success = false
		return err
	}

	if pluginHooks != nil && pluginHooks.BeforeDelete != nil {
		beforeCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
		defer cancel()
		processedKey, err = pluginHooks.BeforeDelete(key)
		_ = beforeCtx
		if err != nil {
			success = false
			return err
		}
	}

	err = s.store.Delete(ctx, processedKey)
	if err != nil {
		success = false
		return err
	}

	if pluginHooks != nil && pluginHooks.AfterDelete != nil {
		afterCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
		defer cancel()
		if err = pluginHooks.AfterDelete(key); err != nil {
			cancel()
			success = false
			return err
		}
		cancel()
		_ = afterCtx
	}

	return nil
}

func (s *StateService) BulkGet(ctx context.Context, keys []string) (map[string][]byte, error) {
	start := time.Now()
	success := true
	defer func() {
		s.metrics.RecordOperation(monitor.OpBulkGet, time.Since(start), success)
	}()

	if len(keys) == 0 {
		return make(map[string][]byte), nil
	}

	pluginHooks, err := s.getHooks()
	if err != nil {
		success = false
		return nil, err
	}

	processedKeys := keys
	keyMap := make(map[string]string)

	if pluginHooks != nil {
		if pluginHooks.BulkBeforeGet != nil {
			beforeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()

			var bulkErr error
			processedKeys, bulkErr = pluginHooks.BulkBeforeGet(keys)
			if bulkErr != nil {
				success = false
				return nil, bulkErr
			}

			for i, key := range keys {
				keyMap[processedKeys[i]] = key
			}
			_ = beforeCtx
		} else if pluginHooks.BeforeGet != nil {
			processedKeys = make([]string, len(keys))
			for i, key := range keys {
				itemCtx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
				processedKey, hookErr := pluginHooks.BeforeGet(key)
				cancel()

				if hookErr != nil {
					success = false
					return nil, hookErr
				}
				processedKeys[i] = processedKey
				keyMap[processedKey] = key
				_ = itemCtx
			}
		}
	}

	result, err := s.store.BulkGet(ctx, processedKeys)
	if err != nil {
		success = false
		return nil, err
	}

	if pluginHooks != nil {
		if pluginHooks.BulkAfterGet != nil {
			afterCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()

			var bulkErr error
			result, bulkErr = pluginHooks.BulkAfterGet(keys, result)
			if bulkErr != nil {
				success = false
				return nil, bulkErr
			}
			_ = afterCtx
		} else if pluginHooks.AfterGet != nil {
			finalResult := make(map[string][]byte)
			for processedKey, value := range result {
				originalKey := keyMap[processedKey]
				itemCtx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
				processedValue, hookErr := pluginHooks.AfterGet(originalKey, value)
				cancel()

				if hookErr != nil {
					success = false
					return nil, hookErr
				}
				finalResult[originalKey] = processedValue
				_ = itemCtx
			}
			result = finalResult
		}
	}

	return result, nil
}

func (s *StateService) BulkSet(ctx context.Context, items map[string][]byte) error {
	start := time.Now()
	success := true
	defer func() {
		s.metrics.RecordOperation(monitor.OpBulkSet, time.Since(start), success)
	}()

	if len(items) == 0 {
		return nil
	}

	pluginHooks, err := s.getHooks()
	if err != nil {
		success = false
		return err
	}

	processedItems := items

	if pluginHooks != nil {
		if pluginHooks.BulkBeforeSet != nil {
			beforeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()

			var bulkErr error
			processedItems, bulkErr = pluginHooks.BulkBeforeSet(items)
			if bulkErr != nil {
				success = false
				return bulkErr
			}
			_ = beforeCtx
		} else if pluginHooks.BeforeSet != nil {
			processedItems = make(map[string][]byte)
			for key, value := range items {
				itemCtx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
				processedKey, processedValue, hookErr := pluginHooks.BeforeSet(key, value)
				cancel()

				if hookErr != nil {
					success = false
					return hookErr
				}
				processedItems[processedKey] = processedValue
				_ = itemCtx
			}
		}
	}

	err = s.store.BulkSet(ctx, processedItems)
	if err != nil {
		success = false
		return err
	}

	if pluginHooks != nil {
		if pluginHooks.BulkAfterSet != nil {
			afterCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()

			if bulkErr := pluginHooks.BulkAfterSet(items); bulkErr != nil {
				success = false
				return bulkErr
			}
			_ = afterCtx
		} else if pluginHooks.AfterSet != nil {
			for key, value := range items {
				itemCtx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
				if hookErr := pluginHooks.AfterSet(key, value); hookErr != nil {
					cancel()
					success = false
					return hookErr
				}
				cancel()
				_ = itemCtx
			}
		}
	}

	return nil
}

func (s *StateService) BulkDelete(ctx context.Context, keys []string) error {
	start := time.Now()
	success := true
	defer func() {
		s.metrics.RecordOperation(monitor.OpBulkDelete, time.Since(start), success)
	}()

	if len(keys) == 0 {
		return nil
	}

	pluginHooks, err := s.getHooks()
	if err != nil {
		success = false
		return err
	}

	processedKeys := keys

	if pluginHooks != nil {
		if pluginHooks.BulkBeforeDelete != nil {
			beforeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()

			var bulkErr error
			processedKeys, bulkErr = pluginHooks.BulkBeforeDelete(keys)
			if bulkErr != nil {
				success = false
				return bulkErr
			}
			_ = beforeCtx
		} else if pluginHooks.BeforeDelete != nil {
			processedKeys = make([]string, len(keys))
			for i, key := range keys {
				itemCtx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
				processedKey, hookErr := pluginHooks.BeforeDelete(key)
				cancel()

				if hookErr != nil {
					success = false
					return hookErr
				}
				processedKeys[i] = processedKey
				_ = itemCtx
			}
		}
	}

	err = s.store.BulkDelete(ctx, processedKeys)
	if err != nil {
		success = false
		return err
	}

	if pluginHooks != nil {
		if pluginHooks.BulkAfterDelete != nil {
			afterCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()

			if bulkErr := pluginHooks.BulkAfterDelete(keys); bulkErr != nil {
				success = false
				return bulkErr
			}
			_ = afterCtx
		} else if pluginHooks.AfterDelete != nil {
			for _, key := range keys {
				itemCtx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
				if hookErr := pluginHooks.AfterDelete(key); hookErr != nil {
					cancel()
					success = false
					return hookErr
				}
				cancel()
				_ = itemCtx
			}
		}
	}

	return nil
}

func (s *StateService) getHooks() (*wasm.PluginHooks, error) {
	if s.activePlugin == "" {
		return nil, nil
	}

	hooks, err := s.pluginManager.GetPluginHooks(s.activePlugin)
	if err != nil {
		return nil, err
	}
	return hooks, nil
}

func (s *StateService) GetMetrics() monitor.MetricsSnapshot {
	return s.metrics.GetSnapshot()
}

func (s *StateService) ResetMetrics() {
	s.metrics.Reset()
}

func (s *StateService) ListPlugins() []wasm.PluginConfig {
	return s.pluginManager.ListPlugins()
}

func (s *StateService) ActivatePlugin(pluginID string) error {
	plugins := s.pluginManager.ListPlugins()
	for _, p := range plugins {
		if p.ID == pluginID {
			s.activePlugin = pluginID
			return nil
		}
	}
	return errors.New("plugin not found")
}

func (s *StateService) DeactivatePlugin() {
	s.activePlugin = ""
}

func (s *StateService) GetVersion(ctx context.Context, key string, version int64) (*store.StateVersion, error) {
	start := time.Now()
	success := true
	defer func() {
		s.metrics.RecordOperation(monitor.OpGet, time.Since(start), success)
	}()

	sv, err := s.store.GetVersion(ctx, key, version)
	if err != nil {
		success = false
		return nil, err
	}

	return sv, nil
}

func (s *StateService) GetVersionHistory(ctx context.Context, key string) ([]*store.StateVersion, error) {
	start := time.Now()
	success := true
	defer func() {
		s.metrics.RecordOperation(monitor.OpGet, time.Since(start), success)
	}()

	history, err := s.store.GetVersionHistory(ctx, key)
	if err != nil {
		success = false
		return nil, err
	}

	return history, nil
}

func (s *StateService) GetAtTime(ctx context.Context, key string, timestamp time.Time) ([]byte, error) {
	start := time.Now()
	success := true
	defer func() {
		s.metrics.RecordOperation(monitor.OpGet, time.Since(start), success)
	}()

	value, err := s.store.GetAtTime(ctx, key, timestamp)
	if err != nil {
		success = false
		return nil, err
	}

	pluginHooks, hookErr := s.getHooks()
	if hookErr != nil {
		success = false
		return nil, hookErr
	}

	if pluginHooks != nil && pluginHooks.AfterGet != nil {
		afterCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
		defer cancel()
		value, err = pluginHooks.AfterGet(key, value)
		_ = afterCtx
		if err != nil {
			success = false
			return nil, err
		}
	}

	return value, nil
}

func (s *StateService) DeleteOldVersions(ctx context.Context, key string) error {
	return s.store.DeleteOldVersions(ctx, key)
}
