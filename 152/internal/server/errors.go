package server

import "errors"

var (
	ErrServiceNotFound = errors.New("service not found")
	ErrUnauthorized    = errors.New("unauthorized")
	ErrInvalidToken    = errors.New("invalid token")
	ErrAuthFailed      = errors.New("authentication failed")
	ErrTOTPInvalid     = errors.New("invalid TOTP code")
	ErrCertInvalid     = errors.New("invalid client certificate")
	ErrAccessDenied    = errors.New("access denied")
	ErrServiceDisabled = errors.New("service is disabled")
	ErrAccountLocked   = errors.New("account is locked due to too many failed MFA attempts")
)
