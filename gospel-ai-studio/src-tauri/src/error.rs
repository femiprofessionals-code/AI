use serde::{Serialize, Serializer};

/// Application error returned to the frontend as `{ code, message }`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    Dependency(String),
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("File system error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Data error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::NotFound(_) => "not_found",
            AppError::Invalid(_) => "invalid",
            AppError::Dependency(_) => "dependency",
            AppError::Db(_) => "database",
            AppError::Io(_) => "io",
            AppError::Json(_) => "data",
            AppError::Other(_) => "other",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

pub fn invalid<T>(msg: impl Into<String>) -> AppResult<T> {
    Err(AppError::Invalid(msg.into()))
}

pub fn not_found(what: &str) -> AppError {
    AppError::NotFound(format!("{what} was not found. It may have been deleted."))
}
