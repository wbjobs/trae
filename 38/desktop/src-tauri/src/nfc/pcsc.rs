use pcsc::{Context, Scope, ReaderState, State, Attribute};
use std::collections::HashSet;
use std::time::Duration;
use tracing::{info, warn, error};

use super::NFCError;

#[derive(Debug, Clone, PartialEq)]
pub enum CardType {
    MifareClassic1K,
    MifareClassic4K,
    MifareUltralight,
    MifareDesfire,
    NTAG21x,
    Unknown,
}

impl std::fmt::Display for CardType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CardType::MifareClassic1K => write!(f, "Mifare Classic 1K"),
            CardType::MifareClassic4K => write!(f, "Mifare Classic 4K"),
            CardType::MifareUltralight => write!(f, "Mifare Ultralight"),
            CardType::MifareDesfire => write!(f, "Mifare Desfire"),
            CardType::NTAG21x => write!(f, "NTAG21x"),
            CardType::Unknown => write!(f, "Unknown"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct NFCReader {
    pub name: String,
    pub connected: bool,
    pub card_present: bool,
    pub card_uid: Option<Vec<u8>>,
    pub card_type: Option<CardType>,
}

pub struct NFCManager {
    ctx: Context,
    readers: Vec<NFCReader>,
}

impl NFCManager {
    pub fn new() -> Result<Self, NFCError> {
        let ctx = Context::establish(Scope::User)
            .map_err(|e| NFCError::PcscError(format!("Failed to establish context: {}", e)))?;
        Ok(Self { ctx, readers: Vec::new() })
    }

    pub fn list_readers(&mut self) -> Result<Vec<NFCReader>, NFCError> {
        let reader_names = self.ctx.list_readers_owned()
            .map_err(|e| NFCError::PcscError(format!("Failed to list readers: {}", e)))?;
        
        let mut readers = Vec::new();
        for name in reader_names {
            let mut states = [ReaderState::new(name.clone(), State::UNAWARE)];
            
            match self.ctx.get_status_change(Duration::from_millis(100), &mut states) {
                Ok(_) => {
                    let state = &states[0];
                    let event_state = state.event_state();
                    let card_present = event_state.contains(State::PRESENT);
                    let atr = state.atr();
                    
                    let (card_uid, card_type) = if card_present {
                        match self.connect_reader(&name) {
                            Ok(card) => {
                                let uid = card.get_uid().ok();
                                let card_type = detect_card_type(atr);
                                (uid, Some(card_type))
                            }
                            Err(e) => {
                                warn!("Failed to connect to card: {}", e);
                                (None, detect_card_type(atr))
                            }
                        }
                    } else {
                        (None, None)
                    };

                    readers.push(NFCReader {
                        name: name.to_string_lossy().to_string(),
                        connected: true,
                        card_present,
                        card_uid,
                        card_type,
                    });
                }
                Err(e) => {
                    warn!("Failed to get status for reader {:?}: {}", name, e);
                    readers.push(NFCReader {
                        name: name.to_string_lossy().to_string(),
                        connected: false,
                        card_present: false,
                        card_uid: None,
                        card_type: None,
                    });
                }
            }
        }
        
        self.readers = readers.clone();
        Ok(readers)
    }

    pub fn connect_reader(&self, reader_name: &str) -> Result<ConnectedCard, NFCError> {
        let reader_names = self.ctx.list_readers_owned()
            .map_err(|e| NFCError::PcscError(format!("Failed to list readers: {}", e)))?;
        
        let target = reader_names.iter()
            .find(|r| r.to_string_lossy() == reader_name)
            .ok_or(NFCError::NoReader)?;
        
        let card = self.ctx.connect(target, pcsc::ShareMode::Shared, pcsc::Protocols::T1)
            .map_err(|e| NFCError::PcscError(format!("Failed to connect: {}", e)))?;
        
        Ok(ConnectedCard { card })
    }

    pub fn wait_for_card(&self, reader_name: &str, timeout_ms: u32) -> Result<ConnectedCard, NFCError> {
        let start = std::time::Instant::now();
        let timeout = Duration::from_millis(timeout_ms as u64);
        
        loop {
            if start.elapsed() > timeout {
                return Err(NFCError::CardNotFound);
            }
            
            match self.connect_reader(reader_name) {
                Ok(card) => return Ok(card),
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(200));
                }
            }
        }
    }
}

pub struct ConnectedCard {
    card: pcsc::Card,
}

impl ConnectedCard {
    pub fn get_uid(&self) -> Result<Vec<u8>, NFCError> {
        let get_uid_cmd: [u8; 10] = [0xFF, 0xCA, 0x00, 0x00, 0x00];
        let mut response = [0u8; 256];
        
        let response_len = self.transmit_with_timeout(&get_uid_cmd, &mut response, Duration::from_millis(500))?;
        
        if response_len >= 2 && response[response_len - 2] == 0x90 && response[response_len - 1] == 0x00 {
            Ok(response[..response_len - 2].to_vec())
        } else {
            Err(NFCError::OperationFailed("Failed to get UID".into()))
        }
    }

    pub fn transmit(&self, command: &[u8], response: &mut [u8]) -> Result<usize, NFCError> {
        self.transmit_with_timeout(command, response, Duration::from_millis(500))
    }

    pub fn transmit_with_timeout(&self, command: &[u8], response: &mut [u8], timeout: Duration) -> Result<usize, NFCError> {
        let result = self.card.transmit(command, response)
            .map_err(|e| {
                let err_str = format!("{}", e);
                if err_str.contains("timeout") || err_str.contains("Timeout") {
                    NFCError::OperationFailed(format!("APDU command timeout"))
                } else {
                    NFCError::PcscError(err_str)
                }
            })?;
        Ok(result.len())
    }

    pub fn transmit_with_retry(&self, command: &[u8], response: &mut [u8], max_retries: usize, initial_timeout_ms: u64) -> Result<usize, NFCError> {
        let mut timeout_ms = initial_timeout_ms;
        
        for attempt in 1..=max_retries {
            let result = self.transmit_with_timeout(command, response, Duration::from_millis(timeout_ms));
            
            match result {
                Ok(len) => {
                    info!("APDU command succeeded on attempt {} (timeout: {}ms)", attempt, timeout_ms);
                    return Ok(len);
                }
                Err(NFCError::OperationFailed(msg)) if msg.contains("timeout") => {
                    warn!("APDU command timeout on attempt {} (timeout: {}ms)", attempt, timeout_ms);
                    if attempt < max_retries {
                        timeout_ms *= 2;
                        std::thread::sleep(Duration::from_millis(100));
                        continue;
                    }
                    return Err(NFCError::OperationFailed(format!(
                        "APDU command timeout after {} attempts, last timeout: {}ms", 
                        max_retries, timeout_ms
                    )));
                }
                Err(e) => {
                    return Err(e);
                }
            }
        }
        
        Err(NFCError::OperationFailed("Max retries exceeded".into()))
    }

    pub fn disconnect(self) {
        let _ = self.card.disconnect(pcsc::Disposition::LeaveCard);
    }
}

fn detect_card_type(atr: &[u8]) -> CardType {
    if atr.len() < 3 {
        return CardType::Unknown;
    }

    if atr.len() >= 7 && atr[3] == 0x88 && atr[4] == 0x01 {
        return CardType::MifareClassic1K;
    }
    
    if atr.len() >= 7 && atr[3] == 0x98 && atr[4] == 0x00 {
        return CardType::MifareClassic4K;
    }
    
    if atr.windows(4).any(|w| w == [0x03, 0x04, 0x03, 0x02]) {
        return CardType::NTAG21x;
    }
    
    if atr.windows(3).any(|w| w == [0x04, 0x03, 0x02]) {
        return CardType::MifareUltralight;
    }

    CardType::Unknown
}

pub fn uid_to_string(uid: &[u8]) -> String {
    uid.iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(":")
}

pub fn string_to_uid(s: &str) -> Result<Vec<u8>, NFCError> {
    let cleaned: String = s.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if cleaned.len() % 2 != 0 {
        return Err(NFCError::InvalidParam("Invalid UID format".into()));
    }
    
    (0..cleaned.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&cleaned[i..i + 2], 16)
            .map_err(|_| NFCError::InvalidParam("Invalid hex character".into())))
        .collect()
}
