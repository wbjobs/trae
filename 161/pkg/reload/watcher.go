package reload

import (
	"context"
	"log"
	"path/filepath"
	"sync"
	"time"

	"github.com/dapr-wasm/middleware/pkg/engine"
	"github.com/fsnotify/fsnotify"
)

type HotReloader struct {
	engine    *engine.Engine
	watcher   *fsnotify.Watcher
	dir       string
	filterMap map[string]engine.FilterMeta
	mu        sync.RWMutex
	cancel    context.CancelFunc
}

func NewHotReloader(e *engine.Engine, watchDir string) (*HotReloader, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	err = watcher.Add(watchDir)
	if err != nil {
		watcher.Close()
		return nil, err
	}

	return &HotReloader{
		engine:    e,
		watcher:   watcher,
		dir:       watchDir,
		filterMap: make(map[string]engine.FilterMeta),
	}, nil
}

func (h *HotReloader) Register(meta engine.FilterMeta) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.filterMap[meta.Name] = meta
}

func (h *HotReloader) Unregister(name string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.filterMap, name)
}

func (h *HotReloader) Start(ctx context.Context) {
	ctx, h.cancel = context.WithCancel(ctx)

	debounce := make(map[string]time.Time)
	var mu sync.Mutex

	go func() {
		for {
			select {
			case <-ctx.Done():
				h.watcher.Close()
				return
			case event, ok := <-h.watcher.Events:
				if !ok {
					return
				}
				if event.Op&fsnotify.Write == fsnotify.Write ||
					event.Op&fsnotify.Create == fsnotify.Create {

					mu.Lock()
					debounce[event.Name] = time.Now()
					mu.Unlock()

					go func(path string) {
						time.Sleep(200 * time.Millisecond)

						mu.Lock()
						t, ok := debounce[path]
						if !ok || time.Since(t) < 200*time.Millisecond {
							mu.Unlock()
							return
						}
						delete(debounce, path)
						mu.Unlock()

						h.handleChange(path)
					}(event.Name)
				}
			case err, ok := <-h.watcher.Errors:
				if !ok {
					return
				}
				log.Printf("hot reload watcher error: %v", err)
			}
		}
	}()
}

func (h *HotReloader) handleChange(path string) {
	absPath, _ := filepath.Abs(path)
	ext := filepath.Ext(path)

	if ext != ".wasm" {
		return
	}

	h.mu.RLock()
	var targetMeta *engine.FilterMeta
	for name, meta := range h.filterMap {
		metaPath, _ := filepath.Abs(meta.Path)
		if metaPath == absPath {
			m := meta
			targetMeta = &m
			_ = name
			break
		}
	}
	h.mu.RUnlock()

	if targetMeta != nil {
		log.Printf("hot reload: reloading %s from %s", targetMeta.Name, absPath)
		if err := h.engine.ReloadFilter(*targetMeta); err != nil {
			log.Printf("hot reload failed for %s: %v", targetMeta.Name, err)
		}
	}
}

func (h *HotReloader) Stop() {
	if h.cancel != nil {
		h.cancel()
	}
}
