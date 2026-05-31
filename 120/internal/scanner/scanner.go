package scanner

import (
	"context"

	"cloudinspector/internal/types"
)

type CloudScanner interface {
	Scan(ctx context.Context, account types.AccountConfig) (*types.ScanResult, error)
}

func NewScanner(provider types.CloudProvider) CloudScanner {
	switch provider {
	case types.ProviderAWS:
		return NewAWSScanner()
	case types.ProviderAliyun:
		return NewAliyunScanner()
	default:
		return nil
	}
}
