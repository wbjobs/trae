use crate::merkle::{DiffResult, MerkleTree, BLOCK_SIZE};
use crate::snapshot::Snapshot;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapDiffResult {
    pub volume_name: String,
    pub snapshot1_id: String,
    pub snapshot2_id: String,
    pub diff: DiffResult,
    pub statistics: DiffStatistics,
    pub changed_blocks: Vec<BlockChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStatistics {
    pub total_blocks_s1: usize,
    pub total_blocks_s2: usize,
    pub added_count: usize,
    pub added_size_bytes: u64,
    pub modified_count: usize,
    pub modified_size_bytes: u64,
    pub deleted_count: usize,
    pub deleted_size_bytes: u64,
    pub total_changed_count: usize,
    pub total_changed_size_bytes: u64,
    pub change_percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockChange {
    pub block_index: usize,
    pub change_type: ChangeType,
    pub old_hash: Option<String>,
    pub new_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ChangeType {
    Added,
    Modified,
    Deleted,
}

pub fn compare_snapshots(
    snapshot1: &Snapshot,
    snapshot2: &Snapshot,
) -> SnapDiffResult {
    let diff = snapshot1.merkle_tree.compare_with(&snapshot2.merkle_tree);
    
    let total_blocks_s1 = snapshot1.block_count;
    let total_blocks_s2 = snapshot2.block_count;
    let max_blocks = total_blocks_s1.max(total_blocks_s2);
    
    let added_count = diff.added.len();
    let modified_count = diff.modified.len();
    let deleted_count = diff.deleted.len();
    let total_changed_count = diff.total_changes();
    
    let added_size_bytes = (added_count * BLOCK_SIZE) as u64;
    let modified_size_bytes = (modified_count * BLOCK_SIZE) as u64;
    let deleted_size_bytes = (deleted_count * BLOCK_SIZE) as u64;
    let total_changed_size_bytes = (total_changed_count * BLOCK_SIZE) as u64;
    
    let change_percentage = if max_blocks > 0 {
        (total_changed_count as f64 / max_blocks as f64) * 100.0
    } else {
        0.0
    };

    let statistics = DiffStatistics {
        total_blocks_s1,
        total_blocks_s2,
        added_count,
        added_size_bytes,
        modified_count,
        modified_size_bytes,
        deleted_count,
        deleted_size_bytes,
        total_changed_count,
        total_changed_size_bytes,
        change_percentage,
    };

    let changed_blocks = collect_block_changes(
        &snapshot1.merkle_tree,
        &snapshot2.merkle_tree,
        &diff,
    );

    SnapDiffResult {
        volume_name: snapshot1.volume_name.clone(),
        snapshot1_id: snapshot1.id.clone(),
        snapshot2_id: snapshot2.id.clone(),
        diff,
        statistics,
        changed_blocks,
    }
}

fn collect_block_changes(
    tree1: &MerkleTree,
    tree2: &MerkleTree,
    diff: &DiffResult,
) -> Vec<BlockChange> {
    let mut changes = Vec::new();
    let mut processed = HashSet::new();

    for &idx in &diff.added {
        changes.push(BlockChange {
            block_index: idx,
            change_type: ChangeType::Added,
            old_hash: None,
            new_hash: tree2.get_leaf_hash(idx).cloned(),
        });
        processed.insert(idx);
    }

    for &idx in &diff.modified {
        changes.push(BlockChange {
            block_index: idx,
            change_type: ChangeType::Modified,
            old_hash: tree1.get_leaf_hash(idx).cloned(),
            new_hash: tree2.get_leaf_hash(idx).cloned(),
        });
        processed.insert(idx);
    }

    for &idx in &diff.deleted {
        changes.push(BlockChange {
            block_index: idx,
            change_type: ChangeType::Deleted,
            old_hash: tree1.get_leaf_hash(idx).cloned(),
            new_hash: None,
        });
        processed.insert(idx);
    }

    changes.sort_by_key(|c| c.block_index);
    changes
}

pub fn format_diff_output(result: &SnapDiffResult, verbose: bool) -> String {
    let mut output = String::new();
    
    output.push_str(&format!("Snapshot Comparison Results\n"));
    output.push_str(&format!("==========================\n\n"));
    output.push_str(&format!("Volume: {}\n", result.volume_name));
    output.push_str(&format!("Snapshot 1: {}\n", result.snapshot1_id));
    output.push_str(&format!("Snapshot 2: {}\n\n", result.snapshot2_id));
    
    output.push_str(&format!("Block Statistics (4KB blocks)\n"));
    output.push_str(&format!("-----------------------------\n"));
    output.push_str(&format!("Blocks in snapshot 1: {}\n", result.statistics.total_blocks_s1));
    output.push_str(&format!("Blocks in snapshot 2: {}\n", result.statistics.total_blocks_s2));
    output.push_str(&format!("\n"));
    
    output.push_str(&format!("Changes Summary\n"));
    output.push_str(&format!("---------------\n"));
    output.push_str(&format!("Added blocks:    {} ({})\n", 
        result.statistics.added_count,
        format_size(result.statistics.added_size_bytes)
    ));
    output.push_str(&format!("Modified blocks: {} ({})\n", 
        result.statistics.modified_count,
        format_size(result.statistics.modified_size_bytes)
    ));
    output.push_str(&format!("Deleted blocks:  {} ({})\n", 
        result.statistics.deleted_count,
        format_size(result.statistics.deleted_size_bytes)
    ));
    output.push_str(&format!("\n"));
    output.push_str(&format!("Total changed:   {} ({})\n", 
        result.statistics.total_changed_count,
        format_size(result.statistics.total_changed_size_bytes)
    ));
    output.push_str(&format!("Change percentage: {:.2}%\n", result.statistics.change_percentage));
    
    if verbose && !result.changed_blocks.is_empty() {
        output.push_str(&format!("\n\nDetailed Block Changes\n"));
        output.push_str(&format!("----------------------\n"));
        
        for change in &result.changed_blocks {
            let change_type_str = match change.change_type {
                ChangeType::Added => "ADDED   ",
                ChangeType::Modified => "MODIFIED",
                ChangeType::Deleted => "DELETED ",
            };
            
            output.push_str(&format!("[{}] Block #{}: ", change_type_str, change.block_index));
            
            match change.change_type {
                ChangeType::Added => {
                    if let Some(hash) = &change.new_hash {
                        output.push_str(&format!("hash = {}\n", &hash[..16]));
                    }
                }
                ChangeType::Modified => {
                    if let (Some(old), Some(new)) = (&change.old_hash, &change.new_hash) {
                        output.push_str(&format!("{} -> {}\n", &old[..16], &new[..16]));
                    }
                }
                ChangeType::Deleted => {
                    if let Some(hash) = &change.old_hash {
                        output.push_str(&format!("hash = {}\n", &hash[..16]));
                    }
                }
            }
        }
    }

    output
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} bytes", bytes)
    }
}
