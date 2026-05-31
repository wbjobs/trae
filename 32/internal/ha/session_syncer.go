package ha

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	clientv3 "go.etcd.io/etcd/client/v3"
	"github.com/sirupsen/logrus"
	"ssh-bastion-audit/internal/config"
)

type SessionStateProvider interface {
	GetActiveSessions() []SessionState
	GetSessionState(sessionID uuid.UUID) (*SessionState, bool)
}

type SessionWatchEventType string

const (
	SessionAdded   SessionWatchEventType = "added"
	SessionUpdated SessionWatchEventType = "updated"
	SessionRemoved SessionWatchEventType = "removed"
)

type SessionWatchEvent struct {
	Type      SessionWatchEventType
	SessionID uuid.UUID
	Session   *SessionState
}

type SessionSyncer struct {
	etcd       *EtcdClient
	cfg        *config.HAConfig
	provider   SessionStateProvider
	ctx        context.Context
	cancel     context.CancelFunc
	wg         sync.WaitGroup
	syncTicker *time.Ticker
}

func NewSessionSyncer(
	etcd *EtcdClient,
	cfg *config.HAConfig,
	provider SessionStateProvider,
) *SessionSyncer {
	ctx, cancel := context.WithCancel(context.Background())

	return &SessionSyncer{
		etcd:       etcd,
		cfg:        cfg,
		provider:   provider,
		ctx:        ctx,
		cancel:     cancel,
		syncTicker: time.NewTicker(time.Duration(cfg.SessionSyncInterval) * time.Second),
	}
}

func (s *SessionSyncer) Start() {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.syncLoop()
	}()
}

func (s *SessionSyncer) Stop() {
	s.cancel()
	if s.syncTicker != nil {
		s.syncTicker.Stop()
	}
	s.wg.Wait()
}

func (s *SessionSyncer) syncLoop() {
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-s.syncTicker.C:
			if s.etcd.IsLeader() {
				s.syncSessions()
			}
		}
	}
}

func (s *SessionSyncer) syncSessions() {
	if s.provider == nil {
		return
	}

	sessions := s.provider.GetActiveSessions()

	for _, session := range sessions {
		session.OwnerNode = s.etcd.nodeID
		session.LastSyncTime = time.Now()

		data, err := MarshalSessionState(&session)
		if err != nil {
			logrus.Errorf("Failed to marshal session state %s: %v", session.SessionID, err)
			continue
		}

		if err := s.etcd.PutSession(s.ctx, session.SessionID.String(), data); err != nil {
			logrus.Errorf("Failed to sync session %s to etcd: %v", session.SessionID, err)
		}
	}
}

func (s *SessionSyncer) SyncSessionNow(state *SessionState) {
	if !s.etcd.IsLeader() {
		return
	}

	state.OwnerNode = s.etcd.nodeID
	state.LastSyncTime = time.Now()

	data, err := MarshalSessionState(state)
	if err != nil {
		logrus.Errorf("Failed to marshal session state %s: %v", state.SessionID, err)
		return
	}

	if err := s.etcd.PutSession(s.ctx, state.SessionID.String(), data); err != nil {
		logrus.Errorf("Failed to sync session %s to etcd: %v", state.SessionID, err)
	}
}

func (s *SessionSyncer) RemoveSession(sessionID uuid.UUID) {
	if !s.etcd.IsLeader() {
		return
	}

	if err := s.etcd.DeleteSession(s.ctx, sessionID.String()); err != nil {
		logrus.Errorf("Failed to remove session %s from etcd: %v", sessionID, err)
	}
}

func (s *SessionSyncer) GetSyncedSessions(ctx context.Context) (map[string]*SessionState, error) {
	dataMap, err := s.etcd.GetSessions(ctx)
	if err != nil {
		return nil, err
	}

	sessions := make(map[string]*SessionState)
	for id, data := range dataMap {
		state, err := UnmarshalSessionState(data)
		if err != nil {
			logrus.Errorf("Failed to unmarshal session state %s: %v", id, err)
			continue
		}
		sessions[id] = state
	}
	return sessions, nil
}

func (s *SessionSyncer) WatchSessions(ctx context.Context) (<-chan SessionWatchEvent, error) {
	eventChan := make(chan SessionWatchEvent, 100)

	go func() {
		defer close(eventChan)

		for event := range s.etcd.WatchSessions(ctx) {
			for _, ev := range event.Events {
				keyParts := strings.Split(string(ev.Kv.Key), "/")
				sessionIDStr := keyParts[len(keyParts)-1]

				sessionID, err := uuid.Parse(sessionIDStr)
				if err != nil {
					continue
				}

				watchEvent := SessionWatchEvent{
					SessionID: sessionID,
				}

				switch ev.Type {
				case clientv3.EventTypePut:
					session, err := UnmarshalSessionState(ev.Kv.Value)
					if err != nil {
						continue
					}
					if ev.IsCreate() {
						watchEvent.Type = SessionAdded
					} else {
						watchEvent.Type = SessionUpdated
					}
					watchEvent.Session = session

				case clientv3.EventTypeDelete:
					watchEvent.Type = SessionRemoved
				}

				select {
				case eventChan <- watchEvent:
				default:
					logrus.Warn("Session watch event channel full, dropping event")
				}
			}
		}
	}()

	return eventChan, nil
}
