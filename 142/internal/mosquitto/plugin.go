package mosquitto

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/mqtt-shared-sub/lb/internal/balancer"
	"github.com/mqtt-shared-sub/lb/internal/model"
	"github.com/mqtt-shared-sub/lb/internal/parser"
)

type PluginAdapter struct {
	lb        *balancer.LoadBalancer
	config    model.MosquittoConfig
	server    *http.Server
}

type MosquittoMessage struct {
	Topic    string `json:"topic"`
	Payload  string `json:"payload"`
	QoS      int    `json:"qos"`
	Retain   bool   `json:"retain"`
	ClientID string `json:"client_id"`
}

type MosquittoSubscribe struct {
	ClientID string `json:"client_id"`
	Topic    string `json:"topic"`
	QoS      int    `json:"qos"`
}

type MosquittoUnsubscribe struct {
	ClientID string `json:"client_id"`
	Topic    string `json:"topic"`
}

type MosquittoConnect struct {
	ClientID string `json:"client_id"`
	Username string `json:"username"`
}

func NewPluginAdapter(lb *balancer.LoadBalancer, config model.MosquittoConfig) *PluginAdapter {
	return &PluginAdapter{
		lb:     lb,
		config: config,
	}
}

func (p *PluginAdapter) Start(ctx context.Context) error {
	if !p.config.Enabled {
		log.Println("[Mosquitto] Plugin adapter disabled, skipping")
		return nil
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/mosquitto/v1/on_message", p.handleOnMessage)
	mux.HandleFunc("/mosquitto/v1/on_subscribe", p.handleOnSubscribe)
	mux.HandleFunc("/mosquitto/v1/on_unsubscribe", p.handleOnUnsubscribe)
	mux.HandleFunc("/mosquitto/v1/on_connect", p.handleOnConnect)
	mux.HandleFunc("/mosquitto/v1/on_disconnect", p.handleOnDisconnect)

	p.server = &http.Server{
		Addr:         p.config.Endpoint,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	log.Printf("[Mosquitto] Plugin adapter listening on %s", p.config.Endpoint)
	go func() {
		if err := p.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[Mosquitto] Plugin adapter error: %v", err)
		}
	}()

	return nil
}

func (p *PluginAdapter) Shutdown() error {
	if p.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return p.server.Shutdown(ctx)
	}
	return nil
}

func (p *PluginAdapter) handleOnMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var msg MosquittoMessage
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("[Mosquitto] Message received: topic=%s, client=%s", msg.Topic, msg.ClientID)

	if err := p.lb.Publish(msg.Topic, []byte(msg.Payload), byte(msg.QoS), msg.Retain); err != nil {
		log.Printf("[Mosquitto] Error publishing message: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (p *PluginAdapter) handleOnSubscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var sub MosquittoSubscribe
	if err := json.NewDecoder(r.Body).Decode(&sub); err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("[Mosquitto] Subscribe: client=%s, topic=%s", sub.ClientID, sub.Topic)

	if parser.IsSharedSubscription(sub.Topic) {
		sharedSub, err := parser.ParseSharedSubscription(sub.Topic)
		if err != nil {
			log.Printf("[Mosquitto] Error parsing shared subscription: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		subscriber := model.NewSubscriber(sub.ClientID, sharedSub.Group, sharedSub.TopicFilter)
		if err := p.lb.AddSubscriber(subscriber); err != nil {
			log.Printf("[Mosquitto] Error adding subscriber: %v", err)
		}
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (p *PluginAdapter) handleOnUnsubscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var unsub MosquittoUnsubscribe
	if err := json.NewDecoder(r.Body).Decode(&unsub); err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("[Mosquitto] Unsubscribe: client=%s, topic=%s", unsub.ClientID, unsub.Topic)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (p *PluginAdapter) handleOnConnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var conn MosquittoConnect
	if err := json.NewDecoder(r.Body).Decode(&conn); err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("[Mosquitto] Client connected: %s", conn.ClientID)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (p *PluginAdapter) handleOnDisconnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var conn MosquittoConnect
	if err := json.NewDecoder(r.Body).Decode(&conn); err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("[Mosquitto] Client disconnected: %s", conn.ClientID)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
