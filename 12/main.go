package main

import (
	"eventstore/config"
	"eventstore/handler"
	"eventstore/service"
	"eventstore/storage"
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

func main() {
	cfg := config.Load()

	log.Printf("Starting eventstore service...")
	log.Printf("Connecting to FoundationDB...")

	store, err := storage.NewEventStore(cfg.FDBCluster)
	if err != nil {
		log.Fatalf("Failed to initialize FoundationDB store: %v", err)
	}
	log.Printf("Connected to FoundationDB successfully")

	eventService := service.NewEventService(store)
	httpHandler := handler.NewHTTPHandler(eventService)

	router := mux.NewRouter()

	router.HandleFunc("/health", httpHandler.HealthCheck).Methods("GET")

	router.HandleFunc("/events", httpHandler.PostEvents).Methods("POST")

	router.HandleFunc("/query/timeline", httpHandler.GetTimeline).Methods("GET")

	router.HandleFunc("/counterfactual", httpHandler.PostCounterfactual).Methods("POST")

	router.HandleFunc("/gc", httpHandler.PostGC).Methods("POST")

	router.HandleFunc("/causal-cluster", httpHandler.GetCausalCluster).Methods("GET")

	log.Printf("Server starting on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, router); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
