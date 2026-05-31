use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const BLOCK_SIZE: usize = 4096;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleNode {
    pub hash: String,
    pub left: Option<Box<MerkleNode>>,
    pub right: Option<Box<MerkleNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleTree {
    pub root: Option<MerkleNode>,
    pub leaf_hashes: Vec<String>,
    pub block_count: usize,
}

impl MerkleTree {
    pub fn new() -> Self {
        MerkleTree {
            root: None,
            leaf_hashes: Vec::new(),
            block_count: 0,
        }
    }

    pub fn from_blocks(blocks: &[Vec<u8>]) -> Self {
        if blocks.is_empty() {
            return MerkleTree::new();
        }

        let leaf_hashes: Vec<String> = blocks
            .iter()
            .map(|block| hash_block(block))
            .collect();

        let root = build_tree(&leaf_hashes);

        MerkleTree {
            root,
            leaf_hashes,
            block_count: blocks.len(),
        }
    }

    pub fn root_hash(&self) -> Option<&String> {
        self.root.as_ref().map(|node| &node.hash)
    }

    pub fn get_leaf_hash(&self, index: usize) -> Option<&String> {
        self.leaf_hashes.get(index)
    }

    pub fn compare_with(&self, other: &MerkleTree) -> DiffResult {
        let max_blocks = self.block_count.max(other.block_count);
        let mut added = Vec::new();
        let mut modified = Vec::new();
        let mut deleted = Vec::new();

        for i in 0..max_blocks {
            let hash1 = self.get_leaf_hash(i);
            let hash2 = other.get_leaf_hash(i);

            match (hash1, hash2) {
                (None, Some(_)) => added.push(i),
                (Some(_), None) => deleted.push(i),
                (Some(h1), Some(h2)) if h1 != h2 => modified.push(i),
                _ => {}
            }
        }

        DiffResult {
            added,
            modified,
            deleted,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub added: Vec<usize>,
    pub modified: Vec<usize>,
    pub deleted: Vec<usize>,
}

impl DiffResult {
    pub fn total_changes(&self) -> usize {
        self.added.len() + self.modified.len() + self.deleted.len()
    }

    pub fn is_empty(&self) -> bool {
        self.total_changes() == 0
    }
}

pub fn hash_block(block: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(block);
    let result = hasher.finalize();
    hex::encode(result)
}

pub fn combine_hashes(left: &str, right: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(left.as_bytes());
    hasher.update(right.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)
}

fn build_tree(hashes: &[String]) -> Option<MerkleNode> {
    if hashes.is_empty() {
        return None;
    }

    let mut nodes: Vec<MerkleNode> = hashes
        .iter()
        .map(|h| MerkleNode {
            hash: h.clone(),
            left: None,
            right: None,
        })
        .collect();

    while nodes.len() > 1 {
        let mut next_level = Vec::new();
        let mut i = 0;

        while i < nodes.len() {
            let left = nodes[i].clone();
            let right = if i + 1 < nodes.len() {
                nodes[i + 1].clone()
            } else {
                left.clone()
            };

            let parent_hash = combine_hashes(&left.hash, &right.hash);
            let parent = MerkleNode {
                hash: parent_hash,
                left: Some(Box::new(left)),
                right: Some(Box::new(right)),
            };

            next_level.push(parent);
            i += 2;
        }

        nodes = next_level;
    }

    nodes.into_iter().next()
}

pub fn split_into_blocks(data: &[u8]) -> Vec<Vec<u8>> {
    if data.is_empty() {
        return Vec::new();
    }

    let mut blocks = Vec::new();
    let mut offset = 0;

    while offset < data.len() {
        let end = (offset + BLOCK_SIZE).min(data.len());
        let block = if end - offset < BLOCK_SIZE {
            let mut padded = vec![0u8; BLOCK_SIZE];
            padded[..end - offset].copy_from_slice(&data[offset..end]);
            padded
        } else {
            data[offset..end].to_vec()
        };
        blocks.push(block);
        offset = end;
    }

    blocks
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockIndex {
    pub hash_to_blocks: HashMap<String, Vec<usize>>,
    pub block_to_hash: HashMap<usize, String>,
}

impl BlockIndex {
    pub fn new() -> Self {
        BlockIndex {
            hash_to_blocks: HashMap::new(),
            block_to_hash: HashMap::new(),
        }
    }

    pub fn from_merkle_tree(tree: &MerkleTree) -> Self {
        let mut index = BlockIndex::new();

        for (i, hash) in tree.leaf_hashes.iter().enumerate() {
            index.block_to_hash.insert(i, hash.clone());
            index
                .hash_to_blocks
                .entry(hash.clone())
                .or_insert_with(Vec::new)
                .push(i);
        }

        index
    }

    pub fn get_blocks_with_hash(&self, hash: &str) -> Option<&Vec<usize>> {
        self.hash_to_blocks.get(hash)
    }

    pub fn get_hash_for_block(&self, block_index: usize) -> Option<&String> {
        self.block_to_hash.get(&block_index)
    }
}
