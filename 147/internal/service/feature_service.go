package service

import (
	"context"
	"log"

	"github.com/realtime-feature-store/internal/historystore"
	"github.com/realtime-feature-store/internal/redisclient"
	pb "github.com/realtime-feature-store/proto"
)

type FeatureService struct {
	pb.UnimplementedFeatureServiceServer
	redisCli  *redisclient.Client
	historyDB *historystore.HistoryStore
}

func New(redisCli *redisclient.Client, historyDB *historystore.HistoryStore) *FeatureService {
	return &FeatureService{
		redisCli:  redisCli,
		historyDB: historyDB,
	}
}

func (s *FeatureService) GetFeatures(ctx context.Context, req *pb.GetFeaturesRequest) (*pb.GetFeaturesResponse, error) {
	log.Printf("GetFeatures request: user_id=%s, features=%v", req.UserId, req.FeatureNames)

	values, timestamps, err := s.redisCli.GetFeatures(ctx, req.UserId, req.FeatureNames)
	if err != nil {
		log.Printf("Error getting features from Redis: %v", err)
		return nil, err
	}

	var features []*pb.Feature
	for _, name := range req.FeatureNames {
		features = append(features, &pb.Feature{
			UserId:       req.UserId,
			FeatureName:  name,
			FeatureValue: values[name],
			Timestamp:    timestamps[name],
		})
	}

	return &pb.GetFeaturesResponse{Features: features}, nil
}

func (s *FeatureService) BatchGetFeatures(ctx context.Context, req *pb.BatchGetFeaturesRequest) (*pb.BatchGetFeaturesResponse, error) {
	log.Printf("BatchGetFeatures request: user_ids=%v, features=%v", req.UserIds, req.FeatureNames)

	values, timestamps, err := s.redisCli.BatchGetFeatures(ctx, req.UserIds, req.FeatureNames)
	if err != nil {
		log.Printf("Error batch getting features from Redis: %v", err)
		return nil, err
	}

	var userFeatures []*pb.UserFeatures
	for _, userID := range req.UserIds {
		var features []*pb.Feature
		for _, name := range req.FeatureNames {
			features = append(features, &pb.Feature{
				UserId:       userID,
				FeatureName:  name,
				FeatureValue: values[userID][name],
				Timestamp:    timestamps[userID][name],
			})
		}
		userFeatures = append(userFeatures, &pb.UserFeatures{
			UserId:   userID,
			Features: features,
		})
	}

	return &pb.BatchGetFeaturesResponse{UserFeatures: userFeatures}, nil
}

func (s *FeatureService) GetFeaturesAtTime(ctx context.Context, req *pb.GetFeaturesAtTimeRequest) (*pb.GetFeaturesAtTimeResponse, error) {
	log.Printf("GetFeaturesAtTime request: user_id=%s, target_time=%d, features=%v",
		req.UserId, req.TargetTimestamp, req.FeatureNames)

	if s.historyDB == nil {
		log.Printf("History store not configured")
		return &pb.GetFeaturesAtTimeResponse{
			TargetTimestamp: req.TargetTimestamp,
			ActualTimestamp: 0,
		}, nil
	}

	values, timestamps, err := s.historyDB.GetFeaturesAtTime(ctx, req.UserId, req.FeatureNames, req.TargetTimestamp)
	if err != nil {
		log.Printf("Error getting features at time: %v", err)
		return nil, err
	}

	var features []*pb.Feature
	var maxTimestamp int64
	for _, name := range req.FeatureNames {
		ts := timestamps[name]
		if ts > maxTimestamp {
			maxTimestamp = ts
		}
		features = append(features, &pb.Feature{
			UserId:       req.UserId,
			FeatureName:  name,
			FeatureValue: values[name],
			Timestamp:    ts,
		})
	}

	return &pb.GetFeaturesAtTimeResponse{
		Features:        features,
		TargetTimestamp: req.TargetTimestamp,
		ActualTimestamp: maxTimestamp,
	}, nil
}

func (s *FeatureService) BatchGetFeaturesAtTime(ctx context.Context, req *pb.BatchGetFeaturesAtTimeRequest) (*pb.BatchGetFeaturesAtTimeResponse, error) {
	log.Printf("BatchGetFeaturesAtTime request: user_ids=%v, target_time=%d, features=%v",
		req.UserIds, req.TargetTimestamp, req.FeatureNames)

	if s.historyDB == nil {
		log.Printf("History store not configured")
		return &pb.BatchGetFeaturesAtTimeResponse{
			TargetTimestamp: req.TargetTimestamp,
		}, nil
	}

	values, timestamps, err := s.historyDB.BatchGetFeaturesAtTime(ctx, req.UserIds, req.FeatureNames, req.TargetTimestamp)
	if err != nil {
		log.Printf("Error batch getting features at time: %v", err)
		return nil, err
	}

	var userFeatures []*pb.UserFeatures
	for _, userID := range req.UserIds {
		var features []*pb.Feature
		for _, name := range req.FeatureNames {
			features = append(features, &pb.Feature{
				UserId:       userID,
				FeatureName:  name,
				FeatureValue: values[userID][name],
				Timestamp:    timestamps[userID][name],
			})
		}
		userFeatures = append(userFeatures, &pb.UserFeatures{
			UserId:   userID,
			Features: features,
		})
	}

	return &pb.BatchGetFeaturesAtTimeResponse{
		UserFeatures:    userFeatures,
		TargetTimestamp: req.TargetTimestamp,
	}, nil
}

func (s *FeatureService) GetFeatureHistory(ctx context.Context, req *pb.GetFeatureHistoryRequest) (*pb.GetFeatureHistoryResponse, error) {
	log.Printf("GetFeatureHistory request: user_id=%s, feature=%s, start=%d, end=%d, limit=%d",
		req.UserId, req.FeatureName, req.StartTimestamp, req.EndTimestamp, req.Limit)

	if s.historyDB == nil {
		log.Printf("History store not configured")
		return &pb.GetFeatureHistoryResponse{
			UserId:      req.UserId,
			FeatureName: req.FeatureName,
		}, nil
	}

	limit := int(req.Limit)
	if limit <= 0 {
		limit = 100
	}
	if limit > 10000 {
		limit = 10000
	}

	records, err := s.historyDB.GetFeatureHistory(ctx, req.UserId, req.FeatureName,
		req.StartTimestamp, req.EndTimestamp, limit)
	if err != nil {
		log.Printf("Error getting feature history: %v", err)
		return nil, err
	}

	var features []*pb.Feature
	for _, r := range records {
		features = append(features, &pb.Feature{
			UserId:       r.UserID,
			FeatureName:  r.FeatureName,
			FeatureValue: r.FeatureValue,
			Timestamp:    r.Timestamp,
		})
	}

	return &pb.GetFeatureHistoryResponse{
		UserId:      req.UserId,
		FeatureName: req.FeatureName,
		Features:    features,
	}, nil
}

func (s *FeatureService) BackfillFeatures(ctx context.Context, req *pb.BackfillFeaturesRequest) (*pb.BackfillFeaturesResponse, error) {
	log.Printf("BackfillFeatures request: user_id=%s, features=%v, start=%d, end=%d, interval=%d",
		req.UserId, req.FeatureNames, req.StartTimestamp, req.EndTimestamp, req.IntervalSeconds)

	if s.historyDB == nil {
		return &pb.BackfillFeaturesResponse{
			Status: "error: history store not configured",
		}, nil
	}

	interval := req.IntervalSeconds
	if interval <= 0 {
		interval = 60
	}

	var allFeatures []*pb.Feature
	totalPoints := int32(0)

	for ts := req.StartTimestamp; ts <= req.EndTimestamp; ts += interval {
		values, timestamps, err := s.historyDB.GetFeaturesAtTime(ctx, req.UserId, req.FeatureNames, ts)
		if err != nil {
			log.Printf("Error backfilling features at timestamp %d: %v", ts, err)
			continue
		}

		for _, name := range req.FeatureNames {
			allFeatures = append(allFeatures, &pb.Feature{
				UserId:       req.UserId,
				FeatureName:  name,
				FeatureValue: values[name],
				Timestamp:    timestamps[name],
			})
		}
		totalPoints++
	}

	return &pb.BackfillFeaturesResponse{
		Status:      "completed",
		TotalPoints: totalPoints,
		Features:    allFeatures,
	}, nil
}
