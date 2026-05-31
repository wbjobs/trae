use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;
use crate::crypto::CryptoManager;
use crate::db::{Database, PasswordEntry};

type SharedState = Arc<AppState>;

struct AppState {
    token: String,
    crypto: CryptoManager,
    db: Arc<Mutex<Option<Database>>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ApiResponse<T: Serialize> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PasswordRecord {
    id: String,
    title: String,
    username: String,
    password: String,
    url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct MatchQuery {
    url: Option<String>,
    domain: Option<String>,
}

pub struct HttpServer {
    port: u16,
    token: String,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    handle: Option<tokio::task::JoinHandle<()>>,
    running: bool,
}

impl HttpServer {
    pub async fn start(port: u16, crypto: CryptoManager) -> Result<Self, Box<dyn std::error::Error>> {
        let token = Uuid::new_v4().to_string();

        let app_state = Arc::new(AppState {
            token: token.clone(),
            crypto: crypto.clone(),
            db: Arc::new(Mutex::new(None)),
        });

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();

        let app = Router::new()
            .route("/api/health", get(health_check))
            .route("/api/passwords", get(list_passwords))
            .route("/api/passwords/{id}", get(get_password))
            .route("/api/match", get(find_matching_passwords))
            .with_state(app_state);

        let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
            .await
            .map_err(|e| format!("无法绑定端口 {}: {}", port, e))?;

        let actual_port = listener.local_addr()?.port();

        let handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await
                .unwrap_or_else(|e| eprintln!("服务器错误: {}", e));
        });

        Ok(Self {
            port: actual_port,
            token,
            shutdown_tx: Some(shutdown_tx),
            handle: Some(handle),
            running: true,
        })
    }

    pub async fn stop(mut self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.await;
        }
        self.running = false;
        Ok(())
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn is_running(&self) -> bool {
        self.running
    }
}

async fn health_check() -> Json<ApiResponse<()>> {
    Json(ApiResponse {
        success: true,
        data: None,
        error: None,
    })
}

fn verify_token(headers: &axum::http::HeaderMap, expected: &str) -> Result<(), StatusCode> {
    let auth = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if token != expected {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(())
}

async fn list_passwords(
    State(state): State<SharedState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<ApiResponse<Vec<PasswordRecord>>>, StatusCode> {
    verify_token(&headers, &state.token)?;

    let db = state.db.lock().await;
    let db = db.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let entries = db
        .list_passwords()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let records: Vec<PasswordRecord> = entries
        .into_iter()
        .map(|e| {
            let password = state
                .crypto
                .decrypt_from_db(&e.encrypted_password, &e.iv, &e.tag)
                .unwrap_or_default();

            PasswordRecord {
                id: e.id,
                title: e.title,
                username: e.username,
                password,
                url: e.url,
            }
        })
        .collect();

    Ok(Json(ApiResponse {
        success: true,
        data: Some(records),
        error: None,
    }))
}

async fn get_password(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    headers: axum::http::HeaderMap,
) -> Result<Json<ApiResponse<PasswordRecord>>, StatusCode> {
    verify_token(&headers, &state.token)?;

    let db = state.db.lock().await;
    let db = db.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let entry = db
        .get_password(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let password = state
        .crypto
        .decrypt_from_db(&entry.encrypted_password, &entry.iv, &entry.tag)
        .unwrap_or_default();

    Ok(Json(ApiResponse {
        success: true,
        data: Some(PasswordRecord {
            id: entry.id,
            title: entry.title,
            username: entry.username,
            password,
            url: entry.url,
        }),
        error: None,
    }))
}

async fn find_matching_passwords(
    State(state): State<SharedState>,
    Query(query): Query<MatchQuery>,
    headers: axum::http::HeaderMap,
) -> Result<Json<ApiResponse<Vec<PasswordRecord>>>, StatusCode> {
    verify_token(&headers, &state.token)?;

    let db = state.db.lock().await;
    let db = db.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let entries = db
        .list_passwords()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let search_target = query
        .domain
        .or_else(|| query.url.clone())
        .unwrap_or_default();

    let matching: Vec<PasswordRecord> = entries
        .into_iter()
        .filter(|e| {
            if let Some(url) = &e.url {
                url.contains(&search_target) || search_target.contains(url)
            } else {
                false
            }
        })
        .map(|e| {
            let password = state
                .crypto
                .decrypt_from_db(&e.encrypted_password, &e.iv, &e.tag)
                .unwrap_or_default();

            PasswordRecord {
                id: e.id,
                title: e.title,
                username: e.username,
                password,
                url: e.url,
            }
        })
        .collect();

    Ok(Json(ApiResponse {
        success: true,
        data: Some(matching),
        error: None,
    }))
}
