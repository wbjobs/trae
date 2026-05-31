use crate::config::ConfigUpdate;
use crate::sampler::{SamplingConfig, SamplingStrategy};
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::info;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<parking_lot::RwLock<Arc<SamplingConfig>>>,
    pub update_tx: broadcast::Sender<ConfigUpdate>,
}

#[derive(Debug, Serialize)]
pub struct ConfigResponse {
    pub strategy: String,
    pub rate: f64,
    pub parent_sampled: Option<String>,
    pub parent_not_sampled: Option<String>,
    pub remote_parent_sampled: Option<String>,
    pub remote_parent_not_sampled: Option<String>,
    pub local_parent_sampled: Option<String>,
    pub local_parent_not_sampled: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRateRequest {
    pub rate: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStrategyRequest {
    pub strategy: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConfigRequest {
    pub strategy: String,
    pub rate: f64,
    pub parent_sampled: Option<String>,
    pub parent_not_sampled: Option<String>,
    pub remote_parent_sampled: Option<String>,
    pub remote_parent_not_sampled: Option<String>,
    pub local_parent_sampled: Option<String>,
    pub local_parent_not_sampled: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct SuccessResponse {
    pub message: String,
}

fn parse_strategy(s: &str) -> Result<SamplingStrategy, String> {
    match s.to_lowercase().as_str() {
        "always_on" | "alwayson" | "always-on" => Ok(SamplingStrategy::AlwaysOn),
        "always_off" | "alwaysoff" | "always-off" => Ok(SamplingStrategy::AlwaysOff),
        "probability" | "probabilistic" | "prob" => Ok(SamplingStrategy::Probability),
        "parent_based" | "parentbased" | "parent-based" => Ok(SamplingStrategy::ParentBased),
        _ => Err(format!("无效的采样策略: {}", s)),
    }
}

fn strategy_to_string(s: &SamplingStrategy) -> String {
    s.to_string()
}

pub async fn get_config(
    State(state): State<AppState>,
) -> Result<Json<ConfigResponse>, (StatusCode, Json<ErrorResponse>)> {
    let config_arc = state.config.read().clone();
    let config = config_arc.as_ref();
    Ok(Json(ConfigResponse {
        strategy: strategy_to_string(&config.strategy),
        rate: config.rate,
        parent_sampled: config.parent_sampled.as_ref().map(strategy_to_string),
        parent_not_sampled: config.parent_not_sampled.as_ref().map(strategy_to_string),
        remote_parent_sampled: config.remote_parent_sampled.as_ref().map(strategy_to_string),
        remote_parent_not_sampled: config.remote_parent_not_sampled.as_ref().map(strategy_to_string),
        local_parent_sampled: config.local_parent_sampled.as_ref().map(strategy_to_string),
        local_parent_not_sampled: config.local_parent_not_sampled.as_ref().map(strategy_to_string),
    }))
}

pub async fn update_rate(
    State(state): State<AppState>,
    Json(req): Json<UpdateRateRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    if req.rate < 0.0 || req.rate > 1.0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("采样率必须在 0.0 到 1.0 之间，当前值: {}", req.rate),
            }),
        ));
    }

    let current_arc = state.config.read().clone();
    let mut new_config = current_arc.as_ref().clone();
    new_config.rate = req.rate;
    let new_arc = Arc::new(new_config.clone());
    *state.config.write() = new_arc;

    let _ = state.update_tx.send(ConfigUpdate {
        config: new_config,
        source: crate::config::ConfigSource::HttpApi,
    });

    info!("采样率已更新为: {}", req.rate);

    Ok(Json(SuccessResponse {
        message: format!("采样率已更新为: {}", req.rate),
    }))
}

pub async fn update_strategy(
    State(state): State<AppState>,
    Json(req): Json<UpdateStrategyRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let strategy = parse_strategy(&req.strategy).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e,
            }),
        )
    })?;

    let current_arc = state.config.read().clone();
    let mut new_config = current_arc.as_ref().clone();
    new_config.strategy = strategy;
    let new_arc = Arc::new(new_config.clone());
    *state.config.write() = new_arc;

    let _ = state.update_tx.send(ConfigUpdate {
        config: new_config,
        source: crate::config::ConfigSource::HttpApi,
    });

    info!("采样策略已更新为: {}", strategy);

    Ok(Json(SuccessResponse {
        message: format!("采样策略已更新为: {}", strategy),
    }))
}

pub async fn update_config(
    State(state): State<AppState>,
    Json(req): Json<UpdateConfigRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let strategy = parse_strategy(&req.strategy).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e,
            }),
        )
    })?;

    if req.rate < 0.0 || req.rate > 1.0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("采样率必须在 0.0 到 1.0 之间，当前值: {}", req.rate),
            }),
        ));
    }

    let parent_sampled = match &req.parent_sampled {
        Some(s) => Some(parse_strategy(s).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("parent_sampled: {}", e),
                }),
            )
        })?),
        None => None,
    };

    let parent_not_sampled = match &req.parent_not_sampled {
        Some(s) => Some(parse_strategy(s).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("parent_not_sampled: {}", e),
                }),
            )
        })?),
        None => None,
    };

    let remote_parent_sampled = match &req.remote_parent_sampled {
        Some(s) => Some(parse_strategy(s).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("remote_parent_sampled: {}", e),
                }),
            )
        })?),
        None => None,
    };

    let remote_parent_not_sampled = match &req.remote_parent_not_sampled {
        Some(s) => Some(parse_strategy(s).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("remote_parent_not_sampled: {}", e),
                }),
            )
        })?),
        None => None,
    };

    let local_parent_sampled = match &req.local_parent_sampled {
        Some(s) => Some(parse_strategy(s).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("local_parent_sampled: {}", e),
                }),
            )
        })?),
        None => None,
    };

    let local_parent_not_sampled = match &req.local_parent_not_sampled {
        Some(s) => Some(parse_strategy(s).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("local_parent_not_sampled: {}", e),
                }),
            )
        })?),
        None => None,
    };

    let new_config = SamplingConfig {
        strategy,
        rate: req.rate,
        parent_sampled,
        parent_not_sampled,
        remote_parent_sampled,
        remote_parent_not_sampled,
        local_parent_sampled,
        local_parent_not_sampled,
    };

    new_config.validate().map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e,
            }),
        )
    })?;

    let new_arc = Arc::new(new_config.clone());
    *state.config.write() = new_arc;

    let _ = state.update_tx.send(ConfigUpdate {
        config: new_config,
        source: crate::config::ConfigSource::HttpApi,
    });

    info!("配置已更新: strategy={}, rate={}", strategy, req.rate);

    Ok(Json(SuccessResponse {
        message: format!("配置已更新: strategy={}, rate={}", strategy, req.rate),
    }))
}

pub async fn health_check() -> Json<SuccessResponse> {
    Json(SuccessResponse {
        message: "OK".to_string(),
    })
}
