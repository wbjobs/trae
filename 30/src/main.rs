use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

mod error;
mod mp4;
mod h26x;
mod sei_injector;
mod sei_extractor;

use error::Mp4SeiError;

#[derive(Parser)]
#[command(name = "mp4_sei", version, about = "MP4 SEI data injector and extractor")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Parse MP4 file and display structure information
    Info {
        /// Input MP4 file path
        #[arg(short, long)]
        input: PathBuf,
    },
    /// Extract H.264/H.265 bitstream from MP4
    Extract {
        /// Input MP4 file path
        #[arg(short, long)]
        input: PathBuf,
        /// Output raw bitstream file path
        #[arg(short, long)]
        output: PathBuf,
    },
    /// Inject SEI data into video
    Inject {
        /// Input MP4 file path
        #[arg(short, long)]
        input: PathBuf,
        /// Output MP4 file path
        #[arg(short, long)]
        output: PathBuf,
        /// SEI payload data as hex string
        #[arg(short, long)]
        data: String,
        /// Inject SEI into every Nth frame (default: every keyframe)
        #[arg(short, long, default_value_t = 0)]
        every: u32,
    },
    /// Inject SEI with user ID
    InjectUser {
        /// Input MP4 file path
        #[arg(short, long)]
        input: PathBuf,
        /// Output MP4 file path
        #[arg(short, long)]
        output: PathBuf,
        /// User ID to embed
        #[arg(short, long)]
        user_id: u64,
        /// Optional timestamp (default: current time)
        #[arg(short, long)]
        timestamp: Option<u64>,
    },
    /// Extract SEI data from MP4 (blind extraction)
    ExtractSei {
        /// Input MP4 file path
        #[arg(short, long)]
        input: PathBuf,
        /// Output file for extracted SEI payloads (optional)
        #[arg(short, long)]
        output: Option<PathBuf>,
        /// Extract only payload data (raw bytes) instead of full report
        #[arg(long)]
        raw: bool,
    },
    /// Verify SEI injection is lossless
    Verify {
        /// Original MP4 file path
        #[arg(short, long)]
        original: PathBuf,
        /// Modified MP4 file path with SEI
        #[arg(short, long)]
        modified: PathBuf,
        /// Output report file path (optional)
        #[arg(short, long)]
        report: Option<PathBuf>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Info { input } => {
            let mp4 = mp4::Mp4File::parse(&input)?;
            println!("{}", mp4);
            Ok(())
        }
        Commands::Extract { input, output } => {
            let mp4 = mp4::Mp4File::parse(&input)?;
            let bitstream = mp4.extract_bitstream()?;
            std::fs::write(&output, bitstream)?;
            println!("Bitstream extracted to: {}", output.display());
            println!("Total size: {} bytes", std::fs::metadata(&output)?.len());
            Ok(())
        }
        Commands::Inject { input, output, data, every } => {
            let sei_data = hex::decode(&data)?;
            let mut injector = sei_injector::SeiInjector::new(&input)?;
            let count_before = injector.injection_count();
            injector.inject_sei(&sei_data, every)?;
            let count_after = injector.injection_count();
            injector.write_to_file(&output)?;
            println!("SEI data injected successfully");
            println!("Injections: {} frames", count_after - count_before);
            println!("Output file: {}", output.display());
            Ok(())
        }
        Commands::InjectUser { input, output, user_id, timestamp } => {
            let ts = timestamp.unwrap_or_else(|| {
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
            });
            let mut payload = Vec::with_capacity(16);
            payload.extend_from_slice(&user_id.to_be_bytes());
            payload.extend_from_slice(&ts.to_be_bytes());
            let mut injector = sei_injector::SeiInjector::new(&input)?;
            injector.inject_sei(&payload, 1)?;
            injector.write_to_file(&output)?;
            println!("User ID ({}) and timestamp ({}) injected successfully", user_id, ts);
            println!("Output file: {}", output.display());
            Ok(())
        }
        Commands::ExtractSei { input, output, raw } => {
            if raw {
                let sei_list = sei_extractor::SeiExtractor::extract_sei(&input)?;
                let mut all_payloads = Vec::new();
                for sei in &sei_list {
                    for payload in &sei.payloads {
                        all_payloads.extend_from_slice(&payload.data);
                    }
                }
                if let Some(out) = output {
                    std::fs::write(&out, &all_payloads)?;
                    println!("Raw SEI payloads written to: {}", out.display());
                } else {
                    println!("{}", hex::encode(&all_payloads));
                }
                println!("Total SEI messages: {}", sei_list.len());
                println!("Total payload bytes: {}", all_payloads.len());
            } else {
                let report = sei_extractor::SeiExtractor::extract_sei_report(&input)?;
                println!("{}", report);
                if let Some(out) = output {
                    std::fs::write(&out, &report)?;
                    println!("Report saved to: {}", out.display());
                }
            }
            Ok(())
        }
        Commands::Verify { original, modified, report } => {
            let result = sei_extractor::SeiExtractor::verify(&original, &modified)?;
            println!("{}", result.details);
            if let Some(out) = report {
                std::fs::write(&out, &result.details)?;
                println!("\nReport saved to: {}", out.display());
            }
            Ok(())
        }
    }
}
