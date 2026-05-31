use crate::merkle::{MerkleTree, BlockIndex};
use crate::storage::Volume;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::fs;
use anyhow::{Result, Context};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub volume_name: String,
    pub created_at: DateTime<Utc>,
    pub description: Option<String>,
    pub merkle_tree: MerkleTree,
    pub block_index: BlockIndex,
    pub block_count: usize,
    pub total_size_bytes: u64,
}

impl Snapshot {
    pub fn new(
        id: &str,
        volume: &Volume,
        description: Option<String>,
    ) -> Result<Self> {
        let merkle_tree = volume.build_merkle_tree()?;
        let block_index = BlockIndex::from_merkle_tree(&merkle_tree);
        let block_count = merkle_tree.block_count;
        let total_size_bytes = (block_count * crate::merkle::BLOCK_SIZE) as u64;

        Ok(Snapshot {
            id: id.to_string(),
            volume_name: volume.name.clone(),
            created_at: Utc::now(),
            description,
            merkle_tree,
            block_index,
            block_count,
            total_size_bytes,
        })
    }

    pub fn save(&self, base_path: &Path) -> Result<()> {
        let snapshot_dir = base_path
            .join("snapshots")
            .join(&self.volume_name);
        
        fs::create_dir_all(&snapshot_dir)
            .with_context(|| format!("Failed to create snapshot directory: {:?}", snapshot_dir))?;

        let snapshot_path = snapshot_dir.join(format!("{}.json", self.id));
        let json = serde_json::to_string_pretty(self)
            .context("Failed to serialize snapshot")?;
        
        fs::write(&snapshot_path, json)
            .with_context(|| format!("Failed to write snapshot file: {:?}", snapshot_path))?;

        Ok(())
    }

    pub fn load(base_path: &Path, volume_name: &str, snapshot_id: &str) -> Result<Self> {
        let snapshot_path = base_path
            .join("snapshots")
            .join(volume_name)
            .join(format!("{}.json", snapshot_id));

        if !snapshot_path.exists() {
            anyhow::bail!("Snapshot not found: {}", snapshot_id);
        }

        let json = fs::read_to_string(&snapshot_path)
            .with_context(|| format!("Failed to read snapshot file: {:?}", snapshot_path))?;

        let snapshot: Snapshot = serde_json::from_str(&json)
            .context("Failed to deserialize snapshot")?;

        Ok(snapshot)
    }

    pub fn list(base_path: &Path, volume_name: &str) -> Result<Vec<String>> {
        let snapshot_dir = base_path
            .join("snapshots")
            .join(volume_name);

        if !snapshot_dir.exists() {
            return Ok(Vec::new());
        }

        let mut snapshot_ids = Vec::new();

        for entry in fs::read_dir(&snapshot_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.ends_with(".json") {
                    let id = file_name.trim_end_matches(".json").to_string();
                    snapshot_ids.push(id);
                }
            }
        }

        snapshot_ids.sort();
        Ok(snapshot_ids)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotHistory {
    pub volume_name: String,
    pub snapshots: Vec<SnapshotRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotRecord {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub block_count: usize,
    pub root_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotManager {
    pub base_path: PathBuf,
    pub histories: HashMap<String, SnapshotHistory>,
}

impl SnapshotManager {
    pub fn new(base_path: &Path) -> Self {
        SnapshotManager {
            base_path: base_path.to_path_buf(),
            histories: HashMap::new(),
        }
    }

    pub fn create_snapshot(
        &mut self,
        volume: &Volume,
        snapshot_id: &str,
        description: Option<String>,
    ) -> Result<Snapshot> {
        let snapshot = Snapshot::new(snapshot_id, volume, description)?;
        snapshot.save(&self.base_path)?;

        let history = self.histories
            .entry(volume.name.clone())
            .or_insert_with(|| SnapshotHistory {
                volume_name: volume.name.clone(),
                snapshots: Vec::new(),
            });

        let record = SnapshotRecord {
            id: snapshot.id.clone(),
            created_at: snapshot.created_at,
            block_count: snapshot.block_count,
            root_hash: snapshot.merkle_tree.root_hash().cloned(),
        };

        history.snapshots.push(record);
        self.save_history(volume.name.as_str())?;

        Ok(snapshot)
    }

    pub fn get_snapshot(
        &self,
        volume_name: &str,
        snapshot_id: &str,
    ) -> Result<Snapshot> {
        Snapshot::load(&self.base_path, volume_name, snapshot_id)
    }

    pub fn list_snapshots(&self, volume_name: &str) -> Result<Vec<String>> {
        Snapshot::list(&self.base_path, volume_name)
    }

    fn history_path(&self, volume_name: &str) -> PathBuf {
        self.base_path
            .join("snapshots")
            .join(volume_name)
            .join("history.json")
    }

    pub fn load_history(&mut self, volume_name: &str) -> Result<()> {
        let history_path = self.history_path(volume_name);
        
        if history_path.exists() {
            let json = fs::read_to_string(&history_path)?;
            let history: SnapshotHistory = serde_json::from_str(&json)?;
            self.histories.insert(volume_name.to_string(), history);
        }

        Ok(())
    }

    pub fn save_history(&self, volume_name: &str) -> Result<()> {
        if let Some(history) = self.histories.get(volume_name) {
            let history_path = self.history_path(volume_name);
            fs::create_dir_all(history_path.parent().unwrap())?;
            let json = serde_json::to_string_pretty(history)?;
            fs::write(&history_path, json)?;
        }

        Ok(())
    }

    pub fn get_history(&self, volume_name: &str) -> Option<&SnapshotHistory> {
        self.histories.get(volume_name)
    }
}
