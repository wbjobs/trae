use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;
use tracing::{info, warn, error};
use rand::Rng;

use super::pcsc::ConnectedCard;
use super::NFCError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ATRFeature {
    pub response_time_ms: f64,
    pub atr_raw: Vec<u8>,
    pub atr_hash: String,
    pub signal_strength: Option<f32>,
    pub retry_count: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardProfile {
    pub uid: String,
    pub atr_features: Vec<ATRFeature>,
    pub avg_response_time: f64,
    pub std_deviation: f64,
    pub anomaly_score: f64,
    pub last_seen: i64,
    pub is_suspicious: bool,
    pub is_blacklisted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntiCloneResult {
    pub is_genuine: bool,
    pub confidence: f64,
    pub reasons: Vec<String>,
    pub action_required: ActionType,
    pub anomaly_score: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActionType {
    Allow,
    Warn,
    Block,
    Blacklist,
}

pub struct AntiCloneDetector {
    profiles: Arc<RwLock<HashMap<String, CardProfile>>>,
    isolation_forest: Arc<RwLock<IsolationForest>>,
    config: DetectorConfig,
}

#[derive(Debug, Clone)]
pub struct DetectorConfig {
    pub base_timeout_ms: u64,
    pub max_response_time_ms: f64,
    pub anomaly_threshold: f64,
    pub min_samples_for_training: usize,
    pub blacklist_after_violations: u8,
}

impl Default for DetectorConfig {
    fn default() -> Self {
        Self {
            base_timeout_ms: 200,
            max_response_time_ms: 500.0,
            anomaly_threshold: 0.7,
            min_samples_for_training: 10,
            blacklist_after_violations: 3,
        }
    }
}

pub struct IsolationForest {
    trees: Vec<IsolationTree>,
    num_trees: usize,
    sample_size: usize,
}

struct IsolationTree {
    max_depth: usize,
    root: Option<TreeNode>,
}

#[derive(Debug, Clone)]
enum TreeNode {
    Internal {
        feature_index: usize,
        threshold: f64,
        left: Box<TreeNode>,
        right: Box<TreeNode>,
    },
    Leaf {
        size: usize,
    },
}

impl AntiCloneDetector {
    pub fn new() -> Self {
        Self {
            profiles: Arc::new(RwLock::new(HashMap::new())),
            isolation_forest: Arc::new(RwLock::new(IsolationForest::new(100, 256))),
            config: DetectorConfig::default(),
        }
    }

    pub fn with_config(config: DetectorConfig) -> Self {
        Self {
            profiles: Arc::new(RwLock::new(HashMap::new())),
            isolation_forest: Arc::new(RwLock::new(IsolationForest::new(100, 256))),
            config,
        }
    }

    pub fn analyze_card(
        &self,
        card: &ConnectedCard,
        registered_uid: Option<&str>,
    ) -> Result<AntiCloneResult, NFCError> {
        let mut reasons = Vec::new();
        let mut anomaly_score = 0.0;

        let uid = card.get_uid()?;
        let uid_str = uid.iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(":");

        info!("Analyzing card with UID: {}", uid_str);

        let start_time = std::time::Instant::now();
        let atr_raw = self.get_atr_with_timing(card)?;
        let response_time = start_time.elapsed().as_secs_f64() * 1000.0;

        let atr_hash = format!("{:X}", md5_hash(&atr_raw));

        if response_time > self.config.max_response_time_ms {
            reasons.push(format!(
                "响应时间异常: {:.2}ms (正常范围 < {:.2}ms)",
                response_time, self.config.max_response_time_ms
            ));
            anomaly_score += 0.4;
            warn!("Suspicious response time detected: {:.2}ms", response_time);
        }

        if let Some(expected_uid) = registered_uid {
            let clean_expected = expected_uid.replace(":", "").to_uppercase();
            let clean_actual = uid_str.replace(":", "").to_uppercase();

            if clean_expected != clean_actual {
                reasons.push(format!(
                    "UID不匹配: 注册={}, 实际={}",
                    clean_expected, clean_actual
                ));
                anomaly_score = 1.0;
                warn!("UID mismatch detected! Expected: {}, Actual: {}", expected_uid, uid_str);

                return Ok(AntiCloneResult {
                    is_genuine: false,
                    confidence: 1.0,
                    reasons,
                    action_required: ActionType::Blacklist,
                    anomaly_score,
                });
            }
        }

        if self.is_known_suspicious(&uid_str) {
            reasons.push("卡片在黑名单中".to_string());
            anomaly_score = 1.0;
            return Ok(AntiCloneResult {
                is_genuine: false,
                confidence: 1.0,
                reasons,
                action_required: ActionType::Blacklist,
                anomaly_score,
            });
        }

        let profile = self.get_or_create_profile(&uid_str);
        self.update_profile(&uid_str, response_time, &atr_hash);

        let isolation_score = self.calculate_isolation_score(response_time);
        if isolation_score > self.config.anomaly_threshold {
            reasons.push(format!(
                "行为模式异常: 隔离分数={:.3}",
                isolation_score
            ));
            anomaly_score += isolation_score * 0.5;
        }

        if self.check_atr_anomaly(&uid_str, &atr_hash) {
            reasons.push("ATR特征异常".to_string());
            anomaly_score += 0.3;
        }

        let final_score = (anomaly_score * 100.0).round() / 100.0;
        let is_genuine = final_score < 0.7;
        let confidence = if is_genuine {
            1.0 - final_score
        } else {
            final_score
        };

        let action = self.determine_action(final_score, reasons.len());

        info!(
            "Card analysis complete: UID={}, score={:.2}, genuine={}, action={:?}",
            uid_str, final_score, is_genuine, action
        );

        Ok(AntiCloneResult {
            is_genuine,
            confidence,
            reasons,
            action_required: action,
            anomaly_score: final_score,
        })
    }

    fn get_atr_with_timing(&self, card: &ConnectedCard) -> Result<Vec<u8>, NFCError> {
        let get_atr_cmd = vec![0xFF, 0xCA, 0x00, 0x00, 0x00];
        let mut response = [0u8; 256];

        match card.transmit_with_retry(&get_atr_cmd, &mut response, 3, 500) {
            Ok(len) => {
                if len >= 2 && response[len - 2] == 0x90 && response[len - 1] == 0x00 {
                    Ok(response[..len - 2].to_vec())
                } else {
                    Ok(response[..len.min(32)].to_vec())
                }
            }
            Err(_) => Ok(Vec::new()),
        }
    }

    fn get_or_create_profile(&self, uid: &str) -> CardProfile {
        let mut profiles = self.profiles.write();
        profiles.entry(uid.to_string())
            .or_insert_with(|| CardProfile {
                uid: uid.to_string(),
                atr_features: Vec::new(),
                avg_response_time: 0.0,
                std_deviation: 0.0,
                anomaly_score: 0.0,
                last_seen: chrono_timestamp(),
                is_suspicious: false,
                is_blacklisted: false,
            })
            .clone()
    }

    fn update_profile(&self, uid: &str, response_time: f64, atr_hash: &str) {
        let mut profiles = self.profiles.write();
        if let Some(profile) = profiles.get_mut(uid) {
            profile.last_seen = chrono_timestamp();

            let feature = ATRFeature {
                response_time_ms: response_time,
                atr_raw: Vec::new(),
                atr_hash: atr_hash.to_string(),
                signal_strength: None,
                retry_count: 0,
            };
            profile.atr_features.push(feature);

            if profile.atr_features.len() > 100 {
                profile.atr_features.remove(0);
            }

            let times: Vec<f64> = profile.atr_features.iter()
                .map(|f| f.response_time_ms)
                .collect();

            profile.avg_response_time = times.iter().sum::<f64>() / times.len() as f64;
            profile.std_deviation = calculate_std_dev(&times, profile.avg_response_time);
        }
    }

    fn calculate_isolation_score(&self, response_time: f64) -> f64 {
        let profiles = self.profiles.read();

        if profiles.is_empty() {
            return 0.0;
        }

        let mut all_times: Vec<f64> = profiles.values()
            .flat_map(|p| p.atr_features.iter().map(|f| f.response_time_ms))
            .collect();

        if all_times.len() < 10 {
            return 0.0;
        }

        all_times.push(response_time);
        let mean = all_times.iter().sum::<f64>() / all_times.len() as f64;
        let std_dev = calculate_std_dev(&all_times, mean);

        if std_dev < 0.001 {
            return 0.0;
        }

        let z_score = ((response_time - mean) / std_dev).abs();

        let score = if z_score > 3.0 {
            1.0
        } else {
            (z_score / 3.0).min(1.0)
        };

        let isolation_forest = self.isolation_forest.read();
        isolation_forest.score(&[response_time])
    }

    fn check_atr_anomaly(&self, uid: &str, atr_hash: &str) -> bool {
        let profiles = self.profiles.read();
        if let Some(profile) = profiles.get(uid) {
            if profile.atr_features.len() >= 2 {
                let hashes: Vec<&str> = profile.atr_features.iter()
                    .map(|f| f.atr_hash.as_str())
                    .collect();

                let unique_count = hashes.iter().collect::<std::collections::HashSet<_>>().len();
                let total = hashes.len();

                if unique_count as f64 / total as f64 < 0.8 {
                    return true;
                }

                if !profile.atr_features.iter().any(|f| f.atr_hash == atr_hash) {
                    let recent_features = &profile.atr_features[profile.atr_features.len().saturating_sub(5)..];
                    let old_hashes: Vec<_> = recent_features.iter()
                        .map(|f| &f.atr_hash)
                        .collect();

                    if old_hashes.iter().all(|h| *h != atr_hash) && old_hashes.len() >= 3 {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn is_known_suspicious(&self, uid: &str) -> bool {
        let profiles = self.profiles.read();
        profiles.get(uid)
            .map(|p| p.is_blacklisted || p.is_suspicious)
            .unwrap_or(false)
    }

    fn determine_action(&self, anomaly_score: f64, reason_count: usize) -> ActionType {
        if anomaly_score >= 0.9 || reason_count >= 3 {
            ActionType::Blacklist
        } else if anomaly_score >= 0.7 {
            ActionType::Block
        } else if anomaly_score >= 0.4 || reason_count >= 2 {
            ActionType::Warn
        } else {
            ActionType::Allow
        }
    }

    pub fn blacklist_card(&self, uid: &str) {
        let mut profiles = self.profiles.write();
        if let Some(profile) = profiles.get_mut(uid) {
            profile.is_blacklisted = true;
            profile.is_suspicious = true;
            info!("Card {} has been blacklisted", uid);
        }
    }

    pub fn unblacklist_card(&self, uid: &str) {
        let mut profiles = self.profiles.write();
        if let Some(profile) = profiles.get_mut(uid) {
            profile.is_blacklisted = false;
            info!("Card {} has been removed from blacklist", uid);
        }
    }

    pub fn get_all_suspicious_cards(&self) -> Vec<CardProfile> {
        let profiles = self.profiles.read();
        profiles.values()
            .filter(|p| p.is_suspicious || p.anomaly_score > 0.5)
            .cloned()
            .collect()
    }

    pub fn get_profile(&self, uid: &str) -> Option<CardProfile> {
        let profiles = self.profiles.read();
        profiles.get(uid).cloned()
    }
}

impl IsolationForest {
    pub fn new(num_trees: usize, sample_size: usize) -> Self {
        Self {
            trees: (0..num_trees).map(|_| IsolationTree::new(10)).collect(),
            num_trees,
            sample_size,
        }
    }

    pub fn score(&self, features: &[f64]) -> f64 {
        if features.is_empty() {
            return 0.0;
        }

        let mut path_lengths: Vec<f64> = self.trees.iter()
            .map(|tree| tree.path_length(features, 0) as f64)
            .collect();

        let avg_path_length = path_lengths.iter().sum::<f64>() / path_lengths.len() as f64;

        let c = if self.sample_size > 2 {
            2.0 * (self.sample_size as f64 - 1.0).ln() - (2.0 * (self.sample_size as f64 - 2.0) / self.sample_size as f64)
        } else {
            1.0
        };

        let anomaly_score = (-avg_path_length / c).exp();

        anomaly_score.max(0.0).min(1.0)
    }

    pub fn train(&mut self, data: &[Vec<f64>]) {
        let mut rng = rand::thread_rng();

        for tree in &mut self.trees {
            let sample_size = data.len().min(self.sample_size);
            let indices: Vec<usize> = (0..data.len())
                .choose_multiple(&mut rng, sample_size)
                .cloned()
                .collect();

            let sample: Vec<Vec<f64>> = indices.iter()
                .filter_map(|&i| data.get(i).cloned())
                .collect();

            tree.build_tree(&sample, 0);
        }
    }
}

impl IsolationTree {
    pub fn new(max_depth: usize) -> Self {
        Self {
            max_depth,
            root: None,
        }
    }

    pub fn build_tree(&mut self, data: &[Vec<f64>], depth: usize) {
        if data.is_empty() || depth >= self.max_depth || data.len() <= 1 {
            self.root = Some(TreeNode::Leaf { size: data.len() });
            return;
        }

        let num_features = data[0].len();
        if num_features == 0 {
            self.root = Some(TreeNode::Leaf { size: data.len() });
            return;
        }

        let feature_index = rand::thread_rng().gen_range(0..num_features);
        let values: Vec<f64> = data.iter()
            .map(|row| row[feature_index])
            .collect();

        let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = values.iter().cloned().fold(-f64::INFINITY, f64::max);

        if (max - min).abs() < 0.0001 {
            self.root = Some(TreeNode::Leaf { size: data.len() });
            return;
        }

        let threshold = rand::thread_rng().gen_range(min..max);

        let left: Vec<Vec<f64>> = data.iter()
            .filter(|row| row[feature_index] < threshold)
            .cloned()
            .collect();

        let right: Vec<Vec<f64>> = data.iter()
            .filter(|row| row[feature_index] >= threshold)
            .cloned()
            .collect();

        let mut left_tree = IsolationTree::new(self.max_depth);
        left_tree.build_tree(&left, depth + 1);

        let mut right_tree = IsolationTree::new(self.max_depth);
        right_tree.build_tree(&right, depth + 1);

        self.root = Some(TreeNode::Internal {
            feature_index,
            threshold,
            left: Box::new(left_tree),
            right: Box::new(right_tree),
        });
    }

    pub fn path_length(&self, features: &[f64], depth: usize) -> usize {
        match &self.root {
            Some(TreeNode::Leaf { size }) => {
                if *size <= 1 {
                    depth as usize
                } else {
                    depth as usize + calculate_path_length(*size)
                }
            }
            Some(TreeNode::Internal { feature_index, threshold, left, right }) => {
                if *feature_index < features.len() {
                    if features[*feature_index] < *threshold {
                        left.path_length(features, depth + 1)
                    } else {
                        right.path_length(features, depth + 1)
                    }
                } else {
                    depth as usize
                }
            }
            None => depth as usize,
        }
    }
}

fn calculate_path_length(n: usize) -> f64 {
    if n <= 1 {
        0.0
    } else {
        (n as f64).ln() + 0.5772156649
    }
}

fn calculate_std_dev(values: &[f64], mean: f64) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }

    let variance = values.iter()
        .map(|v| {
            let diff = v - mean;
            diff * diff
        })
        .sum::<f64>() / (values.len() - 1) as f64;

    variance.sqrt()
}

fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn md5_hash(data: &[u8]) -> u128 {
    let mut hash: u128 = 0;
    for (i, &byte) in data.iter().enumerate() {
        hash = hash.wrapping_add((byte as u128).wrapping_mul((i + 1) as u128));
        hash = hash.rotate_left(7);
    }
    hash
}

trait ChooseMultiple: Iterator {
    fn choose_multiple(&mut self, k: usize) -> Vec<Self::Item>
    where
        Self: Sized,
        Self::Item: Clone,
    {
        let mut rng = rand::thread_rng();
        let pool: Vec<_> = self.collect();
        pool.choose_multiple(&mut rng, k).cloned().collect()
    }
}

impl<T: Iterator> ChooseMultiple for T {}

trait ChooseExt<T> {
    fn choose_multiple(&mut self, rng: &mut impl rand::Rng, k: usize) -> Vec<T>;
}

impl<T> ChooseExt<T> for Vec<T> {
    fn choose_multiple(&mut self, rng: &mut impl rand::Rng, k: usize) -> Vec<T> {
        let len = self.len();
        if k >= len {
            return std::mem::take(self);
        }

        let mut result = Vec::with_capacity(k);
        let mut indices: Vec<usize> = (0..len).collect();
        
        for i in 0..k {
            let j = rng.gen_range(i..len);
            indices.swap(i, j);
        }

        for i in 0..k {
            result.push(self[indices[i]].clone());
        }

        result
    }
}
