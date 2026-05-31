use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const CHUNK_SIZE: usize = 4 * 1024 * 1024; // 4MB per chunk
pub const MIN_CONTRIBUTION_RATIO: f64 = 0.3;
pub const CHOKING_DURATION_SECS: i64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeInfo {
    pub id: Uuid,
    pub address: String,
    pub public_ip: Option<String>,
    pub location: GeoLocation,
    pub bandwidth: BandwidthInfo,
    pub last_seen: DateTime<Utc>,
    pub is_active: bool,
    pub score: f64,
    pub stats: NodeStats,
    pub is_choked: bool,
    pub choked_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NodeStats {
    pub total_uploaded: u64,
    pub total_downloaded: u64,
    pub contribution_ratio: f64,
    pub upload_count: u32,
    pub download_count: u32,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoLocation {
    pub lat: f64,
    pub lon: f64,
    pub city: Option<String>,
    pub country: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BandwidthInfo {
    pub upload_speed: u64,
    pub download_speed: u64,
    pub latency_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub id: Uuid,
    pub name: String,
    pub size: u64,
    pub mime_type: String,
    pub total_chunks: u32,
    pub chunks: Vec<ChunkInfo>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkInfo {
    pub index: u32,
    pub hash: String,
    pub size: u32,
    pub holders: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub address: String,
    pub public_ip: Option<String>,
    pub location: GeoLocation,
    pub bandwidth: BandwidthInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterResponse {
    pub node_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatRequest {
    pub node_id: Uuid,
    pub bandwidth: BandwidthInfo,
    pub held_chunks: Vec<ChunkHeld>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkHeld {
    pub file_id: Uuid,
    pub chunk_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRegisterRequest {
    pub name: String,
    pub size: u64,
    pub mime_type: String,
    pub total_chunks: u32,
    pub chunks: Vec<ChunkInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRegisterResponse {
    pub file_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeQueryRequest {
    pub file_id: Uuid,
    pub chunk_index: u32,
    pub location: Option<GeoLocation>,
    pub count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeQueryResponse {
    pub nodes: Vec<NodeInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadProgress {
    pub file_id: Uuid,
    pub node_id: Uuid,
    pub completed_chunks: Vec<u32>,
    pub total_chunks: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub file_id: Uuid,
    pub node_id: Uuid,
    pub chunk_index: u32,
    pub downloaded: u64,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferReport {
    pub node_id: Uuid,
    pub peer_id: Uuid,
    pub bytes_transferred: u64,
    pub direction: TransferDirection,
    pub chunk_index: u32,
    pub file_id: Uuid,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TransferDirection {
    Upload,
    Download,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChokeStatus {
    pub is_choked: bool,
    pub choked_until: Option<DateTime<Utc>>,
    pub contribution_ratio: f64,
    pub download_speed_limit: Option<u64>,
}
