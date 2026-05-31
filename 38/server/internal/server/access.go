package server

import (
	"context"
	"time"

	"nfc-access-server/internal/db"
	pb "nfc-access-server/proto"
)

type AccessServer struct {
	pb.UnimplementedAccessServiceServer
}

func NewAccessServer() *AccessServer {
	return &AccessServer{}
}

func (s *AccessServer) ListPermissionGroups(ctx context.Context, req *pb.ListPermissionGroupsRequest) (*pb.ListPermissionGroupsResponse, error) {
	var groups []db.PermissionGroup
	db.DB.Preload("TimeRules").Find(&groups)

	pbGroups := make([]*pb.PermissionGroup, len(groups))
	for i, group := range groups {
		rules := make([]*pb.TimeRule, len(group.TimeRules))
		for j, rule := range group.TimeRules {
			rules[j] = &pb.TimeRule{
				Id:                rule.ID,
				PermissionGroupId: rule.PermissionGroupID,
				DayOfWeek:         rule.DayOfWeek,
				StartTime:         rule.StartTime,
				EndTime:           rule.EndTime,
			}
		}

		pbGroups[i] = &pb.PermissionGroup{
			Id:          group.ID,
			Name:        group.Name,
			Description: group.Description,
			TimeRules:   rules,
		}
	}

	return &pb.ListPermissionGroupsResponse{
		Groups: pbGroups,
	}, nil
}

func (s *AccessServer) CreatePermissionGroup(ctx context.Context, req *pb.CreatePermissionGroupRequest) (*pb.PermissionGroupResponse, error) {
	group := db.PermissionGroup{
		Name:        req.Name,
		Description: req.Description,
	}

	if err := db.DB.Create(&group).Error; err != nil {
		return &pb.PermissionGroupResponse{
			Success: false,
			Message: "创建权限组失败",
		}, nil
	}

	for _, rule := range req.TimeRules {
		timeRule := db.TimeRule{
			PermissionGroupID: group.ID,
			DayOfWeek:         rule.DayOfWeek,
			StartTime:         rule.StartTime,
			EndTime:           rule.EndTime,
		}
		db.DB.Create(&timeRule)
	}

	return &pb.PermissionGroupResponse{
		Success: true,
		GroupId: group.ID,
		Message: "权限组创建成功",
	}, nil
}

func (s *AccessServer) VerifyAccess(ctx context.Context, req *pb.VerifyAccessRequest) (*pb.VerifyAccessResponse, error) {
	var card db.Card
	result := db.DB.Where("uid = ?", req.CardUid).First(&card)
	if result.Error != nil {
		logAccess(req.CardUid, "", req.DoorName, "刷卡验证", "denied", "卡片未注册")
		return &pb.VerifyAccessResponse{
			Allowed: false,
			Message: "卡片未注册",
		}, nil
	}

	if card.Status != "active" {
		logAccess(card.UID, card.OwnerName, req.DoorName, "刷卡验证", "denied", "卡片已注销")
		return &pb.VerifyAccessResponse{
			Allowed: false,
			Message: "卡片已注销",
		}, nil
	}

	if card.PermissionGroupID == "" {
		logAccess(card.UID, card.OwnerName, req.DoorName, "刷卡验证", "success", "无权限组限制")
		return &pb.VerifyAccessResponse{
			Allowed: true,
			Message: "验证通过",
		}, nil
	}

	allowed := checkTimePermission(card.PermissionGroupID)
	if allowed {
		logAccess(card.UID, card.OwnerName, req.DoorName, "刷卡验证", "success", "验证通过")
		return &pb.VerifyAccessResponse{
			Allowed: true,
			Message: "验证通过",
		}, nil
	}

	logAccess(card.UID, card.OwnerName, req.DoorName, "刷卡验证", "denied", "不在允许的时间段内")
	return &pb.VerifyAccessResponse{
		Allowed: false,
		Message: "不在允许的时间段内",
	}, nil
}

func (s *AccessServer) RemoteOpenDoor(ctx context.Context, req *pb.RemoteOpenDoorRequest) (*pb.OpenDoorResponse, error) {
	log := db.AccessLog{
		CardUID:    "",
		CardOwner:  "远程控制",
		DoorName:   req.DoorId,
		AccessType: "远程开门",
		Result:     "success",
		Reason:     req.Reason,
	}
	db.DB.Create(&log)

	return &pb.OpenDoorResponse{
		Success:     true,
		AccessLogId: log.ID,
		Message:     "远程开门成功",
	}, nil
}

func checkTimePermission(groupID string) bool {
	var group db.PermissionGroup
	result := db.DB.Preload("TimeRules").Where("id = ?", groupID).First(&group)
	if result.Error != nil {
		return true
	}

	if len(group.TimeRules) == 0 {
		return true
	}

	now := time.Now()
	dayOfWeek := int32(now.Weekday())
	currentTime := now.Format("15:04")

	for _, rule := range group.TimeRules {
		if rule.DayOfWeek == dayOfWeek {
			if currentTime >= rule.StartTime && currentTime <= rule.EndTime {
				return true
			}
		}
	}

	return false
}
