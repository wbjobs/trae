package nats

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/edge/wruntime/pkg/config"
	"github.com/edge/wruntime/pkg/types"
	"github.com/nats-io/nats.go"
)

type Client struct {
	conn        *nats.Conn
	subject     string
	workerCount int
	msgChan     chan *nats.Msg
	closeChan   chan struct{}
	wg          sync.WaitGroup
	once        sync.Once
	timeout     time.Duration
}

func New(cfg *config.Config) (*Client, error) {
	nc, err := nats.Connect(cfg.NATSURL,
		nats.Timeout(5*time.Second),
		nats.PingInterval(20*time.Second),
		nats.MaxPingsOutstanding(5),
		nats.ReconnectWait(1*time.Second),
		nats.MaxReconnects(10),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	workerCount := cfg.WorkerPoolSize
	if workerCount <= 0 {
		workerCount = 10
	}

	timeout := cfg.FunctionMaxTimeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	return &Client{
		conn:        nc,
		subject:     cfg.NATSSubject,
		workerCount: workerCount,
		msgChan:     make(chan *nats.Msg, 1000),
		closeChan:   make(chan struct{}),
		timeout:     timeout,
	}, nil
}

func (c *Client) Close() {
	c.once.Do(func() {
		close(c.closeChan)
		c.wg.Wait()
		if c.conn != nil {
			c.conn.Close()
		}
		close(c.msgChan)
	})
}

func (c *Client) PublishInvoke(ctx context.Context, req *types.FunctionRequest) (*types.FunctionResponse, error) {
	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	msg, err := c.conn.RequestWithContext(ctx, c.subject, data)
	if err != nil {
		return nil, fmt.Errorf("failed to publish request: %w", err)
	}

	var resp types.FunctionResponse
	if err := json.Unmarshal(msg.Data, &resp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &resp, nil
}

func (c *Client) SubscribeInvoke(handler func(ctx context.Context, req *types.FunctionRequest) (*types.FunctionResponse, error)) (*nats.Subscription, error) {
	sub, err := c.conn.ChanSubscribe(c.subject, c.msgChan)
	if err != nil {
		return nil, fmt.Errorf("failed to subscribe: %w", err)
	}

	for i := 0; i < c.workerCount; i++ {
		c.wg.Add(1)
		go c.worker(handler)
	}

	return sub, nil
}

func (c *Client) worker(handler func(ctx context.Context, req *types.FunctionRequest) (*types.FunctionResponse, error)) {
	defer c.wg.Done()

	for {
		select {
		case <-c.closeChan:
			return
		case msg, ok := <-c.msgChan:
			if !ok {
				return
			}
			c.processMessage(msg, handler)
		}
	}
}

func (c *Client) processMessage(msg *nats.Msg, handler func(ctx context.Context, req *types.FunctionRequest) (*types.FunctionResponse, error)) {
	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()

	var req types.FunctionRequest
	if err := json.Unmarshal(msg.Data, &req); err != nil {
		resp := &types.FunctionResponse{
			StatusCode: 400,
			Body:       []byte(fmt.Sprintf("invalid request: %v", err)),
			Error:      err.Error(),
		}
		respData, _ := json.Marshal(resp)
		msg.Respond(respData)
		return
	}

	resultChan := make(chan *types.FunctionResponse, 1)
	errChan := make(chan error, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				errChan <- fmt.Errorf("handler panic: %v", r)
			}
		}()

		resp, err := handler(ctx, &req)
		if err != nil {
			errChan <- err
			return
		}
		resultChan <- resp
	}()

	select {
	case <-ctx.Done():
		resp := &types.FunctionResponse{
			StatusCode: 504,
			Body:       []byte("function execution timeout"),
			Error:      fmt.Sprintf("timeout: function execution exceeded %v limit", c.timeout),
		}
		respData, _ := json.Marshal(resp)
		msg.Respond(respData)
		return
	case err := <-errChan:
		resp := &types.FunctionResponse{
			StatusCode: 500,
			Body:       []byte(err.Error()),
			Error:      err.Error(),
		}
		respData, _ := json.Marshal(resp)
		msg.Respond(respData)
		return
	case resp := <-resultChan:
		respData, _ := json.Marshal(resp)
		msg.Respond(respData)
		return
	}
}
