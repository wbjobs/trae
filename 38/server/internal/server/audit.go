package server

import (
	"context"
	"time"

	"nfc-access-server/internal/db"
	pb "nfc-access-server/proto"
)

type AuditServer struct {
	pb.UnimplementedAuditServiceServer
}

func NewAuditServer() *AuditServer {
	return &AuditServer{}
}

func (s *AuditServer) ListAccessLogs(ctx context.Context, req *pb.ListAccessLogsRequest) (*pb.ListAccessLogsResponse, error) {
	var logs []db.AccessLog
	var total int64

	query := db.DB.Model(&db.AccessLog{})

	if req.CardId != "" {
		query = query.Where("card_uid = ?", req.CardId)
	}
	if req.StartTime > 0 {
		query = query.Where("timestamp >= ?", req.StartTime)
	}
	if req.EndTime > 0 {
		query = query.Where("timestamp <= ?", req.EndTime)
	}

	query.Count(&total)

	offset := (req.Page - 1) * req.PageSize
	if offset < 0 {
		offset = 0
	}
	query.Offset(int(offset)).Limit(int(req.PageSize)).Order("timestamp DESC").Find(&logs)

	pbLogs := make([]*pb.AccessLog, len(logs))
	for i, log := range logs {
		pbLogs[i] = &pb.AccessLog{
			Id:         log.ID,
			CardUid:    log.CardUID,
			CardOwner:  log.CardOwner,
			DoorName:   log.DoorName,
			AccessType: log.AccessType,
			Result:     log.Result,
			Reason:     log.Reason,
			Timestamp:  log.Timestamp,
		}
	}

	return &pb.ListAccessLogsResponse{
		Logs:  pbLogs,
		Total: int32(total),
		Page:  req.Page,
	}, nil
}

func logAccess(cardUID, cardOwner, doorName, accessType, result, reason string) {
	log := db.AccessLog{
		CardUID:    cardUID,
		CardOwner:  cardOwner,
		DoorName:   doorName,
		AccessType: accessType,
		Result:     result,
		Reason:     reason,
		Timestamp:  time.Now().Unix(),
	}
	db.DB.Create(&log)
}
