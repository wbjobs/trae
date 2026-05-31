package server

import (
	"context"
	"strings"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"nfc-access-server/internal/db"
	pb "nfc-access-server/proto"
)

type CardServer struct {
	pb.UnimplementedCardServiceServer
}

func NewCardServer() *CardServer {
	return &CardServer{}
}

func (s *CardServer) RegisterCard(ctx context.Context, req *pb.RegisterCardRequest) (*pb.RegisterCardResponse, error) {
	cleanedUID := strings.ReplaceAll(req.Uid, ":", "")
	cleanedUID = strings.ToUpper(cleanedUID)

	var existing db.Card
	result := db.DB.Where("uid = ?", cleanedUID).First(&existing)
	if result.Error == nil {
		return &pb.RegisterCardResponse{
			Success: false,
			Message: "该卡片UID已存在",
		}, nil
	}

	var group db.PermissionGroup
	if req.PermissionGroupId != "" {
		db.DB.Where("id = ?", req.PermissionGroupId).First(&group)
	}

	card := db.Card{
		UID:                 cleanedUID,
		OwnerName:           req.OwnerName,
		CardType:            req.CardType,
		PermissionGroupID:   req.PermissionGroupId,
		PermissionGroupName: group.Name,
		Status:              "active",
		KeyA:                req.KeyA,
		KeyB:                req.KeyB,
	}

	if err := db.DB.Create(&card).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "注册卡片失败: %v", err)
	}

	logAccess(cleanedUID, req.OwnerName, "注册卡片", "success", "新卡片注册")

	return &pb.RegisterCardResponse{
		Success: true,
		CardId:  card.ID,
		Message: "卡片注册成功",
	}, nil
}

func (s *CardServer) RevokeCard(ctx context.Context, req *pb.CardRequest) (*pb.RevokeCardResponse, error) {
	var card db.Card
	result := db.DB.Where("id = ?", req.CardId).First(&card)
	if result.Error != nil {
		return &pb.RevokeCardResponse{
			Success: false,
			Message: "卡片不存在",
		}, nil
	}

	card.Status = "revoked"
	card.UpdatedAt = time.Now()
	db.DB.Save(&card)

	logAccess(card.UID, card.OwnerName, "注销卡片", "success", "卡片已注销")

	return &pb.RevokeCardResponse{
		Success: true,
		Message: "卡片已注销",
	}, nil
}

func (s *CardServer) ListCards(ctx context.Context, req *pb.ListCardsRequest) (*pb.ListCardsResponse, error) {
	var cards []db.Card
	var total int64

	query := db.DB.Model(&db.Card{})

	if req.Status != "" {
		query = query.Where("status = ?", req.Status)
	}

	query.Count(&total)

	offset := (req.Page - 1) * req.PageSize
	if offset < 0 {
		offset = 0
	}
	query.Offset(int(offset)).Limit(int(req.PageSize)).Order("created_at DESC").Find(&cards)

	pbCards := make([]*pb.CardInfo, len(cards))
	for i, card := range cards {
		pbCards[i] = &pb.CardInfo{
			Id:                  card.ID,
			Uid:                 card.UID,
			OwnerName:           card.OwnerName,
			CardType:            card.CardType,
			PermissionGroupId:   card.PermissionGroupID,
			PermissionGroupName: card.PermissionGroupName,
			Status:              card.Status,
			CreatedAt:           card.CreatedAt,
		}
	}

	return &pb.ListCardsResponse{
		Cards: pbCards,
		Total: int32(total),
		Page:  req.Page,
	}, nil
}

func (s *CardServer) GetCard(ctx context.Context, req *pb.CardRequest) (*pb.CardInfo, error) {
	var card db.Card
	result := db.DB.Where("id = ?", req.CardId).First(&card)
	if result.Error != nil {
		return nil, status.Errorf(codes.NotFound, "卡片不存在")
	}

	return &pb.CardInfo{
		Id:                  card.ID,
		Uid:                 card.UID,
		OwnerName:           card.OwnerName,
		CardType:            card.CardType,
		PermissionGroupId:   card.PermissionGroupID,
		PermissionGroupName: card.PermissionGroupName,
		Status:              card.Status,
		CreatedAt:           card.CreatedAt,
	}, nil
}
