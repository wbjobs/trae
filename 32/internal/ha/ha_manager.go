package ha

import (
	"context"
	"sync"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
	"ssh-bastion-audit/internal/config"
)

type HAManager struct {
	cfg        *config.HAConfig
	etcd       *EtcdClient
	syncer     *SessionSyncer
	failover   *FailoverManager
	provider   SessionStateProvider
	handler    SessionRestoreHandler
	ctx        context.Context
	cancel     context.CancelFunc
	mu         sync.Mutex
	started    bool
}

func NewHAManager(cfg *config.HAConfig) *HAManager {
	ctx, cancel := context.WithCancel(context.Background())

	return &HAManager{
		cfg:     cfg,
		ctx:     ctx,
		cancel:  cancel,
	}
}

func (h *HAManager) SetSessionProvider(provider SessionStateProvider) {
	h.provider = provider
}

func (h *HAManager) SetRestoreHandler(handler SessionRestoreHandler) {
	h.handler = handler
}

func (h *HAManager) Start() error {
	if !h.cfg.Enabled {
		logrus.Info("HA mode is disabled, skipping HA manager startup")
		return nil
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if h.started {
		return nil
	}

	logrus.Infof("Starting HA manager for node %s", h.cfg.NodeID)

	etcd, err := NewEtcdClient(h.cfg)
	if err != nil {
		return fmt.Errorf("failed to create etcd client: %w", err)
	}
	h.etcd = etcd

	syncer := NewSessionSyncer(etcd, h.cfg, h.provider)
	h.syncer = syncer

	failover := NewFailoverManager(etcd, syncer, h.handler)
	h.failover = failover

	if err := etcd.Start(); err != nil {
		etcd.Close()
		return fmt.Errorf("failed to start etcd client: %w", err)
	}

	syncer.Start()
	failover.Start()

	h.started = true
	logrus.Infof("HA manager started successfully for node %s", h.cfg.NodeID)

	return nil
}

func (h *HAManager) Stop() {
	h.mu.Lock()
	defer h.mu.Unlock()

	if !h.started {
		return
	}

	logrus.Info("Stopping HA manager...")

	if h.failover != nil {
		h.failover.Stop()
	}
	if h.syncer != nil {
		h.syncer.Stop()
	}
	if h.etcd != nil {
		h.etcd.Close()
	}

	h.started = false
	logrus.Info("HA manager stopped")
}

func (h *HAManager) IsLeader() bool {
	if h.etcd == nil {
		return true
	}
	return h.etcd.IsLeader()
}

func (h *HAManager) GetRole() NodeRole {
	if h.etcd == nil {
		return RoleLeader
	}
	return h.etcd.GetRole()
}

func (h *HAManager) GetLeaderID() string {
	if h.etcd == nil {
		return h.cfg.NodeID
	}
	return h.etcd.GetLeaderID()
}

func (h *HAManager) RoleChanges() <-chan LeadershipChangeEvent {
	if h.etcd == nil {
		ch := make(chan LeadershipChangeEvent, 1)
		ch <- LeadershipChangeEvent{IsLeader: true, LeaderID: h.cfg.NodeID}
		close(ch)
		return ch
	}
	return h.etcd.RoleChanges()
}

func (h *HAManager) SyncSessionNow(state *SessionState) {
	if h.syncer != nil {
		h.syncer.SyncSessionNow(state)
	}
}

func (h *HAManager) RemoveSession(sessionID uuid.UUID) {
	if h.syncer != nil {
		h.syncer.RemoveSession(sessionID)
	}
}

func (h *HAManager) GetActiveNodes(ctx context.Context) ([]NodeInfo, error) {
	if h.etcd == nil {
		return nil, nil
	}
	return h.etcd.GetActiveNodes(ctx)
}

func (h *HAManager) IsEnabled() bool {
	return h.cfg.Enabled
}

func (h *HAManager) GetNodeID() string {
	return h.cfg.NodeID
}
