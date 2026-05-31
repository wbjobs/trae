use proxy_wasm::traits::*;
use proxy_wasm::types::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use md5::{Md5, Digest};

proxy_wasm::main! {{
    proxy_wasm::set_log_level(LogLevel::Info);
    proxy_wasm::set_root_context(|_| -> Box<dyn RootContext> {
        Box::new(GrayRoutingRoot {
            config: None,
            rules: Vec::new(),
        })
    });
}}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UpstreamNode {
    host: String,
    port: u32,
    #[serde(default = "default_weight")]
    weight: u32,
}

fn default_weight() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UpstreamConfig {
    #[serde(rename = "type")]
    upstream_type: String,
    #[serde(default)]
    nodes: Option<Vec<UpstreamNode>>,
    #[serde(default)]
    upstream_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MatchConfig {
    #[serde(default = "default_header")]
    header: String,
    #[serde(default)]
    value: Option<String>,
    #[serde(default = "default_user_id_header")]
    user_id_header: String,
    #[serde(default)]
    percentage: Option<u8>,
    #[serde(default)]
    hash_key: Option<String>,
    #[serde(default)]
    user_ids: Option<Vec<String>>,
}

fn default_header() -> String {
    "x-version".to_string()
}

fn default_user_id_header() -> String {
    "x-user-id".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GrayRule {
    #[serde(default)]
    match_config: Option<MatchConfig>,
    upstream: UpstreamConfig,
    #[serde(default = "default_enabled")]
    enabled: bool,
    #[serde(default)]
    priority: i32,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PluginConfig {
    #[serde(default)]
    rules: Vec<GrayRule>,
    #[serde(default)]
    default_upstream: Option<UpstreamConfig>,
    #[serde(default = "default_etcd_key")]
    etcd_watch_key: String,
}

fn default_etcd_key() -> String {
    "/apisix/plugins/gray-routing/rules".to_string()
}

struct GrayRoutingRoot {
    config: Option<PluginConfig>,
    rules: Vec<GrayRule>,
}

struct GrayRoutingHttp {
    rules: Vec<GrayRule>,
    default_upstream: Option<UpstreamConfig>,
}

impl RootContext for GrayRoutingRoot {
    fn on_configure(&mut self, _plugin_configuration_size: usize) -> bool {
        if let Some(config_bytes) = self.get_plugin_configuration() {
            match serde_json::from_slice::<PluginConfig>(&config_bytes) {
                Ok(config) => {
                    self.config = Some(config.clone());
                    self.rules = config.rules;
                    log::info!("Gray Routing Wasm plugin configured with {} rules", self.rules.len());
                    return true;
                }
                Err(e) => {
                    log::error!("Failed to parse plugin config: {}", e);
                    return false;
                }
            }
        }
        true
    }

    fn create_http_context(&self, _context_id: u32) -> Option<Box<dyn HttpContext>> {
        Some(Box::new(GrayRoutingHttp {
            rules: self.rules.clone(),
            default_upstream: self.config.as_ref().and_then(|c| c.default_upstream.clone()),
        }))
    }

    fn get_type(&self) -> Option<ContextType> {
        Some(ContextType::HttpContext)
    }
}

impl Context for GrayRoutingRoot {}
impl Context for GrayRoutingHttp {}

impl HttpContext for GrayRoutingHttp {
    fn on_http_request_headers(&mut self, _num_headers: usize, _end_of_stream: bool) -> Action {
        let headers = self.get_http_request_headers();
        let headers_map: HashMap<String, String> = headers.into_iter().collect();

        let mut rules = self.rules.clone();
        rules.sort_by(|a, b| b.priority.cmp(&a.priority));

        for rule in &rules {
            if !rule.enabled {
                continue;
            }

            if let Some(matched) = self.match_rule(rule, &headers_map) {
                if matched {
                    log::info!("Rule matched, routing to: {}", rule.upstream.upstream_type);
                    self.set_http_request_header("x-gray-route", Some(&rule.upstream.upstream_type));
                    self.set_http_request_header("x-gray-rule-matched", Some("true"));

                    if let Some(nodes) = &rule.upstream.nodes {
                        if !nodes.is_empty() {
                            let node = &nodes[0];
                            self.set_property(
                                &["upstream", "host"],
                                Some(node.host.as_bytes()),
                            );
                            self.set_property(
                                &["upstream", "port"],
                                Some(&node.port.to_le_bytes()),
                            );
                        }
                    }

                    return Action::Continue;
                }
            }
        }

        if let Some(default) = &self.default_upstream {
            self.set_http_request_header("x-gray-route", Some(&default.upstream_type));
            self.set_http_request_header("x-gray-rule-matched", Some("false"));
        }

        Action::Continue
    }
}

impl GrayRoutingHttp {
    fn match_rule(&self, rule: &GrayRule, headers: &HashMap<String, String>) -> Option<bool> {
        let match_config = rule.match_config.as_ref()?;

        if let Some(value) = &match_config.value {
            let header_value = headers.get(&match_config.header.to_lowercase())?;
            if header_value != value {
                return Some(false);
            }
        }

        let user_id = headers.get(&match_config.user_id_header.to_lowercase());

        if let Some(whitelist) = &match_config.user_ids {
            if let Some(uid) = user_id {
                if whitelist.contains(uid) {
                    log::info!("User {} matched whitelist", uid);
                    return Some(true);
                }
            }
        }

        if let Some(percentage) = match_config.percentage {
            if let Some(uid) = user_id {
                if self.is_user_in_percentage(uid, percentage, match_config.hash_key.as_deref()) {
                    log::info!("User {} matched percentage {}%", uid, percentage);
                    return Some(true);
                }
            }
        }

        if match_config.value.is_some() {
            return Some(true);
        }

        Some(false)
    }

    fn is_user_in_percentage(&self, user_id: &str, percentage: u8, hash_key: Option<&str>) -> bool {
        if percentage == 0 {
            return false;
        }
        if percentage >= 100 {
            return true;
        }

        let hash = self.hash_user_id(user_id, hash_key);
        (hash % 100) < percentage as u64
    }

    fn hash_user_id(&self, user_id: &str, hash_key: Option<&str>) -> u64 {
        let key = match hash_key {
            Some(k) => format!("{}{}", user_id, k),
            None => user_id.to_string(),
        };

        let mut hasher = Md5::new();
        hasher.update(key.as_bytes());
        let result = hasher.finalize();

        let mut hash: u64 = 0;
        for byte in result.iter() {
            hash = (hash * 256 + *byte as u64) % 10000;
        }

        hash
    }
}
