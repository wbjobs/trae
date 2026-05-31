package ha

import (
	"context"
	"fmt"
	"strings"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
	"go.etcd.io/etcd/client/v3/concurrency"
	"ssh-bastion-audit/internal/config"
)

const (
	leaderKeyPrefix   = "/bastion/leader"
	sessionKeyPrefix  = "/bastion/sessions"
	nodesKeyPrefix    = "/bastion/nodes"
)

type NodeRole string

const (
	RoleLeader   NodeRole = "leader"
	RoleFollower NodeRole = "follower"
	RoleUnknown  NodeRole = "unknown"
)

type NodeInfo struct {
	NodeID      string    `json:"node_id"`
	Role        NodeRole  `json:"role"`
	Address     string    `json:"address"`
	StartedAt   time.Time `json:"started_at"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	ActiveSessions int   `json:"active_sessions"`
}

type LeadershipChangeEvent struct {
	IsLeader bool
	LeaderID string
}

type EtcdClient struct {
	client     *clientv3.Client
	cfg        *config.HAConfig
	nodeID     string
	session    *concurrency.Session
	election   *concurrency.Election
	role       NodeRole
	leaderID   string
	roleChan   chan LeadershipChangeEvent
	ctx        context.Context
	cancel     context.CancelFunc
}

func NewEtcdClient(cfg *config.HAConfig) (*EtcdClient, error) {
	client, err := clientv3.New(clientv3.Config{
		Endpoints:   cfg.EtcdEndpoints,
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create etcd client: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &EtcdClient{
		client:   client,
		cfg:      cfg,
		nodeID:   cfg.NodeID,
		role:     RoleUnknown,
		roleChan: make(chan LeadershipChangeEvent, 1),
		ctx:      ctx,
		cancel:   cancel,
	}, nil
}

func (e *EtcdClient) Close() error {
	e.cancel()
	if e.session != nil {
		e.session.Close()
	}
	return e.client.Close()
}

func (e *EtcdClient) Start() error {
	session, err := concurrency.NewSession(e.client, concurrency.WithTTL(int(e.cfg.LeaseTTL)))
	if err != nil {
		return fmt.Errorf("failed to create etcd session: %w", err)
	}
	e.session = session

	e.election = concurrency.NewElection(session, leaderKeyPrefix)

	go e.campaignLoop()
	go e.watchLeader()
	go e.registerNode()

	return nil
}

func (e *EtcdClient) campaignLoop() {
	for {
		select {
		case <-e.ctx.Done():
			return
		default:
		}

		if err := e.election.Campaign(e.ctx, e.nodeID); err != nil {
			if e.ctx.Err() != nil {
				return
			}
			time.Sleep(1 * time.Second)
			continue
		}

		e.setRole(RoleLeader, e.nodeID)

		select {
		case <-e.ctx.Done():
			return
		case <-e.session.Done():
			e.setRole(RoleFollower, "")
			return
		}
	}
}

func (e *EtcdClient) watchLeader() {
	rch := e.election.Observe(e.ctx)

	for resp := range rch {
		if len(resp.Kvs) > 0 {
			leader := string(resp.Kvs[0].Value)
			if leader == e.nodeID && e.role != RoleLeader {
				e.setRole(RoleLeader, leader)
			} else if leader != e.nodeID {
				e.setRole(RoleFollower, leader)
			}
		}
	}
}

func (e *EtcdClient) setRole(role NodeRole, leaderID string) {
	e.role = role
	e.leaderID = leaderID

	select {
	case e.roleChan <- LeadershipChangeEvent{
		IsLeader: role == RoleLeader,
		LeaderID: leaderID,
	}:
	default:
	}
}

func (e *EtcdClient) RoleChanges() <-chan LeadershipChangeEvent {
	return e.roleChan
}

func (e *EtcdClient) IsLeader() bool {
	return e.role == RoleLeader
}

func (e *EtcdClient) GetRole() NodeRole {
	return e.role
}

func (e *EtcdClient) GetLeaderID() string {
	return e.leaderID
}

func (e *EtcdClient) registerNode() {
	nodeKey := fmt.Sprintf("%s/%s", nodesKeyPrefix, e.nodeID)

	ticker := time.NewTicker(time.Duration(e.cfg.LeaseTTL/2) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-e.ctx.Done():
			e.client.Delete(e.ctx, nodeKey)
			return
		case <-ticker.C:
			lease, err := e.client.Grant(e.ctx, e.cfg.LeaseTTL)
			if err != nil {
				continue
			}

			nodeInfo := NodeInfo{
				NodeID:      e.nodeID,
				Role:        e.role,
				StartedAt:   time.Now(),
				LastHeartbeat: time.Now(),
			}

			data, _ := marshal(&nodeInfo)
			e.client.Put(e.ctx, nodeKey, string(data), clientv3.WithLease(lease.ID))
		}
	}
}

func (e *EtcdClient) GetActiveNodes(ctx context.Context) ([]NodeInfo, error) {
	resp, err := e.client.Get(ctx, nodesKeyPrefix, clientv3.WithPrefix())
	if err != nil {
		return nil, err
	}

	nodes := make([]NodeInfo, 0, len(resp.Kvs))
	for _, kv := range resp.Kvs {
		var node NodeInfo
		if err := unmarshal(kv.Value, &node); err != nil {
			continue
		}
		nodes = append(nodes, node)
	}
	return nodes, nil
}

func (e *EtcdClient) PutSession(ctx context.Context, sessionID string, data []byte) error {
	key := fmt.Sprintf("%s/%s", sessionKeyPrefix, sessionID)
	lease, err := e.client.Grant(ctx, e.cfg.LeaseTTL*2)
	if err != nil {
		return err
	}
	_, err = e.client.Put(ctx, key, string(data), clientv3.WithLease(lease.ID))
	return err
}

func (e *EtcdClient) DeleteSession(ctx context.Context, sessionID string) error {
	key := fmt.Sprintf("%s/%s", sessionKeyPrefix, sessionID)
	_, err := e.client.Delete(ctx, key)
	return err
}

func (e *EtcdClient) GetSessions(ctx context.Context) (map[string][]byte, error) {
	resp, err := e.client.Get(ctx, sessionKeyPrefix, clientv3.WithPrefix())
	if err != nil {
		return nil, err
	}

	sessions := make(map[string][]byte)
	for _, kv := range resp.Kvs {
		keyParts := strings.Split(string(kv.Key), "/")
		sessionID := keyParts[len(keyParts)-1]
		sessions[sessionID] = kv.Value
	}
	return sessions, nil
}

func (e *EtcdClient) WatchSessions(ctx context.Context) clientv3.WatchChan {
	return e.client.Watch(ctx, sessionKeyPrefix, clientv3.WithPrefix())
}

func (e *EtcdClient) WatchNodes(ctx context.Context) clientv3.WatchChan {
	return e.client.Watch(ctx, nodesKeyPrefix, clientv3.WithPrefix())
}
