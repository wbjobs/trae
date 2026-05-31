package ha

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
)

type SessionRestoreHandler func(state *SessionState) error

type FailoverManager struct {
	etcd          *EtcdClient
	syncer        *SessionSyncer
	restoreHandler SessionRestoreHandler
	ctx           context.Context
	cancel        context.CancelFunc
	wg            sync.WaitGroup
	mu            sync.Mutex
	isRestoring   bool
	failedNode    string
}

func NewFailoverManager(
	etcd *EtcdClient,
	syncer *SessionSyncer,
	restoreHandler SessionRestoreHandler,
) *FailoverManager {
	ctx, cancel := context.WithCancel(context.Background())

	return &FailoverManager{
		etcd:          etcd,
		syncer:        syncer,
		restoreHandler: restoreHandler,
		ctx:           ctx,
		cancel:        cancel,
	}
}

func (f *FailoverManager) Start() {
	f.wg.Add(2)
	go f.watchLeaderChanges()
	go f.watchNodeFailures()
}

func (f *FailoverManager) Stop() {
	f.cancel()
	f.wg.Wait()
}

func (f *FailoverManager) watchLeaderChanges() {
	defer f.wg.Done()

	for event := range f.etcd.RoleChanges() {
		logrus.Infof("Leadership changed: is_leader=%v, leader_id=%s", event.IsLeader, event.LeaderID)

		if event.IsLeader {
			go f.takeOverSessions()
		}
	}
}

func (f *FailoverManager) watchNodeFailures() {
	defer f.wg.Done()

	watchChan := f.etcd.WatchNodes(f.ctx)

	for event := range watchChan {
		for _, ev := range event.Events {
			if ev.Type == 1 {
				keyParts := strings.Split(string(ev.Kv.Key), "/")
				if len(keyParts) > 0 {
					nodeID := keyParts[len(keyParts)-1]
					logrus.Infof("Node %s may have failed", nodeID)

					go f.checkAndTakeOverNode(nodeID)
				}
			}
		}
	}
}

func (f *FailoverManager) takeOverSessions() {
	f.mu.Lock()
	if f.isRestoring {
		f.mu.Unlock()
		return
	}
	f.isRestoring = true
	f.mu.Unlock()

	defer func() {
		f.mu.Lock()
		f.isRestoring = false
		f.mu.Unlock()
	}()

	logrus.Info("Starting session takeover as new leader...")

	ctx, cancel := context.WithTimeout(f.ctx, 30*time.Second)
	defer cancel()

	sessions, err := f.syncer.GetSyncedSessions(ctx)
	if err != nil {
		logrus.Errorf("Failed to get synced sessions: %v", err)
		return
	}

	logrus.Infof("Found %d synced sessions to take over", len(sessions))

	restoredCount := 0
	for _, state := range sessions {
		select {
		case <-f.ctx.Done():
			return
		default:
		}

		if state.OwnerNode == f.etcd.nodeID {
			continue
		}

		if err := f.restoreAndUpdateSession(state); err != nil {
			logrus.Errorf("Failed to restore session %s: %v", state.SessionID, err)
			continue
		}
		restoredCount++
	}

	logrus.Infof("Session takeover complete: restored %d/%d sessions", restoredCount, len(sessions))
}

func (f *FailoverManager) checkAndTakeOverNode(nodeID string) {
	if !f.etcd.IsLeader() {
		return
	}

	f.mu.Lock()
	if f.failedNode == nodeID {
		f.mu.Unlock()
		return
	}
	f.mu.Unlock()

	time.Sleep(2 * time.Second)

	ctx, cancel := context.WithTimeout(f.ctx, 5*time.Second)
	defer cancel()

	nodes, err := f.etcd.GetActiveNodes(ctx)
	if err != nil {
		return
	}

	nodeExists := false
	for _, n := range nodes {
		if n.NodeID == nodeID {
			nodeExists = true
			break
		}
	}

	if nodeExists {
		return
	}

	logrus.Infof("Confirmed node %s failed, taking over its sessions", nodeID)

	f.mu.Lock()
	f.failedNode = nodeID
	f.mu.Unlock()

	ctx2, cancel2 := context.WithTimeout(f.ctx, 30*time.Second)
	defer cancel2()

	sessions, err := f.syncer.GetSyncedSessions(ctx2)
	if err != nil {
		return
	}

	restoredCount := 0
	for _, state := range sessions {
		select {
		case <-f.ctx.Done():
			return
		default:
		}

		if state.OwnerNode != nodeID {
			continue
		}

		if err := f.restoreAndUpdateSession(state); err != nil {
			logrus.Errorf("Failed to restore session %s from node %s: %v", state.SessionID, nodeID, err)
			continue
		}
		restoredCount++
	}

	logrus.Infof("Node %s takeover complete: restored %d sessions", nodeID, restoredCount)
}

func (f *FailoverManager) restoreAndUpdateSession(state *SessionState) error {
	if f.restoreHandler != nil {
		if err := f.restoreHandler(state); err != nil {
			return err
		}
	}

	state.OwnerNode = f.etcd.nodeID
	state.LastSyncTime = time.Now()

	f.syncer.SyncSessionNow(state)

	logrus.Infof("Restored session %s (user=%s, host=%s)", state.SessionID, state.Username, state.DstHost)
	return nil
}

func (f *FailoverManager) GetOrphanedSessions(ctx context.Context, nodeID string) ([]*SessionState, error) {
	sessions, err := f.syncer.GetSyncedSessions(ctx)
	if err != nil {
		return nil, err
	}

	orphaned := make([]*SessionState, 0)
	for _, state := range sessions {
		if state.OwnerNode == nodeID {
			orphaned = append(orphaned, state)
		}
	}
	return orphaned, nil
}

func (f *FailoverManager) IsRestoring() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.isRestoring
}
