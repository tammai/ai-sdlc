//! Notes business logic. Plain functions over a `Connection`, so they are unit-testable with in-memory SQLite.
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub const TITLE_MAX: usize = 120;
pub const BODY_MAX: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub created_at: String,
}

impl Note {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self { id: r.get(0)?, title: r.get(1)?, body: r.get(2)?, created_at: r.get(3)? })
    }
}

#[derive(Debug, Deserialize)]
pub struct NewNote {
    pub title: String,
    #[serde(default)]
    pub body: String,
}

/// Validates and normalizes (trims) the input. This is the authoritative check; the UI only mirrors it.
fn validate(input: NewNote) -> AppResult<NewNote> {
    let title = input.title.trim().to_owned();
    let body = input.body.trim().to_owned();
    if title.is_empty() {
        return Err(AppError::Validation("title is required".into()));
    }
    if title.chars().count() > TITLE_MAX {
        return Err(AppError::Validation(format!("title must be at most {TITLE_MAX} characters")));
    }
    if body.chars().count() > BODY_MAX {
        return Err(AppError::Validation(format!("body must be at most {BODY_MAX} characters")));
    }
    Ok(NewNote { title, body })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Note>> {
    let mut stmt = conn.prepare("SELECT id, title, body, created_at FROM notes ORDER BY created_at DESC, id DESC")?;
    let rows = stmt.query_map([], Note::from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create(conn: &Connection, input: NewNote) -> AppResult<Note> {
    let input = validate(input)?;
    conn.query_row(
        "INSERT INTO notes (title, body) VALUES (?1, ?2) RETURNING id, title, body, created_at",
        params![input.title, input.body],
        Note::from_row,
    )
    .map_err(AppError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::db::open_in_memory;

    fn new(title: &str, body: &str) -> NewNote {
        NewNote { title: title.into(), body: body.into() }
    }

    #[test]
    fn list_is_empty_initially() {
        let conn = open_in_memory().unwrap();
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn create_trims_and_persists() {
        let conn = open_in_memory().unwrap();
        let note = create(&conn, new("  Buy milk  ", " 2 litres ")).unwrap();
        assert_eq!(note.title, "Buy milk");
        assert_eq!(note.body, "2 litres");
        assert_eq!(list(&conn).unwrap(), vec![note]);
    }

    #[test]
    fn list_returns_newest_first() {
        let conn = open_in_memory().unwrap();
        create(&conn, new("first", "")).unwrap();
        create(&conn, new("second", "")).unwrap();
        let titles: Vec<_> = list(&conn).unwrap().into_iter().map(|n| n.title).collect();
        assert_eq!(titles, ["second", "first"]);
    }

    #[test]
    fn rejects_blank_title() {
        let conn = open_in_memory().unwrap();
        let err = create(&conn, new("   ", "body")).unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn rejects_oversized_input() {
        let conn = open_in_memory().unwrap();
        assert!(matches!(create(&conn, new(&"a".repeat(TITLE_MAX + 1), "")), Err(AppError::Validation(_))));
        assert!(matches!(create(&conn, new("ok", &"b".repeat(BODY_MAX + 1))), Err(AppError::Validation(_))));
        assert!(create(&conn, new(&"a".repeat(TITLE_MAX), &"b".repeat(BODY_MAX))).is_ok());
    }
}
