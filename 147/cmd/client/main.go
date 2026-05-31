package main

import (
	"context"
	"flag"
	"log"
	"time"

	pb "github.com/realtime-feature-store/proto"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	addr := flag.String("addr", "localhost:50051", "Feature service address")
	userID := flag.String("user", "user-0", "User ID to query")
	batch := flag.Bool("batch", false, "Use batch query")
	flag.Parse()

	conn, err := grpc.Dial(*addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	client := pb.NewFeatureServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	featureNames := []string{"click_count_5m", "purchase_amount_1h"}

	if *batch {
		userIDs := []string{"user-0", "user-1", "user-2", "user-3", "user-4"}
		req := &pb.BatchGetFeaturesRequest{
			UserIds:      userIDs,
			FeatureNames: featureNames,
		}

		resp, err := client.BatchGetFeatures(ctx, req)
		if err != nil {
			log.Fatalf("BatchGetFeatures failed: %v", err)
		}

		log.Println("Batch Features:")
		for _, uf := range resp.UserFeatures {
			log.Printf("  User: %s", uf.UserId)
			for _, f := range uf.Features {
				log.Printf("    %s: %.2f (updated: %d)", f.FeatureName, f.FeatureValue, f.Timestamp)
			}
		}
	} else {
		req := &pb.GetFeaturesRequest{
			UserId:       *userID,
			FeatureNames: featureNames,
		}

		resp, err := client.GetFeatures(ctx, req)
		if err != nil {
			log.Fatalf("GetFeatures failed: %v", err)
		}

		log.Printf("Features for user %s:", *userID)
		for _, f := range resp.Features {
			log.Printf("  %s: %.2f (updated: %d)", f.FeatureName, f.FeatureValue, f.Timestamp)
		}
	}
}
