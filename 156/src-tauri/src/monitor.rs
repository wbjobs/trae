use crate::alert::AlertConfig;
use crate::database::Database;
use crate::{CpuData, DiskData, MemoryData, NetworkData, SystemData};
use sysinfo::System;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

pub struct SystemMonitor {
    system: System,
    current_data: SystemData,
    is_running: Arc<AtomicBool>,
    prev_network_received: u64,
    prev_network_transmitted: u64,
}

impl SystemMonitor {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        let cpu = Self::collect_cpu_data(&system);
        let memory = Self::collect_memory_data(&system);
        let disks = Self::collect_disk_data(&system);
        let network = Self::collect_network_data(&system);

        Self {
            system,
            current_data: SystemData {
                cpu,
                memory,
                disks,
                network,
                history: Default::default(),
            },
            is_running: Arc::new(AtomicBool::new(false)),
            prev_network_received: 0,
            prev_network_transmitted: 0,
        }
    }

    pub fn get_current_data(&self) -> SystemData {
        self.current_data.clone()
    }

    pub fn start_monitoring(
        &mut self,
        app: AppHandle,
        db: Database,
        alert_config: AlertConfig,
    ) {
        if self.is_running.load(Ordering::SeqCst) {
            return;
        }

        self.is_running.store(true, Ordering::SeqCst);
        let is_running = self.is_running.clone();

        let mut system = System::new_all();
        system.refresh_all();

        let mut prev_network_received = 0u64;
        let mut prev_network_transmitted = 0u64;

        let mut alert_cooldown = 0u32;

        thread::spawn(move || {
            loop {
                if !is_running.load(Ordering::SeqCst) {
                    break;
                }

                system.refresh_all();

                let cpu = Self::collect_cpu_data(&system);
                let memory = Self::collect_memory_data(&system);
                let disks = Self::collect_disk_data(&system);
                let network = Self::collect_network_data_with_speed(
                    &system,
                    prev_network_received,
                    prev_network_transmitted,
                );

                prev_network_received = network.received;
                prev_network_transmitted = network.transmitted;

                let data = SystemData {
                    cpu: cpu.clone(),
                    memory: memory.clone(),
                    disks: disks.clone(),
                    network: network.clone(),
                    history: Default::default(),
                };

                if let Err(e) = db.insert_metrics(
                    cpu.overall,
                    memory.percentage,
                    network.received_speed,
                    network.transmitted_speed,
                ) {
                    eprintln!("Failed to insert metrics: {}", e);
                }

                if alert_cooldown == 0 {
                    if cpu.overall > alert_config.cpu_threshold {
                        let alert_msg = format!(
                            "CPU 使用率超过 {}%: {:.1}%",
                            alert_config.cpu_threshold,
                            cpu.overall
                        );
                        let _ = app.emit("cpu_alert", &alert_msg);
                        
                        let metadata = format!(
                            "{{\"cpu_usage\": {:.1}, \"threshold\": {:.1}}}",
                            cpu.overall,
                            alert_config.cpu_threshold
                        );
                        if let Err(e) = db.log_event("cpu_alert", &alert_msg, &metadata) {
                            eprintln!("Failed to log event: {}", e);
                        }
                        
                        alert_cooldown = 30;
                    }
                } else {
                    alert_cooldown -= 1;
                }

                let _ = app.emit("system_data_update", &data);

                thread::sleep(Duration::from_secs(1));
            }
        });
    }

    pub fn stop_monitoring(&mut self) {
        self.is_running.store(false, Ordering::SeqCst);
    }

    fn collect_cpu_data(system: &System) -> CpuData {
        let overall = system.global_cpu_info().cpu_usage() as f32;
        let cores: Vec<f32> = system
            .cpus()
            .iter()
            .map(|cpu| cpu.cpu_usage() as f32)
            .collect();

        CpuData { overall, cores }
    }

    fn collect_memory_data(system: &System) -> MemoryData {
        let total = system.total_memory();
        let used = system.used_memory();
        let free = system.available_memory();
        let percentage = if total > 0 {
            (used as f32 / total as f32) * 100.0
        } else {
            0.0
        };

        MemoryData {
            total,
            used,
            free,
            percentage,
        }
    }

    fn collect_disk_data(system: &System) -> Vec<DiskData> {
        system
            .disks()
            .iter()
            .filter(|disk| {
                !matches!(disk.kind(), sysinfo::DiskKind::Unknown(_))
            })
            .map(|disk| {
                let total = disk.total_space();
                let available = disk.available_space();
                let used = total - available;
                let percentage = if total > 0 {
                    (used as f32 / total as f32) * 100.0
                } else {
                    0.0
                };

                DiskData {
                    name: disk.name().to_string_lossy().into_owned(),
                    mount_point: disk.mount_point().to_string_lossy().into_owned(),
                    total,
                    used,
                    percentage,
                }
            })
            .collect()
    }

    fn collect_network_data(system: &System) -> NetworkData {
        let mut total_received = 0u64;
        let mut total_transmitted = 0u64;

        for (_, network) in system.networks() {
            total_received += network.received();
            total_transmitted += network.transmitted();
        }

        NetworkData {
            received: total_received,
            transmitted: total_transmitted,
            received_speed: 0,
            transmitted_speed: 0,
        }
    }

    fn collect_network_data_with_speed(
        system: &System,
        prev_received: u64,
        prev_transmitted: u64,
    ) -> NetworkData {
        let mut total_received = 0u64;
        let mut total_transmitted = 0u64;

        for (_, network) in system.networks() {
            total_received += network.received();
            total_transmitted += network.transmitted();
        }

        let received_speed = if total_received >= prev_received {
            total_received - prev_received
        } else {
            0
        };

        let transmitted_speed = if total_transmitted >= prev_transmitted {
            total_transmitted - prev_transmitted
        } else {
            0
        };

        NetworkData {
            received: total_received,
            transmitted: total_transmitted,
            received_speed,
            transmitted_speed,
        }
    }
}

impl Default for SystemMonitor {
    fn default() -> Self {
        Self::new()
    }
}
