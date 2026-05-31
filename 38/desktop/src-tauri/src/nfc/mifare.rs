use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use super::pcsc::ConnectedCard;
use super::NFCError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MifareKeyType {
    A,
    B,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MifareKey {
    pub key_type: MifareKeyType,
    pub value: [u8; 6],
}

impl MifareKey {
    pub fn new_a(value: [u8; 6]) -> Self {
        Self { key_type: MifareKeyType::A, value }
    }

    pub fn new_b(value: [u8; 6]) -> Self {
        Self { key_type: MifareKeyType::B, value }
    }

    pub fn from_hex(hex: &str, key_type: MifareKeyType) -> Result<Self, NFCError> {
        let cleaned: String = hex.chars().filter(|c| c.is_ascii_hexdigit()).collect();
        if cleaned.len() != 12 {
            return Err(NFCError::InvalidParam("Key must be 12 hex characters".into()));
        }
        
        let mut value = [0u8; 6];
        for i in 0..6 {
            value[i] = u8::from_str_radix(&cleaned[i * 2..i * 2 + 2], 16)
                .map_err(|_| NFCError::InvalidParam("Invalid hex character".into()))?;
        }
        
        Ok(Self { key_type, value })
    }

    pub fn default_key_a() -> Self {
        Self::new_a([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
    }

    pub fn default_key_b() -> Self {
        Self::new_b([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
    }
}

pub fn authenticate_mifare_block(
    card: &ConnectedCard,
    block: u8,
    key: &MifareKey,
) -> Result<bool, NFCError> {
    let auth_command = match key.key_type {
        MifareKeyType::A => [0x60, block, 0x00],
        MifareKeyType::B => [0x61, block, 0x00],
    };

    let mut full_command = Vec::with_capacity(10);
    full_command.extend_from_slice(&[0xFF, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00]);
    full_command.extend_from_slice(&auth_command);
    full_command.extend_from_slice(&key.value);

    let mut response = [0u8; 256];
    let response_len = card.transmit(&full_command, &mut response)?;

    if response_len >= 2 {
        let sw1 = response[response_len - 2];
        let sw2 = response[response_len - 1];
        
        if sw1 == 0x90 && sw2 == 0x00 {
            info!("Authentication successful for block {}", block);
            return Ok(true);
        } else if sw1 == 0x63 && sw2 == 0x00 {
            warn!("Authentication failed for block {}: wrong key", block);
            return Ok(false);
        } else {
            warn!("Authentication failed for block {}: SW=0x{:02X}{:02X}", block, sw1, sw2);
            return Ok(false);
        }
    }

    Err(NFCError::OperationFailed("Invalid response".into()))
}

pub fn read_mifare_block(
    card: &ConnectedCard,
    block: u8,
) -> Result<[u8; 16], NFCError> {
    let command = [0xFF, 0xB0, 0x00, block, 0x10];
    let mut response = [0u8; 256];
    let response_len = card.transmit(&command, &mut response)?;

    if response_len >= 18 {
        let sw1 = response[response_len - 2];
        let sw2 = response[response_len - 1];
        
        if sw1 == 0x90 && sw2 == 0x00 {
            let mut data = [0u8; 16];
            data.copy_from_slice(&response[..16]);
            return Ok(data);
        } else {
            return Err(NFCError::OperationFailed(
                format!("Read failed: SW=0x{:02X}{:02X}", sw1, sw2)
            ));
        }
    }

    Err(NFCError::OperationFailed("Invalid response length".into()))
}

pub fn write_mifare_block(
    card: &ConnectedCard,
    block: u8,
    data: &[u8; 16],
) -> Result<(), NFCError> {
    const MAX_RETRIES: usize = 3;
    const INITIAL_TIMEOUT_MS: u64 = 200;

    for attempt in 1..=MAX_RETRIES {
        let result = attempt_write_block(card, block, data, INITIAL_TIMEOUT_MS * (1u64 << (attempt - 1)));
        
        match result {
            Ok(()) => {
                info!("Successfully wrote block {} on attempt {}", block, attempt);
                return Ok(());
            }
            Err(NFCError::OperationFailed(msg)) if msg.contains("timeout") || msg.contains("CRC") || msg.contains("mismatch") => {
                warn!("Write block {} attempt {} failed: {}", block, attempt, msg);
                if attempt < MAX_RETRIES {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    continue;
                }
                return Err(NFCError::OperationFailed(format!(
                    "Write block {} failed after {} attempts: {}", 
                    block, MAX_RETRIES, msg
                )));
            }
            Err(e) => {
                return Err(e);
            }
        }
    }

    Err(NFCError::OperationFailed("Max retries exceeded".into()))
}

fn attempt_write_block(
    card: &ConnectedCard,
    block: u8,
    data: &[u8; 16],
    timeout_ms: u64,
) -> Result<(), NFCError> {
    let mut command = Vec::with_capacity(21);
    command.extend_from_slice(&[0xFF, 0xD6, 0x00, block, 0x10]);
    command.extend_from_slice(data);

    let mut response = [0u8; 256];
    let response_len = card.transmit_with_timeout(&command, &mut response, std::time::Duration::from_millis(timeout_ms))?;

    if response_len >= 2 {
        let sw1 = response[response_len - 2];
        let sw2 = response[response_len - 1];
        
        if sw1 == 0x90 && sw2 == 0x00 {
            info!("Write command succeeded for block {}", block);
            
            match verify_write(card, block, data, timeout_ms) {
                Ok(()) => {
                    info!("Write verification succeeded for block {}", block);
                    return Ok(());
                }
                Err(e) => {
                    warn!("Write verification failed for block {}: {}", block, e);
                    return Err(e);
                }
            }
        } else {
            return Err(NFCError::OperationFailed(
                format!("Write failed: SW=0x{:02X}{:02X}", sw1, sw2)
            ));
        }
    }

    Err(NFCError::OperationFailed("Invalid response".into()))
}

fn verify_write(
    card: &ConnectedCard,
    block: u8,
    expected_data: &[u8; 16],
    timeout_ms: u64,
) -> Result<(), NFCError> {
    let command = [0xFF, 0xB0, 0x00, block, 0x10];
    let mut response = [0u8; 256];
    
    let response_len = card.transmit_with_timeout(&command, &mut response, std::time::Duration::from_millis(timeout_ms))?;

    if response_len >= 18 {
        let sw1 = response[response_len - 2];
        let sw2 = response[response_len - 1];
        
        if sw1 == 0x90 && sw2 == 0x00 {
            let mut read_data = [0u8; 16];
            read_data.copy_from_slice(&response[..16]);
            
            if read_data == *expected_data {
                return Ok(());
            } else {
                let expected_hex = hex::encode(expected_data);
                let read_hex = hex::encode(&read_data);
                return Err(NFCError::OperationFailed(
                    format!("CRC verification failed: expected {}, got {}", expected_hex, read_hex)
                ));
            }
        } else {
            return Err(NFCError::OperationFailed(
                format!("Read for verification failed: SW=0x{:02X}{:02X}", sw1, sw2)
            ));
        }
    }

    Err(NFCError::OperationFailed("Invalid response length during verification".into()))
}

pub fn write_uid_to_pn532(
    card: &ConnectedCard,
    uid: &[u8],
) -> Result<(), NFCError> {
    if uid.len() != 4 && uid.len() != 7 {
        return Err(NFCError::InvalidParam("UID must be 4 or 7 bytes".into()));
    }

    let mut block0 = [0u8; 16];
    block0[..uid.len()].copy_from_slice(uid);
    
    if uid.len() == 4 {
        let mut bcc = 0u8;
        for byte in uid {
            bcc ^= byte;
        }
        block0[4] = bcc;
        block0[5] = 0x88;
        block0[6] = 0x04;
    }

    write_mifare_block(card, 0, &block0)?;

    match verify_uid_write(card, uid) {
        Ok(()) => {
            info!("UID write verification succeeded");
            Ok(())
        }
        Err(e) => {
            warn!("UID write verification failed: {}", e);
            Err(e)
        }
    }
}

fn verify_uid_write(card: &ConnectedCard, expected_uid: &[u8]) -> Result<(), NFCError> {
    match card.get_uid() {
        Ok(uid) => {
            if uid == expected_uid {
                Ok(())
            } else {
                let expected_hex = hex::encode(expected_uid);
                let read_hex = hex::encode(&uid);
                Err(NFCError::OperationFailed(
                    format!("UID verification failed: expected {}, got {}", expected_hex, read_hex)
                ))
            }
        }
        Err(e) => Err(NFCError::OperationFailed(
            format!("Failed to read UID for verification: {}", e)
        )),
    }
}

pub fn get_trailer_block(block: u8) -> u8 {
    ((block / 4) * 4) + 3
}

pub fn is_trailer_block(block: u8) -> bool {
    block % 4 == 3
}
