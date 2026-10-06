use tauri_build::{AppManifest, Attributes};

/// Commands the frontend may call. Each one gets an `allow-<command>` permission
/// that `capabilities/default.json` must grant explicitly (least privilege).
const COMMANDS: &[&str] = &["list_notes", "create_note"];

fn main() {
    // `generate_context!` embeds the frontend build; make sure the folder exists so
    // `cargo clippy` / `cargo test` work before the first `pnpm build`.
    let _ = std::fs::create_dir_all("../.output/public");
    tauri_build::try_build(Attributes::new().app_manifest(AppManifest::new().commands(COMMANDS)))
        .expect("failed to run tauri-build");
}
