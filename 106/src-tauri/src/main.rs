use tauri::Manager;
use password_manager::{
    db::Database,
    crypto::CryptoManager,
    server::HttpServer,
};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub db: Arc<Mutex<Option<Database>>>,
    pub crypto: Arc<Mutex<Option<CryptoManager>>>,
    pub server: Arc<Mutex<Option<HttpServer>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db: Arc::new(Mutex::new(None)),
            crypto: Arc::new(Mutex::new(None)),
            server: Arc::new(Mutex::new(None)),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            password_manager::commands::initialize_vault,
            password_manager::commands::unlock_vault,
            password_manager::commands::lock_vault,
            password_manager::commands::add_password,
            password_manager::commands::get_password,
            password_manager::commands::update_password,
            password_manager::commands::delete_password,
            password_manager::commands::list_passwords,
            password_manager::commands::search_passwords,
            password_manager::commands::start_server,
            password_manager::commands::stop_server,
            password_manager::commands::get_server_status,
            password_manager::commands::analyze_passwords,
            password_manager::commands::generate_password,
            password_manager::commands::check_password_strength,
            password_manager::commands::setup_emergency_contacts,
            password_manager::commands::get_emergency_config,
            password_manager::commands::disable_emergency_contacts,
            password_manager::commands::request_recovery,
            password_manager::commands::get_recovery_requests,
            password_manager::commands::approve_recovery_request,
            password_manager::commands::get_recovery_status,
            password_manager::commands::recover_vault,
            password_manager::commands::clear_recovery_requests,
        ])
        .run(tauri::generate_context!())
        .expect("error while running password manager");
}
