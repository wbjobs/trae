package share

import (
	"sync"
)

type Viewer struct {
	ID   string
	Data chan []byte
}

type Session struct {
	mu      sync.RWMutex
	id      string
	viewers map[string]*Viewer
	active  bool
}

var (
	registry   = make(map[string]*Session)
	registryMu sync.RWMutex
)

func NewSession(id string) *Session {
	s := &Session{
		id:      id,
		viewers: make(map[string]*Viewer),
		active:  true,
	}
	registryMu.Lock()
	registry[id] = s
	registryMu.Unlock()
	return s
}

func GetSession(id string) *Session {
	registryMu.RLock()
	defer registryMu.RUnlock()
	return registry[id]
}

func ListSessions() []string {
	registryMu.RLock()
	defer registryMu.RUnlock()
	ids := make([]string, 0, len(registry))
	for id, s := range registry {
		if s.active {
			ids = append(ids, id)
		}
	}
	return ids
}

func (s *Session) AddViewer(viewerID string) *Viewer {
	s.mu.Lock()
	defer s.mu.Unlock()

	v := &Viewer{
		ID:   viewerID,
		Data: make(chan []byte, 1024),
	}
	s.viewers[viewerID] = v
	return v
}

func (s *Session) RemoveViewer(viewerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if v, ok := s.viewers[viewerID]; ok {
		close(v.Data)
		delete(s.viewers, viewerID)
	}
}

func (s *Session) Broadcast(data []byte) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, v := range s.viewers {
		select {
		case v.Data <- data:
		default:
		}
	}
}

func (s *Session) ViewerCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.viewers)
}

func (s *Session) ID() string {
	return s.id
}

func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, v := range s.viewers {
		close(v.Data)
	}
	s.viewers = make(map[string]*Viewer)
	s.active = false

	registryMu.Lock()
	delete(registry, s.id)
	registryMu.Unlock()
}
