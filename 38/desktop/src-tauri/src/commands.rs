use tauri::{State, command};
use serde::{Deserialize, Serialize};
use parking_lot::Mutex;
use std::sync::Arc;
use tracing::{info, error, warn};

use crate::AppState;
use crate::nfc::{
    NFCManager, NFCError, NfcReaderInfo, AuthResult, ReadBlockResult, WriteResult,
    MifareKey, MifareKeyType, authenticate_mifare_block, read_mifare_block, 
    write_mifare_block, write_uid_to_pn532, pcsc::uid_to_string,
};
use crate::grpc::{GrpcClient, GrpcConnectionResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticateRequest {
    pub reader_name: String,
    pub block: u8,
    pub key_type: String,
    pub key_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadBlockRequest {
    pub reader_name: String,
    pub block: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteBlockRequest {
    pub reader_name: String,
    pub block: u8,
    pub data_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteUidRequest {
    pub reader_name: String,
    pub uid_hex: String,
}

#[command]
pub async fn list_nfc_readers(
    state: State<'_, AppState>,
) -> Result<Vec<NfcReaderInfo>, String> {
    let mut nfc_manager = state.nfc_manager.lock();
    
    if nfc_manager.is_none() {
        match NFCManager::new() {
            Ok(manager) => {
                *nfc_manager = Some(manager);
            }
            Err(e) => {
                error!("Failed to create NFC manager: {}", e);
                return Err(format!("Failed to initialize NFC: {}", e));
            }
        }
    }

    let manager = nfc_manager.as_mut().unwrap();
    
    match manager.list_readers() {
        Ok(readers) => {
            let result = readers.iter().map(|r| NfcReaderInfo {
                name: r.name.clone(),
                status: if r.connected { "connected" } else { "disconnected" }.to_string(),
                card_present: r.card_present,
                card_uid: r.card_uid.as_ref().map(|uid| uid_to_string(uid)),
                card_type: r.card_type.as_ref().map(|t| t.to_string()),
            }).collect();
            Ok(result)
        }
        Err(e) => {
            error!("Failed to list readers: {}", e);
            Err(format!("Failed to list readers: {}", e))
        }
    }
}

#[command]
pub async fn connect_nfc_reader(
    state: State<'_, AppState>,
    reader_name: String,
) -> Result<bool, String> {
    let mut nfc_manager = state.nfc_manager.lock();
    
    if nfc_manager.is_none() {
        match NFCManager::new() {
            Ok(manager) => {
                *nfc_manager = Some(manager);
            }
            Err(e) => {
                return Err(format!("Failed to initialize NFC: {}", e));
            }
        }
    }

    let manager = nfc_manager.as_ref().unwrap();
    
    match manager.connect_reader(&reader_name) {
        Ok(_) => Ok(true),
        Err(e) => {
            error!("Failed to connect to reader {}: {}", reader_name, e);
            Err(format!("Failed to connect: {}", e))
        }
    }
}

#[command]
pub async fn disconnect_nfc_reader(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut nfc_manager = state.nfc_manager.lock();
    *nfc_manager = None;
    Ok(())
}

#[command]
pub async fn authenticate_mifare(
    state: State<'_, AppState>,
    request: AuthenticateRequest,
) -> Result<AuthResult, String> {
    let nfc_manager = state.nfc_manager.lock();
    
    let manager = nfc_manager.as_ref().ok_or_else(|| "NFC manager not initialized".to_string())?;
    
    let key_type = match request.key_type.as_str() {
        "A" | "a" => MifareKeyType::A,
        "B" | "b" => MifareKeyType::B,
        _ => return Err("Invalid key type, must be A or B".to_string()),
    };

    let key = MifareKey::from_hex(&request.key_hex, key_type)
        .map_err(|e| format!("Invalid key: {}", e))?;

    let card = manager.connect_reader(&request.reader_name)
        .map_err(|e| format!("Failed to connect to card: {}", e))?;

    match authenticate_mifare_block(&card, request.block, &key) {
        Ok(success) => {
            if success {
                Ok(AuthResult {
                    success: true,
                    message: format!("Successfully authenticated block {}", request.block),
                    block: request.block,
                    key_type: request.key_type,
                })
            } else {
                Ok(AuthResult {
                    success: false,
                    message: "Authentication failed, wrong key".to_string(),
                    block: request.block,
                    key_type: request.key_type,
                })
            }
        }
        Err(e) => {
            error!("Authentication error: {}", e);
            Err(format!("Authentication error: {}", e))
        }
    }
}

#[command]
pub async fn read_mifare_block(
    state: State<'_, AppState>,
    request: ReadBlockRequest,
) -> Result<ReadBlockResult, String> {
    let nfc_manager = state.nfc_manager.lock();
    
    let manager = nfc_manager.as_ref().ok_or_else(|| "NFC manager not initialized".to_string())?;

    let card = manager.connect_reader(&request.reader_name)
        .map_err(|e| format!("Failed to connect to card: {}", e))?;

    match read_mifare_block(&card, request.block) {
        Ok(data) => {
            let hex = hex::encode(&data);
            Ok(ReadBlockResult {
                success: true,
                data: Some(hex),
                message: format!("Successfully read block {}", request.block),
            })
        }
        Err(e) => {
            error!("Read error: {}", e);
            Err(format!("Read error: {}", e))
        }
    }
}

#[command]
pub async fn write_mifare_block(
    state: State<'_, AppState>,
    request: WriteBlockRequest,
) -> Result<WriteResult, String> {
    let nfc_manager = state.nfc_manager.lock();
    
    let manager = nfc_manager.as_ref().ok_or_else(|| "NFC manager not initialized".to_string())?;

    let data = hex::decode(&request.data_hex)
        .map_err(|_| "Invalid hex data".to_string())?;

    if data.len() != 16 {
        return Err("Data must be exactly 16 bytes (32 hex characters)".to_string());
    }

    let mut block_data = [0u8; 16];
    block_data.copy_from_slice(&data);

    let card = manager.connect_reader(&request.reader_name)
        .map_err(|e| format!("Failed to connect to card: {}", e))?;

    match write_mifare_block(&card, request.block, &block_data) {
        Ok(_) => {
            Ok(WriteResult {
                success: true,
                message: format!("Successfully wrote block {}", request.block),
            })
        }
        Err(e) => {
            error!("Write error: {}", e);
            Err(format!("Write error: {}", e))
        }
    }
}

#[command]
pub async fn write_uid_to_pn532(
    state: State<'_, AppState>,
    request: WriteUidRequest,
) -> Result<WriteResult, String> {
    let nfc_manager = state.nfc_manager.lock();
    
    let manager = nfc_manager.as_ref().ok_or_else(|| "NFC manager not initialized".to_string())?;

    let uid_cleaned: String = request.uid_hex.chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect();

    let uid = hex::decode(&uid_cleaned)
        .map_err(|_| "Invalid UID hex".to_string())?;

    if uid.len() != 4 && uid.len() != 7 {
        return Err("UID must be 4 or 7 bytes".to_string());
    }

    let card = manager.connect_reader(&request.reader_name)
        .map_err(|e| format!("Failed to connect to card: {}", e))?;

    match write_uid_to_pn532(&card, &uid) {
        Ok(_) => {
            Ok(WriteResult {
                success: true,
                message: format!("Successfully wrote UID {}", uid_to_string(&uid)),
            })
        }
        Err(e) => {
            error!("Write UID error: {}", e);
            Err(format!("Write UID error: {}", e))
        }
    }
}

#[command]
pub async fn grpc_connect(
    state: State<'_, AppState>,
    server_address: String,
) -> Result<GrpcConnectionResult, String> {
    let mut grpc_client = state.grpc_client.lock();
    
    match GrpcClient::connect(&server_address).await {
        Ok(client) => {
            *grpc_client = Some(client);
            Ok(GrpcConnectionResult {
                success: true,
                message: "Connected to gRPC server".to_string(),
            })
        }
        Err(e) => {
            error!("Failed to connect to gRPC server: {}", e);
            Ok(GrpcConnectionResult {
                success: false,
                message: format!("Failed to connect: {}", e),
            })
        }
    }
}

#[command]
pub async fn grpc_disconnect(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut grpc_client = state.grpc_client.lock();
    *grpc_client = None;
    Ok(())
}

#[command]
pub async fn grpc_login(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<crate::grpc::LoginResponse, String> {
    let grpc_client = state.grpc_client.lock();
    
    let client = grpc_client.as_ref().ok_or_else(|| "Not connected to gRPC server".to_string())?;
    
    match client.login(&username, &password).await {
        Ok(result) => Ok(result),
        Err(e) => {
            error!("Login error: {}", e);
            Err(format!("Login error: {}", e))
        }
    }
}

#[command]
pub async fn grpc_register_card(
    state: State<'_, AppState>,
    card: crate::grpc::RegisterCardRequest,
) -> Result<crate::grpc::RegisterCardResponse, String> {
    let grpc_client = state.grpc_client.lock();
    
    let client = grpc_client.as_ref().ok_or_else(|| "Not connected to gRPC server".to_string())?;
    
    match client.register_card(card).await {
        Ok(result) => Ok(result),
        Err(e) => {
            error!("Register card error: {}", e);
            Err(format!("Register card error: {}", e))
        }
    }
}

#[command]
pub async fn grpc_revoke_card(
    state: State<'_, AppState>,
    card_id: String,
) -> Result<crate::grpc::RevokeCardResponse, String> {
    let grpc_client = state.grpc_client.lock();
    
    let client = grpc_client.as_ref().ok_or_else(|| "Not connected to gRPC server".to_string())?;
    
    match client.revoke_card(&card_id).await {
        Ok(result) => Ok(result),
        Err(e) => {
            error!("Revoke card error: {}", e);
            Err(format!("Revoke card error: {}", e))
        }
    }
}

#[command]
pub async fn grpc_list_cards(
    state: State<'_, AppState>,
) -> Result<Vec<crate::grpc::CardInfo>, String> {
    let grpc_client = state.grpc_client.lock();
    
    let client = grpc_client.as_ref().ok_or_else(|| "Not connected to gRPC server".to_string())?;
    
    match client.list_cards().await {
        Ok(result) => Ok(result),
        Err(e) => {
            error!("List cards error: {}", e);
            Err(format!("List cards error: {}", e))
        }
    }
}

#[command]
pub async fn grpc_list_permission_groups(
    state: State<'_, AppState>,
) -> Result<Vec<crate::grpc::PermissionGroupInfo>, String> {
    let grpc_client = state.grpc_client.lock();
    
    let client = grpc_client.as_ref().ok_or_else(|| "Not connected to gRPC server".to_string())?;
    
    match client.list_permission_groups().await {
        Ok(result) => Ok(result),
        Err(e) => {
            error!("List permission groups error: {}", e);
            Err(format!("List permission groups error: {}", e))
        }
    }
}

#[command]
pub async fn grpc_list_access_logs(
    state: State<'_, AppState>,
    limit: i32,
    offset: i32,
) -> Result<crate::grpc::ListAccessLogsResponse, String> {
    let grpc_client = state.grpc_client.lock();
    
    let client = grpc_client.as_ref().ok_or_else(|| "Not connected to gRPC server".to_string())?;
    
    match client.list_access_logs(limit, offset).await {
        Ok(result) => Ok(result),
        Err(e) => {
            error!("List access logs error: {}", e);
            Err(format!("List access logs error: {}", e))
        }
    }
}

#[command]
pub async fn grpc_remote_open_door(
    state: State<'_, AppState>,
    door_id: String,
    reason: String,
) -> Result<crate::grpc::OpenDoorResponse, String> {
    let grpc_client = state.grpc_client.lock();
    
    let client = grpc_client.as_ref().ok_or_else(|| "Not connected to gRPC server".to_string())?;
    
    match client.remote_open_door(&door_id, &reason).await {
        Ok(result) => Ok(result),
        Err(e) => {
            error!("Remote open door error: {}", e);
            Err(format!("Remote open door error: {}", e))
        }
    }
}
