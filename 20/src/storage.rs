use crate::merkle::{MerkleTree, split_into_blocks, BlockIndex};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::fs;
use anyhow::{Result, Context};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Volume {
    pub name: String,
    pub path: PathBuf,
    pub total_blocks: usize,
    pub used_blocks: usize,
}

impl Volume {
    pub fn new(name: &str, path: PathBuf) -> Self {
        Volume {
            name: name.to_string(),
            path,
            total_blocks: 0,
            used_blocks: 0,
        }
    }

    pub fn from_path(name: &str, path: &Path) -> Result<Self> {
        let mut volume = Volume::new(name, path.to_path_buf());
        volume.scan()?;
        Ok(volume)
    }

    pub fn scan(&mut self) -> Result<()> {
        let mut total_blocks = 0;
        let mut used_blocks = 0;

        if self.path.exists() {
            for entry in WalkDir::new(&self.path)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let metadata = entry.metadata()?;
                    let file_size = metadata.len() as usize;
                    let blocks = if file_size == 0 {
                        0
                    } else {
                        (file_size + crate::merkle::BLOCK_SIZE - 1) / crate::merkle::BLOCK_SIZE
                    };
                    total_blocks += blocks;
                    used_blocks += blocks;
                }
            }
        }

        self.total_blocks = total_blocks;
        self.used_blocks = used_blocks;
        Ok(())
    }

    pub fn read_all_data(&self) -> Result<Vec<u8>> {
        let mut all_data = Vec::new();

        if self.path.exists() {
            let mut files: Vec<PathBuf> = WalkDir::new(&self.path)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .map(|e| e.path().to_path_buf())
                .collect();
            
            files.sort();

            for file_path in files {
                let data = fs::read(&file_path)
                    .with_context(|| format!("Failed to read file: {:?}", file_path))?;
                all_data.extend_from_slice(&data);
            }
        }

        Ok(all_data)
    }

    pub fn build_merkle_tree(&self) -> Result<MerkleTree> {
        let data = self.read_all_data()?;
        let blocks = split_into_blocks(&data);
        Ok(MerkleTree::from_blocks(&blocks))
    }

    pub fn build_block_index(&self) -> Result<BlockIndex> {
        let tree = self.build_merkle_tree()?;
        Ok(BlockIndex::from_merkle_tree(&tree))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageManager {
    pub volumes: HashMap<String, Volume>,
    pub base_path: PathBuf,
}

impl StorageManager {
    pub fn new(base_path: &Path) -> Self {
        StorageManager {
            volumes: HashMap::new(),
            base_path: base_path.to_path_buf(),
        }
    }

    pub fn from_base_path(base_path: &Path) -> Result<Self> {
        let mut manager = StorageManager::new(base_path);
        
        if base_path.exists() {
            for entry in fs::read_dir(base_path)? {
                let entry = entry?;
                if entry.file_type()?.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let volume = Volume::from_path(&name, &entry.path())?;
                    manager.volumes.insert(name, volume);
                }
            }
        }

        Ok(manager)
    }

    pub fn get_volume(&self, name: &str) -> Option<&Volume> {
        self.volumes.get(name)
    }

    pub fn create_volume(&mut self, name: &str) -> Result<&Volume> {
        let volume_path = self.base_path.join(name);
        fs::create_dir_all(&volume_path)?;
        let volume = Volume::from_path(name, &volume_path)?;
        self.volumes.insert(name.to_string(), volume);
        Ok(self.volumes.get(name).unwrap())
    }

    pub fn list_volumes(&self) -> Vec<&Volume> {
        self.volumes.values().collect()
    }
}
