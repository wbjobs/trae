use crate::sampler::{SamplingConfig, SamplingStrategy};
use etcd_client::Client;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tracing::{info, warn};

#[derive(Debug, Clone)]
pub struct ConfigUpdate {
    pub config: SamplingConfig,
    pub source: ConfigSource,
}

#[derive(Debug, Clone, Copy)]
pub enum ConfigSource {
    Etcd,
    HttpApi,
}

pub struct EtcdConfigManager {
    client: Option<Client>,
    key_prefix: String,
    config: Arc<parking_lot::RwLock<Arc<SamplingConfig>>>,
    update_tx: broadcast::Sender<ConfigUpdate>,
}

impl EtcdConfigManager {
    pub async fn new(
        etcd_endpoints: Vec<String>,
        key_prefix: String,
        config: Arc<parking_lot::RwLock<Arc<SamplingConfig>>>,
        update_tx: broadcast::Sender<ConfigUpdate>,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = if etcd_endpoints.is_empty() {
            warn!("未提供 etcd 端点，将使用本地配置");
            None
        } else {
            match Client::connect(etcd_endpoints.clone(), None).await {
                Ok(c) => {
                    info!("已连接到 etcd: {:?}", etcd_endpoints);
                    Some(c)
                }
                Err(e) => {
                    warn!("无法连接到 etcd: {}，将使用本地配置", e);
                    None
                }
            }
        };

        Ok(EtcdConfigManager {
            client,
            key_prefix,
            config,
            update_tx,
        })
    }

    pub async fn start_reload_loop(&self) {
        if self.client.is_none() {
            info!("etcd 客户端未初始化，跳过配置热更新");
            return;
        }

        let client = self.client.as_ref().unwrap().clone();
        let key_prefix = self.key_prefix.clone();
        let config = Arc::clone(&self.config);
        let update_tx = self.update_tx.clone();

        tokio::spawn(async move {
            info!("启动 etcd 配置热更新循环，每 1 秒检查一次");
            loop {
                match Self::load_from_etcd(&client, &key_prefix).await {
                    Ok(new_config) => {
                        let current_arc = config.read().clone();
                        let current = current_arc.as_ref();
                        if !configs_equal(current, &new_config) {
                            info!("检测到 etcd 配置更新: {:?}", new_config);
                            let new_arc = Arc::new(new_config.clone());
                            *config.write() = new_arc;
                            let _ = update_tx.send(ConfigUpdate {
                                config: new_config,
                                source: ConfigSource::Etcd,
                            });
                        }
                    }
                    Err(e) => {
                        warn!("从 etcd 加载配置失败: {}", e);
                    }
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });
    }

    async fn load_from_etcd(
        client: &Client,
        key_prefix: &str,
    ) -> Result<SamplingConfig, Box<dyn std::error::Error + Send + Sync>> {
        let mut client = client.clone();

        let strategy_key = format!("{}/strategy", key_prefix);
        let rate_key = format!("{}/rate", key_prefix);

        let strategy_resp = client
            .get(strategy_key.as_str(), None)
            .await
            .map_err(|e| format!("获取 strategy 失败: {}", e))?;
        let rate_resp = client
            .get(rate_key.as_str(), None)
            .await
            .map_err(|e| format!("获取 rate 失败: {}", e))?;

        let strategy_str = strategy_resp
            .kvs()
            .first()
            .map(|kv| kv.value_str().unwrap_or("always_on").to_string())
            .unwrap_or_else(|| "always_on".to_string());

        let rate_str = rate_resp
            .kvs()
            .first()
            .map(|kv| kv.value_str().unwrap_or("1.0").to_string())
            .unwrap_or_else(|| "1.0".to_string());

        let strategy = parse_strategy(&strategy_str);
        let rate: f64 = rate_str.parse().unwrap_or(1.0).clamp(0.0, 1.0);

        let parent_sampled_key = format!("{}/parent_sampled", key_prefix);
        let parent_not_sampled_key = format!("{}/parent_not_sampled", key_prefix);
        let remote_parent_sampled_key = format!("{}/remote_parent_sampled", key_prefix);
        let remote_parent_not_sampled_key = format!("{}/remote_parent_not_sampled", key_prefix);
        let local_parent_sampled_key = format!("{}/local_parent_sampled", key_prefix);
        let local_parent_not_sampled_key = format!("{}/local_parent_not_sampled", key_prefix);

        let parent_sampled = Self::get_optional_strategy(&mut client, &parent_sampled_key).await?;
        let parent_not_sampled =
            Self::get_optional_strategy(&mut client, &parent_not_sampled_key).await?;
        let remote_parent_sampled =
            Self::get_optional_strategy(&mut client, &remote_parent_sampled_key).await?;
        let remote_parent_not_sampled =
            Self::get_optional_strategy(&mut client, &remote_parent_not_sampled_key).await?;
        let local_parent_sampled =
            Self::get_optional_strategy(&mut client, &local_parent_sampled_key).await?;
        let local_parent_not_sampled =
            Self::get_optional_strategy(&mut client, &local_parent_not_sampled_key).await?;

        let config = SamplingConfig {
            strategy,
            rate,
            parent_sampled,
            parent_not_sampled,
            remote_parent_sampled,
            remote_parent_not_sampled,
            local_parent_sampled,
            local_parent_not_sampled,
        };

        config
            .validate()
            .map_err(|e| format!("配置验证失败: {}", e))?;

        Ok(config)
    }

    async fn get_optional_strategy(
        client: &mut Client,
        key: &str,
    ) -> Result<Option<SamplingStrategy>, Box<dyn std::error::Error + Send + Sync>> {
        match client.get(key, None).await {
            Ok(resp) => Ok(resp
                .kvs()
                .first()
                .and_then(|kv| kv.value_str().ok())
                .map(|s| parse_strategy(&s.to_string()))),
            Err(_) => Ok(None),
        }
    }

    pub fn update_local_config(
        &self,
        new_config: SamplingConfig,
    ) -> Result<(), String> {
        new_config.validate()?;
        let new_arc = Arc::new(new_config.clone());
        *self.config.write() = new_arc;
        let _ = self.update_tx.send(ConfigUpdate {
            config: new_config,
            source: ConfigSource::HttpApi,
        });
        Ok(())
    }

    pub fn get_config(&self) -> Arc<SamplingConfig> {
        self.config.read().clone()
    }
}

fn parse_strategy(s: &str) -> SamplingStrategy {
    match s.to_lowercase().as_str() {
        "always_on" | "alwayson" | "always-on" => SamplingStrategy::AlwaysOn,
        "always_off" | "alwaysoff" | "always-off" => SamplingStrategy::AlwaysOff,
        "probability" | "probabilistic" | "prob" => SamplingStrategy::Probability,
        "parent_based" | "parentbased" | "parent-based" => SamplingStrategy::ParentBased,
        _ => {
            warn!("未知的采样策略: {}，默认使用 always_on", s);
            SamplingStrategy::AlwaysOn
        }
    }
}

fn configs_equal(a: &SamplingConfig, b: &SamplingConfig) -> bool {
    a.strategy == b.strategy
        && (a.rate - b.rate).abs() < f64::EPSILON
        && a.parent_sampled == b.parent_sampled
        && a.parent_not_sampled == b.parent_not_sampled
        && a.remote_parent_sampled == b.remote_parent_sampled
        && a.remote_parent_not_sampled == b.remote_parent_not_sampled
        && a.local_parent_sampled == b.local_parent_sampled
        && a.local_parent_not_sampled == b.local_parent_not_sampled
}
