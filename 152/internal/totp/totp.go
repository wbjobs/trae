package totp

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"
)

type TOTP struct {
	Secret string
	Digits int
	Period int64
}

func New(secret string) *TOTP {
	return &TOTP{
		Secret: secret,
		Digits: 6,
		Period: 30,
	}
}

func (t *TOTP) Generate() (string, error) {
	return t.GenerateAtTime(time.Now())
}

func (t *TOTP) GenerateAtTime(tm time.Time) (string, error) {
	counter := uint64(math.Floor(float64(tm.Unix()) / float64(t.Period)))
	return t.generateOTP(counter)
}

func (t *TOTP) generateOTP(counter uint64) (string, error) {
	secret := strings.TrimSpace(t.Secret)
	secret = strings.ToUpper(secret)
	secret = strings.ReplaceAll(secret, " ", "")

	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return "", fmt.Errorf("invalid base32 secret: %w", err)
	}

	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	hash := mac.Sum(nil)

	offset := hash[len(hash)-1] & 0x0f
	binaryCode := (uint32(hash[offset])&0x7f)<<24 |
		uint32(hash[offset+1])<<16 |
		uint32(hash[offset+2])<<8 |
		uint32(hash[offset+3])

	mod := uint32(math.Pow10(t.Digits))
	otp := binaryCode % mod

	return fmt.Sprintf("%0*d", t.Digits, otp), nil
}

func (t *TOTP) Validate(token string) bool {
	return t.ValidateAtTime(token, time.Now())
}

func (t *TOTP) ValidateAtTime(token string, tm time.Time) bool {
	for i := -1; i <= 1; i++ {
		adjustedTime := tm.Add(time.Duration(i) * time.Duration(t.Period) * time.Second)
		expected, err := t.GenerateAtTime(adjustedTime)
		if err != nil {
			continue
		}
		if hmac.Equal([]byte(expected), []byte(token)) {
			return true
		}
	}
	return false
}

func GenerateSecret() string {
	randomBytes := make([]byte, 20)
	for i := range randomBytes {
		randomBytes[i] = byte(time.Now().UnixNano() % 256)
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(randomBytes)
}

func ProvisioningURI(accountName, issuer, secret string) string {
	return fmt.Sprintf("otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=6&period=30",
		issuer, accountName, secret, issuer)
}
