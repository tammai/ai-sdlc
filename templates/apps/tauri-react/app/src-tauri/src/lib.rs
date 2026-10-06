mod commands;
mod error;
mod services;

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

/// Shared SQLite connection (single local user; commands hold the lock only for the duration of a query).
pub struct Db(pub Mutex<Connection>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = services::db::open(&dir.join("notes.sqlite3"))?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::notes::list_notes, commands::notes::create_note])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
