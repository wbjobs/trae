use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

mod alert;
mod charts;
mod database;
mod monitor;
mod search;

pub struct AppState {
    pub monitor: Mutex<monitor::SystemMonitor>,
    pub db: Mutex<database::Database>,
    pub alert_config: Mutex<alert::AlertConfig>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SystemData {
    pub cpu: CpuData,
    pub memory: MemoryData,
    pub disks: Vec<DiskData>,
    pub network: NetworkData,
    pub history: HistoryData,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CpuData {
    pub overall: f32,
    pub cores: Vec<f32>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MemoryData {
    pub total: u64,
    pub used: u64,
    pub free: u64,
    pub percentage: f32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DiskData {
    pub name: String,
    pub mount_point: String,
    pub total: u64,
    pub used: u64,
    pub percentage: f32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct NetworkData {
    pub received: u64,
    pub transmitted: u64,
    pub received_speed: u64,
    pub transmitted_speed: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct HistoryData {
    pub cpu: Vec<f32>,
    pub memory: Vec<f32>,
    pub network_in: Vec<u64>,
    pub network_out: Vec<u64>,
}

#[tauri::command]
pub async fn get_system_data(state: State<'_, AppState>) -> Result<SystemData, String> {
    let monitor = state.monitor.lock().map_err(|e| e.to_string())?;
    Ok(monitor.get_current_data())
}

#[tauri::command]
pub async fn start_monitoring(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut monitor = state.monitor.lock().map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let alert_config = state.alert_config.lock().map_err(|e| e.to_string())?;

    monitor.start_monitoring(app, db.clone(), alert_config.clone());
    Ok(())
}

#[tauri::command]
pub async fn update_alert_threshold(
    threshold: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut config = state.alert_config.lock().map_err(|e| e.to_string())?;
    config.cpu_threshold = threshold;
    Ok(())
}

#[tauri::command]
pub async fn send_alert_notification(
    message: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    alert::send_notification(&app, &message);
    Ok(())
}

#[tauri::command]
pub async fn get_history_data(
    state: State<'_, AppState>,
) -> Result<HistoryData, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_history(24)
}

#[tauri::command]
pub async fn generate_cpu_chart(
    state: State<'_, AppState>,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let history = db.get_history(24).map_err(|e| e.to_string())?;
    let png_data = charts::generate_cpu_chart(&history.cpu, width, height)
        .map_err(|e| e.to_string())?;
    Ok(charts::data_url_from_png(&png_data))
}

#[tauri::command]
pub async fn generate_memory_chart(
    state: State<'_, AppState>,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let history = db.get_history(24).map_err(|e| e.to_string())?;
    let png_data = charts::generate_memory_chart(&history.memory, width, height)
        .map_err(|e| e.to_string())?;
    Ok(charts::data_url_from_png(&png_data))
}

#[tauri::command]
pub async fn generate_network_chart(
    state: State<'_, AppState>,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let history = db.get_history(24).map_err(|e| e.to_string())?;
    let png_data = charts::generate_network_chart(
        &history.network_in,
        &history.network_out,
        width,
        height,
    )
    .map_err(|e| e.to_string())?;
    Ok(charts::data_url_from_png(&png_data))
}

#[tauri::command]
pub async fn hybrid_search(
    query: String,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<search::SearchResult>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.hybrid_search(&query, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_recent_events(
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<search::EventLog>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_recent_events(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn log_event(
    event_type: String,
    content: String,
    metadata: String,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.log_event(&event_type, &content, &metadata).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            monitor: Mutex::new(monitor::SystemMonitor::new()),
            db: Mutex::new(database::Database::new().expect("Failed to create database")),
            alert_config: Mutex::new(alert::AlertConfig::default()),
        })
        .invoke_handler(tauri::generate_handler![
            get_system_data,
            start_monitoring,
            update_alert_threshold,
            send_alert_notification,
            get_history_data,
            generate_cpu_chart,
            generate_memory_chart,
            generate_network_chart,
            hybrid_search,
            get_recent_events,
            log_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
