package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	pb "github.com/realtime-feature-store/proto"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	addr := flag.String("addr", "localhost:50051", "Feature service address")
	userID := flag.String("user", "user-0", "User ID to query")
	featureName := flag.String("feature", "click_count_5m", "Feature name")
	targetTime := flag.String("time", "", "Target time (RFC3339 format, e.g., 2024-01-15T14:00:00Z)")
	mode := flag.String("mode", "point", "Query mode: point, batch, history, backfill")
	batchUsers := flag.Int("batch-users", 5, "Number of users for batch query")
	startTime := flag.String("start", "", "Start time for history query")
	endTime := flag.String("end", "", "End time for history query")
	interval := flag.Int64("interval", 3600, "Interval in seconds for backfill")
	flag.Parse()

	conn, err := grpc.Dial(*addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	client := pb.NewFeatureServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	featureNames := []string{"click_count_5m", "purchase_amount_1h"}

	switch *mode {
	case "point":
		runPointQuery(ctx, client, *userID, featureNames, *targetTime)
	case "batch":
		runBatchQuery(ctx, client, *batchUsers, featureNames, *targetTime)
	case "history":
		runHistoryQuery(ctx, client, *userID, *featureName, *startTime, *endTime)
	case "backfill":
		runBackfillQuery(ctx, client, *userID, featureNames, *startTime, *endTime, *interval)
	default:
		log.Fatalf("Unknown mode: %s (use point, batch, history, backfill)", *mode)
	}
}

func runPointQuery(ctx context.Context, client pb.FeatureServiceClient, userID string, featureNames []string, targetTimeStr string) {
	var targetTimestamp int64
	if targetTimeStr != "" {
		t, err := time.Parse(time.RFC3339, targetTimeStr)
		if err != nil {
			log.Fatalf("Invalid target time format: %v", err)
		}
		targetTimestamp = t.Unix()
	} else {
		targetTimestamp = time.Now().Unix()
	}

	fmt.Printf("Querying features at time: %s (timestamp: %d)\n",
		time.Unix(targetTimestamp, 0).Format(time.RFC3339), targetTimestamp)

	req := &pb.GetFeaturesAtTimeRequest{
		UserId:          userID,
		FeatureNames:    featureNames,
		TargetTimestamp: targetTimestamp,
	}

	resp, err := client.GetFeaturesAtTime(ctx, req)
	if err != nil {
		log.Fatalf("GetFeaturesAtTime failed: %v", err)
	}

	fmt.Printf("Target timestamp: %d\n", resp.TargetTimestamp)
	fmt.Printf("Actual timestamp: %d (%s)\n", resp.ActualTimestamp,
		time.Unix(resp.ActualTimestamp, 0).Format(time.RFC3339))
	fmt.Println("Features:")
	for _, f := range resp.Features {
		fmt.Printf("  %s: %.2f (at %s)\n", f.FeatureName, f.FeatureValue,
			time.Unix(f.Timestamp, 0).Format(time.RFC3339))
	}
}

func runBatchQuery(ctx context.Context, client pb.FeatureServiceClient, numUsers int, featureNames []string, targetTimeStr string) {
	var targetTimestamp int64
	if targetTimeStr != "" {
		t, err := time.Parse(time.RFC3339, targetTimeStr)
		if err != nil {
			log.Fatalf("Invalid target time format: %v", err)
		}
		targetTimestamp = t.Unix()
	} else {
		targetTimestamp = time.Now().Unix()
	}

	userIDs := make([]string, numUsers)
	for i := 0; i < numUsers; i++ {
		userIDs[i] = fmt.Sprintf("user-%d", i)
	}

	fmt.Printf("Batch querying %d users at time: %s\n",
		numUsers, time.Unix(targetTimestamp, 0).Format(time.RFC3339))

	req := &pb.BatchGetFeaturesAtTimeRequest{
		UserIds:         userIDs,
		FeatureNames:    featureNames,
		TargetTimestamp: targetTimestamp,
	}

	resp, err := client.BatchGetFeaturesAtTime(ctx, req)
	if err != nil {
		log.Fatalf("BatchGetFeaturesAtTime failed: %v", err)
	}

	fmt.Printf("Target timestamp: %d\n", resp.TargetTimestamp)
	fmt.Println("User Features:")
	for _, uf := range resp.UserFeatures {
		fmt.Printf("  User: %s\n", uf.UserId)
		for _, f := range uf.Features {
			fmt.Printf("    %s: %.2f\n", f.FeatureName, f.FeatureValue)
		}
	}
}

func runHistoryQuery(ctx context.Context, client pb.FeatureServiceClient, userID, featureName, startStr, endStr string) {
	var startTimestamp, endTimestamp int64
	var err error

	if startStr != "" {
		t, err := time.Parse(time.RFC3339, startStr)
		if err != nil {
			log.Fatalf("Invalid start time format: %v", err)
		}
		startTimestamp = t.Unix()
	} else {
		startTimestamp = time.Now().Add(-24 * time.Hour).Unix()
	}

	if endStr != "" {
		t, err := time.Parse(time.RFC3339, endStr)
		if err != nil {
			log.Fatalf("Invalid end time format: %v", err)
		}
		endTimestamp = t.Unix()
	} else {
		endTimestamp = time.Now().Unix()
	}

	fmt.Printf("Querying history for %s:%s from %s to %s\n",
		userID, featureName,
		time.Unix(startTimestamp, 0).Format(time.RFC3339),
		time.Unix(endTimestamp, 0).Format(time.RFC3339))

	req := &pb.GetFeatureHistoryRequest{
		UserId:        userID,
		FeatureName:   featureName,
		StartTimestamp: startTimestamp,
		EndTimestamp:  endTimestamp,
		Limit:         100,
	}

	resp, err := client.GetFeatureHistory(ctx, req)
	if err != nil {
		log.Fatalf("GetFeatureHistory failed: %v", err)
	}

	fmt.Printf("User: %s, Feature: %s\n", resp.UserId, resp.FeatureName)
	fmt.Println("History:")
	for _, f := range resp.Features {
		fmt.Printf("  %s: %.2f\n",
			time.Unix(f.Timestamp, 0).Format(time.RFC3339), f.FeatureValue)
	}
	fmt.Printf("Total records: %d\n", len(resp.Features))
}

func runBackfillQuery(ctx context.Context, client pb.FeatureServiceClient, userID string, featureNames []string, startStr, endStr string, interval int64) {
	var startTimestamp, endTimestamp int64
	var err error

	if startStr != "" {
		t, err := time.Parse(time.RFC3339, startStr)
		if err != nil {
			log.Fatalf("Invalid start time format: %v", err)
		}
		startTimestamp = t.Unix()
	} else {
		startTimestamp = time.Now().Add(-1 * time.Hour).Unix()
	}

	if endStr != "" {
		t, err := time.Parse(time.RFC3339, endStr)
		if err != nil {
			log.Fatalf("Invalid end time format: %v", err)
		}
		endTimestamp = t.Unix()
	} else {
		endTimestamp = time.Now().Unix()
	}

	fmt.Printf("Backfilling features for %s from %s to %s (interval: %ds)\n",
		userID,
		time.Unix(startTimestamp, 0).Format(time.RFC3339),
		time.Unix(endTimestamp, 0).Format(time.RFC3339),
		interval)

	req := &pb.BackfillFeaturesRequest{
		UserId:          userID,
		FeatureNames:    featureNames,
		StartTimestamp:  startTimestamp,
		EndTimestamp:    endTimestamp,
		IntervalSeconds: interval,
	}

	resp, err := client.BackfillFeatures(ctx, req)
	if err != nil {
		log.Fatalf("BackfillFeatures failed: %v", err)
	}

	fmt.Printf("Status: %s\n", resp.Status)
	fmt.Printf("Total points: %d\n", resp.TotalPoints)
	fmt.Println("Backfilled Features:")
	for _, f := range resp.Features {
		fmt.Printf("  %s @ %s: %.2f\n", f.FeatureName,
			time.Unix(f.Timestamp, 0).Format(time.RFC3339), f.FeatureValue)
	}
}
