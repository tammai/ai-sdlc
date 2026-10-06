//! SQLite connection + embedded migrations (tracked with `PRAGMA user_version`).
use std::path::Path;

use rusqlite::Connection;

use crate::error::AppResult;

/// Ordered, append-only. Never edit a shipped migration - add a new one.
const MIGRATIONS: &[&str] = &[include_str!("../../migrations/0001_init.sql")];

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    init(conn)
}

#[cfg(test)]
pub fn open_in_memory()-> AppResult<Connection> {
    init(Connection::open_in_memory()?)
}

fn init(mut conn: Connection) -> AppResult<Connection> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&mut conn)?;
    Ok(conn)
}

pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current: usize = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", i + 1)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent() {
        let mut conn = open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        let v: usize = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(v, MIGRATIONS.len());
    }
}
