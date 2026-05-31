pub mod pcsc;
pub mod mifare;
pub mod anti_clone;

pub use pcsc::{NFCManager, NFCReader, CardType};
pub use mifare::{MifareKey, MifareKeyType, authenticate_mifare_block, read_mifare_block, write_mifare_block};
pub use anti_clone::{AntiCloneDetector, AntiCloneResult, ActionType, CardProfile, DetectorConfig};

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum NFCError {
    #[error("PC/SC error: {0}")]
    PcscError(String),
    #[error("No reader available")]
    NoReader,
    #[error("Card not found")]
    CardNotFound,
    #[error("Authentication failed")]
    AuthFailed,
    #[error("Invalid parameter: {0}")]
    InvalidParam(String),
    #[error("Operation failed: {0}")]
    OperationFailed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NfcReaderInfo {
    pub name: String,
    pub status: String,
    pub card_present: bool,
    pub card_uid: Option<String>,
    pub card_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResult {
    pub success: bool,
    pub message: String,
    pub block: u8,
    pub key_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadBlockResult {
    pub success: bool,
    pub data: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteResult {
    pub success: bool,
    pub message: String,
}
