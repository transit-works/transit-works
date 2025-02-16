use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("{0}")]
    Error(String),
    #[error("Cache not found")]
    CacheNotFound,
    #[error("Cannot read file")]
    IO(#[from] std::io::Error),
    #[error(transparent)]
    Serde(#[from] serde_json::Error),
    #[error(transparent)]
    GtfsError(#[from] crate::gtfs::error::Error),
    #[error(transparent)]
    SqliteError(#[from] rusqlite::Error),
    #[error(transparent)]
    BincodeError(#[from] bincode::Error),
}
