use serde::Serializer;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid brain folder: {0}")]
    InvalidBrain(String),
    #[error("no active brain is configured")]
    MissingBrain,
    #[error("capture session was not found: {0}")]
    MissingSession(String),
    #[error("invalid capture title: {0}")]
    InvalidCaptureTitle(String),
    #[error("invalid source import: {0}")]
    InvalidSource(String),
    #[error("image source was not found: {0}")]
    MissingImageMemory(String),
    #[error("invalid search request: {0}")]
    InvalidSearch(String),
    #[error("invalid note: {0}")]
    InvalidNote(String),
    #[error("review item was not found: {0}")]
    MissingReviewItem(String),
    #[error("invalid review item: {0}")]
    InvalidReview(String),
    #[error("unexpected request body; audio must be sent as raw bytes")]
    AudioBodyMustBeRaw,
    #[error("missing request header: {0}")]
    MissingHeader(&'static str),
    #[error("unsupported transcription provider: {0}")]
    UnsupportedProvider(String),
    #[error("speech recognition error: {0}")]
    SpeechRecognition(String),
    #[error("speech recognition permission was not granted: {0}")]
    SpeechPermission(String),
    #[error("capture session has no saved audio: {0}")]
    MissingSessionAudio(String),
    #[error("invalid microphone permission state: {0}")]
    InvalidPermissionState(String),
    #[error("invalid global shortcut: {0}")]
    InvalidShortcut(String),
    #[error("chat conversation was not found: {0}")]
    MissingConversation(String),
    #[error("invalid chat message: {0}")]
    InvalidChatMessage(String),
    #[error("interview host was not found: {0}")]
    MissingInterviewHost(String),
    #[error("interview was not found: {0}")]
    MissingInterview(String),
    #[error("interview turn was not found: {0}")]
    MissingInterviewTurn(String),
    #[error("invalid interview input: {0}")]
    InvalidInterview(String),
    #[error("content skill was not found: {0}")]
    MissingContentSkill(String),
    #[error("content project was not found: {0}")]
    MissingContentProject(String),
    #[error("invalid content workflow: {0}")]
    InvalidContent(String),
    #[error("invalid sync configuration: {0}")]
    InvalidSync(String),
    #[error("sync credential is unavailable")]
    MissingSyncCredential,
    #[error("sync path is unsafe: {0}")]
    UnsafeSyncPath(String),
    #[error("generation provider was not found: {0}")]
    MissingGenerationProvider(String),
    #[error("invalid generation provider configuration: {0}")]
    InvalidGenerationProvider(String),
    #[error("provider credential is unavailable: {0}")]
    MissingProviderCredential(String),
    #[error("generation provider request failed: {0}")]
    GenerationProvider(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
