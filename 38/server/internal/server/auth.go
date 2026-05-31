package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"nfc-access-server/internal/db"
	pb "nfc-access-server/proto"
)

type AuthServer struct {
	pb.UnimplementedAuthServiceServer
	jwtSecret      string
	jwtExpireHours int
}

func NewAuthServer(jwtSecret string, jwtExpireHours int) *AuthServer {
	return &AuthServer{
		jwtSecret:      jwtSecret,
		jwtExpireHours: jwtExpireHours,
	}
}

func (s *AuthServer) Login(ctx context.Context, req *pb.LoginRequest) (*pb.LoginResponse, error) {
	var user db.User
	result := db.DB.Where("username = ?", req.Username).First(&user)
	if result.Error != nil {
		return &pb.LoginResponse{
			Success: false,
			Message: "用户名或密码错误",
		}, nil
	}

	if user.Password != hashPassword(req.Password) {
		return &pb.LoginResponse{
			Success: false,
			Message: "用户名或密码错误",
		}, nil
	}

	token, err := s.generateToken(&user)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "生成token失败: %v", err)
	}

	return &pb.LoginResponse{
		Success: true,
		Token:   token,
		Message: "登录成功",
		User: &pb.UserInfo{
			Id:       user.ID,
			Username: user.Username,
			Name:     user.Name,
			Role:     user.Role,
		},
	}, nil
}

func (s *AuthServer) generateToken(user *db.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id":   user.ID,
		"username":  user.Username,
		"role":      user.Role,
		"exp":       time.Now().Add(time.Hour * time.Duration(s.jwtExpireHours)).Unix(),
		"issued_at": time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

func (s *AuthServer) ValidateToken(tokenString string) (*jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return &claims, nil
	}

	return nil, jwt.ErrSignatureInvalid
}

func hashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return hex.EncodeToString(hash[:])
}
