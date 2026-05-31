use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AlertConfig {
    pub cpu_threshold: f32,
    pub memory_threshold: f32,
    pub disk_threshold: f32,
}

impl Default for AlertConfig {
    fn default() -> Self {
        Self {
            cpu_threshold: 90.0,
            memory_threshold: 90.0,
            disk_threshold: 90.0,
        }
    }
}

pub fn send_notification(app: &tauri::AppHandle, message: &str) {
    #[cfg(desktop)]
    {
        let _ = tauri::Manager::emit(app, "show_alert", message);
    }
}

pub fn check_cpu_alert(cpu_usage: f32, threshold: f32) -> Option<String> {
    if cpu_usage > threshold {
        Some(format!(
            "⚠️ CPU 使用率告警: {:.1}% (阈值: {}%)",
            cpu_usage, threshold
        ))
    } else {
        None
    }
}

pub fn check_memory_alert(memory_usage: f32, threshold: f32) -> Option<String> {
    if memory_usage > threshold {
        Some(format!(
            "⚠️ 内存使用率告警: {:.1}% (阈值: {}%)",
            memory_usage, threshold
        ))
    } else {
        None
    }
}

pub fn check_disk_alert(disk_usage: f32, threshold: f32) -> Option<String> {
    if disk_usage > threshold {
        Some(format!(
            "⚠️ 磁盘使用率告警: {:.1}% (阈值: {}%)",
            disk_usage, threshold
        ))
    } else {
        None
    }
}
