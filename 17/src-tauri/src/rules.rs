use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

static RULES: Mutex<Vec<Rule>> = Mutex::new(Vec::new());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    pub enabled: bool,
    #[serde(rename = "case_insensitive")]
    pub case_insensitive: bool,
    #[serde(rename = "script_id")]
    pub script_id: String,
}

impl Rule {
    pub fn regex(&self) -> Option<Regex> {
        let pattern = if self.case_insensitive {
            format!("(?i){}", self.pattern)
        } else {
            self.pattern.clone()
        };
        Regex::new(&pattern).ok()
    }

    pub fn is_match(&self, text: &str) -> bool {
        if !self.enabled || self.pattern.is_empty() {
            return false;
        }
        match self.regex() {
            Some(re) => re.is_match(text),
            None => false,
        }
    }

    pub fn matched_text(&self, text: &str) -> String {
        match self.regex() {
            Some(re) => re.find(text).map(|m| m.as_str().to_string()).unwrap_or_default(),
            None => String::new(),
        }
    }

    pub fn capture_groups(&self, text: &str) -> Vec<String> {
        match self.regex() {
            Some(re) => {
                if let Some(caps) = re.captures(text) {
                    caps.iter()
                        .map(|c| c.map(|m| m.as_str().to_string()).unwrap_or_default())
                        .collect()
                } else {
                    Vec::new()
                }
            }
            None => Vec::new(),
        }
    }
}

pub fn sync_rules(new_rules: Vec<Rule>) {
    if let Ok(mut rules) = RULES.lock() {
        *rules = new_rules;
    }
}

pub fn find_matching_rule(text: &str) -> Option<Rule> {
    let rules = RULES.lock().ok()?;
    for rule in rules.iter() {
        if rule.is_match(text) {
            return Some(rule.clone());
        }
    }
    None
}

pub fn get_all_rules() -> Vec<Rule> {
    RULES.lock().map(|r| r.clone()).unwrap_or_default()
}

pub fn match_all_rules(text: &str) -> Vec<Rule> {
    let rules = RULES.lock().ok().unwrap_or_default();
    rules.iter().filter(|r| r.is_match(text)).cloned().collect()
}
