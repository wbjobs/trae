use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct PasswordAnalysis {
    pub total_passwords: usize,
    pub weak_passwords: Vec<WeakPassword>,
    pub duplicate_passwords: Vec<DuplicatePassword>,
    pub reused_passwords: Vec<ReusedPassword>,
    pub old_passwords: Vec<OldPassword>,
    pub average_strength: f32,
    pub security_score: u8,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WeakPassword {
    pub id: String,
    pub title: String,
    pub score: u8,
    pub label: String,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicatePassword {
    pub password: String,
    pub count: usize,
    pub entries: Vec<PasswordRef>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReusedPassword {
    pub password: String,
    pub count: usize,
    pub entries: Vec<PasswordRef>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OldPassword {
    pub id: String,
    pub title: String,
    pub days_since_change: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PasswordRef {
    pub id: String,
    pub title: String,
}

#[derive(Debug)]
pub struct PasswordStrengthResult {
    pub score: u8,
    pub label: String,
    pub suggestions: Vec<String>,
    pub crack_time: String,
}

pub fn check_password_strength(password: &str) -> PasswordStrengthResult {
    let result = zxcvbn::zxcvbn(password, &[]);

    match result {
        Ok(entropy) => {
            let score = entropy.score() as u8;
            let label = match score {
                0 => "非常弱",
                1 => "弱",
                2 => "一般",
                3 => "强",
                _ => "非常强",
            };

            let crack_time = format!(
                "{:.1} 秒",
                entropy.crack_times().online_throttling_100_per_hour()
            );

            let suggestions = entropy
                .feedback()
                .map(|f| {
                    let mut s = Vec::new();
                    if let Some(warning) = f.warning() {
                        s.push(warning.to_string());
                    }
                    s.extend(f.suggestions().iter().map(|s| s.to_string()));
                    s
                })
                .unwrap_or_default();

            PasswordStrengthResult {
                score: score * 25,
                label: label.to_string(),
                suggestions,
                crack_time,
            }
        }
        Err(_) => PasswordStrengthResult {
            score: 0,
            label: "无效密码".to_string(),
            suggestions: vec!["密码不能为空".to_string()],
            crack_time: "0 秒".to_string(),
        },
    }
}

pub fn analyze_vault(passwords: &[(String, String, String)]) -> PasswordAnalysis {
    let total_passwords = passwords.len();
    let mut weak_passwords = Vec::new();
    let mut password_map: HashMap<&str, Vec<PasswordRef>> = HashMap::new();
    let mut total_score = 0u32;

    for (id, title, password) in passwords {
        let strength = check_password_strength(password);
        total_score += strength.score as u32;

        if strength.score < 50 {
            weak_passwords.push(WeakPassword {
                id: id.clone(),
                title: title.clone(),
                score: strength.score,
                label: strength.label,
                suggestions: strength.suggestions,
            });
        }

        password_map
            .entry(password.as_str())
            .or_insert_with(Vec::new)
            .push(PasswordRef {
                id: id.clone(),
                title: title.clone(),
            });
    }

    let duplicate_passwords: Vec<DuplicatePassword> = password_map
        .iter()
        .filter(|(_, entries)| entries.len() > 1)
        .map(|(password, entries)| DuplicatePassword {
            password: password.to_string(),
            count: entries.len(),
            entries: entries.clone(),
        })
        .collect();

    let reused_passwords = duplicate_passwords
        .iter()
        .map(|d| ReusedPassword {
            password: d.password.clone(),
            count: d.count,
            entries: d.entries.clone(),
        })
        .collect();

    let average_strength = if total_passwords > 0 {
        total_score as f32 / total_passwords as f32
    } else {
        0.0
    };

    let security_score = calculate_security_score(
        total_passwords,
        weak_passwords.len(),
        duplicate_passwords.len(),
        average_strength,
    );

    let recommendations = generate_recommendations(
        &weak_passwords,
        &duplicate_passwords,
        average_strength,
    );

    PasswordAnalysis {
        total_passwords,
        weak_passwords,
        duplicate_passwords,
        reused_passwords,
        old_passwords: Vec::new(),
        average_strength,
        security_score,
        recommendations,
    }
}

fn calculate_security_score(
    total: usize,
    weak: usize,
    duplicates: usize,
    avg_strength: f32,
) -> u8 {
    if total == 0 {
        return 100;
    }

    let weak_penalty = (weak as f32 / total as f32) * 40.0;
    let duplicate_penalty = (duplicates as f32 / total as f32) * 30.0;
    let strength_bonus = (avg_strength / 100.0) * 30.0;

    let score = 100.0 - weak_penalty - duplicate_penalty + strength_bonus;
    score.clamp(0.0, 100.0) as u8
}

fn generate_recommendations(
    weak: &[WeakPassword],
    duplicates: &[DuplicatePassword],
    avg_strength: f32,
) -> Vec<String> {
    let mut recs = Vec::new();

    if !weak.is_empty() {
        recs.push(format!(
            "发现 {} 个弱密码，建议尽快更换为强密码",
            weak.len()
        ));
    }

    if !duplicates.is_empty() {
        recs.push(format!(
            "发现 {} 组重复密码，建议为每个账户使用唯一密码",
            duplicates.len()
        ));
    }

    if avg_strength < 60.0 {
        recs.push("平均密码强度较低，建议使用更长、更复杂的密码".to_string());
    }

    if recs.is_empty() {
        recs.push("您的密码库安全性良好！继续保持".to_string());
    }

    recs
}
