use crate::diff::{SnapDiffResult, BlockChange, ChangeType};
use crate::merkle::BLOCK_SIZE;
use crate::snapshot::Snapshot;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

pub const DEFAULT_FRAGMENTATION_THRESHOLD: f64 = 0.3;
pub const DEFAULT_CONSECUTIVE_BLOCKS_THRESHOLD: usize = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FragmentationAnalysis {
    pub volume_name: String,
    pub total_blocks: usize,
    pub fragmented_blocks: Vec<FragmentedBlock>,
    pub fragmentation_score: f64,
    defrag_plan: Option<DefragPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FragmentedBlock {
    pub block_index: usize,
    pub fragmentation_score: f64,
    pub change_history: Vec<BlockChangeRecord>,
    pub pattern_type: FragmentationPattern,
    pub severity: FragmentationSeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum FragmentationPattern {
    RandomWrites,
    SequentialBreaks,
    FrequentUpdates,
    HolePunching,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum FragmentationSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockChangeRecord {
    pub snapshot_id: String,
    pub change_type: ChangeType,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefragPlan {
    pub volume_name: String,
    pub created_at: String,
    pub estimated_gain_bytes: u64,
    pub blocks_to_move: Vec<BlockMove>,
    pub free_blocks: Vec<usize>,
    pub contiguous_ranges: Vec<ContiguousRange>,
    pub is_dry_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockMove {
    pub from_block: usize,
    pub to_block: usize,
    pub reason: MoveReason,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum MoveReason {
    FillHole,
    ConsolidateFragment,
    GroupRelated,
    DefragmentRegion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContiguousRange {
    pub start_block: usize,
    pub end_block: usize,
    pub length: usize,
    pub is_free: bool,
}

pub struct DefragAnalyzer {
    pub fragmentation_threshold: f64,
    pub consecutive_blocks_threshold: usize,
}

impl DefragAnalyzer {
    pub fn new() -> Self {
        DefragAnalyzer {
            fragmentation_threshold: DEFAULT_FRAGMENTATION_THRESHOLD,
            consecutive_blocks_threshold: DEFAULT_CONSECUTIVE_BLOCKS_THRESHOLD,
        }
    }

    pub fn analyze_fragmentation(
        &self,
        snapshot: &Snapshot,
        diff_history: &[SnapDiffResult],
    ) -> FragmentationAnalysis {
        let total_blocks = snapshot.block_count;
        
        let change_history_map = self.build_change_history(diff_history);
        let fragmented_blocks = self.identify_fragmented_blocks(
            total_blocks,
            &change_history_map,
            snapshot,
        );
        
        let fragmentation_score = if total_blocks > 0 {
            fragmented_blocks.len() as f64 / total_blocks as f64
        } else {
            0.0
        };

        FragmentationAnalysis {
            volume_name: snapshot.volume_name.clone(),
            total_blocks,
            fragmented_blocks,
            fragmentation_score,
            defrag_plan: None,
        }
    }

    fn build_change_history(
        &self,
        diff_history: &[SnapDiffResult],
    ) -> HashMap<usize, Vec<BlockChangeRecord>> {
        let mut history: HashMap<usize, Vec<BlockChangeRecord>> = HashMap::new();

        for diff in diff_history {
            for change in &diff.changed_blocks {
                let record = BlockChangeRecord {
                    snapshot_id: diff.snapshot2_id.clone(),
                    change_type: change.change_type.clone(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                };

                history
                    .entry(change.block_index)
                    .or_insert_with(Vec::new)
                    .push(record);
            }
        }

        history
    }

    fn identify_fragmented_blocks(
        &self,
        total_blocks: usize,
        change_history: &HashMap<usize, Vec<BlockChangeRecord>>,
        snapshot: &Snapshot,
    ) -> Vec<FragmentedBlock> {
        let mut fragmented = Vec::new();
        let changed_blocks: HashSet<usize> = change_history.keys().cloned().collect();
        
        let hole_blocks = self.find_hole_blocks(total_blocks, &changed_blocks, snapshot);
        
        for &block_idx in &hole_blocks {
            let history = change_history.get(&block_idx).cloned().unwrap_or_default();
            let (pattern, score) = self.analyze_block_pattern(block_idx, &history, total_blocks);
            
            let severity = self.calculate_severity(score);
            
            if score >= self.fragmentation_threshold {
                fragmented.push(FragmentedBlock {
                    block_index: block_idx,
                    fragmentation_score: score,
                    change_history: history,
                    pattern_type: pattern,
                    severity,
                });
            }
        }

        for (block_idx, history) in change_history {
            if hole_blocks.contains(block_idx) {
                continue;
            }

            let (pattern, score) = self.analyze_block_pattern(*block_idx, history, total_blocks);
            let severity = self.calculate_severity(score);

            if score >= self.fragmentation_threshold {
                fragmented.push(FragmentedBlock {
                    block_index: *block_idx,
                    fragmentation_score: score,
                    change_history: history.clone(),
                    pattern_type: pattern,
                    severity,
                });
            }
        }

        fragmented.sort_by(|a, b| {
            b.severity.cmp(&a.severity)
                .then_with(|| b.fragmentation_score.partial_cmp(&a.fragmentation_score).unwrap())
        });

        fragmented
    }

    fn find_hole_blocks(
        &self,
        total_blocks: usize,
        changed_blocks: &HashSet<usize>,
        _snapshot: &Snapshot,
    ) -> HashSet<usize> {
        let mut holes = HashSet::new();
        
        for i in 1..total_blocks.saturating_sub(1) {
            let prev_exists = changed_blocks.contains(&(i - 1));
            let curr_exists = changed_blocks.contains(&i);
            let next_exists = changed_blocks.contains(&(i + 1));
            
            if prev_exists && next_exists && !curr_exists {
                holes.insert(i);
            }
        }

        holes
    }

    fn analyze_block_pattern(
        &self,
        block_index: usize,
        history: &[BlockChangeRecord],
        total_blocks: usize,
    ) -> (FragmentationPattern, f64) {
        if history.is_empty() {
            return (FragmentationPattern::HolePunching, 0.5);
        }

        let change_count = history.len();
        let mut score = 0.0;

        let modifications: Vec<_> = history
            .iter()
            .filter(|r| r.change_type == ChangeType::Modified)
            .collect();

        if modifications.len() >= 3 {
            score += 0.4;
        }

        let neighbors_changed = self.count_neighbor_changes(block_index, history, total_blocks);
        if neighbors_changed == 0 && change_count > 0 {
            score += 0.3;
        }

        let has_deletes = history.iter().any(|r| r.change_type == ChangeType::Deleted);
        if has_deletes {
            score += 0.2;
        }

        score = score.min(1.0);

        let pattern = if modifications.len() >= 5 {
            FragmentationPattern::FrequentUpdates
        } else if neighbors_changed == 0 && change_count > 0 {
            FragmentationPattern::RandomWrites
        } else if has_deletes && neighbors_changed > 0 {
            FragmentationPattern::SequentialBreaks
        } else if change_count == 0 {
            FragmentationPattern::HolePunching
        } else {
            FragmentationPattern::Unknown
        };

        (pattern, score)
    }

    fn count_neighbor_changes(
        &self,
        block_index: usize,
        history: &[BlockChangeRecord],
        _total_blocks: usize,
    ) -> usize {
        let modified_blocks: HashSet<usize> = history
            .iter()
            .map(|_| block_index)
            .collect();
        
        let mut count = 0;
        if modified_blocks.contains(&(block_index.saturating_sub(1))) {
            count += 1;
        }
        if modified_blocks.contains(&(block_index + 1)) {
            count += 1;
        }
        count
    }

    fn calculate_severity(&self, score: f64) -> FragmentationSeverity {
        if score >= 0.8 {
            FragmentationSeverity::Critical
        } else if score >= 0.5 {
            FragmentationSeverity::High
        } else if score >= 0.3 {
            FragmentationSeverity::Medium
        } else {
            FragmentationSeverity::Low
        }
    }
}

impl Default for DefragAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl FragmentationAnalysis {
    pub fn generate_defrag_plan(&mut self, dry_run: bool) -> &DefragPlan {
        if self.defrag_plan.is_none() {
            let plan = self.create_defrag_plan(dry_run);
            self.defrag_plan = Some(plan);
        }
        self.defrag_plan.as_ref().unwrap()
    }

    fn create_defrag_plan(&self, dry_run: bool) -> DefragPlan {
        let total_blocks = self.total_blocks;
        let mut blocks_to_move = Vec::new();
        let mut free_blocks = Vec::new();
        let mut contiguous_ranges = Vec::new();

        let mut fragmented_set: HashSet<usize> = self
            .fragmented_blocks
            .iter()
            .map(|b| b.block_index)
            .collect();

        let mut current_start = None;
        let mut current_is_free = false;

        for i in 0..total_blocks {
            let is_free = !fragmented_set.contains(&i) 
                && self.is_block_available(i);
            
            match (current_start, current_is_free == is_free) {
                (None, _) => {
                    current_start = Some(i);
                    current_is_free = is_free;
                }
                (Some(start), false) => {
                    if i > 0 {
                        contiguous_ranges.push(ContiguousRange {
                            start_block: start,
                            end_block: i - 1,
                            length: i - start,
                            is_free: current_is_free,
                        });
                    }
                    current_start = Some(i);
                    current_is_free = is_free;
                }
                _ => {}
            }

            if is_free {
                free_blocks.push(i);
            }
        }

        if let Some(start) = current_start {
            contiguous_ranges.push(ContiguousRange {
                start_block: start,
                end_block: total_blocks.saturating_sub(1),
                length: total_blocks - start,
                is_free: current_is_free,
            });
        }

        let mut free_iter = free_blocks.iter();
        for block in &self.fragmented_blocks {
            if let Some(&free_block) = free_iter.next() {
                let reason = match block.pattern_type {
                    FragmentationPattern::HolePunching => MoveReason::FillHole,
                    FragmentationPattern::RandomWrites => MoveReason::ConsolidateFragment,
                    FragmentationPattern::FrequentUpdates => MoveReason::GroupRelated,
                    _ => MoveReason::DefragmentRegion,
                };

                blocks_to_move.push(BlockMove {
                    from_block: block.block_index,
                    to_block: free_block,
                    reason,
                });
            }
        }

        let estimated_gain_bytes = (blocks_to_move.len() * BLOCK_SIZE) as u64;

        DefragPlan {
            volume_name: self.volume_name.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            estimated_gain_bytes,
            blocks_to_move,
            free_blocks,
            contiguous_ranges,
            is_dry_run: dry_run,
        }
    }

    fn is_block_available(&self, _block_index: usize) -> bool {
        true
    }
}

pub fn format_fragmentation_output(analysis: &FragmentationAnalysis) -> String {
    let mut output = String::new();

    output.push_str(&format!("Fragmentation Analysis Report\n"));
    output.push_str(&format!("=============================\n\n"));
    output.push_str(&format!("Volume: {}\n", analysis.volume_name));
    output.push_str(&format!("Total blocks: {}\n", analysis.total_blocks));
    output.push_str(&format!("Fragmentation score: {:.2}%\n", analysis.fragmentation_score * 100.0));
    output.push_str(&format!("Fragmented blocks: {}\n\n", analysis.fragmented_blocks.len()));

    if !analysis.fragmented_blocks.is_empty() {
        output.push_str(&format!("Fragmented Blocks (by severity):\n"));
        output.push_str(&format!("---------------------------------\n"));

        let mut by_severity: HashMap<&FragmentationSeverity, Vec<&FragmentedBlock>> = HashMap::new();
        for block in &analysis.fragmented_blocks {
            by_severity.entry(&block.severity).or_default().push(block);
        }

        for severity in &[
            FragmentationSeverity::Critical,
            FragmentationSeverity::High,
            FragmentationSeverity::Medium,
            FragmentationSeverity::Low,
        ] {
            if let Some(blocks) = by_severity.get(severity) {
                let severity_str = match severity {
                    FragmentationSeverity::Critical => "CRITICAL",
                    FragmentationSeverity::High => "HIGH    ",
                    FragmentationSeverity::Medium => "MEDIUM  ",
                    FragmentationSeverity::Low => "LOW     ",
                };
                
                output.push_str(&format!("\n[{}] - {} blocks:\n", severity_str, blocks.len()));
                
                for block in blocks {
                    let pattern_str = match block.pattern_type {
                        FragmentationPattern::RandomWrites => "Random Writes",
                        FragmentationPattern::SequentialBreaks => "Sequential Breaks",
                        FragmentationPattern::FrequentUpdates => "Frequent Updates",
                        FragmentationPattern::HolePunching => "Hole Punching",
                        FragmentationPattern::Unknown => "Unknown",
                    };
                    
                    output.push_str(&format!(
                        "  Block #{}: score={:.2}, pattern={}, changes={}\n",
                        block.block_index,
                        block.fragmentation_score,
                        pattern_str,
                        block.change_history.len()
                    ));
                }
            }
        }
    }

    output
}

pub fn format_defrag_plan_output(plan: &DefragPlan) -> String {
    let mut output = String::new();

    output.push_str(&format!("Defragmentation Plan{}\n", if plan.is_dry_run { " (DRY RUN)" } else { "" }));
    output.push_str(&format!("====================\n\n"));
    output.push_str(&format!("Volume: {}\n", plan.volume_name));
    output.push_str(&format!("Created: {}\n", plan.created_at));
    output.push_str(&format!("\n"));

    output.push_str(&format!("Summary:\n"));
    output.push_str(&format!("--------\n"));
    output.push_str(&format!("Blocks to move: {}\n", plan.blocks_to_move.len()));
    output.push_str(&format!("Free blocks available: {}\n", plan.free_blocks.len()));
    output.push_str(&format!("Estimated gain: {} bytes ({:.2} MB)\n", 
        plan.estimated_gain_bytes,
        plan.estimated_gain_bytes as f64 / (1024.0 * 1024.0)
    ));
    output.push_str(&format!("\n"));

    if !plan.contiguous_ranges.is_empty() {
        output.push_str(&format!("Contiguous Ranges:\n"));
        output.push_str(&format!("------------------\n"));
        for range in &plan.contiguous_ranges {
            let type_str = if range.is_free { "FREE  " } else { "USED  " };
            output.push_str(&format!("[{}] Blocks {} - {} ({} blocks)\n",
                type_str, range.start_block, range.end_block, range.length));
        }
        output.push_str(&format!("\n"));
    }

    if !plan.blocks_to_move.is_empty() {
        output.push_str(&format!("Block Moves:\n"));
        output.push_str(&format!("------------\n"));
        
        for move_op in &plan.blocks_to_move {
            let reason_str = match move_op.reason {
                MoveReason::FillHole => "Fill Hole",
                MoveReason::ConsolidateFragment => "Consolidate Fragment",
                MoveReason::GroupRelated => "Group Related",
                MoveReason::DefragmentRegion => "Defragment Region",
            };
            
            output.push_str(&format!("  Block {} -> {} ({})\n",
                move_op.from_block, move_op.to_block, reason_str));
        }
    }

    output
}
