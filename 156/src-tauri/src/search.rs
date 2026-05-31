use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

#[derive(Clone)]
pub struct SearchEngine {
    conn: Arc<std::sync::Mutex<Connection>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchResult {
    pub id: i64,
    pub timestamp: i64,
    pub event_type: String,
    pub content: String,
    pub score: f64,
    pub bm25_rank: Option<usize>,
    pub vector_rank: Option<usize>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EventLog {
    pub id: i64,
    pub timestamp: i64,
    pub event_type: String,
    pub content: String,
    pub metadata: String,
}

struct Document {
    id: i64,
    timestamp: i64,
    event_type: String,
    content: String,
    metadata: String,
    tokens: Vec<String>,
    token_counts: HashMap<String, usize>,
    length: usize,
}

struct BM25Stats {
    avgdl: f64,
    doc_count: f64,
    df: HashMap<String, f64>,
}

const BM25_K1: f64 = 1.5;
const BM25_B: f64 = 0.75;
const RRF_K: f64 = 60.0;

impl SearchEngine {
    pub fn new(conn: Arc<std::sync::Mutex<Connection>>) -> Result<Self, Box<dyn std::error::Error>> {
        let db = conn.lock().map_err(|e| e.to_string())?;

        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS event_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_event_logs_timestamp ON event_logs(timestamp);
            CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(event_type);"
        )?;

        Ok(Self { conn: conn.clone() })
    }

    pub fn add_event(
        &self,
        event_type: &str,
        content: &str,
        metadata: &str,
    ) -> Result<i64, Box<dyn std::error::Error>> {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)?
            .as_secs() as i64;

        let db = self.conn.lock().map_err(|e| e.to_string())?;

        db.execute(
            "INSERT INTO event_logs (timestamp, event_type, content, metadata) 
             VALUES (?1, ?2, ?3, ?4)",
            params![timestamp, event_type, content, metadata],
        )?;

        Ok(db.last_insert_rowid())
    }

    pub fn hybrid_search(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>, Box<dyn std::error::Error>> {
        let documents = self.load_documents()?;

        if documents.is_empty() {
            return Ok(Vec::new());
        }

        let query_tokens = tokenize(query);
        if query_tokens.is_empty() {
            return Ok(Vec::new());
        }

        let bm25_stats = self.compute_bm25_stats(&documents);
        let bm25_results = self.bm25_search(&query_tokens, &documents, &bm25_stats);
        let vector_results = self.vector_search(&query_tokens, &documents);

        let results = self.rrf_merge(&bm25_results, &vector_results, &documents, limit);

        Ok(results)
    }

    fn load_documents(&self) -> Result<Vec<Document>, Box<dyn std::error::Error>> {
        let db = self.conn.lock().map_err(|e| e.to_string())?;

        let cutoff = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)?
            .as_secs() as i64
            - 24 * 60 * 60;

        let mut stmt = db.prepare(
            "SELECT id, timestamp, event_type, content, metadata 
             FROM event_logs 
             WHERE timestamp >= ?1
             ORDER BY timestamp DESC
             LIMIT 10000"
        )?;

        let docs = stmt.query_map(params![cutoff], |row| {
            let content: String = row.get(3)?;
            let tokens = tokenize(&content);
            let token_counts = count_tokens(&tokens);

            Ok(Document {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                event_type: row.get(2)?,
                content,
                metadata: row.get(4)?,
                length: tokens.len(),
                tokens,
                token_counts,
            })
        })?;

        let mut documents = Vec::new();
        for doc in docs {
            if let Ok(d) = doc {
                documents.push(d);
            }
        }

        Ok(documents)
    }

    fn compute_bm25_stats(&self, documents: &[Document]) -> BM25Stats {
        let doc_count = documents.len() as f64;
        let total_length: usize = documents.iter().map(|d| d.length).sum();
        let avgdl = total_length as f64 / doc_count.max(1) as f64;

        let mut df = HashMap::new();
        let mut seen_terms = HashSet::new();

        for doc in documents {
            seen_terms.clear();
            for token in &doc.tokens {
                if seen_terms.insert(token.clone()) {
                    *df.entry(token.clone()).or_insert(0.0) += 1.0;
                }
            }
        }

        BM25Stats {
            avgdl,
            doc_count,
            df,
        }
    }

    fn bm25_search(
        &self,
        query_tokens: &[String],
        documents: &[Document],
        stats: &BM25Stats,
    ) -> Vec<(i64, f64)> {
        let mut scores = Vec::new();

        for doc in documents {
            let mut score = 0.0;

            for term in query_tokens {
                if let Some(&tf) = doc.token_counts.get(term) {
                    let df = stats.df.get(term).copied().unwrap_or(0.0);
                    let idf = ((stats.doc_count - df + 0.5) / (df + 0.5) + 1.0).ln();

                    let tf_norm = (tf as f64 * (BM25_K1 + 1.0))
                        / (tf as f64 + BM25_K1 * (1.0 - BM25_B + BM25_B * doc.length as f64 / stats.avgdl.max(1.0)));

                    score += idf * tf_norm;
                }
            }

            if score > 0.0 {
                scores.push((doc.id, score));
            }
        }

        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scores
    }

    fn vector_search(
        &self,
        query_tokens: &[String],
        documents: &[Document],
    ) -> Vec<(i64, f64)> {
        let mut vocabulary = HashMap::new();
        let mut idx = 0usize;

        for token in query_tokens {
            vocabulary.entry(token.clone()).or_insert_with(|| {
                let i = idx;
                idx += 1;
                i
            });
        }

        for doc in documents {
            for token in &doc.tokens {
                vocabulary.entry(token.clone()).or_insert_with(|| {
                    let i = idx;
                    idx += 1;
                    i
                });
            }
        }

        let vocab_size = vocabulary.len();
        if vocab_size == 0 {
            return Vec::new();
        }

        let mut query_vector = vec![0.0f64; vocab_size];
        for token in query_tokens {
            if let Some(&i) = vocabulary.get(token) {
                query_vector[i] += 1.0;
            }
        }

        let query_norm = vector_norm(&query_vector);
        if query_norm == 0.0 {
            return Vec::new();
        }

        let mut scores = Vec::new();

        for doc in documents {
            let mut doc_vector = vec![0.0f64; vocab_size];
            for (token, &count) in &doc.token_counts {
                if let Some(&i) = vocabulary.get(token) {
                    doc_vector[i] = count as f64;
                }
            }

            let similarity = cosine_similarity(&query_vector, &doc_vector, query_norm);
            if similarity > 0.0 {
                scores.push((doc.id, similarity));
            }
        }

        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scores
    }

    fn rrf_merge(
        &self,
        bm25_results: &[(i64, f64)],
        vector_results: &[(i64, f64)],
        documents: &[Document],
        limit: usize,
    ) -> Vec<SearchResult> {
        let mut rrf_scores: HashMap<i64, (f64, Option<usize>, Option<usize>)> = HashMap::new();

        for (rank, (doc_id, _)) in bm25_results.iter().enumerate() {
            let rrf = 1.0 / (RRF_K + rank as f64 + 1.0);
            rrf_scores
                .entry(*doc_id)
                .or_insert((0.0, None, None))
                .0 += rrf;
            rrf_scores.get_mut(doc_id).unwrap().1 = Some(rank);
        }

        for (rank, (doc_id, _)) in vector_results.iter().enumerate() {
            let rrf = 1.0 / (RRF_K + rank as f64 + 1.0);
            rrf_scores
                .entry(*doc_id)
                .or_insert((0.0, None, None))
                .0 += rrf;
            rrf_scores.get_mut(doc_id).unwrap().2 = Some(rank);
        }

        let doc_map: HashMap<i64, &Document> = documents
            .iter()
            .map(|d| (d.id, d))
            .collect();

        let mut merged: Vec<(i64, f64, Option<usize>, Option<usize>)> = rrf_scores
            .into_iter()
            .map(|(id, (score, bm25_rank, vector_rank))| (id, score, bm25_rank, vector_rank))
            .collect();

        merged.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        merged
            .into_iter()
            .take(limit)
            .filter_map(|(id, score, bm25_rank, vector_rank)| {
                doc_map.get(&id).map(|doc| SearchResult {
                    id,
                    timestamp: doc.timestamp,
                    event_type: doc.event_type.clone(),
                    content: doc.content.clone(),
                    score,
                    bm25_rank,
                    vector_rank,
                })
            })
            .collect()
    }

    pub fn get_recent_events(
        &self,
        limit: usize,
    ) -> Result<Vec<EventLog>, Box<dyn std::error::Error>> {
        let db = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = db.prepare(
            "SELECT id, timestamp, event_type, content, metadata 
             FROM event_logs 
             ORDER BY timestamp DESC 
             LIMIT ?1"
        )?;

        let events = stmt.query_map(params![limit as i64], |row| {
            Ok(EventLog {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                event_type: row.get(2)?,
                content: row.get(3)?,
                metadata: row.get(4)?,
            })
        })?;

        let mut result = Vec::new();
        for event in events {
            if let Ok(e) = event {
                result.push(e);
            }
        }

        Ok(result)
    }
}

fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|s| !s.is_empty() && s.len() > 1)
        .map(|s| s.to_string())
        .collect()
}

fn count_tokens(tokens: &[String]) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for token in tokens {
        *counts.entry(token.clone()).or_insert(0) += 1;
    }
    counts
}

fn vector_norm(v: &[f64]) -> f64 {
    v.iter().map(|x| x * x).sum::<f64>().sqrt()
}

fn cosine_similarity(a: &[f64], b: &[f64], a_norm: f64) -> f64 {
    let dot_product: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let b_norm = vector_norm(b);
    if b_norm == 0.0 {
        return 0.0;
    }
    dot_product / (a_norm * b_norm)
}

pub fn format_timestamp(ts: i64) -> String {
    let datetime = chrono::DateTime::from_timestamp(ts, 0)
        .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
}
