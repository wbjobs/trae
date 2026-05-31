mod nfc;
mod grpc;
mod commands;

use std::sync::Arc;
use parking_lot::Mutex;
use tauri::Manager;

pub use nfc::{NFCManager, NFCReader, MifareKey, MifareKeyType};
pub use grpc::GrpcClient;

#[derive(Clone)]
pub struct AppState {
    pub nfc_manager: Arc<Mutex<Option<NFCManager>>>,
    pub grpc_client: Arc<Mutex<Option<GrpcClient>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let state = AppState {
        nfc_manager: Arc::new(Mutex::new(None)),
        grpc_client: Arc::new(Mutex::new(None)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::list_nfc_readers,
            commands::connect_nfc_reader,
            commands::disconnect_nfc_reader,
            commands::authenticate_mifare,
            commands::read_mifare_block,
            commands::write_mifare_block,
            commands::write_uid_to_pn532,
            commands::grpc_connect,
            commands::grpc_disconnect,
            commands::grpc_login,
            commands::grpc_register_card,
            commands::grpc_revoke_card,
            commands::grpc_list_cards,
            commands::grpc_list_permission_groups,
            commands::grpc_list_access_logs,
            commands::grpc_remote_open_door,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
