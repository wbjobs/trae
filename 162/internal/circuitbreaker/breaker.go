package circuitbreaker

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

type State int

const (
	StateClosed State = iota
	StateHalfOpen
	StateOpen
)

func (s State) String() string {
	switch s {
	case StateClosed:
		return "closed"
	case StateHalfOpen:
		return "half-open"
	case StateOpen:
		return "open"
	default:
		return "unknown"
	}
}

type Counts struct {
	Requests             uint32
	TotalSuccesses       uint32
	TotalFailures        uint32
	ConsecutiveSuccesses uint32
	ConsecutiveFailures  uint32
}

type CircuitBreaker struct {
	name          string
	maxRequests   uint32
	interval      time.Duration
	timeout       time.Duration
	readyToTrip   func(counts Counts) bool

	mu             sync.Mutex
	state          State
	expiry         time.Time
	counts         Counts
}

type Options struct {
	Name        string
	MaxRequests uint32
	Interval    time.Duration
	Timeout     time.Duration
	ReadyToTrip func(counts Counts) bool
}

func New(opts Options) *CircuitBreaker {
	cb := &CircuitBreaker{
		name:        opts.Name,
		maxRequests: opts.MaxRequests,
		interval:    opts.Interval,
		timeout:     opts.Timeout,
	}
	if cb.readyToTrip == nil {
		cb.readyToTrip = defaultReadyToTrip
	}
	if opts.ReadyToTrip != nil {
		cb.readyToTrip = opts.ReadyToTrip
	}
	cb.toNewGeneration(time.Now())
	return cb
}

func defaultReadyToTrip(counts Counts) bool {
	return counts.ConsecutiveFailures > 5
}

var ErrCircuitOpen = errors.New("circuit breaker is open")

func (cb *CircuitBreaker) Name() string {
	return cb.name
}

func (cb *CircuitBreaker) State() State {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	now := time.Now()
	state, _ := cb.currentState(now)
	return state
}

func (cb *CircuitBreaker) Allow() error {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()
	state, _ := cb.currentState(now)
	switch state {
	case StateClosed:
		cb.counts.Requests++
		return nil
	case StateOpen:
		return ErrCircuitOpen
	case StateHalfOpen:
		if cb.counts.Requests >= cb.maxRequests {
			return ErrCircuitOpen
		}
		cb.counts.Requests++
		return nil
	}
	return nil
}

func (cb *CircuitBreaker) Execute(fn func() (interface{}, error)) (interface{}, error) {
	if err := cb.Allow(); err != nil {
		return nil, fmt.Errorf("%s: %w", cb.name, err)
	}

	result, err := fn()

	cb.mu.Lock()
	defer cb.mu.Unlock()

	if err == nil {
		cb.onSuccess()
	} else {
		cb.onFailure()
	}
	return result, err
}

func (cb *CircuitBreaker) onSuccess() {
	cb.counts.TotalSuccesses++
	cb.counts.ConsecutiveSuccesses++
	cb.counts.ConsecutiveFailures = 0

	if cb.state == StateHalfOpen {
		if cb.counts.ConsecutiveSuccesses >= cb.maxRequests {
			cb.toNewGeneration(time.Now())
			cb.state = StateClosed
		}
	}
}

func (cb *CircuitBreaker) onFailure() {
	cb.counts.TotalFailures++
	cb.counts.ConsecutiveFailures++
	cb.counts.ConsecutiveSuccesses = 0

	if cb.state == StateHalfOpen {
		cb.toNewGeneration(time.Now())
		cb.state = StateOpen
		cb.expiry = time.Now().Add(cb.timeout)
	} else if cb.readyToTrip(cb.counts) {
		cb.toNewGeneration(time.Now())
		cb.state = StateOpen
		cb.expiry = time.Now().Add(cb.timeout)
	}
}

func (cb *CircuitBreaker) Reset() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.toNewGeneration(time.Now())
	cb.state = StateClosed
}

func (cb *CircuitBreaker) currentState(now time.Time) (State, Counts) {
	switch cb.state {
	case StateClosed:
		if cb.interval > 0 && now.After(cb.expiry) {
			cb.toNewGeneration(now)
		}
	case StateOpen:
		if now.After(cb.expiry) {
			cb.setState(StateHalfOpen, now)
		}
	}
	return cb.state, cb.counts
}

func (cb *CircuitBreaker) toNewGeneration(now time.Time) {
	cb.counts = Counts{}
	var zero time.Time
	if cb.interval <= 0 {
		cb.expiry = zero
	} else {
		cb.expiry = now.Add(cb.interval)
	}
}

func (cb *CircuitBreaker) setState(state State, now time.Time) {
	if cb.state == state {
		return
	}
	cb.state = state
	switch state {
	case StateClosed:
		cb.toNewGeneration(now)
	case StateOpen:
		cb.expiry = now.Add(cb.timeout)
	case StateHalfOpen:
		cb.toNewGeneration(now)
	}
}

type Manager struct {
	mu       sync.RWMutex
	breakers map[string]*CircuitBreaker
}

func NewManager() *Manager {
	return &Manager{
		breakers: make(map[string]*CircuitBreaker),
	}
}

func (m *Manager) Get(name string, opts Options) *CircuitBreaker {
	m.mu.RLock()
	cb, exists := m.breakers[name]
	m.mu.RUnlock()
	if exists {
		return cb
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	cb, exists = m.breakers[name]
	if exists {
		return cb
	}
	opts.Name = name
	cb = New(opts)
	m.breakers[name] = cb
	return cb
}
