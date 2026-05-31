package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
)

const (
	nonceSize         = 12
	keySize           = 32
	encryptedPrefix   = "ENC:"
)

type Encryptor interface {
	Encrypt(plaintext []byte, keyID string) (string, error)
	Decrypt(ciphertext string, keyID string) ([]byte, error)
	IsEncrypted(value string) bool
}

type AESGCMEncryptor struct {
	masterKey []byte
}

func NewAESGCMEncryptor(masterKey []byte) (*AESGCMEncryptor, error) {
	if len(masterKey) == 0 {
		return nil, fmt.Errorf("master key cannot be empty")
	}

	derivedKey := deriveKey(masterKey)

	return &AESGCMEncryptor{
		masterKey: derivedKey,
	}, nil
}

func NewAESGCMEncryptorFromBase64(encodedKey string) (*AESGCMEncryptor, error) {
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return nil, fmt.Errorf("decode base64 key: %w", err)
	}

	return NewAESGCMEncryptor(key)
}

func deriveKey(masterKey []byte) []byte {
	hash := sha256.Sum256(masterKey)
	return hash[:]
}

func (e *AESGCMEncryptor) Encrypt(plaintext []byte, keyID string) (string, error) {
	if len(plaintext) == 0 {
		return "", nil
	}

	aead, err := aes.NewCipher(e.masterKey)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(aead)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	aad := []byte(keyID)

	ciphertext := gcm.Seal(nil, nonce, plaintext, aad)

	result := make([]byte, 0, len(nonce)+len(ciphertext))
	result = append(result, nonce...)
	result = append(result, ciphertext...)

	return encryptedPrefix + base64.StdEncoding.EncodeToString(result), nil
}

func (e *AESGCMEncryptor) Decrypt(encoded string, keyID string) ([]byte, error) {
	if !e.IsEncrypted(encoded) {
		return []byte(encoded), nil
	}

	encoded = encoded[len(encryptedPrefix):]

	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decode ciphertext: %w", err)
	}

	if len(data) < nonceSize+1 {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce := data[:nonceSize]
	ciphertext := data[nonceSize:]

	aead, err := aes.NewCipher(e.masterKey)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(aead)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	aad := []byte(keyID)

	plaintext, err := gcm.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return nil, fmt.Errorf("decrypt: %w", err)
	}

	return plaintext, nil
}

func (e *AESGCMEncryptor) IsEncrypted(value string) bool {
	return len(value) > len(encryptedPrefix) && value[:len(encryptedPrefix)] == encryptedPrefix
}

func GenerateMasterKey() (string, error) {
	key := make([]byte, keySize)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return "", fmt.Errorf("generate random key: %w", err)
	}

	return base64.StdEncoding.EncodeToString(key), nil
}
