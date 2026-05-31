use crate::HistoryData;
use crate::search::SearchEngine;
use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

const BATCH_SIZE: usize = 60;
const CLEANUP_INTERVAL_SECS: u64 = 300;

#[derive(Clone)]
pub struct Database {
    conn: Option<ArcConnection>,
    buffer: Option<ArcBuffer>,
    last_cleanup: Arc<AtomicU64>,
    search_engine: Option<SearchEngine>,
}

struct ArcConnection {
    inner: std::sync::Arc<std::sync::Mutex<Connection>>,
}

impl Clone for ArcConnection {
    fn clone(&self) -> Self {
        ArcConnection {
            inner: self.inner.clone(),
        }
    }
}

struct ArcBuffer {
    inner: std::sync::Arc<std::sync::Mutex<Vec<MetricsRecord>>>,
}

#[derive(Clone)]
struct MetricsRecord {
    timestamp: i64,
    cpu_usage: f32,
    memory_usage: f32,
    network_in: i64,
    network_out: i64,
}

impl Database {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let db_path = Self::get_db_path()?;
        let conn = Connection::open(&db_path)?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA cache_size=-64;
             PRAGMA temp_store=MEMORY;
             PRAGMA mmap_size=268435456;

             CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                cpu_usage REAL NOT NULL,
                memory_usage REAL NOT NULL,
                network_in INTEGER NOT NULL,
                network_out INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);"
        )?;

        let conn_arc = std::sync::Arc::new(std::sync::Mutex::new(conn));
        let search_engine = SearchEngine::new(conn_arc.clone())?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        Ok(Self {
            conn: Some(ArcConnection {
                inner: conn_arc,
            }),
            buffer: Some(ArcBuffer {
                inner: std::sync::Arc::new(std::sync::Mutex::new(Vec::with_capacity(BATCH_SIZE))),
            }),
            last_cleanup: std::sync::Arc::new(AtomicU64::new(now)),
            search_engine: Some(search_engine),
        })
    }

    fn get_db_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
        let app_data_dir = if let Ok(home) = std::env::var("APPDATA") {
            PathBuf::from(home)
        } else if let Ok(home) = std::env::var("HOME") {
            PathBuf::from(home)
        } else {
            PathBuf::from(".")
        };

        let db_dir = app_data_dir.join("SystemMonitorDashboard");
        std::fs::create_dir_all(&db_dir)?;

        Ok(db_dir.join("monitor.db"))
    }

    pub fn insert_metrics(
        &self,
        cpu_usage: f32,
        memory_usage: f32,
        network_in: u64,
        network_out: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let timestamp = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs() as i64;

        let record = MetricsRecord {
            timestamp,
            cpu_usage,
            memory_usage,
            network_in: network_in as i64,
            network_out: network_out as i64,
        };

        if let Some(ref buffer) = self.buffer {
            let mut buf = buffer.inner.lock().map_err(|e| e.to_string())?;
            buf.push(record);

            if buf.len() >= BATCH_SIZE {
                let batch: Vec<MetricsRecord> = buf.drain(..).collect();
                drop(buf);

                self.flush_batch(&batch)?;

                let now = SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)?
                    .as_secs();
                let last = self.last_cleanup.load(Ordering::Relaxed);

                if now - last >= CLEANUP_INTERVAL_SECS {
                    self.last_cleanup.store(now, Ordering::Relaxed);
                    self.cleanup_old_data(timestamp)?;
                }
            }
        }

        Ok(())
    }

    fn flush_batch(&self, batch: &[MetricsRecord]) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(ref conn) = self.conn {
            let conn = conn.inner.lock().map_err(|e| e.to_string())?;

            conn.execute_batch("BEGIN TRANSACTION")?;

            {
                let mut stmt = conn.prepare(
                    "INSERT INTO metrics (timestamp, cpu_usage, memory_usage, network_in, network_out) 
                     VALUES (?1, ?2, ?3, ?4, ?5)"
                )?;

                for record in batch {
                    stmt.execute(params![
                        record.timestamp,
                        record.cpu_usage,
                        record.memory_usage,
                        record.network_in,
                        record.network_out,
                    ])?;
                }
            }

            conn.execute_batch("COMMIT")?;
        }

        Ok(())
    }

    fn cleanup_old_data(&self, current_timestamp: i64) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(ref conn) = self.conn {
            let conn = conn.inner.lock().map_err(|e| e.to_string())?;
            let cutoff = current_timestamp - 24 * 60 * 60;
            conn.execute(
                "DELETE FROM metrics WHERE timestamp < ?1",
                params![cutoff],
            )?;
        }
        Ok(())
    }

    pub fn force_flush(&self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(ref buffer) = self.buffer {
            let mut buf = buffer.inner.lock().map_err(|e| e.to_string())?;
            if !buf.is_empty() {
                let batch: Vec<MetricsRecord> = buf.drain(..).collect();
                drop(buf);
                self.flush_batch(&batch)?;
            }
        }
        Ok(())
    }

    pub fn get_history(&self, hours: u32) -> Result<HistoryData, Box<dyn std::error::Error>> {
        self.force_flush()?;

        let cutoff = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs() as i64
            - (hours as i64 * 60 * 60);

        let mut history = HistoryData::default();

        if let Some(ref conn) = self.conn {
            let conn = conn.inner.lock().map_err(|e| e.to_string())?;

            let mut stmt = conn.prepare(
                "SELECT cpu_usage, memory_usage, network_in, network_out 
                 FROM metrics 
                 WHERE timestamp >= ?1 
                 ORDER BY timestamp DESC 
                 LIMIT 2880",
            )?;

            let rows = stmt.query_map(params![cutoff], |row| {
                Ok((
                    row.get::<_, f32>(0)?,
                    row.get::<_, f32>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })?;

            for row in rows {
                if let Ok((cpu, memory, net_in, net_out)) = row {
                    history.cpu.push(cpu);
                    history.memory.push(memory);
                    history.network_in.push(net_in as u64);
                    history.network_out.push(net_out as u64);
                }
            }

            history.cpu.reverse();
            history.memory.reverse();
            history.network_in.reverse();
            history.network_out.reverse();
        }

        Ok(history)
    }

    pub fn log_event(
        &self,
        event_type: &str,
        content: &str,
        metadata: &str,
    ) -> Result<i64, Box<dyn std::error::Error>> {
        if let Some(ref engine) = self.search_engine {
            engine.add_event(event_type, content, metadata)
        } else {
            Err("Search engine not initialized".into())
        }
    }

    pub fn hybrid_search(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<crate::search::SearchResult>, Box<dyn std::error::Error>> {
        if let Some(ref engine) = self.search_engine {
            engine.hybrid_search(query, limit)
        } else {
            Ok(Vec::new())
        }
    }

    pub fn get_recent_events(
        &self,
        limit: usize,
    ) -> Result<Vec<crate::search::EventLog>, Box<dyn std::error::Error>> {
        if let Some(ref engine) = self.search_engine {
            engine.get_recent_events(limit)
        } else {
            Ok(Vec::new())
        }
    }
}
