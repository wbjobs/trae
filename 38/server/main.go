package main

import (
	"log"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"nfc-access-server/internal/config"
	"nfc-access-server/internal/db"
	"nfc-access-server/internal/server"
	pb "nfc-access-server/proto"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if err := db.Init(cfg.GetDSN()); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := db.AutoMigrate(); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	if err := db.SeedDefaultData(cfg.AdminUsername, cfg.AdminPassword); err != nil {
		log.Printf("Warning: Failed to seed default data: %v", err)
	}

	lis, err := net.Listen("tcp", cfg.GetGRPCAddr())
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()

	pb.RegisterAuthServiceServer(s, server.NewAuthServer(cfg.JWTSecret, cfg.JWTExpireHours))
	pb.RegisterCardServiceServer(s, server.NewCardServer())
	pb.RegisterAccessServiceServer(s, server.NewAccessServer())
	pb.RegisterAuditServiceServer(s, server.NewAuditServer())
	pb.RegisterBlacklistServiceServer(s, server.NewBlacklistServer())

	reflection.Register(s)

	log.Printf("gRPC server starting on %s", cfg.GetGRPCAddr())
	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
