use std::{
    collections::VecDeque,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::Utc;
use p2p_cdn_common::{HeartbeatRequest, TransferReport};
use tokio::sync::{Mutex, Semaphore};
use tracing::{debug, warn};

use crate::SharedState;

pub const RING_BUFFER_CAPACITY: usize = 10000;
pub const BATCH_SIZE: usize = 100;
pub const BATCH_INTERVAL_MS: u64 = 50;
pub const MAX_PROCESSING_CONCURRENCY: usize = 4;
pub const DATA_TTL_SECS: i64 = 30;

pub enum IngestionEvent {
    Heartbeat(HeartbeatRequest, Instant),
    TransferReport(TransferReport, Instant),
}

pub struct IngestionPipeline {
    buffer: Mutex<VecDeque<IngestionEvent>>,
    semaphore: Semaphore,
    state: Arc<SharedState>,
    stats: Mutex<IngestionStats>,
}

#[derive(Debug, Default, Clone)]
pub struct IngestionStats {
    pub total_received: u64,
    pub total_processed: u64,
    pub total_dropped: u64,
    pub max_queue_size: usize,
    pub current_queue_size: usize,
    pub avg_processing_time_ms: f64,
}

impl IngestionPipeline {
    pub fn new(state: Arc<SharedState>) -> Self {
        Self {
            buffer: Mutex::new(VecDeque::with_capacity(RING_BUFFER_CAPACITY)),
            semaphore: Semaphore::new(0),
            state,
            stats: Mutex::new(IngestionStats::default()),
        }
    }

    pub async fn ingest_heartbeat(&self, req: HeartbeatRequest) {
        let event = IngestionEvent::Heartbeat(req, Instant::now());
        self.push_event(event).await;
    }

    pub async fn ingest_transfer(&self, report: TransferReport) {
        let event = IngestionEvent::TransferReport(report, Instant::now());
        self.push_event(event).await;
    }

    async fn push_event(&self, event: IngestionEvent) {
        let mut buffer = self.buffer.lock().await;
        let mut stats = self.stats.lock().await;

        stats.total_received += 1;

        if buffer.len() >= RING_BUFFER_CAPACITY {
            let dropped = buffer.pop_front();
            stats.total_dropped += 1;
            if stats.total_dropped % 100 == 0 {
                warn!(
                    "Ring buffer full, dropping oldest event. Total dropped: {}",
                    stats.total_dropped
                );
            }
            drop(dropped);
        }

        buffer.push_back(event);
        stats.current_queue_size = buffer.len();
        if stats.current_queue_size > stats.max_queue_size {
            stats.max_queue_size = stats.current_queue_size;
        }

        if buffer.len() >= BATCH_SIZE {
            self.semaphore.add_permits(1);
        }
    }

    pub async fn get_stats(&self) -> IngestionStats {
        self.stats.lock().await.clone()
    }

    pub async fn run(&self) {
        let mut interval = tokio::time::interval(Duration::from_millis(BATCH_INTERVAL_MS));
        let mut processing_times: VecDeque<Duration> = VecDeque::new();

        loop {
            interval.tick().await;

            let permit = match self.semaphore.try_acquire() {
                Ok(p) => p,
                Err(_) => {
                    let buffer = self.buffer.lock().await;
                    if !buffer.is_empty() {
                        drop(buffer);
                        continue;
                    }
                    continue;
                }
            };

            let events = self.drain_batch().await;
            if events.is_empty() {
                drop(permit);
                continue;
            }

            let start = Instant::now();
            let batch_size = events.len();

            let _ = self.apply_batch(events).await;

            let elapsed = start.elapsed();
            processing_times.push_back(elapsed);
            if processing_times.len() > 100 {
                processing_times.pop_front();
            }

            let avg_ms = processing_times.iter().sum::<Duration>().as_millis() as f64 / processing_times.len() as f64;

            let mut stats = self.stats.lock().await;
            stats.total_processed += batch_size as u64;
            stats.current_queue_size = self.buffer.lock().await.len();
            stats.avg_processing_time_ms = avg_ms;

            drop(permit);

            debug!(
                "Processed batch: {} events, {:?}, avg: {:.2}ms, queue: {}",
                batch_size, elapsed, avg_ms, stats.current_queue_size
            );
        }
    }

    async fn drain_batch(&self) -> Vec<IngestionEvent> {
        let mut buffer = self.buffer.lock().await;
        let drain_count = buffer.len().min(BATCH_SIZE);
        buffer.drain(..drain_count).collect()
    }

    async fn apply_batch(&self, events: Vec<IngestionEvent>) -> anyhow::Result<()> {
        let now = Utc::now();
        let mut nodes = self.state.nodes.write().await;
        let mut chunk_index = self.state.chunk_index.write().await;
        let mut files = self.state.files.write().await;

        for event in events {
            match event {
                IngestionEvent::Heartbeat(req, received_at) => {
                    if received_at.elapsed().as_secs() > DATA_TTL_SECS as u64 {
                        continue;
                    }

                    if let Some(node) = nodes.get_mut(&req.node_id) {
                        let score = crate::scoring::calculate_node_score(&req.bandwidth, &node.location, None);
                        node.bandwidth = req.bandwidth;
                        node.last_seen = Utc::now();
                        node.is_active = true;
                        node.score = score;

                        if let Some(choked_until) = node.choked_until {
                            if Utc::now() > choked_until {
                                node.is_choked = false;
                                node.choked_until = None;
                            }
                        }

                        for chunk_held in &req.held_chunks {
                            let key = (chunk_held.file_id, chunk_held.chunk_index);
                            let holders = chunk_index.entry(key).or_insert_with(Vec::new);
                            if !holders.contains(&req.node_id) {
                                holders.push(req.node_id);
                            }

                            if let Some(file) = files.get_mut(&chunk_held.file_id) {
                                if let Some(chunk) = file.chunks.get_mut(chunk_held.chunk_index as usize) {
                                    if !chunk.holders.contains(&req.node_id) {
                                        chunk.holders.push(req.node_id);
                                    }
                                }
                            }
                        }
                    }
                }
                IngestionEvent::TransferReport(report, received_at) => {
                    if received_at.elapsed().as_secs() > DATA_TTL_SECS as u64 {
                        continue;
                    }

                    use p2p_cdn_common::TransferDirection::*;

                    match report.direction {
                        Upload => {
                            if let Some(node) = nodes.get_mut(&report.node_id) {
                                node.stats.total_uploaded += report.bytes_transferred;
                                node.stats.upload_count += 1;
                                if node.stats.total_downloaded > 0 {
                                    node.stats.contribution_ratio =
                                        node.stats.total_uploaded as f64 / node.stats.total_downloaded as f64;
                                }
                            }
                        }
                        Download => {
                            if let Some(node) = nodes.get_mut(&report.node_id) {
                                node.stats.total_downloaded += report.bytes_transferred;
                                node.stats.download_count += 1;
                                if node.stats.total_downloaded > 0 {
                                    node.stats.contribution_ratio =
                                        node.stats.total_uploaded as f64 / node.stats.total_downloaded as f64;
                                }
                            }
                        }
                    }

                    if let Some(peer) = nodes.get_mut(&report.peer_id) {
                        match report.direction {
                            Upload => {
                                peer.stats.total_downloaded += report.bytes_transferred;
                                peer.stats.download_count += 1;
                                if peer.stats.total_downloaded > 0 {
                                    peer.stats.contribution_ratio =
                                        peer.stats.total_uploaded as f64 / peer.stats.total_downloaded as f64;
                                }
                            }
                            Download => {
                                peer.stats.total_uploaded += report.bytes_transferred;
                                peer.stats.upload_count += 1;
                                if peer.stats.total_downloaded > 0 {
                                    peer.stats.contribution_ratio =
                                        peer.stats.total_uploaded as f64 / peer.stats.total_downloaded as f64;
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
