use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SamplingDecision {
    Drop,
    RecordAndSample,
    RecordOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SamplingStrategy {
    AlwaysOn,
    AlwaysOff,
    Probability,
    ParentBased,
}

impl std::fmt::Display for SamplingStrategy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SamplingStrategy::AlwaysOn => write!(f, "always_on"),
            SamplingStrategy::AlwaysOff => write!(f, "always_off"),
            SamplingStrategy::Probability => write!(f, "probability"),
            SamplingStrategy::ParentBased => write!(f, "parent_based"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplingConfig {
    pub strategy: SamplingStrategy,
    pub rate: f64,
    #[serde(default)]
    pub parent_sampled: Option<SamplingStrategy>,
    #[serde(default)]
    pub parent_not_sampled: Option<SamplingStrategy>,
    #[serde(default)]
    pub remote_parent_sampled: Option<SamplingStrategy>,
    #[serde(default)]
    pub remote_parent_not_sampled: Option<SamplingStrategy>,
    #[serde(default)]
    pub local_parent_sampled: Option<SamplingStrategy>,
    #[serde(default)]
    pub local_parent_not_sampled: Option<SamplingStrategy>,
}

impl Default for SamplingConfig {
    fn default() -> Self {
        SamplingConfig {
            strategy: SamplingStrategy::AlwaysOn,
            rate: 1.0,
            parent_sampled: None,
            parent_not_sampled: None,
            remote_parent_sampled: None,
            remote_parent_not_sampled: None,
            local_parent_sampled: None,
            local_parent_not_sampled: None,
        }
    }
}

impl SamplingConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.rate < 0.0 || self.rate > 1.0 {
            return Err(format!(
                "采样率必须在 0.0 到 1.0 之间，当前值: {}",
                self.rate
            ));
        }
        Ok(())
    }
}

pub struct Sampler {
    config: Arc<parking_lot::RwLock<Arc<SamplingConfig>>>,
}

impl Sampler {
    pub fn new(config: Arc<parking_lot::RwLock<Arc<SamplingConfig>>>) -> Self {
        Sampler { config }
    }

    pub fn should_sample(
        &self,
        trace_id: &str,
        parent_sampled: bool,
        has_parent: bool,
        is_remote_parent: bool,
    ) -> (SamplingDecision, f64, SamplingStrategy) {
        let config_arc = self.config.read().clone();
        let config = config_arc.as_ref();
        let strategy = config.strategy;

        match strategy {
            SamplingStrategy::AlwaysOn => (SamplingDecision::RecordAndSample, 1.0, strategy),
            SamplingStrategy::AlwaysOff => (SamplingDecision::Drop, 0.0, strategy),
            SamplingStrategy::Probability => {
                let decision = if Self::probability_sample(trace_id, config.rate) {
                    SamplingDecision::RecordAndSample
                } else {
                    SamplingDecision::Drop
                };
                (decision, config.rate, strategy)
            }
            SamplingStrategy::ParentBased => {
                self.parent_based_sample(
                    trace_id,
                    parent_sampled,
                    has_parent,
                    is_remote_parent,
                    config,
                )
            }
        }
    }

    fn parent_based_sample(
        &self,
        trace_id: &str,
        parent_sampled: bool,
        has_parent: bool,
        is_remote_parent: bool,
        config: &SamplingConfig,
    ) -> (SamplingDecision, f64, SamplingStrategy) {
        if !has_parent {
            let root_strategy = config.parent_sampled.unwrap_or(SamplingStrategy::Probability);
            return self.apply_strategy(trace_id, parent_sampled, has_parent, is_remote_parent, root_strategy, config);
        }

        let sub_strategy = if is_remote_parent {
            if parent_sampled {
                config
                    .remote_parent_sampled
                    .or(config.parent_sampled)
                    .unwrap_or(SamplingStrategy::AlwaysOn)
            } else {
                config
                    .remote_parent_not_sampled
                    .or(config.parent_not_sampled)
                    .unwrap_or(SamplingStrategy::AlwaysOff)
            }
        } else if parent_sampled {
            config
                .local_parent_sampled
                .or(config.parent_sampled)
                .unwrap_or(SamplingStrategy::AlwaysOn)
        } else {
            config
                .local_parent_not_sampled
                .or(config.parent_not_sampled)
                .unwrap_or(SamplingStrategy::AlwaysOff)
        };

        self.apply_strategy(
            trace_id,
            parent_sampled,
            has_parent,
            is_remote_parent,
            sub_strategy,
            config,
        )
    }

    fn apply_strategy(
        &self,
        trace_id: &str,
        parent_sampled: bool,
        has_parent: bool,
        is_remote_parent: bool,
        strategy: SamplingStrategy,
        config: &SamplingConfig,
    ) -> (SamplingDecision, f64, SamplingStrategy) {
        match strategy {
            SamplingStrategy::AlwaysOn => (SamplingDecision::RecordAndSample, 1.0, strategy),
            SamplingStrategy::AlwaysOff => (SamplingDecision::Drop, 0.0, strategy),
            SamplingStrategy::Probability => {
                let decision = if Self::probability_sample(trace_id, config.rate) {
                    SamplingDecision::RecordAndSample
                } else {
                    SamplingDecision::Drop
                };
                (decision, config.rate, strategy)
            }
            SamplingStrategy::ParentBased => self.parent_based_sample(
                trace_id,
                parent_sampled,
                has_parent,
                is_remote_parent,
                config,
            ),
        }
    }

    fn probability_sample(trace_id: &str, rate: f64) -> bool {
        if rate >= 1.0 {
            return true;
        }
        if rate <= 0.0 {
            return false;
        }

        let mut hasher = DefaultHasher::new();
        trace_id.hash(&mut hasher);
        let hash = hasher.finish();
        let normalized = (hash % 10000) as f64 / 10000.0;
        normalized < rate
    }

    pub fn update_config(&self, new_config: SamplingConfig) {
        let new_arc = Arc::new(new_config);
        *self.config.write() = new_arc;
    }

    pub fn get_config(&self) -> Arc<SamplingConfig> {
        self.config.read().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_sampler(strategy: SamplingStrategy, rate: f64) -> Sampler {
        let config = SamplingConfig {
            strategy,
            rate,
            ..Default::default()
        };
        Sampler::new(Arc::new(parking_lot::RwLock::new(Arc::new(config))))
    }

    #[test]
    fn test_always_on() {
        let sampler = create_sampler(SamplingStrategy::AlwaysOn, 1.0);
        let (decision, rate, strategy) =
            sampler.should_sample("trace-123", false, false, false);
        assert_eq!(decision, SamplingDecision::RecordAndSample);
        assert_eq!(rate, 1.0);
        assert_eq!(strategy, SamplingStrategy::AlwaysOn);
    }

    #[test]
    fn test_always_off() {
        let sampler = create_sampler(SamplingStrategy::AlwaysOff, 0.0);
        let (decision, rate, strategy) =
            sampler.should_sample("trace-123", false, false, false);
        assert_eq!(decision, SamplingDecision::Drop);
        assert_eq!(rate, 0.0);
        assert_eq!(strategy, SamplingStrategy::AlwaysOff);
    }

    #[test]
    fn test_probability_100_percent() {
        let sampler = create_sampler(SamplingStrategy::Probability, 1.0);
        let (decision, rate, _) = sampler.should_sample("trace-123", false, false, false);
        assert_eq!(decision, SamplingDecision::RecordAndSample);
        assert_eq!(rate, 1.0);
    }

    #[test]
    fn test_probability_0_percent() {
        let sampler = create_sampler(SamplingStrategy::Probability, 0.0);
        let (decision, rate, _) = sampler.should_sample("trace-123", false, false, false);
        assert_eq!(decision, SamplingDecision::Drop);
        assert_eq!(rate, 0.0);
    }

    #[test]
    fn test_probability_distribution() {
        let sampler = create_sampler(SamplingStrategy::Probability, 0.5);
        let mut sampled_count = 0;
        let total = 10000;
        for i in 0..total {
            let (decision, _, _) =
                sampler.should_sample(&format!("trace-{}", i), false, false, false);
            if matches!(decision, SamplingDecision::RecordAndSample) {
                sampled_count += 1;
            }
        }
        let actual_rate = sampled_count as f64 / total as f64;
        assert!(
            (actual_rate - 0.5).abs() < 0.1,
            "采样率应该接近 0.5，实际: {}",
            actual_rate
        );
    }

    #[test]
    fn test_parent_based_parent_sampled() {
        let config = SamplingConfig {
            strategy: SamplingStrategy::ParentBased,
            rate: 0.5,
            parent_sampled: Some(SamplingStrategy::AlwaysOn),
            parent_not_sampled: Some(SamplingStrategy::AlwaysOff),
            ..Default::default()
        };
        let sampler =
            Sampler::new(Arc::new(parking_lot::RwLock::new(Arc::new(config))));

        let (decision, _, _) =
            sampler.should_sample("trace-123", true, true, false);
        assert_eq!(decision, SamplingDecision::RecordAndSample);

        let (decision, _, _) =
            sampler.should_sample("trace-456", false, true, false);
        assert_eq!(decision, SamplingDecision::Drop);
    }

    #[test]
    fn test_parent_based_no_parent() {
        let config = SamplingConfig {
            strategy: SamplingStrategy::ParentBased,
            rate: 0.5,
            parent_sampled: Some(SamplingStrategy::Probability),
            ..Default::default()
        };
        let sampler =
            Sampler::new(Arc::new(parking_lot::RwLock::new(Arc::new(config))));

        let (_, rate, strategy) =
            sampler.should_sample("trace-123", false, false, false);
        assert_eq!(rate, 0.5);
        assert_eq!(strategy, SamplingStrategy::Probability);
    }

    #[test]
    fn test_config_update() {
        let sampler = create_sampler(SamplingStrategy::AlwaysOn, 1.0);
        let (decision, _, _) =
            sampler.should_sample("trace-123", false, false, false);
        assert_eq!(decision, SamplingDecision::RecordAndSample);

        let new_config = SamplingConfig {
            strategy: SamplingStrategy::AlwaysOff,
            rate: 0.0,
            ..Default::default()
        };
        sampler.update_config(new_config);

        let (decision, _, _) =
            sampler.should_sample("trace-123", false, false, false);
        assert_eq!(decision, SamplingDecision::Drop);
    }

    #[test]
    fn test_validate_rate() {
        let mut config = SamplingConfig::default();
        assert!(config.validate().is_ok());

        config.rate = 1.5;
        assert!(config.validate().is_err());

        config.rate = -0.1;
        assert!(config.validate().is_err());

        config.rate = 0.5;
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_probability_deterministic() {
        let sampler = create_sampler(SamplingStrategy::Probability, 0.5);
        let (d1, _, _) =
            sampler.should_sample("same-trace-id", false, false, false);
        let (d2, _, _) =
            sampler.should_sample("same-trace-id", false, false, false);
        assert_eq!(d1, d2);
    }

    #[test]
    fn test_concurrent_read_no_deadlock() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::time::Instant;

        let sampler = Arc::new(create_sampler(SamplingStrategy::Probability, 0.5));
        let counter = Arc::new(AtomicUsize::new(0));

        let mut handles = Vec::new();
        for t in 0..8 {
            let sampler = Arc::clone(&sampler);
            let counter = Arc::clone(&counter);
            handles.push(std::thread::spawn(move || {
                let start = Instant::now();
                while start.elapsed().as_millis() < 100 {
                    let _ = sampler.should_sample(
                        &format!("trace-{}-{}", t, counter.fetch_add(1, Ordering::Relaxed)),
                        false,
                        false,
                        false,
                    );
                }
            }));
        }

        let writer_sampler = Arc::clone(&sampler);
        let writer_handle = std::thread::spawn(move || {
            for _ in 0..100 {
                writer_sampler.update_config(SamplingConfig {
                    strategy: SamplingStrategy::Probability,
                    rate: 0.3,
                    ..Default::default()
                });
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
        });

        for h in handles {
            h.join().unwrap();
        }
        writer_handle.join().unwrap();

        assert!(counter.load(Ordering::Relaxed) > 0);
    }
}
