fn main() {
    tonic_build::configure()
        .build_server(false)
        .compile(
            &["../../proto/access.proto"],
            &["../../proto"],
        )
        .ok();

    tauri_build::build()
}
