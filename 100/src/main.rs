use clap::Parser;
use goblin::{Object, elf, pe, Hint};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::panic;
use thiserror::Error;

const RED: &str = "\x1b[31m";
const RESET: &str = "\x1b[0m";

#[derive(Parser, Debug)]
#[command(name = "dep-tree", version, about = "Analyze shared library dependencies of ELF/PE files")]
struct Cli {
    /// Input file path (ELF or PE)
    file: PathBuf,

    /// Maximum depth of dependency tree (0 for unlimited)
    #[arg(short, long, default_value_t = 0)]
    depth: usize,

    /// Output in JSON format
    #[arg(long, default_value_t = false)]
    json: bool,

    /// Search paths for libraries (can be specified multiple times)
    #[arg(short = 'L', long = "library-path")]
    library_paths: Vec<PathBuf>,
}

#[derive(Debug, Error)]
enum DepTreeError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Unsupported file format")]
    UnsupportedFormat,

    #[error("Library not found: {0}")]
    LibraryNotFound(String),
}

#[derive(Debug, Serialize, Clone)]
struct DependencyNode {
    name: String,
    path: Option<PathBuf>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    children: Vec<DependencyNode>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    circular: bool,
}

#[derive(Debug, Serialize)]
struct OutputRoot {
    root: DependencyNode,
    format: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    cycles: Vec<Vec<String>>,
}

#[derive(Debug)]
struct RunResult {
    root: DependencyNode,
    format: String,
    cycles: Vec<Vec<String>>,
}

fn safe_parse_object(buffer: &[u8]) -> Result<Object, DepTreeError> {
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
        Object::parse(buffer).map_err(|e| DepTreeError::Parse(e.to_string()))
    }));

    match result {
        Ok(inner) => inner,
        Err(panic_info) => {
            let msg = if let Some(s) = panic_info.downcast_ref::<String>() {
                format!("Parse panic: {}", s)
            } else if let Some(s) = panic_info.downcast_ref::<&str>() {
                format!("Parse panic: {}", s)
            } else {
                "Parse panic: unknown reason".to_string()
            };
            Err(DepTreeError::Parse(msg))
        }
    }
}

fn main() {
    let cli = Cli::parse();
    match run(&cli) {
        Ok(result) => {
            if cli.json {
                let output = OutputRoot {
                    root: result.root,
                    format: result.format,
                    cycles: result.cycles,
                };
                println!("{}", serde_json::to_string_pretty(&output).unwrap());
            } else {
                print_tree(&result.root, 0, &mut Vec::new());
                if !result.cycles.is_empty() {
                    eprintln!();
                    eprintln!("{}Warning: {} circular dependenc{} detected:{}",
                        RED,
                        result.cycles.len(),
                        if result.cycles.len() == 1 { "y" } else { "ies" },
                        RESET);
                    for cycle in &result.cycles {
                        eprintln!("  {}  {}[{}]{}", RED, cycle.join(" -> "), RED, RESET);
                    }
                    std::process::exit(2);
                }
            }
        }
        Err(e) => {
            if cli.json {
                let err_output = serde_json::json!({
                    "error": e.to_string(),
                    "root": null,
                    "format": null,
                    "cycles": null
                });
                println!("{}", serde_json::to_string_pretty(&err_output).unwrap());
            } else {
                eprintln!("Error: {}", e);
            }
            std::process::exit(1);
        }
    }
}

fn run(cli: &Cli) -> Result<RunResult, DepTreeError> {
    let file_path = &cli.file;
    let buffer = fs::read(file_path)?;

    let hint = goblin::peek(&buffer).map_err(|e| DepTreeError::Parse(e.to_string()))?;
    if !matches!(hint, Hint::Elf(_) | Hint::PE(_)) {
        return Err(DepTreeError::UnsupportedFormat);
    }

    let object = safe_parse_object(&buffer)?;

    let (root_name, deps, format) = match object {
        Object::Elf(elf) => {
            let name = file_path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let deps = parse_elf_dependencies(&elf)?;
            (name, deps, "ELF".to_string())
        }
        Object::PE(pe) => {
            let name = file_path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let deps = parse_pe_dependencies(&pe)?;
            (name, deps, "PE".to_string())
        }
        _ => return Err(DepTreeError::UnsupportedFormat),
    };

    let mut visited = HashSet::new();
    visited.insert(root_name.clone());

    let mut in_stack = Vec::new();
    in_stack.push(root_name.clone());

    let mut cycles = Vec::new();

    let children = build_dependency_tree(
        &deps,
        cli.depth,
        1,
        &mut visited,
        &mut in_stack,
        &cli.library_paths,
        &mut cycles,
    )?;

    in_stack.pop();

    let root = DependencyNode {
        name: root_name,
        path: Some(file_path.clone()),
        children,
        circular: false,
    };

    Ok(RunResult { root, format, cycles })
}

fn parse_elf_dependencies(elf: &elf::Elf) -> Result<Vec<String>, DepTreeError> {
    let mut deps = Vec::new();
    if let Some(imports) = elf.libraries {
        for lib in imports {
            deps.push(lib.to_string());
        }
    }
    Ok(deps)
}

fn parse_pe_dependencies(pe: &pe::PE) -> Result<Vec<String>, DepTreeError> {
    let mut deps = Vec::new();
    if let Some(imports) = pe.imports {
        for import in imports {
            deps.push(import.dll.to_string());
        }
    }
    Ok(deps)
}

fn build_dependency_tree(
    libs: &[String],
    max_depth: usize,
    current_depth: usize,
    visited: &mut HashSet<String>,
    in_stack: &mut Vec<String>,
    search_paths: &[PathBuf],
    cycles: &mut Vec<Vec<String>>,
) -> Result<Vec<DependencyNode>, DepTreeError> {
    let mut nodes = Vec::new();

    if max_depth > 0 && current_depth > max_depth {
        return Ok(nodes);
    }

    for lib in libs {
        if in_stack.contains(lib) {
            let cycle_start = in_stack.iter().position(|s| s == lib).unwrap();
            let cycle_path: Vec<String> = in_stack[cycle_start..].to_vec();
            cycles.push(cycle_path);

            nodes.push(DependencyNode {
                name: lib.clone(),
                path: None,
                children: Vec::new(),
                circular: true,
            });
            continue;
        }

        if visited.contains(lib) {
            continue;
        }
        visited.insert(lib.clone());
        in_stack.push(lib.clone());

        let lib_path = find_library(lib, search_paths);
        let children = match &lib_path {
            Some(path) => {
                match fs::read(path) {
                    Ok(buffer) => {
                        match safe_parse_object(&buffer) {
                            Ok(Object::Elf(elf)) => {
                                match parse_elf_dependencies(&elf) {
                                    Ok(deps) => {
                                        build_dependency_tree(
                                            &deps,
                                            max_depth,
                                            current_depth + 1,
                                            visited,
                                            in_stack,
                                            search_paths,
                                            cycles,
                                        )?
                                    }
                                    Err(_) => Vec::new(),
                                }
                            }
                            Ok(Object::PE(pe)) => {
                                match parse_pe_dependencies(&pe) {
                                    Ok(deps) => {
                                        build_dependency_tree(
                                            &deps,
                                            max_depth,
                                            current_depth + 1,
                                            visited,
                                            in_stack,
                                            search_paths,
                                            cycles,
                                        )?
                                    }
                                    Err(_) => Vec::new(),
                                }
                            }
                            _ => Vec::new(),
                        }
                    }
                    Err(_) => Vec::new(),
                }
            }
            None => Vec::new(),
        };

        in_stack.pop();

        nodes.push(DependencyNode {
            name: lib.clone(),
            path: lib_path,
            children,
            circular: false,
        });
    }

    Ok(nodes)
}

fn find_library(lib_name: &str, search_paths: &[PathBuf]) -> Option<PathBuf> {
    for path in search_paths {
        let lib_path = path.join(lib_name);
        if lib_path.exists() {
            return Some(lib_path);
        }
    }

    let system_paths = if cfg!(target_os = "windows") {
        vec![
            PathBuf::from(r"C:\Windows\System32"),
            PathBuf::from(r"C:\Windows\SysWOW64"),
        ]
    } else {
        vec![
            PathBuf::from("/lib"),
            PathBuf::from("/lib64"),
            PathBuf::from("/usr/lib"),
            PathBuf::from("/usr/lib64"),
            PathBuf::from("/usr/local/lib"),
        ]
    };

    for path in system_paths {
        let lib_path = path.join(lib_name);
        if lib_path.exists() {
            return Some(lib_path);
        }
    }

    None
}

fn print_tree(node: &DependencyNode, depth: usize, prefix: &mut Vec<bool>) {
    if depth > 0 {
        for i in 0..depth - 1 {
            if prefix[i] {
                print!("│   ");
            } else {
                print!("    ");
            }
        }
        if prefix[depth - 1] {
            print!("├── ");
        } else {
            print!("└── ");
        }
    }

    if node.circular {
        println!("{}{} [circular]{}", RED, node.name, RESET);
    } else {
        println!("{}", node.name);
    }

    let count = node.children.len();
    for (i, child) in node.children.iter().enumerate() {
        let is_last = i == count - 1;
        prefix.push(!is_last);
        print_tree(child, depth + 1, prefix);
        prefix.pop();
    }
}
