pub mod config;
pub mod grpc_server;
pub mod http_server;
pub mod sampler;

pub mod sampling {
    pub mod sampling_service {
        tonic::include_proto!("otel.sampling");
    }
    pub use sampling_service::*;
}

use crate::config::{ConfigUpdate, EtcdConfigManager};
use crate::grpc_server::SamplingServiceImpl;
use crate::http_server::{AppState, health_check};
use crate::sampler::{SamplingConfig, Sampler};
use crate::sampling::sampling_service_server::SamplingServiceServer;
use axum::routing::{get, post};
use axum::Router;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

const GRPC_PORT: u16 = 50051;
const HTTP_PORT: u16 = 8080;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(false)
        .init();

    info!("Starting OpenTelemetry Sampling Proxy...");

    let config = Arc::new(parking_lot::RwLock::new(Arc::new(SamplingConfig::default())));
    let (update_tx, mut update_rx) = broadcast::channel::<ConfigUpdate>(256);

    tokio::spawn(async move {
        loop {
            match update_rx.recv().await {
                Ok(update) => {
                    info!(
                        "配置已更新: source={:?}, strategy={}, rate={}",
                        update.source,
                        update.config.strategy,
                        update.config.rate
                    );
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    info!("配置更新通知落后 {} 条，继续消费", n);
                }
                Err(broadcast::error::RecvError::Closed) => {
                    info!("配置更新通道已关闭");
                    break;
                }
            }
        }
    });

    let etcd_endpoints: Vec<String> = std::env::var("ETCD_ENDPOINTS")
        .unwrap_or_else(|_| "127.0.0.1:2379".to_string())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let etcd_key_prefix =
        std::env::var("ETCD_KEY_PREFIX").unwrap_or_else(|_| "/otel/sampling".to_string());

    let etcd_manager = EtcdConfigManager::new(
        etcd_endpoints,
        etcd_key_prefix,
        Arc::clone(&config),
        update_tx.clone(),
    )
    .await?;

    etcd_manager.start_reload_loop().await;

    let sampler = Arc::new(Sampler::new(Arc::clone(&config)));

    let grpc_service = SamplingServiceImpl::new(Arc::clone(&sampler));

    let grpc_addr = format!("[::]:{}", GRPC_PORT).parse()?;
    info!("gRPC server listening on {}", grpc_addr);

    let grpc_server = tonic::transport::Server::builder()
        .add_service(SamplingServiceServer::new(grpc_service))
        .serve(grpc_addr);

    let app_state = AppState {
        config: Arc::clone(&config),
        update_tx: update_tx.clone(),
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/config", get(http_server::get_config))
        .route(
            "/api/v1/config/rate",
            post(http_server::update_rate),
        )
        .route(
            "/api/v1/config/strategy",
            post(http_server::update_strategy),
        )
        .route(
            "/api/v1/config",
            post(http_server::update_config),
        )
        .with_state(app_state);

    let http_addr = format!("[::]:{}", HTTP_PORT);
    info!("HTTP management server listening on {}", http_addr);

    let http_server = axum::Server::bind(&http_addr.parse()?).serve(app.into_make_service());

    tokio::select! {
        result = grpc_server => {
            if let Err(e) = result {
                error!("gRPC server error: {}", e);
            }
        }
        result = http_server => {
            if let Err(e) = result {
                error!("HTTP server error: {}", e);
            }
        }
        _ = tokio::signal::ctrl_c() => {
            info!("Received shutdown signal, exiting...");
        }
    }

    info!("Server stopped");
    Ok(())
}
