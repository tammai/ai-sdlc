//! Thin command layer: unpack state, call the service, return `Result<_, AppError>`.
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::services::notes::{self, NewNote, Note};
use crate::Db;

fn poisoned<T>(_: T) -> AppError {
    AppError::Internal("database lock poisoned".into())
}

#[tauri::command]
pub async fn list_notes(db: State<'_, Db>) -> AppResult<Vec<Note>> {
    let conn = db.0.lock().map_err(poisoned)?;
    notes::list(&conn)
}

#[tauri::command]
pub async fn create_note(db: State<'_, Db>, input: NewNote) -> AppResult<Note> {
    let conn = db.0.lock().map_err(poisoned)?;
    notes::create(&conn, input)
}
