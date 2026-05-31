use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use zeroize::{Zeroize, ZeroizeOnDrop};
use thiserror::Error;
use anyhow::Result;

const PBKDF2_ITERATIONS: u32 = 100_000;
const SALT_LENGTH: usize = 32;
const NONCE_LENGTH: usize = 12;
const TAG_LENGTH: usize = 16;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("加密失败: {0}")]
    EncryptionError(String),
    #[error("解密失败: {0}")]
    DecryptionError(String),
    #[error("密钥派生失败: {0}")]
    KeyDerivationError(String),
    #[error("无效的密钥")]
    InvalidKey,
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct DerivedKey {
    key: [u8; 32],
}

impl DerivedKey {
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.key
    }
}

#[derive(Clone)]
pub struct CryptoManager {
    cipher: Aes256Gcm,
    salt: Vec<u8>,
}

impl CryptoManager {
    pub fn new(password: &str, salt: Option<&[u8]>) -> Result<Self> {
        let salt = match salt {
            Some(s) => s.to_vec(),
            None => {
                let mut new_salt = vec![0u8; SALT_LENGTH];
                rand::thread_rng().fill_bytes(&mut new_salt);
                new_salt
            }
        };

        let derived_key = Self::derive_key(password, &salt)?;
        let key = Key::<Aes256Gcm>::from_slice(derived_key.as_bytes());
        let cipher = Aes256Gcm::new(key);

        Ok(Self { cipher, salt })
    }

    pub fn derive_key(password: &str, salt: &[u8]) -> Result<DerivedKey> {
        let mut key = [0u8; 32];
        pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key)
            .map_err(|e| CryptoError::KeyDerivationError(e.to_string()))?;

        Ok(DerivedKey { key })
    }

    pub fn get_salt(&self) -> &[u8] {
        &self.salt
    }

    pub fn get_salt_base64(&self) -> String {
        BASE64.encode(&self.salt)
    }

    pub fn encrypt(&self, plaintext: &str) -> Result<EncryptedData> {
        let mut nonce_bytes = [0u8; NONCE_LENGTH];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| CryptoError::EncryptionError(e.to_string()))?;

        Ok(EncryptedData {
            ciphertext: BASE64.encode(&ciphertext),
            iv: BASE64.encode(&nonce_bytes),
            tag: String::new(),
        })
    }

    pub fn decrypt(&self, encrypted: &EncryptedData) -> Result<String> {
        let nonce_bytes = BASE64
            .decode(&encrypted.iv)
            .map_err(|e| CryptoError::DecryptionError(e.to_string()))?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = BASE64
            .decode(&encrypted.ciphertext)
            .map_err(|e| CryptoError::DecryptionError(e.to_string()))?;

        let plaintext = self
            .cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| CryptoError::DecryptionError(e.to_string()))?;

        String::from_utf8(plaintext)
            .map_err(|e| CryptoError::DecryptionError(e.to_string()))
    }

    pub fn encrypt_for_db(&self, plaintext: &str) -> Result<(String, String, String)> {
        let mut nonce_bytes = [0u8; NONCE_LENGTH];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| CryptoError::EncryptionError(e.to_string()))?;

        let tag_start = ciphertext.len().saturating_sub(TAG_LENGTH);
        let tag = &ciphertext[tag_start..];

        Ok((
            BASE64.encode(&ciphertext),
            BASE64.encode(&nonce_bytes),
            BASE64.encode(tag),
        ))
    }

    pub fn decrypt_from_db(
        &self,
        ciphertext_b64: &str,
        iv_b64: &str,
        _tag_b64: &str,
    ) -> Result<String> {
        let nonce_bytes = BASE64
            .decode(iv_b64)
            .map_err(|e| CryptoError::DecryptionError(e.to_string()))?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = BASE64
            .decode(ciphertext_b64)
            .map_err(|e| CryptoError::DecryptionError(e.to_string()))?;

        let plaintext = self
            .cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| CryptoError::DecryptionError(e.to_string()))?;

        String::from_utf8(plaintext)
            .map_err(|e| CryptoError::DecryptionError(e.to_string()))
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EncryptedData {
    pub ciphertext: String,
    pub iv: String,
    pub tag: String,
}

pub fn generate_password(length: usize, include_symbols: bool) -> String {
    let mut charset = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".to_vec();
    if include_symbols {
        charset.extend_from_slice(b"!@#$%^&*()_+-=[]{}|;:,.<>?");
    }

    let mut rng = rand::thread_rng();
    let mut password = String::with_capacity(length);

    for _ in 0..length {
        let idx = rng.next_u32() as usize % charset.len();
        password.push(charset[idx] as char);
    }

    password
}
