use std::{collections::HashMap, sync::Arc, time::Duration};

use anyhow::Result;
use axum::{
    extract::{Path, State},
    http::Method,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration as ChronoDuration, Utc};
use p2p_cdn_common::{
    BandwidthInfo, ChokeStatus, ChunkHeld, ChunkInfo, FileInfo, FileRegisterRequest,
    FileRegisterResponse, GeoLocation, HeartbeatRequest, NodeInfo, NodeQueryRequest,
    NodeQueryResponse, NodeStats, RegisterRequest, RegisterResponse, TransferDirection,
    TransferReport, CHOKING_DURATION_SECS, MIN_CONTRIBUTION_RATIO,
};
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

mod ingestion;
mod scoring;
use ingestion::{IngestionPipeline, IngestionStats};
use scoring::calculate_node_score;

struct SharedState {
    nodes: RwLock<HashMap<Uuid, NodeInfo>>,
    files: RwLock<HashMap<Uuid, FileInfo>>,
    chunk_index: RwLock<HashMap<(Uuid, u32), Vec<Uuid>>>,
}

struct AppState {
    shared: Arc<SharedState>,
    ingestion: Arc<IngestionPipeline>,
}

impl AppState {
    fn new() -> Arc<Self> {
        let shared = Arc::new(SharedState {
            nodes: RwLock::new(HashMap::new()),
            files: RwLock::new(HashMap::new()),
            chunk_index: RwLock::new(HashMap::new()),
        });

        let ingestion = Arc::new(IngestionPipeline::new(shared.clone()));

        Arc::new(Self { shared, ingestion })
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "p2p_cdn_tracker=debug,tower_http=debug,axum=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = AppState::new();

    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_origin(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/nodes/register", post(register_node))
        .route("/api/v1/nodes/heartbeat", post(heartbeat))
        .route("/api/v1/nodes", get(list_nodes))
        .route("/api/v1/nodes/query", post(query_nodes))
        .route("/api/v1/nodes/:node_id/choke-status", get(get_choke_status))
        .route("/api/v1/transfers/report", post(report_transfer))
        .route("/api/v1/files/register", post(register_file))
        .route("/api/v1/files/:file_id", get(get_file_info))
        .route("/api/v1/files", get(list_files))
        .route("/api/v1/stats/ingestion", get(get_ingestion_stats))
        .with_state(state.clone())
        .layer(cors);

    let state_clone = state.clone();
    tokio::spawn(async move {
        loop {
            cleanup_inactive_nodes(state_clone.clone()).await;
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });

    let state_clone = state.clone();
    tokio::spawn(async move {
        loop {
            enforce_choking_policy(state_clone.clone()).await;
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });

    let ingestion_clone = state.ingestion.clone();
    tokio::spawn(async move {
        ingestion_clone.run().await;
    });

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await?;
    tracing::info!("Tracker server listening on 0.0.0.0:3001");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "OK"
}

async fn get_ingestion_stats(
    State(state): State<Arc<AppState>>,
) -> Json<IngestionStats> {
    Json(state.ingestion.get_stats().await)
}

async fn register_node(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterRequest>,
) -> Json<RegisterResponse> {
    let node_id = Uuid::new_v4();
    let score = calculate_node_score(&req.bandwidth, &req.location, None);

    let node = NodeInfo {
        id: node_id,
        address: req.address,
        public_ip: req.public_ip,
        location: req.location,
        bandwidth: req.bandwidth,
        last_seen: Utc::now(),
        is_active: true,
        score,
        stats: NodeStats {
            total_uploaded: 0,
            total_downloaded: 0,
            contribution_ratio: 1.0,
            upload_count: 0,
            download_count: 0,
            joined_at: Utc::now(),
        },
        held_chunks: Vec::new(),
        is_choked: false,
        choked_until: None,
    };

    state.shared.nodes.write().await.insert(node_id, node);
    tracing::info!("Node registered: {} at {}", node_id, req.address);

    Json(RegisterResponse {
        node_id,
        assigned_id: node_id.to_string(),
    })
}

async fn heartbeat(
    State(state): State<Arc<AppState>>,
    Json(req): Json<HeartbeatRequest>,
) -> Json<()> {
    state.ingestion.ingest_heartbeat(req).await;
    Json(())
}

async fn list_nodes(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<NodeInfo>> {
    let nodes = state.shared.nodes.read().await;
    Json(nodes.values().cloned().collect())
}

async fn query_nodes(
    State(state): State<Arc<AppState>>,
    Json(req): Json<NodeQueryRequest>,
) -> Json<NodeQueryResponse> {
    let nodes = state.shared.nodes.read().await;
    let chunk_index = state.shared.chunk_index.read().await;

    let key = (req.file_id, req.chunk_index);
    let holders = chunk_index.get(&key).cloned().unwrap_or_default();

    let mut candidate_nodes: Vec<NodeInfo> = holders
        .iter()
        .filter_map(|id| nodes.get(id).cloned())
        .filter(|n| !n.is_choked)
        .collect();

    if candidate_nodes.is_empty() {
        candidate_nodes = holders
            .iter()
            .filter_map(|id| nodes.get(id).cloned())
            .collect();
    }

    candidate_nodes.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    Json(NodeQueryResponse {
        nodes: candidate_nodes.into_iter().take(req.limit.unwrap_or(10)).collect(),
    })
}

async fn get_choke_status(
    State(state): State<Arc<AppState>>,
    Path(node_id): Path<Uuid>,
) -> Json<ChokeStatus> {
    let nodes = state.shared.nodes.read().await;
    let node = nodes.get(&node_id);

    match node {
        Some(n) => Json(ChokeStatus {
            is_choked: n.is_choked,
            choked_until: n.choked_until,
            contribution_ratio: n.stats.contribution_ratio,
            download_speed_limit: if n.is_choked {
                Some((n.bandwidth.download_mbps * 0.1).max(0.1))
            } else {
                None
            },
        }),
        None => Json(ChokeStatus {
            is_choked: false,
            choked_until: None,
            contribution_ratio: 0.0,
            download_speed_limit: None,
        }),
    }
}

async fn report_transfer(
    State(state): State<Arc<AppState>>,
    Json(report): Json<TransferReport>,
) -> Json<()> {
    state.ingestion.ingest_transfer(report).await;
    Json(())
}

async fn register_file(
    State(state): State<Arc<AppState>>,
    Json(req): Json<FileRegisterRequest>,
) -> Json<FileRegisterResponse> {
    let file_id = Uuid::new_v4();
    let chunks: Vec<ChunkInfo> = (0..req.chunk_count)
        .map(|i| ChunkInfo {
            index: i,
            size: if i == req.chunk_count - 1 {
                req.total_size - (req.chunk_size * i as u64)
            } else {
                req.chunk_size
            },
            hash: req.chunk_hashes.get(i as usize).cloned().unwrap_or_default(),
            holders: vec![req.source_node_id],
        })
        .collect();

    let file = FileInfo {
        id: file_id,
        name: req.name,
        total_size: req.total_size,
        chunk_size: req.chunk_size,
        chunk_count: req.chunk_count,
        chunks,
        created_at: Utc::now(),
    };

    state.shared.files.write().await.insert(file_id, file);
    tracing::info!("File registered: {} with {} chunks", file_id, req.chunk_count);

    Json(FileRegisterResponse { file_id })
}

async fn get_file_info(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<Uuid>,
) -> Json<Option<FileInfo>> {
    let files = state.shared.files.read().await;
    Json(files.get(&file_id).cloned())
}

async fn list_files(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<FileInfo>> {
    let files = state.shared.files.read().await;
    Json(files.values().cloned().collect())
}

async fn cleanup_inactive_nodes(state: Arc<AppState>) {
    let mut nodes = state.shared.nodes.write().await;
    let mut chunk_index = state.shared.chunk_index.write().await;
    let cutoff = Utc::now() - ChronoDuration::seconds(120);

    let inactive_nodes: Vec<Uuid> = nodes
        .iter()
        .filter(|(_, n)| n.last_seen < cutoff)
        .map(|(id, _)| *id)
        .collect();

    for node_id in &inactive_nodes {
        nodes.remove(node_id);
        for (_, holders) in chunk_index.iter_mut() {
            holders.retain(|id| id != node_id);
        }
    }

    if !inactive_nodes.is_empty() {
        tracing::info!("Cleaned up {} inactive nodes", inactive_nodes.len());
    }
}

async fn enforce_choking_policy(state: Arc<AppState>) {
    let mut nodes = state.shared.nodes.write().await;
    let now = Utc::now();

    for node in nodes.values_mut() {
        let age = (now - node.stats.joined_at).num_seconds();
        if age < 300 || node.stats.download_count < 5 {
            continue;
        }

        if node.stats.contribution_ratio < MIN_CONTRIBUTION_RATIO {
            if !node.is_choked {
                node.is_choked = true;
                node.choked_until = Some(now + ChronoDuration::seconds(CHOKING_DURATION_SECS));
                tracing::warn!(
                    "Node {} choked: contribution_ratio={:.2}, upload={}, download={}",
                    node.id,
                    node.stats.contribution_ratio,
                    node.stats.total_uploaded,
                    node.stats.total_downloaded
                );
            }
        } else if let Some(choked_until) = node.choked_until {
            if now > choked_until {
                node.is_choked = false;
                node.choked_until = None;
                tracing::info!("Node {} unchoked, penalty expired", node.id);
            }
        }
    }
}
