package server

import (
	"context"
	"strings"
	"time"

	"nfc-access-server/internal/db"
	pb "nfc-access-server/proto"
)

type BlacklistServer struct {
	pb.UnimplementedBlacklistServiceServer
	autoBlacklistThreshold float64
}

func NewBlacklistServer() *BlacklistServer {
	return &BlacklistServer{
		autoBlacklistThreshold: 0.8,
	}
}

func (s *BlacklistServer) AddToBlacklist(ctx context.Context, req *pb.AddToBlacklistRequest) (*pb.AddToBlacklistResponse, error) {
	cleanedUID := strings.ReplaceAll(req.Uid, ":", "")
	cleanedUID = strings.ToUpper(cleanedUID)

	var existing db.BlacklistedCard
	result := db.DB.Where("uid = ? AND is_active = ?", cleanedUID, true).First(&existing)
	if result.Error == nil {
		return &pb.AddToBlacklistResponse{
			Success:     false,
			BlacklistId: existing.ID,
			Message:     "卡片已在黑名单中",
		}, nil
	}

	blacklisted := db.BlacklistedCard{
		UID:         cleanedUID,
		CardType:    "unknown",
		Reason:      req.Reason,
		Source:      req.Source,
		DetectedAt:  time.Now().Unix(),
		IsActive:    true,
		ReportedBy:  req.ReportedBy,
	}

	if req.ExpiresAt > 0 {
		blacklisted.ExpiresAt = req.ExpiresAt
	} else {
		blacklisted.ExpiresAt = 0
	}

	if err := db.DB.Create(&blacklisted).Error; err != nil {
		return &pb.AddToBlacklistResponse{
			Success: false,
			Message: "添加黑名单失败",
		}, nil
	}

	var card db.Card
	db.DB.Where("uid = ?", cleanedUID).First(&card)
	if card.ID != "" {
		card.Status = "blacklisted"
		db.DB.Save(&card)
	}

	logAccess(cleanedUID, "", "添加到黑名单", "blocked", req.Reason)

	return &pb.AddToBlacklistResponse{
		Success:     true,
		BlacklistId: blacklisted.ID,
		Message:     "已添加到黑名单",
	}, nil
}

func (s *BlacklistServer) RemoveFromBlacklist(ctx context.Context, req *pb.RemoveFromBlacklistRequest) (*pb.RemoveFromBlacklistResponse, error) {
	cleanedUID := strings.ReplaceAll(req.Uid, ":", "")
	cleanedUID = strings.ToUpper(cleanedUID)

	result := db.DB.Model(&db.BlacklistedCard{}).
		Where("uid = ?", cleanedUID).
		Update("is_active", false)

	if result.RowsAffected == 0 {
		return &pb.RemoveFromBlacklistResponse{
			Success: false,
			Message: "卡片不在黑名单中",
		}, nil
	}

	var card db.Card
	db.DB.Where("uid = ?", cleanedUID).First(&card)
	if card.ID != "" {
		card.Status = "active"
		db.DB.Save(&card)
	}

	return &pb.RemoveFromBlacklistResponse{
		Success: true,
		Message: "已从黑名单移除",
	}, nil
}

func (s *BlacklistServer) ListBlacklistedCards(ctx context.Context, req *pb.ListBlacklistedCardsRequest) (*pb.ListBlacklistedCardsResponse, error) {
	var cards []db.BlacklistedCard
	var total int64

	query := db.DB.Model(&db.BlacklistedCard{})

	if req.ActiveOnly {
		query = query.Where("is_active = ?", true)
	}

	query.Count(&total)

	offset := (req.Page - 1) * req.PageSize
	if offset < 0 {
		offset = 0
	}

	if req.PageSize <= 0 {
		req.PageSize = 20
	}

	query.Offset(int(offset)).Limit(int(req.PageSize)).Order("detected_at DESC").Find(&cards)

	pbCards := make([]*pb.BlacklistedCard, len(cards))
	for i, card := range cards {
		pbCards[i] = &pb.BlacklistedCard{
			Id:         card.ID,
			Uid:         card.UID,
			CardType:   card.CardType,
			Reason:     card.Reason,
			Source:     card.Source,
			DetectedAt: card.DetectedAt,
			ExpiresAt:  card.ExpiresAt,
			IsActive:   card.IsActive,
			ReportedBy: card.ReportedBy,
		}
	}

	return &pb.ListBlacklistedCardsResponse{
		Cards: pbCards,
		Total: int32(total),
		Page:  req.Page,
	}, nil
}

func (s *BlacklistServer) CheckBlacklist(ctx context.Context, req *pb.CheckBlacklistRequest) (*pb.CheckBlacklistResponse, error) {
	cleanedUID := strings.ReplaceAll(req.Uid, ":", "")
	cleanedUID = strings.ToUpper(cleanedUID)

	var entry db.BlacklistedCard
	result := db.DB.Where("uid = ? AND is_active = ?", cleanedUID, true).First(&entry)

	if result.Error != nil {
		return &pb.CheckBlacklistResponse{
			IsBlacklisted: false,
		}, nil
	}

	if entry.ExpiresAt > 0 && entry.ExpiresAt < time.Now().Unix() {
		return &pb.CheckBlacklistResponse{
			IsBlacklisted: false,
		}, nil
	}

	return &pb.CheckBlacklistResponse{
		IsBlacklisted: true,
		Entry: &pb.BlacklistedCard{
			Id:         entry.ID,
			Uid:         entry.UID,
			CardType:   entry.CardType,
			Reason:     entry.Reason,
			Source:     entry.Source,
			DetectedAt: entry.DetectedAt,
			ExpiresAt:  entry.ExpiresAt,
			IsActive:   entry.IsActive,
			ReportedBy: entry.ReportedBy,
		},
	}, nil
}

func (s *BlacklistServer) GetSuspiciousCards(ctx context.Context, req *pb.GetSuspiciousCardsRequest) (*pb.GetSuspiciousCardsResponse, error) {
	var suspicious []db.SuspiciousCard
	var total int64

	query := db.DB.Model(&db.SuspiciousCard{})

	if req.MinScore > 0 {
		query = query.Where("anomaly_score >= ?", req.MinScore)
	}

	if !req.IncludeBlacklisted {
		query = query.Where("is_blacklisted = ?", false)
	}

	query.Count(&total)

	offset := (req.Page - 1) * req.PageSize
	if offset < 0 {
		offset = 0
	}

	if req.PageSize <= 0 {
		req.PageSize = 20
	}

	query.Offset(int(offset)).Limit(int(req.PageSize)).Order("anomaly_score DESC").Find(&suspicious)

	pbCards := make([]*pb.SuspiciousCard, len(suspicious))
	for i, card := range suspicious {
		pbCards[i] = &pb.SuspiciousCard{
			Id:             card.ID,
			Uid:             card.UID,
			OwnerName:       card.OwnerName,
			AnomalyScore:    card.AnomalyScore,
			Indicators:      card.Indicators,
			FirstDetected:   card.FirstDetected,
			LastSeen:         card.LastSeen,
			ViolationCount:   card.ViolationCount,
			IsBlacklisted:    card.IsBlacklisted,
		}
	}

	return &pb.GetSuspiciousCardsResponse{
		Cards: pbCards,
		Total: int32(total),
		Page:  req.Page,
	}, nil
}

func (s *BlacklistServer) ReportSuspiciousCard(ctx context.Context, req *pb.ReportSuspiciousCardRequest) (*pb.ReportSuspiciousCardResponse, error) {
	cleanedUID := strings.ReplaceAll(req.Uid, ":", "")
	cleanedUID = strings.ToUpper(cleanedUID)

	var existing db.SuspiciousCard
	result := db.DB.Where("uid = ?", cleanedUID).First(&existing)

	if result.Error == nil {
		existing.AnomalyScore = (existing.AnomalyScore + req.AnomalyScore) / 2
		existing.ViolationCount++
		existing.LastSeen = time.Now().Unix()
		existing.Indicators = append(existing.Indicators, req.Indicators...)

		if existing.ViolationCount >= 3 && !existing.IsBlacklisted {
			existing.IsBlacklisted = true
			s.autoBlacklist(&existing, req.Reason)
		}

		db.DB.Save(&existing)

		return &pb.ReportSuspiciousCardResponse{
			Success:          true,
			SuspiciousCardId: existing.ID,
			AutoBlacklisted:  existing.IsBlacklisted,
		}, nil
	}

	suspicious := db.SuspiciousCard{
		UID:             cleanedUID,
		AnomalyScore:    req.AnomalyScore,
		Indicators:      req.Indicators,
		FirstDetected:   time.Now().Unix(),
		LastSeen:        time.Now().Unix(),
		ViolationCount:  1,
		IsBlacklisted:   false,
	}

	if req.ReportedBy != "" {
		suspicious.OwnerName = req.ReportedBy
	}

	if err := db.DB.Create(&suspicious).Error; err != nil {
		return &pb.ReportSuspiciousCardResponse{
			Success: false,
		}, nil
	}

	return &pb.ReportSuspiciousCardResponse{
		Success:          true,
		SuspiciousCardId: suspicious.ID,
		AutoBlacklisted:  false,
	}, nil
}

func (s *BlacklistServer) autoBlacklist(card *db.SuspiciousCard, reason string) {
	blacklisted := db.BlacklistedCard{
		UID:         card.UID,
		CardType:    "suspicious",
		Reason:      "自动封禁: " + reason,
		Source:      "anti_clone_detection",
		DetectedAt:  time.Now().Unix(),
		IsActive:    true,
		ReportedBy:  "系统",
	}

	db.DB.Create(&blacklisted)

	card.IsBlacklisted = true
	db.DB.Save(card)

	logAccess(card.UID, card.OwnerName, "自动封禁", "blocked", reason)
}
