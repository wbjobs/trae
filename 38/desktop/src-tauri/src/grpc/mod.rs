use serde::{Deserialize, Serialize};
use tonic::transport::Channel;
use tracing::{info, error, warn};
use std::time::Duration;

pub mod access {
    tonic::include_proto!("access");
}

use access::{
    auth_service_client::AuthServiceClient,
    card_service_client::CardServiceClient,
    access_service_client::AccessServiceClient,
    audit_service_client::AuditServiceClient,
    LoginRequest, CardRequest, RegisterCardRequest as ProtoRegisterCardRequest,
    ListCardsRequest, TimeRule as ProtoTimeRule,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcConnectionResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub success: bool,
    pub token: Option<String>,
    pub user: Option<UserInfo>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterCardRequest {
    pub uid: String,
    pub owner_name: String,
    pub card_type: String,
    pub permission_group_id: String,
    pub key_a: Option<String>,
    pub key_b: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterCardResponse {
    pub success: bool,
    pub card_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevokeCardResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardInfo {
    pub id: String,
    pub uid: String,
    pub owner_name: String,
    pub card_type: String,
    pub permission_group_id: String,
    pub permission_group_name: String,
    pub status: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionGroupInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub time_rules: Vec<TimeRuleInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRuleInfo {
    pub id: String,
    pub day_of_week: i32,
    pub start_time: String,
    pub end_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessLogInfo {
    pub id: String,
    pub card_uid: Option<String>,
    pub card_owner: Option<String>,
    pub door_name: String,
    pub access_type: String,
    pub result: String,
    pub reason: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListAccessLogsResponse {
    pub logs: Vec<AccessLogInfo>,
    pub total: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenDoorResponse {
    pub success: bool,
    pub access_log_id: Option<String>,
    pub message: String,
}

pub struct GrpcClient {
    auth_client: AuthServiceClient<Channel>,
    card_client: CardServiceClient<Channel>,
    access_client: AccessServiceClient<Channel>,
    audit_client: AuditServiceClient<Channel>,
    token: Option<String>,
}

impl GrpcClient {
    pub async fn connect(address: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let endpoint = tonic::transport::Endpoint::new(address.to_string())?
            .timeout(Duration::from_secs(5))
            .connect_timeout(Duration::from_secs(5));

        let channel = endpoint.connect().await?;

        Ok(Self {
            auth_client: AuthServiceClient::new(channel.clone()),
            card_client: CardServiceClient::new(channel.clone()),
            access_client: AccessServiceClient::new(channel.clone()),
            audit_client: AuditServiceClient::new(channel),
            token: None,
        })
    }

    pub async fn login(&mut self, username: &str, password: &str) -> Result<LoginResponse, Box<dyn std::error::Error>> {
        let request = tonic::Request::new(LoginRequest {
            username: username.to_string(),
            password: password.to_string(),
        });

        match self.auth_client.login(request).await {
            Ok(response) => {
                let resp = response.into_inner();
                self.token = Some(resp.token.clone());
                
                Ok(LoginResponse {
                    success: resp.success,
                    token: if resp.success { Some(resp.token) } else { None },
                    user: resp.user.map(|u| UserInfo {
                        id: u.id,
                        username: u.username,
                        name: u.name,
                        role: u.role,
                    }),
                    message: resp.message,
                })
            }
            Err(e) => {
                error!("gRPC login error: {}", e);
                Ok(LoginResponse {
                    success: false,
                    token: None,
                    user: None,
                    message: format!("Login failed: {}", e.message()),
                })
            }
        }
    }

    pub async fn register_card(&self, card: RegisterCardRequest) -> Result<RegisterCardResponse, Box<dyn std::error::Error>> {
        let request = tonic::Request::new(ProtoRegisterCardRequest {
            uid: card.uid,
            owner_name: card.owner_name,
            card_type: card.card_type,
            permission_group_id: card.permission_group_id,
            key_a: card.key_a.unwrap_or_default(),
            key_b: card.key_b.unwrap_or_default(),
        });

        match self.card_client.register_card(request).await {
            Ok(response) => {
                let resp = response.into_inner();
                Ok(RegisterCardResponse {
                    success: resp.success,
                    card_id: if resp.success { Some(resp.card_id) } else { None },
                    message: resp.message,
                })
            }
            Err(e) => {
                error!("Register card error: {}", e);
                Ok(RegisterCardResponse {
                    success: false,
                    card_id: None,
                    message: format!("Registration failed: {}", e.message()),
                })
            }
        }
    }

    pub async fn revoke_card(&self, card_id: &str) -> Result<RevokeCardResponse, Box<dyn std::error::Error>> {
        let request = tonic::Request::new(CardRequest {
            card_id: card_id.to_string(),
        });

        match self.card_client.revoke_card(request).await {
            Ok(response) => {
                let resp = response.into_inner();
                Ok(RevokeCardResponse {
                    success: resp.success,
                    message: resp.message,
                })
            }
            Err(e) => {
                error!("Revoke card error: {}", e);
                Ok(RevokeCardResponse {
                    success: false,
                    message: format!("Revoke failed: {}", e.message()),
                })
            }
        }
    }

    pub async fn list_cards(&self) -> Result<Vec<CardInfo>, Box<dyn std::error::Error>> {
        let request = tonic::Request::new(ListCardsRequest {
            page: 1,
            page_size: 100,
            status: String::new(),
        });

        match self.card_client.list_cards(request).await {
            Ok(response) => {
                let resp = response.into_inner();
                let cards = resp.cards.into_iter().map(|c| CardInfo {
                    id: c.id,
                    uid: c.uid,
                    owner_name: c.owner_name,
                    card_type: c.card_type,
                    permission_group_id: c.permission_group_id,
                    permission_group_name: c.permission_group_name,
                    status: c.status,
                    created_at: c.created_at,
                }).collect();
                Ok(cards)
            }
            Err(e) => {
                error!("List cards error: {}", e);
                Err(e.into())
            }
        }
    }

    pub async fn list_permission_groups(&self) -> Result<Vec<PermissionGroupInfo>, Box<dyn std::error::Error>> {
        #[derive(Default)]
        struct EmptyRequest {}

        let request = tonic::Request::new(access::ListPermissionGroupsRequest::default());

        match self.access_client.list_permission_groups(request).await {
            Ok(response) => {
                let resp = response.into_inner();
                let groups = resp.groups.into_iter().map(|g| PermissionGroupInfo {
                    id: g.id,
                    name: g.name,
                    description: g.description,
                    time_rules: g.time_rules.into_iter().map(|r| TimeRuleInfo {
                        id: r.id,
                        day_of_week: r.day_of_week,
                        start_time: r.start_time,
                        end_time: r.end_time,
                    }).collect(),
                }).collect();
                Ok(groups)
            }
            Err(e) => {
                error!("List permission groups error: {}", e);
                Err(e.into())
            }
        }
    }

    pub async fn list_access_logs(&self, limit: i32, offset: i32) -> Result<ListAccessLogsResponse, Box<dyn std::error::Error>> {
        let request = tonic::Request::new(access::ListAccessLogsRequest {
            page: (offset / limit) + 1,
            page_size: limit,
            card_id: String::new(),
            start_time: 0,
            end_time: 0,
        });

        match self.audit_client.list_access_logs(request).await {
            Ok(response) => {
                let resp = response.into_inner();
                let logs = resp.logs.into_iter().map(|l| AccessLogInfo {
                    id: l.id,
                    card_uid: if l.card_uid.is_empty() { None } else { Some(l.card_uid) },
                    card_owner: if l.card_owner.is_empty() { None } else { Some(l.card_owner) },
                    door_name: l.door_name,
                    access_type: l.access_type,
                    result: l.result,
                    reason: if l.reason.is_empty() { None } else { Some(l.reason) },
                    timestamp: l.timestamp,
                }).collect();
                
                Ok(ListAccessLogsResponse {
                    logs,
                    total: resp.total,
                })
            }
            Err(e) => {
                error!("List access logs error: {}", e);
                Err(e.into())
            }
        }
    }

    pub async fn remote_open_door(&self, door_id: &str, reason: &str) -> Result<OpenDoorResponse, Box<dyn std::error::Error>> {
        let request = tonic::Request::new(access::RemoteOpenDoorRequest {
            door_id: door_id.to_string(),
            reason: reason.to_string(),
        });

        match self.access_client.remote_open_door(request).await {
            Ok(response) => {
                let resp = response.into_inner();
                Ok(OpenDoorResponse {
                    success: resp.success,
                    access_log_id: if resp.success { Some(resp.access_log_id) } else { None },
                    message: resp.message,
                })
            }
            Err(e) => {
                error!("Remote open door error: {}", e);
                Ok(OpenDoorResponse {
                    success: false,
                    access_log_id: None,
                    message: format!("Open door failed: {}", e.message()),
                })
            }
        }
    }
}
