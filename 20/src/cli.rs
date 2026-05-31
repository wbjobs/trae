use clap::{Parser, Subcommand};
use crate::defrag::{DefragAnalyzer, format_fragmentation_output, format_defrag_plan_output};
use crate::diff::{compare_snapshots, format_diff_output, SnapDiffResult};
use crate::snapshot::{Snapshot, SnapshotManager};
use crate::storage::StorageManager;
use anyhow::{Result, Context};
use std::path::PathBuf;
use std::fs;

#[derive(Parser, Debug)]
#[command(name = "snap-manager")]
#[command(about = "CLI tool for managing multi-version snapshots of distributed storage")]
#[command(version = "0.1.0")]
pub struct Cli {
    #[arg(short, long, default_value = "./snap-data")]
    pub data_dir: PathBuf,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    SnapDiff {
        volume: String,
        snap1: String,
        snap2: String,

        #[arg(short, long)]
        verbose: bool,

        #[arg(short, long)]
        json: bool,
    },

    DefragSimulate {
        volume: String,

        #[arg(short, long)]
        json: bool,
    },

    ApplyDefrag {
        volume: String,

        #[arg(short, long, default_value_t = true)]
        dry_run: bool,

        #[arg(short, long)]
        json: bool,
    },

    CreateSnapshot {
        volume: String,
        snapshot_id: String,

        #[arg(short, long)]
        description: Option<String>,
    },

    ListSnapshots {
        volume: String,
    },

    ListVolumes,

    CreateVolume {
        name: String,
    },
}

pub fn run(cli: Cli) -> Result<()> {
    let data_dir = cli.data_dir;
    fs::create_dir_all(&data_dir)
        .with_context(|| format!("Failed to create data directory: {:?}", data_dir))?;

    match cli.command {
        Commands::SnapDiff { volume, snap1, snap2, verbose, json } => {
            cmd_snap_diff(&data_dir, &volume, &snap1, &snap2, verbose, json)
        }
        Commands::DefragSimulate { volume, json } => {
            cmd_defrag_simulate(&data_dir, &volume, json)
        }
        Commands::ApplyDefrag { volume, dry_run, json } => {
            cmd_apply_defrag(&data_dir, &volume, dry_run, json)
        }
        Commands::CreateSnapshot { volume, snapshot_id, description } => {
            cmd_create_snapshot(&data_dir, &volume, &snapshot_id, description)
        }
        Commands::ListSnapshots { volume } => {
            cmd_list_snapshots(&data_dir, &volume)
        }
        Commands::ListVolumes => {
            cmd_list_volumes(&data_dir)
        }
        Commands::CreateVolume { name } => {
            cmd_create_volume(&data_dir, &name)
        }
    }
}

fn cmd_snap_diff(
    data_dir: &PathBuf,
    volume: &str,
    snap1: &str,
    snap2: &str,
    verbose: bool,
    json: bool,
) -> Result<()> {
    let snapshot1 = Snapshot::load(data_dir, volume, snap1)
        .with_context(|| format!("Snapshot '{}' not found for volume '{}'", snap1, volume))?;
    let snapshot2 = Snapshot::load(data_dir, volume, snap2)
        .with_context(|| format!("Snapshot '{}' not found for volume '{}'", snap2, volume))?;

    let result = compare_snapshots(&snapshot1, &snapshot2);

    if json {
        let json_output = serde_json::to_string_pretty(&result)?;
        println!("{}", json_output);
    } else {
        println!("{}", format_diff_output(&result, verbose));
    }

    Ok(())
}

fn cmd_defrag_simulate(
    data_dir: &PathBuf,
    volume: &str,
    json: bool,
) -> Result<()> {
    let snapshot_ids = Snapshot::list(data_dir, volume)?;
    
    if snapshot_ids.len() < 2 {
        anyhow::bail!("Need at least 2 snapshots to analyze fragmentation. Found: {}", snapshot_ids.len());
    }

    let mut snapshots = Vec::new();
    for id in &snapshot_ids {
        let snap = Snapshot::load(data_dir, volume, id)?;
        snapshots.push(snap);
    }

    let mut diff_history: Vec<SnapDiffResult> = Vec::new();
    for i in 1..snapshots.len() {
        let diff = compare_snapshots(&snapshots[i - 1], &snapshots[i]);
        diff_history.push(diff);
    }

    let latest_snapshot = snapshots.last().unwrap();
    let analyzer = DefragAnalyzer::new();
    let mut analysis = analyzer.analyze_fragmentation(latest_snapshot, &diff_history);

    if json {
        let json_output = serde_json::to_string_pretty(&analysis)?;
        println!("{}", json_output);
    } else {
        println!("{}", format_fragmentation_output(&analysis));
        
        let plan = analysis.generate_defrag_plan(true);
        println!("\n\n{}", format_defrag_plan_output(plan));
    }

    Ok(())
}

fn cmd_apply_defrag(
    data_dir: &PathBuf,
    volume: &str,
    dry_run: bool,
    json: bool,
) -> Result<()> {
    let snapshot_ids = Snapshot::list(data_dir, volume)?;
    
    if snapshot_ids.len() < 2 {
        anyhow::bail!("Need at least 2 snapshots to generate defrag plan. Found: {}", snapshot_ids.len());
    }

    let mut snapshots = Vec::new();
    for id in &snapshot_ids {
        let snap = Snapshot::load(data_dir, volume, id)?;
        snapshots.push(snap);
    }

    let mut diff_history: Vec<SnapDiffResult> = Vec::new();
    for i in 1..snapshots.len() {
        let diff = compare_snapshots(&snapshots[i - 1], &snapshots[i]);
        diff_history.push(diff);
    }

    let latest_snapshot = snapshots.last().unwrap();
    let analyzer = DefragAnalyzer::new();
    let mut analysis = analyzer.analyze_fragmentation(latest_snapshot, &diff_history);

    let plan = analysis.generate_defrag_plan(dry_run);

    if json {
        let json_output = serde_json::to_string_pretty(plan)?;
        println!("{}", json_output);
    } else {
        println!("{}", format_defrag_plan_output(plan));
        
        if dry_run {
            println!("\n[DRY RUN] This is a simulation. No data has been moved.");
            println!("\nRemapping Table (would be applied in actual run):");
            println!("================================================");
            for move_op in &plan.blocks_to_move {
                println!("  Block {} -> Block {}", move_op.from_block, move_op.to_block);
            }
            
            let mapping_file = data_dir
                .join("snapshots")
                .join(volume)
                .join(format!("defrag-map-{}.json", chrono::Utc::now().format("%Y%m%d-%H%M%S")));
            
            fs::create_dir_all(mapping_file.parent().unwrap())?;
            let json = serde_json::to_string_pretty(plan)?;
            fs::write(&mapping_file, json)?;
            
            println!("\nRemapping table saved to: {:?}", mapping_file);
        }
    }

    Ok(())
}

fn cmd_create_snapshot(
    data_dir: &PathBuf,
    volume: &str,
    snapshot_id: &str,
    description: Option<String>,
) -> Result<()> {
    let storage_manager = StorageManager::from_base_path(data_dir)?;
    let volume_data = storage_manager.get_volume(volume)
        .with_context(|| format!("Volume '{}' not found", volume))?;

    let mut snapshot_manager = SnapshotManager::new(data_dir);
    let snapshot = snapshot_manager.create_snapshot(volume_data, snapshot_id, description)?;

    println!("Snapshot created successfully!");
    println!("  Volume: {}", snapshot.volume_name);
    println!("  Snapshot ID: {}", snapshot.id);
    println!("  Created at: {}", snapshot.created_at);
    println!("  Blocks: {}", snapshot.block_count);
    println!("  Size: {} bytes ({:.2} MB)", 
        snapshot.total_size_bytes,
        snapshot.total_size_bytes as f64 / (1024.0 * 1024.0)
    );
    if let Some(hash) = snapshot.merkle_tree.root_hash() {
        println!("  Root hash: {}...", &hash[..32]);
    }

    Ok(())
}

fn cmd_list_snapshots(
    data_dir: &PathBuf,
    volume: &str,
) -> Result<()> {
    let snapshot_ids = Snapshot::list(data_dir, volume)?;

    if snapshot_ids.is_empty() {
        println!("No snapshots found for volume '{}'", volume);
        return Ok(());
    }

    println!("Snapshots for volume '{}':", volume);
    println!("============================");
    
    for (i, id) in snapshot_ids.iter().enumerate() {
        match Snapshot::load(data_dir, volume, id) {
            Ok(snap) => {
                println!("{}. {}", i + 1, id);
                println!("   Created: {}", snap.created_at);
                println!("   Blocks: {}, Size: {} bytes", snap.block_count, snap.total_size_bytes);
                if let Some(desc) = &snap.description {
                    println!("   Description: {}", desc);
                }
                println!();
            }
            Err(e) => {
                eprintln!("Warning: Failed to load snapshot '{}': {}", id, e);
            }
        }
    }

    Ok(())
}

fn cmd_list_volumes(
    data_dir: &PathBuf,
) -> Result<()> {
    let storage_manager = StorageManager::from_base_path(data_dir)?;
    let volumes = storage_manager.list_volumes();

    if volumes.is_empty() {
        println!("No volumes found. Use 'create-volume' to create one.");
        return Ok(());
    }

    println!("Available Volumes:");
    println!("===================");
    
    for (i, volume) in volumes.iter().enumerate() {
        println!("{}. {}", i + 1, volume.name);
        println!("   Path: {:?}", volume.path);
        println!("   Total blocks: {}", volume.total_blocks);
        println!("   Used blocks: {}", volume.used_blocks);
        println!();
    }

    Ok(())
}

fn cmd_create_volume(
    data_dir: &PathBuf,
    name: &str,
) -> Result<()> {
    let mut storage_manager = StorageManager::from_base_path(data_dir)?;
    
    if storage_manager.get_volume(name).is_some() {
        anyhow::bail!("Volume '{}' already exists", name);
    }

    let volume = storage_manager.create_volume(name)?;

    println!("Volume created successfully!");
    println!("  Name: {}", volume.name);
    println!("  Path: {:?}", volume.path);

    Ok(())
}
