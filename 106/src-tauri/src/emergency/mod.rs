use shamirsecretsharing::create_shares;
use shamirsecretsharing::combine_shares;
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::RngCore;
use uuid::Uuid;
use anyhow::Result;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum EmergencyError {
    #[error("秘密共享失败: {0}")]
    ShareError(String),
    #[error("恢复失败: {0}")]
    RecoverError(String),
    #[error("份额不足: 需要 {required} 个，当前 {got} 个")]
    InsufficientShares { required: usize, got: usize },
    #[error("联系人数量超出限制: 最多 5 个联系人")]
    TooManyContacts,
    #[error("联系人不存在")]
    ContactNotFound,
    #[error("未设置紧急联系人")]
    NoContactsSet,
    #[error("验证失败: {0}")]
    VerificationError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmergencyContact {
    pub id: String,
    pub name: String,
    pub email: String,
    pub phone: Option<String>,
    pub share: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmergencyConfig {
    pub enabled: bool,
    pub threshold: usize,
    pub waiting_period_days: i64,
    pub contacts: Vec<EmergencyContact>,
    pub master_key_hash: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryRequest {
    pub contact_id: String,
    pub share: String,
    pub verification_code: String,
    pub requested_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryStatus {
    pub can_recover: bool,
    pub collected_shares: usize,
    pub required_shares: usize,
    pub waiting_period_remaining_days: i64,
    pub contacts_responded: Vec<String>,
}

pub struct EmergencyManager;

impl EmergencyManager {
    pub fn split_secret(secret: &[u8], num_shares: usize, threshold: usize) -> Result<Vec<Vec<u8>>> {
        if num_shares < 3 || num_shares > 5 {
            return Err(EmergencyError::TooManyContacts.into());
        }
        if threshold < 2 || threshold > num_shares {
            return Err(EmergencyError::ShareError(
                "阈值必须在 2 到联系人数量之间".to_string()
            ).into());
        }

        let shares = create_shares(secret, threshold, num_shares)
            .map_err(|e| EmergencyError::ShareError(e.to_string()))?;

        Ok(shares)
    }

    pub fn recover_secret(shares: &[Vec<u8>]) -> Result<Vec<u8>> {
        if shares.len() < 2 {
            return Err(EmergencyError::InsufficientShares {
                required: 2,
                got: shares.len(),
            }.into());
        }

        let secret = combine_shares(shares)
            .map_err(|e| EmergencyError::RecoverError(e.to_string()))?;

        Ok(secret)
    }

    pub fn encode_share(share: &[u8]) -> String {
        BASE64.encode(share)
    }

    pub fn decode_share(encoded: &str) -> Result<Vec<u8>> {
        BASE64.decode(encoded)
            .map_err(|e| EmergencyError::RecoverError(e.to_string()).into())
    }

    pub fn generate_contact_id() -> String {
        Uuid::new_v4().to_string()
    }

    pub fn generate_verification_code() -> String {
        let mut rng = rand::thread_rng();
        let mut code = vec![0u8; 6];
        rng.fill_bytes(&mut code);
        code.iter()
            .map(|b| format!("{:02X}", b))
            .collect::<String>()
            .to_uppercase()
            .chars()
            .take(8)
            .collect()
    }

    pub fn create_contacts(
        names: &[String],
        emails: &[String],
        phones: &[Option<String>],
        secret: &[u8],
        threshold: usize,
    ) -> Result<Vec<EmergencyContact>> {
        let num_contacts = names.len();
        if num_contacts < 3 || num_contacts > 5 {
            return Err(EmergencyError::TooManyContacts.into());
        }

        let shares = Self::split_secret(secret, num_contacts, threshold)?;
        let now = chrono::Utc::now().to_rfc3339();

        let contacts: Vec<EmergencyContact> = names
            .iter()
            .zip(emails.iter())
            .zip(phones.iter())
            .zip(shares.iter())
            .map(|(((name, email), phone), share)| EmergencyContact {
                id: Self::generate_contact_id(),
                name: name.clone(),
                email: email.clone(),
                phone: phone.clone(),
                share: Self::encode_share(share),
                created_at: now.clone(),
            })
            .collect();

        Ok(contacts)
    }

    pub fn validate_shares(
        shares: &[String],
        expected_secret_hash: &str,
    ) -> Result<bool> {
        let decoded_shares: Result<Vec<Vec<u8>>> = shares
            .iter()
            .map(|s| Self::decode_share(s))
            .collect();

        let decoded_shares = decoded_shares?;
        let secret = Self::recover_secret(&decoded_shares)?;

        let hash = sha2::Sha256::hash(&secret);
        let hash_hex = hex::encode(hash);

        Ok(hash_hex == expected_secret_hash)
    }
}

pub fn days_until_recovery(
    created_at: &str,
    waiting_period_days: i64,
) -> i64 {
    let created = chrono::DateTime::parse_from_rfc3339(created_at)
        .unwrap_or_else(|_| chrono::Utc::now());
    let now = chrono::Utc::now();
    let elapsed = now.signed_duration_since(created.with_timezone(&chrono::Utc));
    let remaining = waiting_period_days - elapsed.num_days();
    
    remaining.max(0)
}
