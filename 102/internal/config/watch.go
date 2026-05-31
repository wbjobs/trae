package config

import (
	"context"
	"log"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Watch starts watching the YAML config file for modifications and
// reloads the Store on every write event. It returns when ctx is done.
func Watch(ctx context.Context, store *Store) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer w.Close()

	abs, _ := filepath.Abs(store.Path())
	dir := filepath.Dir(abs)
	if err := w.Add(dir); err != nil {
		return err
	}

	// Debounce rapid successive events.
	var (
		timer  *time.Timer
		reload = func() {
			if err := store.Reload(); err != nil {
				log.Printf("[mock] config reload failed: %v", err)
				return
			}
			log.Printf("[mock] config reloaded from %s", store.Path())
		}
	)

	for {
		select {
		case <-ctx.Done():
			return nil
		case err, ok := <-w.Errors:
			if !ok {
				return nil
			}
			log.Printf("[mock] watch error: %v", err)
		case ev, ok := <-w.Events:
			if !ok {
				return nil
			}
			if ev.Name != abs {
				continue
			}
			if ev.Op&(fsnotify.Write|fsnotify.Create) == 0 {
				continue
			}
			if timer != nil {
				timer.Stop()
			}
			timer = time.AfterFunc(150*time.Millisecond, reload)
		}
	}
}
