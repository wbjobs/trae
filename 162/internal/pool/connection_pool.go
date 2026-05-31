package pool

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

type ConnFactory func(ctx context.Context) (interface{ Close() error }, error)
type ConnFactoryWithContext func(ctx context.Context) (interface{ Close() error }, error)

type PooledConn struct {
	conn      interface{ Close() error }
	idleSince time.Time
	createdAt time.Time
	inUse     bool
}

type ConnectionPool struct {
	mu          sync.Mutex
	conns       chan *PooledConn
	factory     ConnFactoryWithContext
	maxOpen     int
	maxIdle     int
	maxLifetime time.Duration
	maxIdleTime time.Duration
	totalConns  int64
	idleConns   int64
	activeConns int64
	closed      bool
}

type PoolConfig struct {
	MaxOpen     int
	MaxIdle     int
	MaxLifetime time.Duration
	MaxIdleTime time.Duration
}

func NewConnectionPool(factory ConnFactoryWithContext, cfg PoolConfig) *ConnectionPool {
	maxIdle := cfg.MaxIdle
	if maxIdle <= 0 {
		maxIdle = cfg.MaxOpen / 4
	}
	if maxIdle < 1 {
		maxIdle = 1
	}

	return &ConnectionPool{
		conns:       make(chan *PooledConn, cfg.MaxOpen),
		factory:     factory,
		maxOpen:     cfg.MaxOpen,
		maxIdle:     maxIdle,
		maxLifetime: cfg.MaxLifetime,
		maxIdleTime: cfg.MaxIdleTime,
	}
}

func (p *ConnectionPool) Get(ctx context.Context) (interface{ Close() error }, error) {
	for {
		p.mu.Lock()
		if p.closed {
			p.mu.Unlock()
			return nil, fmt.Errorf("connection pool is closed")
		}

		select {
		case pc := <-p.conns:
			p.mu.Unlock()
			if p.isExpired(pc) {
				p.closeConn(pc)
				atomic.AddInt64(&p.totalConns, -1)
				continue
			}
			atomic.StoreInt64(&p.idleConns, int64(len(p.conns)))
			atomic.AddInt64(&p.activeConns, 1)
			pc.inUse = true
			return pc.conn, nil
		default:
			if int(atomic.LoadInt64(&p.totalConns)) < p.maxOpen {
				atomic.AddInt64(&p.totalConns, 1)
				p.mu.Unlock()

				conn, err := p.factory(ctx)
				if err != nil {
					atomic.AddInt64(&p.totalConns, -1)
					return nil, fmt.Errorf("failed to create connection: %w", err)
				}
				atomic.AddInt64(&p.activeConns, 1)
				return conn, nil
			}
			p.mu.Unlock()
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case pc := <-p.conns:
			if p.isExpired(pc) {
				p.closeConn(pc)
				atomic.AddInt64(&p.totalConns, -1)
				continue
			}
			atomic.StoreInt64(&p.idleConns, int64(len(p.conns)))
			atomic.AddInt64(&p.activeConns, 1)
			pc.inUse = true
			return pc.conn, nil
		}
	}
}

func (p *ConnectionPool) Put(conn interface{ Close() error }) {
	if conn == nil {
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		_ = conn.Close()
		atomic.AddInt64(&p.totalConns, -1)
		atomic.AddInt64(&p.activeConns, -1)
		return
	}

	atomic.AddInt64(&p.activeConns, -1)

	pc := &PooledConn{
		conn:      conn,
		idleSince: time.Now(),
		createdAt: time.Now(),
		inUse:     false,
	}

	select {
	case p.conns <- pc:
		atomic.StoreInt64(&p.idleConns, int64(len(p.conns)))
	default:
		_ = conn.Close()
		atomic.AddInt64(&p.totalConns, -1)
	}
}

func (p *ConnectionPool) Stats() map[string]int64 {
	return map[string]int64{
		"total":  atomic.LoadInt64(&p.totalConns),
		"idle":   atomic.LoadInt64(&p.idleConns),
		"active": atomic.LoadInt64(&p.activeConns),
	}
}

func (p *ConnectionPool) isExpired(pc *PooledConn) bool {
	now := time.Now()
	if p.maxLifetime > 0 && now.Sub(pc.createdAt) > p.maxLifetime {
		return true
	}
	if p.maxIdleTime > 0 && now.Sub(pc.idleSince) > p.maxIdleTime {
		return true
	}
	return false
}

func (p *ConnectionPool) closeConn(pc *PooledConn) {
	if pc != nil && pc.conn != nil {
		_ = pc.conn.Close()
	}
}

func (p *ConnectionPool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.closed = true

	for {
		select {
		case pc := <-p.conns:
			p.closeConn(pc)
		default:
			return
		}
	}
}

func (p *ConnectionPool) CleanupExpired() {
	p.mu.Lock()
	defer p.mu.Unlock()

	var remaining []*PooledConn
	for {
		select {
		case pc := <-p.conns:
			if p.isExpired(pc) {
				p.closeConn(pc)
				atomic.AddInt64(&p.totalConns, -1)
			} else {
				remaining = append(remaining, pc)
			}
		default:
			for _, pc := range remaining {
				p.conns <- pc
			}
			atomic.StoreInt64(&p.idleConns, int64(len(p.conns)))
			return
		}
	}
}
