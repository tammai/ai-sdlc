use serde::{ser::SerializeStruct, Serialize, Serializer};

/// The single error type that crosses the IPC boundary.
/// Serialized as `{ "code": "...", "message": "..." }` (mirrored by `AppErrorPayload` in the frontend bridge).
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Internal(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "validation",
            Self::Database(_) => "database",
            Self::Io(_) => "io",
            Self::Internal(_) => "internal",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_message() {
        let json = serde_json::to_value(AppError::Validation("title is required".into())).unwrap();
        assert_eq!(json, serde_json::json!({ "code": "validation", "message": "title is required" }));
    }
}
