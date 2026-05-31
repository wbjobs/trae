mod cli;
mod merkle;
mod snapshot;
mod diff;
mod defrag;
mod storage;

use clap::Parser;
use cli::Cli;
use anyhow::Result;

fn main() -> Result<()> {
    let cli = Cli::parse();
    cli::run(cli)
}
