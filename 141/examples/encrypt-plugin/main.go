package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"io"

	sdk "github.com/dapr-wasm-state/plugin-sdk"
)

var encryptionKey = []byte("dapr-wasm-state-secret-key-32-by")

//go:export before_set
func before_set(keyPtr, keyLen, valuePtr, valueLen uint32) uint64 {
	key := sdk.ReadString(keyPtr, keyLen)
	value := sdk.ReadBytes(valuePtr, valueLen)

	encryptedValue, err := encrypt(value)
	if err != nil {
		return sdk.ReturnError(err)
	}

	encryptedKey, err := encrypt([]byte(key))
	if err != nil {
		return sdk.ReturnError(err)
	}

	resultKey, resultValue := sdk.ReturnKeyValue(string(encryptedKey), encryptedValue)
	return resultKey<<32 | resultValue
}

//go:export after_get
func after_get(keyPtr, keyLen, valuePtr, valueLen uint32) uint64 {
	key := sdk.ReadString(keyPtr, keyLen)
	_ = key
	value := sdk.ReadBytes(valuePtr, valueLen)

	decryptedValue, err := decrypt(value)
	if err != nil {
		return sdk.ReturnError(err)
	}

	return sdk.ReturnBytes(decryptedValue)
}

//go:export before_get
func before_get(keyPtr, keyLen uint32) uint64 {
	key := sdk.ReadString(keyPtr, keyLen)

	encryptedKey, err := encrypt([]byte(key))
	if err != nil {
		return sdk.ReturnError(err)
	}

	return sdk.ReturnString(string(encryptedKey))
}

//go:export before_delete
func before_delete(keyPtr, keyLen uint32) uint64 {
	key := sdk.ReadString(keyPtr, keyLen)

	encryptedKey, err := encrypt([]byte(key))
	if err != nil {
		return sdk.ReturnError(err)
	}

	return sdk.ReturnString(string(encryptedKey))
}

//go:export bulk_before_set
func bulk_before_set(dataPtr, dataLen uint32) uint64 {
	items, err := sdk.DecodeKeyValueMap(dataPtr, dataLen)
	if err != nil {
		return sdk.ReturnError(err)
	}

	encryptedItems := make(map[string][]byte)
	for key, value := range items {
		encryptedKey, err := encrypt([]byte(key))
		if err != nil {
			return sdk.ReturnError(err)
		}

		encryptedValue, err := encrypt(value)
		if err != nil {
			return sdk.ReturnError(err)
		}

		encryptedItems[string(encryptedKey)] = encryptedValue
	}

	return sdk.ReturnKeyValueMap(encryptedItems)
}

//go:export bulk_before_get
func bulk_before_get(dataPtr, dataLen uint32) uint64 {
	keys, err := sdk.DecodeStringArray(dataPtr, dataLen)
	if err != nil {
		return sdk.ReturnError(err)
	}

	encryptedKeys := make([]string, len(keys))
	for i, key := range keys {
		encryptedKey, err := encrypt([]byte(key))
		if err != nil {
			return sdk.ReturnError(err)
		}
		encryptedKeys[i] = string(encryptedKey)
	}

	return sdk.ReturnStringArray(encryptedKeys)
}

//go:export bulk_after_get
func bulk_after_get(keysPtr, keysLen, valuesPtr, valuesLen uint32) uint64 {
	keys, err := sdk.DecodeStringArray(keysPtr, keysLen)
	if err != nil {
		return sdk.ReturnError(err)
	}

	values, err := sdk.DecodeKeyValueMap(valuesPtr, valuesLen)
	if err != nil {
		return sdk.ReturnError(err)
	}

	decryptedValues := make(map[string][]byte)
	for i, encryptedKey := range keys {
		originalKey := keys[i]

		for encKey, encryptedValue := range values {
			if encKey == encryptedKey {
				decryptedValue, err := decrypt(encryptedValue)
				if err != nil {
					return sdk.ReturnError(err)
				}
				decryptedValues[originalKey] = decryptedValue
				break
			}
		}
	}

	return sdk.ReturnKeyValueMap(decryptedValues)
}

//go:export bulk_before_delete
func bulk_before_delete(dataPtr, dataLen uint32) uint64 {
	keys, err := sdk.DecodeStringArray(dataPtr, dataLen)
	if err != nil {
		return sdk.ReturnError(err)
	}

	encryptedKeys := make([]string, len(keys))
	for i, key := range keys {
		encryptedKey, err := encrypt([]byte(key))
		if err != nil {
			return sdk.ReturnError(err)
		}
		encryptedKeys[i] = string(encryptedKey)
	}

	return sdk.ReturnStringArray(encryptedKeys)
}

func encrypt(data []byte) ([]byte, error) {
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	ciphertext := aesGCM.Seal(nonce, nonce, data, nil)
	return ciphertext, nil
}

func decrypt(data []byte) ([]byte, error) {
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := aesGCM.NonceSize()
	if len(data) < nonceSize {
		return nil, err
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}

func main() {}
