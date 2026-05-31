fn main() {
    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=src/types.rs");
    println!("cargo:rerun-if-changed=src/mbtiles.rs");
    println!("cargo:rerun-if-changed=src/renderer.rs");
    println!("cargo:rerun-if-changed=src/map.rs");
    println!("cargo:rerun-if-changed=src/gps.rs");
    println!("cargo:rerun-if-changed=src/routing.rs");

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    match target_os.as_str() {
        "windows" => {
            println!("cargo:rustc-link-arg=/DEF:offline_map_engine.def");
        }
        _ => {}
    }
}
