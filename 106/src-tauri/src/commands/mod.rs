use crate::db::{Database, NewPasswordEntry, PasswordEntry};
use crate::crypto::{CryptoManager, generate_password};
use crate::analysis::{analyze_vault, PasswordAnalysis};
use crate::server::HttpServer;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct InitializeVaultRequest {
    pub master_password: String,
    pub db_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InitializeVaultResponse {
    pub success: bool,
    pub salt: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UnlockVaultRequest {
    pub master_password: String,
    pub db_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UnlockVaultResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddPasswordRequest {
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePasswordRequest {
    pub id: String,
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PasswordResponse {
    pub id: String,
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PasswordListItem {
    pub id: String,
    pub title: String,
    pub username: String,
    pub url: Option<String>,
    pub category: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeneratePasswordRequest {
    pub length: Option<usize>,
    pub include_symbols: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PasswordStrengthResponse {
    pub score: u8,
    pub label: String,
    pub suggestions: Vec<String>,
    pub crack_time: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: Option<u16>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub token: Option<String>,
}

fn get_db_path(custom_path: Option<&str>) -> PathBuf {
    match custom_path {
        Some(path) => PathBuf::from(path),
        None => {
            let mut path = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
            path.push("password-manager");
            path.push("vault.db");
            path
        }
    }
}

#[tauri::command]
pub async fn initialize_vault(
    request: InitializeVaultRequest,
    state: State<'_, AppState>,
) -> Result<InitializeVaultResponse, String> {
    let db_path = get_db_path(request.db_path.as_deref());
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let crypto = CryptoManager::new(&request.master_password, None)
        .map_err(|e| e.to_string())?;

    let db_encryption_key = hex::encode(crypto.get_salt());
    let db = Database::init(db_path, &db_encryption_key)
        .map_err(|e| e.to_string())?;

    let salt = crypto.get_salt_base64();

    let mut db_state = state.db.lock().await;
    *db_state = Some(db);

    let mut crypto_state = state.crypto.lock().await;
    *crypto_state = Some(crypto);

    Ok(InitializeVaultResponse {
        success: true,
        salt,
        message: "保险箱创建成功".to_string(),
    })
}

#[tauri::command]
pub async fn unlock_vault(
    request: UnlockVaultRequest,
    state: State<'_, AppState>,
) -> Result<UnlockVaultResponse, String> {
    let db_path = get_db_path(request.db_path.as_deref());

    if !db_path.exists() {
        return Err("保险箱不存在，请先创建".to_string());
    }

    let salt = load_salt_from_db(&db_path)?;
    let salt_bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &salt)
        .map_err(|_| "无效的盐值")?;

    let crypto = CryptoManager::new(&request.master_password, Some(&salt_bytes))
        .map_err(|e| e.to_string())?;

    let db_encryption_key = hex::encode(crypto.get_salt());
    let db = Database::new(db_path, &db_encryption_key)
        .map_err(|_| "密码错误或数据库损坏")?;

    let mut db_state = state.db.lock().await;
    *db_state = Some(db);

    let mut crypto_state = state.crypto.lock().await;
    *crypto_state = Some(crypto);

    Ok(UnlockVaultResponse {
        success: true,
        message: "解锁成功".to_string(),
    })
}

fn load_salt_from_db(db_path: &std::path::Path) -> Result<String, String> {
    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    let salt: String = conn
        .query_row("SELECT value FROM vault_config WHERE key = 'salt'", [], |row| {
            row.get(0)
        })
        .unwrap_or_else(|_| String::new());

    if salt.is_empty() {
        return Err("未找到盐值".to_string());
    }
    Ok(salt)
}

#[tauri::command]
pub async fn lock_vault(state: State<'_, AppState>) -> Result<(), String> {
    let mut db_state = state.db.lock().await;
    *db_state = None;

    let mut crypto_state = state.crypto.lock().await;
    *crypto_state = None;

    let mut server_state = state.server.lock().await;
    *server_state = None;

    Ok(())
}

#[tauri::command]
pub async fn add_password(
    request: AddPasswordRequest,
    state: State<'_, AppState>,
) -> Result<PasswordResponse, String> {
    let crypto = state
        .crypto
        .lock()
        .await
        .as_ref()
        .ok_or("请先解锁保险箱")?
        .clone();

    let (encrypted_password, iv, tag) = crypto
        .encrypt_for_db(&request.password)
        .map_err(|e| e.to_string())?;

    let entry = NewPasswordEntry {
        title: request.title,
        username: request.username,
        encrypted_password,
        url: request.url,
        notes: request.notes,
        category: request.category,
        iv,
        tag,
    };

    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let saved = db.add_password(entry).map_err(|e| e.to_string())?;

    Ok(PasswordResponse {
        id: saved.id,
        title: saved.title,
        username: saved.username,
        password: request.password,
        url: saved.url,
        notes: saved.notes,
        category: saved.category,
        created_at: saved.created_at,
        updated_at: saved.updated_at,
    })
}

#[tauri::command]
pub async fn get_password(
    id: String,
    state: State<'_, AppState>,
) -> Result<PasswordResponse, String> {
    let crypto = state
        .crypto
        .lock()
        .await
        .as_ref()
        .ok_or("请先解锁保险箱")?
        .clone();

    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let entry = db
        .get_password(&id)
        .map_err(|e| e.to_string())?
        .ok_or("密码条目未找到")?;

    let password = crypto
        .decrypt_from_db(&entry.encrypted_password, &entry.iv, &entry.tag)
        .map_err(|e| e.to_string())?;

    Ok(PasswordResponse {
        id: entry.id,
        title: entry.title,
        username: entry.username,
        password,
        url: entry.url,
        notes: entry.notes,
        category: entry.category,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
    })
}

#[tauri::command]
pub async fn update_password(
    request: UpdatePasswordRequest,
    state: State<'_, AppState>,
) -> Result<PasswordResponse, String> {
    let crypto = state
        .crypto
        .lock()
        .await
        .as_ref()
        .ok_or("请先解锁保险箱")?
        .clone();

    let (encrypted_password, iv, tag) = crypto
        .encrypt_for_db(&request.password)
        .map_err(|e| e.to_string())?;

    let entry = NewPasswordEntry {
        title: request.title,
        username: request.username,
        encrypted_password,
        url: request.url,
        notes: request.notes,
        category: request.category,
        iv,
        tag,
    };

    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let updated = db
        .update_password(&request.id, entry)
        .map_err(|e| e.to_string())?;

    Ok(PasswordResponse {
        id: updated.id,
        title: updated.title,
        username: updated.username,
        password: request.password,
        url: updated.url,
        notes: updated.notes,
        category: updated.category,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
    })
}

#[tauri::command]
pub async fn delete_password(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    db.delete_password(&id).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn list_passwords(
    state: State<'_, AppState>,
) -> Result<Vec<PasswordListItem>, String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let entries = db.list_passwords().map_err(|e| e.to_string())?;

    Ok(entries
        .into_iter()
        .map(|e| PasswordListItem {
            id: e.id,
            title: e.title,
            username: e.username,
            url: e.url,
            category: e.category,
            updated_at: e.updated_at,
        })
        .collect())
}

#[tauri::command]
pub async fn search_passwords(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<PasswordListItem>, String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let entries = db.search_passwords(&query).map_err(|e| e.to_string())?;

    Ok(entries
        .into_iter()
        .map(|e| PasswordListItem {
            id: e.id,
            title: e.title,
            username: e.username,
            url: e.url,
            category: e.category,
            updated_at: e.updated_at,
        })
        .collect())
}

#[tauri::command]
pub async fn generate_password(
    request: GeneratePasswordRequest,
) -> Result<String, String> {
    let length = request.length.unwrap_or(24);
    let include_symbols = request.include_symbols.unwrap_or(true);

    Ok(generate_password(length, include_symbols))
}

#[tauri::command]
pub async fn check_password_strength(
    password: String,
) -> Result<PasswordStrengthResponse, String> {
    use crate::analysis::check_password_strength;
    let result = check_password_strength(&password);

    Ok(PasswordStrengthResponse {
        score: result.score,
        label: result.label,
        suggestions: result.suggestions,
        crack_time: result.crack_time,
    })
}

#[tauri::command]
pub async fn analyze_passwords(
    state: State<'_, AppState>,
) -> Result<PasswordAnalysis, String> {
    let crypto = state
        .crypto
        .lock()
        .await
        .as_ref()
        .ok_or("请先解锁保险箱")?
        .clone();

    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let entries = db.list_passwords().map_err(|e| e.to_string())?;

    let mut passwords_with_ids = Vec::new();
    for entry in &entries {
        if let Ok(plaintext) =
            crypto.decrypt_from_db(&entry.encrypted_password, &entry.iv, &entry.tag)
        {
            passwords_with_ids.push((entry.id.clone(), entry.title.clone(), plaintext));
        }
    }

    Ok(analyze_vault(&passwords_with_ids))
}

#[tauri::command]
pub async fn start_server(
    config: ServerConfig,
    state: State<'_, AppState>,
) -> Result<ServerStatus, String> {
    let port = config.port.unwrap_or(9234);

    let crypto = state
        .crypto
        .lock()
        .await
        .as_ref()
        .ok_or("请先解锁保险箱")?
        .clone();

    let server = HttpServer::start(port, crypto)
        .await
        .map_err(|e| e.to_string())?;

    let status = ServerStatus {
        running: true,
        port: Some(server.port()),
        token: Some(server.token().to_string()),
    };

    let mut server_state = state.server.lock().await;
    *server_state = Some(server);

    Ok(status)
}

#[tauri::command]
pub async fn stop_server(state: State<'_, AppState>) -> Result<(), String> {
    let mut server_state = state.server.lock().await;
    if let Some(server) = server_state.take() {
        server.stop().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let server_state = state.server.lock().await;
    match server_state.as_ref() {
        Some(server) => Ok(ServerStatus {
            running: server.is_running(),
            port: Some(server.port()),
            token: Some(server.token().to_string()),
        }),
        None => Ok(ServerStatus {
            running: false,
            port: None,
            token: None,
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetupEmergencyRequest {
    pub contacts: Vec<EmergencyContactInput>,
    pub threshold: usize,
    pub waiting_period_days: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmergencyContactInput {
    pub name: String,
    pub email: String,
    pub phone: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmergencyContactResponse {
    pub id: String,
    pub name: String,
    pub email: String,
    pub phone: Option<String>,
    pub share: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmergencyConfigResponse {
    pub enabled: bool,
    pub threshold: usize,
    pub waiting_period_days: i64,
    pub contacts: Vec<EmergencyContactResponse>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecoveryRequestInput {
    pub contact_id: String,
    pub verification_code: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecoveryRequestResponse {
    pub id: String,
    pub contact_id: String,
    pub contact_name: String,
    pub verification_code: String,
    pub requested_at: String,
    pub approved: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecoveryStatusResponse {
    pub can_recover: bool,
    pub collected_shares: usize,
    pub required_shares: usize,
    pub waiting_period_remaining_days: i64,
    pub contacts_responded: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecoverVaultRequest {
    pub shares: Vec<String>,
}

#[tauri::command]
pub async fn setup_emergency_contacts(
    request: SetupEmergencyRequest,
    state: State<'_, AppState>,
) -> Result<EmergencyConfigResponse, String> {
    let crypto = state
        .crypto
        .lock()
        .await
        .as_ref()
        .ok_or("请先解锁保险箱")?
        .clone();

    let num_contacts = request.contacts.len();
    if num_contacts < 3 {
        return Err("至少需要 3 个紧急联系人".to_string());
    }
    if num_contacts > 5 {
        return Err("最多只能设置 5 个紧急联系人".to_string());
    }
    if request.threshold < 2 || request.threshold > num_contacts {
        return Err(format!(
            "阈值必须在 2 到 {} 之间",
            num_contacts
        ));
    }

    let master_key = crypto.get_salt();
    let key_hash = hex::encode(sha2::Sha256::hash(master_key));

    let names: Vec<String> = request.contacts.iter().map(|c| c.name.clone()).collect();
    let emails: Vec<String> = request.contacts.iter().map(|c| c.email.clone()).collect();
    let phones: Vec<Option<String>> = request.contacts.iter().map(|c| c.phone.clone()).collect();

    let contacts = crate::emergency::EmergencyManager::create_contacts(
        &names,
        &emails,
        &phones,
        master_key,
        request.threshold,
    )
    .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    let db_contacts: Vec<crate::db::DbEmergencyContact> = contacts
        .iter()
        .map(|c| crate::db::DbEmergencyContact {
            id: c.id.clone(),
            name: c.name.clone(),
            email: c.email.clone(),
            phone: c.phone.clone(),
            share: c.share.clone(),
            created_at: c.created_at.clone(),
        })
        .collect();

    let config = crate::db::DbEmergencyConfig {
        enabled: true,
        threshold: request.threshold as i32,
        waiting_period_days: request.waiting_period_days,
        master_key_hash: key_hash,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    db.save_emergency_config(&config, &db_contacts)
        .map_err(|e| e.to_string())?;

    Ok(EmergencyConfigResponse {
        enabled: true,
        threshold: request.threshold,
        waiting_period_days: request.waiting_period_days,
        contacts: contacts
            .into_iter()
            .map(|c| EmergencyContactResponse {
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                share: c.share,
                created_at: c.created_at,
            })
            .collect(),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn get_emergency_config(
    state: State<'_, AppState>,
) -> Result<Option<EmergencyConfigResponse>, String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let config = db.get_emergency_config().map_err(|e| e.to_string())?;

    match config {
        Some(config) if config.enabled => {
            let contacts = db.get_emergency_contacts().map_err(|e| e.to_string())?;
            Ok(Some(EmergencyConfigResponse {
                enabled: config.enabled,
                threshold: config.threshold as usize,
                waiting_period_days: config.waiting_period_days,
                contacts: contacts
                    .into_iter()
                    .map(|c| EmergencyContactResponse {
                        id: c.id,
                        name: c.name,
                        email: c.email,
                        phone: c.phone,
                        share: c.share,
                        created_at: c.created_at,
                    })
                    .collect(),
                created_at: config.created_at,
                updated_at: config.updated_at,
            }))
        }
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn disable_emergency_contacts(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    db.disable_emergency().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn request_recovery(
    request: RecoveryRequestInput,
    state: State<'_, AppState>,
) -> Result<RecoveryRequestResponse, String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let contacts = db.get_emergency_contacts().map_err(|e| e.to_string())?;
    let contact = contacts
        .iter()
        .find(|c| c.id == request.contact_id)
        .ok_or("联系人不存在")?;

    let recovery_request = db
        .add_recovery_request(&request.contact_id, &request.verification_code)
        .map_err(|e| e.to_string())?;

    Ok(RecoveryRequestResponse {
        id: recovery_request.id,
        contact_id: recovery_request.contact_id,
        contact_name: contact.name.clone(),
        verification_code: recovery_request.verification_code,
        requested_at: recovery_request.requested_at,
        approved: recovery_request.approved,
    })
}

#[tauri::command]
pub async fn get_recovery_requests(
    state: State<'_, AppState>,
) -> Result<Vec<RecoveryRequestResponse>, String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let contacts = db.get_emergency_contacts().map_err(|e| e.to_string())?;
    let requests = db.get_recovery_requests().map_err(|e| e.to_string())?;

    Ok(requests
        .into_iter()
        .map(|r| {
            let contact_name = contacts
                .iter()
                .find(|c| c.id == r.contact_id)
                .map(|c| c.name.clone())
                .unwrap_or_else(|| "未知".to_string());

            RecoveryRequestResponse {
                id: r.id,
                contact_id: r.contact_id,
                contact_name,
                verification_code: r.verification_code,
                requested_at: r.requested_at,
                approved: r.approved,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn approve_recovery_request(
    request_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    db.approve_recovery_request(&request_id)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_recovery_status(
    state: State<'_, AppState>,
) -> Result<RecoveryStatusResponse, String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    let config = db
        .get_emergency_config()
        .map_err(|e| e.to_string())?
        .ok_or("未设置紧急联系人")?;

    if !config.enabled {
        return Err("紧急联系人功能未启用".to_string());
    }

    let requests = db.get_recovery_requests().map_err(|e| e.to_string())?;
    let contacts = db.get_emergency_contacts().map_err(|e| e.to_string())?;

    let approved_requests: Vec<_> = requests.iter().filter(|r| r.approved).collect();

    let contacts_responded: Vec<String> = approved_requests
        .iter()
        .filter_map(|r| {
            contacts
                .iter()
                .find(|c| c.id == r.contact_id)
                .map(|c| c.name.clone())
        })
        .collect();

    let waiting_period_remaining =
        crate::emergency::days_until_recovery(&config.created_at, config.waiting_period_days);

    let can_recover = approved_requests.len() >= config.threshold as usize
        && waiting_period_remaining == 0;

    Ok(RecoveryStatusResponse {
        can_recover,
        collected_shares: approved_requests.len(),
        required_shares: config.threshold as usize,
        waiting_period_remaining_days: waiting_period_remaining,
        contacts_responded,
    })
}

#[tauri::command]
pub async fn recover_vault(
    request: RecoverVaultRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if request.shares.len() < 2 {
        return Err("至少需要 2 个份额来恢复".to_string());
    }

    let decoded_shares: Result<Vec<Vec<u8>>, _> = request
        .shares
        .iter()
        .map(|s| crate::emergency::EmergencyManager::decode_share(s))
        .collect();

    let decoded_shares = decoded_shares.map_err(|e| e.to_string())?;

    let master_key = crate::emergency::EmergencyManager::recover_secret(&decoded_shares)
        .map_err(|e| e.to_string())?;

    let master_key_hex = hex::encode(&master_key);
    Ok(master_key_hex)
}

#[tauri::command]
pub async fn clear_recovery_requests(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut db = state.db.lock().await;
    let db = db.as_mut().ok_or("请先解锁保险箱")?;

    db.clear_recovery_requests().map_err(|e| e.to_string())?;
    Ok(())
}
