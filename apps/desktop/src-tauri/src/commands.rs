use crate::domain::{
    AudioRetentionResult, BootstrapState, CaptureAudioPayload, CaptureSession, ChatConversation,
    ChatTurn, CompleteInterviewAudioInput, ContentProject, ContentProjectDetail,
    Conversation, ConversationExchange, ConversationMessage,
    ContentSkill, ContentStepRun, CreateContentProjectInput, DashboardOverview, ImageMemory,
    ImageMemoryPayload, IndexStats, IndexedSource, InterviewAccessEntry, InterviewExchange,
    InterviewHost, InterviewSession, InterviewStart, InterviewTurn, LibraryOverview, NoteDocument,
    ParakeetStatus, ProcessInterviewAudioInput, ProviderDescriptor, QueueAgentProposalInput,
    ResolveReviewInput, ReviewDecision, ReviewRecord, SaveContentSkillInput,
    SaveContentStepRevisionInput, SaveGenerationProviderInput, SaveInterviewHostInput,
    SaveNoteInput, SaveProviderCredentialInput, SaveSyncCredentialsInput, SearchQuery,
    SearchResult, SendChatInput, SendInterviewTurnInput, SetDefaultProviderModelInput, ShareImportReport,
    SetFavoriteModelInput, SetPreferredModelInput, ShortcutSettingsState, SourceDocument,
    StartInterviewInput, SubmitConversationTurnInput, SyncFileDescriptor, SyncManifest, SyncState, SyncWriteOutcome,
    TagsOverview, TestGenerationProviderInput, TranscriptCleanupProposal, WriteSyncedFileInput,
};
use crate::error::{AppError, AppResult};
use crate::{
    capture, chat, content, conversation, dashboard, filesystem, image_memory, interview, library, notes,
    permissions, provider_costs, providers, review, search, share, shortcuts, storage, sync, tags,
    transcription,
};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

static PARAKEET_DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static PARAKEET_DOWNLOAD_ERROR: Mutex<Option<String>> = Mutex::new(None);

fn parakeet_download_error() -> Option<String> {
    PARAKEET_DOWNLOAD_ERROR
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

fn set_parakeet_download_error(error: Option<String>) {
    *PARAKEET_DOWNLOAD_ERROR
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = error;
}

#[tauri::command]
pub fn frontend_ready() {
    eprintln!("SECOND_BRAIN_UI_READY");
}

#[tauri::command]
pub fn get_shortcut_settings(app: AppHandle) -> AppResult<ShortcutSettingsState> {
    shortcuts::get(&app)
}

#[tauri::command]
pub fn update_quick_capture_shortcut(
    app: AppHandle,
    shortcut: String,
    enabled: bool,
    local_shortcut: String,
    local_enabled: bool,
) -> AppResult<ShortcutSettingsState> {
    shortcuts::update(&app, &shortcut, enabled, &local_shortcut, local_enabled)
}

fn active_brain(app: &AppHandle) -> AppResult<String> {
    storage::read_config(app)?
        .active_brain
        .ok_or(AppError::MissingBrain)
}

#[tauri::command]
pub fn get_bootstrap_state(app: AppHandle) -> AppResult<BootstrapState> {
    let mut config = storage::read_config(&app)?;
    config.microphone_permission = permissions::microphone_authorization_status();
    config.speech_permission = transcription::authorization_status();
    eprintln!(
        "SECOND_BRAIN_PERMISSION_STATE microphone={} speech={}",
        config.microphone_permission, config.speech_permission
    );
    let sessions = match &config.active_brain {
        Some(path) => {
            filesystem::start(Path::new(path))?;
            capture::recover_pending_enrichment(Path::new(path))?;
            storage::recover_interrupted_sessions(Path::new(path))?;
            if let Ok(home) = app.path().home_dir() {
                let _ = storage::apply_audio_retention(
                    Path::new(path),
                    config.audio_retention_days,
                    &home.join(".Trash"),
                );
            }
            storage::list_sessions(Path::new(path))?
        }
        None => Vec::new(),
    };
    Ok(BootstrapState {
        configured: config.active_brain.is_some(),
        brain_folders: config.brain_folders,
        active_brain: config.active_brain,
        transcription_provider: config.transcription_provider,
        microphone_permission: config.microphone_permission,
        speech_permission: config.speech_permission,
        transcription_correction_preference: config.transcription_correction_preference,
        default_agent_mode: config.default_agent_mode,
        allow_general_knowledge_default: config.allow_general_knowledge_default,
        sessions,
        runtime: "tauri",
    })
}

#[tauri::command]
pub fn update_behavior_preferences(
    app: AppHandle,
    transcription_correction_preference: String,
    default_agent_mode: String,
    allow_general_knowledge_default: bool,
) -> AppResult<BootstrapState> {
    if !["verbatim", "review-after-transcription"]
        .contains(&transcription_correction_preference.as_str())
    {
        return Err(AppError::InvalidPermissionState(
            "unsupported transcription correction preference".into(),
        ));
    }
    if !["read-only", "read-and-propose", "read-write"].contains(&default_agent_mode.as_str()) {
        return Err(AppError::InvalidPermissionState("unsupported default agent mode".into()));
    }
    let mut config = storage::read_config(&app)?;
    config.transcription_correction_preference = transcription_correction_preference;
    config.default_agent_mode = default_agent_mode;
    config.allow_general_knowledge_default = allow_general_knowledge_default;
    storage::write_config(&app, &config)?;
    get_bootstrap_state(app)
}

#[tauri::command]
pub fn get_audio_retention(app: AppHandle) -> AppResult<AudioRetentionResult> {
    Ok(AudioRetentionResult {
        days: storage::read_config(&app)?.audio_retention_days,
        removed_files: 0,
        removed_bytes: 0,
    })
}

#[tauri::command]
pub fn set_audio_retention(app: AppHandle, days: Option<u32>) -> AppResult<AudioRetentionResult> {
    if let Some(value) = days {
        if ![0, 7, 30, 90, 180, 365].contains(&value) {
            return Err(AppError::InvalidBrain(
                "unsupported audio retention period".into(),
            ));
        }
    }
    let brain = active_brain(&app)?;
    let trash = app
        .path()
        .home_dir()
        .map_err(|error| AppError::InvalidBrain(error.to_string()))?
        .join(".Trash");
    let (removed_files, removed_bytes) =
        storage::apply_audio_retention(Path::new(&brain), days, &trash)?;
    let mut config = storage::read_config(&app)?;
    config.audio_retention_days = days;
    storage::write_config(&app, &config)?;
    Ok(AudioRetentionResult {
        days,
        removed_files,
        removed_bytes,
    })
}

#[tauri::command]
pub fn get_dashboard_overview(app: AppHandle) -> AppResult<DashboardOverview> {
    let brain = active_brain(&app)?;
    dashboard::overview(Path::new(&brain))
}

#[tauri::command]
pub fn get_library_overview(app: AppHandle) -> AppResult<LibraryOverview> {
    let brain = active_brain(&app)?;
    library::overview(Path::new(&brain))
}

#[tauri::command]
pub fn import_source_files(app: AppHandle, paths: Vec<String>) -> AppResult<LibraryOverview> {
    let brain = active_brain(&app)?;
    library::import_files(Path::new(&brain), &paths)
}

#[tauri::command]
pub fn import_image_files(app: AppHandle, paths: Vec<String>) -> AppResult<Vec<ImageMemory>> {
    let brain = active_brain(&app)?;
    image_memory::import_files(Path::new(&brain), &paths)
}

#[tauri::command]
pub fn import_video_files(app: AppHandle, paths: Vec<String>) -> AppResult<LibraryOverview> {
    let brain = active_brain(&app)?;
    let provider = storage::read_config(&app)?.transcription_provider;
    share::import_videos(Path::new(&brain), &paths, &provider)
}

#[tauri::command]
pub fn import_shared_items(app: AppHandle) -> AppResult<ShareImportReport> {
    share::drain_inbox(&app)
}

#[tauri::command]
pub fn get_image_memory(app: AppHandle, image_id: String) -> AppResult<ImageMemory> {
    let brain = active_brain(&app)?;
    image_memory::get(Path::new(&brain), &image_id)
}

#[tauri::command]
pub async fn process_image_memory(app: AppHandle, image_id: String) -> AppResult<ImageMemory> {
    let brain = active_brain(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        image_memory::process(&app, Path::new(&brain), &image_id)
    })
    .await
    .map_err(|error| AppError::GenerationProvider(error.to_string()))?
}

#[tauri::command]
pub fn read_image_memory(app: AppHandle, image_id: String) -> AppResult<ImageMemoryPayload> {
    let brain = active_brain(&app)?;
    image_memory::read_image(Path::new(&brain), &image_id)
}

#[tauri::command]
pub fn reveal_image_memory(app: AppHandle, image_id: String) -> AppResult<()> {
    let brain = active_brain(&app)?;
    let path = image_memory::reveal_path(Path::new(&brain), &image_id)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(path).spawn()?;
    Ok(())
}

#[tauri::command]
pub fn list_notes(app: AppHandle) -> AppResult<Vec<NoteDocument>> {
    let brain = active_brain(&app)?;
    notes::list(Path::new(&brain))
}

#[tauri::command]
pub fn save_note(app: AppHandle, input: SaveNoteInput) -> AppResult<NoteDocument> {
    let brain = active_brain(&app)?;
    notes::save(Path::new(&brain), &input)
}

#[tauri::command]
pub fn trash_note(app: AppHandle, relative_path: String) -> AppResult<()> {
    let brain = active_brain(&app)?;
    let trash = app
        .path()
        .home_dir()
        .map_err(|error| AppError::InvalidBrain(error.to_string()))?
        .join(".Trash");
    notes::trash(Path::new(&brain), &relative_path, &trash)?;
    let _ = review::discard_for_target(Path::new(&brain), &relative_path);
    Ok(())
}

#[tauri::command]
pub fn open_note_external(app: AppHandle, relative_path: String) -> AppResult<()> {
    if !relative_path.starts_with("notes/") {
        return Err(AppError::InvalidNote(
            "only files inside notes/ can be opened as notes".into(),
        ));
    }
    let brain = active_brain(&app)?;
    let source = search::read_source(Path::new(&brain), &relative_path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(source.absolute_path)
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn list_review_items(app: AppHandle) -> AppResult<Vec<ReviewRecord>> {
    let brain = active_brain(&app)?;
    review::list(Path::new(&brain))
}

#[tauri::command]
pub fn resolve_review_item(app: AppHandle, input: ResolveReviewInput) -> AppResult<ReviewDecision> {
    let brain = active_brain(&app)?;
    review::resolve(Path::new(&brain), &input)
}

#[tauri::command]
pub fn get_tags_overview(app: AppHandle) -> AppResult<TagsOverview> {
    let brain = active_brain(&app)?;
    tags::overview(Path::new(&brain))
}

#[tauri::command]
pub fn configure_brain_folder(app: AppHandle, path: String) -> AppResult<BootstrapState> {
    storage::configure_brain(&app, &path)?;
    filesystem::start(Path::new(&path))?;
    get_bootstrap_state(app)
}

#[tauri::command]
pub fn create_capture_session(app: AppHandle) -> AppResult<CaptureSession> {
    let brain = active_brain(&app)?;
    storage::create_session(Path::new(&brain))
}

#[tauri::command]
pub fn fail_capture_session(
    app: AppHandle,
    session_id: String,
    message: String,
) -> AppResult<CaptureSession> {
    let brain = active_brain(&app)?;
    storage::mark_recording_failed(Path::new(&brain), &session_id, &message)
}

#[tauri::command]
pub fn save_capture_audio(
    app: AppHandle,
    request: tauri::ipc::Request,
) -> AppResult<CaptureSession> {
    let tauri::ipc::InvokeBody::Raw(audio) = request.body() else {
        return Err(AppError::AudioBodyMustBeRaw);
    };
    let session_id = request
        .headers()
        .get("x-session-id")
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::MissingHeader("x-session-id"))?;
    let mime_type = request
        .headers()
        .get("x-audio-mime-type")
        .or_else(|| request.headers().get("content-type"))
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream");
    let brain = active_brain(&app)?;
    storage::save_audio(Path::new(&brain), session_id, mime_type, audio)
}

#[tauri::command]
pub fn save_capture_audio_snapshot(
    app: AppHandle,
    request: tauri::ipc::Request,
) -> AppResult<CaptureSession> {
    let tauri::ipc::InvokeBody::Raw(audio) = request.body() else {
        return Err(AppError::AudioBodyMustBeRaw);
    };
    let session_id = request
        .headers()
        .get("x-session-id")
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::MissingHeader("x-session-id"))?;
    let mime_type = request
        .headers()
        .get("x-audio-mime-type")
        .or_else(|| request.headers().get("content-type"))
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream");
    let brain = active_brain(&app)?;
    storage::save_audio_snapshot(Path::new(&brain), session_id, mime_type, audio)
}

#[tauri::command]
pub async fn transcribe_capture_snapshot(
    app: AppHandle,
    session_id: String,
) -> AppResult<String> {
    let brain = active_brain(&app)?;
    let provider = storage::read_config(&app)?.transcription_provider;
    if provider != "apple-speech" {
        return Ok(String::new());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let session = storage::get_session(Path::new(&brain), &session_id)?;
        let path = session
            .audio_path
            .as_deref()
            .map(Path::new)
            .filter(|path| path.is_file())
            .ok_or_else(|| AppError::MissingSessionAudio(session_id.clone()))?;
        transcription::transcribe_file(path, "en-US")
    })
    .await
    .map_err(|error| AppError::SpeechRecognition(error.to_string()))?
}

#[tauri::command]
pub fn reveal_capture_session(app: AppHandle, session_id: String) -> AppResult<()> {
    let brain = active_brain(&app)?;
    let session = storage::get_session(Path::new(&brain), &session_id)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&session.folder_path)
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn open_capture_transcript(app: AppHandle, session_id: String) -> AppResult<()> {
    let brain = active_brain(&app)?;
    let session = storage::get_session(Path::new(&brain), &session_id)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&session.transcript_path)
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn reveal_capture_audio(app: AppHandle, session_id: String) -> AppResult<()> {
    let brain = active_brain(&app)?;
    let session = storage::get_session(Path::new(&brain), &session_id)?;
    let audio_path = session
        .audio_path
        .ok_or_else(|| AppError::MissingSessionAudio(session_id))?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("-R")
        .arg(audio_path)
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn read_capture_audio(app: AppHandle, session_id: String) -> AppResult<CaptureAudioPayload> {
    let brain = active_brain(&app)?;
    let session = storage::repair_session_audio_format(Path::new(&brain), &session_id)?;
    let audio_path = session
        .audio_path
        .ok_or_else(|| AppError::MissingSessionAudio(session_id))?;
    Ok(CaptureAudioPayload {
        mime_type: session
            .audio_mime_type
            .unwrap_or_else(|| "audio/wav".into()),
        bytes: std::fs::read(audio_path)?,
    })
}

#[tauri::command]
pub fn rename_capture_session(
    app: AppHandle,
    session_id: String,
    title: String,
) -> AppResult<CaptureSession> {
    let brain = active_brain(&app)?;
    storage::rename_session(Path::new(&brain), &session_id, &title)
}

#[tauri::command]
pub fn trash_capture_session(app: AppHandle, session_id: String) -> AppResult<()> {
    let brain = active_brain(&app)?;
    let trash = app
        .path()
        .home_dir()
        .map_err(|error| AppError::InvalidBrain(error.to_string()))?
        .join(".Trash");
    storage::trash_session(Path::new(&brain), &session_id, &trash)
}

#[tauri::command]
pub async fn process_capture_session(
    app: AppHandle,
    session_id: String,
) -> AppResult<CaptureSession> {
    let brain = active_brain(&app)?;
    let provider = storage::read_config(&app)?.transcription_provider;
    tauri::async_runtime::spawn_blocking(move || {
        capture::process_session(Path::new(&brain), &session_id, &provider)
    })
    .await
    .map_err(|error| AppError::SpeechRecognition(error.to_string()))?
}

#[tauri::command]
pub async fn update_capture_transcript(
    app: AppHandle,
    session_id: String,
    transcript: String,
    reorganize: bool,
) -> AppResult<CaptureSession> {
    let brain = active_brain(&app)?;
    let provider = storage::get_session(Path::new(&brain), &session_id)?
        .transcription_provider
        .unwrap_or_else(|| "user-edit".into());
    tauri::async_runtime::spawn_blocking(move || {
        let brain = Path::new(&brain);
        let saved = storage::save_edited_transcript(brain, &session_id, &transcript, reorganize)?;
        if !reorganize {
            return Ok(saved);
        }
        storage::enqueue_capture_enrichment(brain, &session_id)?;
        capture::run_enrichment_job(brain, &session_id, &provider)
    })
    .await
    .map_err(|error| AppError::SpeechRecognition(error.to_string()))?
}

#[tauri::command]
pub async fn propose_transcript_cleanup(
    app: AppHandle,
    session_id: String,
) -> AppResult<TranscriptCleanupProposal> {
    let brain = active_brain(&app)?;
    let session = storage::get_session(Path::new(&brain), &session_id)?;
    if session.transcript.trim().is_empty() {
        return Err(AppError::InvalidReview(
            "the capture has no transcript to clean up".into(),
        ));
    }
    let selection = providers::preferred_model(&app, "transcript")?;
    if providers::is_builtin(&selection.provider_id)? {
        return Err(AppError::InvalidGenerationProvider(
            "choose a configured text-generation model for Transcript cleanup in Settings → Models"
                .into(),
        ));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let original = session.transcript;
        let output = providers::generate(
            &app,
            &selection,
            "You are a conservative transcript editor. Correct punctuation, casing, obvious speech disfluencies, and unmistakable recognition errors. Preserve meaning, factual claims, uncertainty, tone, names, numbers, and paragraph order. Do not summarize, add facts, censor, or answer the transcript. Return only the cleaned transcript with no preface or Markdown fence.",
            &original,
            "transcript-cleanup",
        )?;
        let proposed = output.text.trim().to_string();
        if proposed.is_empty() {
            return Err(AppError::GenerationProvider(
                "the transcript cleanup provider returned an empty draft".into(),
            ));
        }
        Ok(TranscriptCleanupProposal {
            session_id,
            original,
            proposed,
            provider_id: output.provider_id,
            model_id: output.model_id,
            locality: output.locality,
        })
    })
    .await
    .map_err(|error| AppError::GenerationProvider(error.to_string()))?
}

#[tauri::command]
pub async fn request_speech_permission(app: AppHandle) -> AppResult<BootstrapState> {
    let permission = tauri::async_runtime::spawn_blocking(transcription::request_authorization)
        .await
        .map_err(|error| AppError::SpeechRecognition(error.to_string()))??;
    let mut config = storage::read_config(&app)?;
    config.speech_permission = permission;
    storage::write_config(&app, &config)?;
    get_bootstrap_state(app)
}

#[tauri::command]
pub fn set_transcription_provider(
    app: AppHandle,
    provider_id: String,
) -> AppResult<BootstrapState> {
    if !["none", "apple-speech", "parakeet"].contains(&provider_id.as_str()) {
        return Err(AppError::UnsupportedProvider(provider_id));
    }
    if provider_id == "parakeet" && !transcription::parakeet_available() {
        return Err(AppError::UnsupportedProvider(
            "Finish the Parakeet setup first: its CLI, ffmpeg, and local model are required."
                .into(),
        ));
    }
    let mut config = storage::read_config(&app)?;
    config.transcription_provider = provider_id;
    storage::write_config(&app, &config)?;
    get_bootstrap_state(app)
}

#[tauri::command]
pub fn set_microphone_permission_state(
    app: AppHandle,
    permission_state: String,
) -> AppResult<BootstrapState> {
    if ![
        "not-requested",
        "granted",
        "denied",
        "unsupported",
        "skipped",
    ]
    .contains(&permission_state.as_str())
    {
        return Err(AppError::InvalidPermissionState(permission_state));
    }
    let mut config = storage::read_config(&app)?;
    config.microphone_permission = permission_state;
    storage::write_config(&app, &config)?;
    get_bootstrap_state(app)
}

#[tauri::command]
pub fn list_transcription_providers() -> Vec<ProviderDescriptor> {
    let parakeet_available = transcription::parakeet_available();
    let parakeet_cli = transcription::parakeet_executable().is_some();
    let ffmpeg = transcription::ffmpeg_available();
    let model_state = transcription::parakeet_model_cache().0;
    vec![
        ProviderDescriptor {
            id: "none",
            label: "Record only",
            locality: "local",
            installed: true,
            available: true,
            detail: "Save raw audio without transcribing it.",
        },
        ProviderDescriptor {
            id: "apple-speech",
            label: "Apple Speech",
            locality: "local",
            installed: cfg!(target_os = "macos"),
            available: cfg!(target_os = "macos"),
            detail: "Use the speech recognizer built into macOS.",
        },
        ProviderDescriptor {
            id: "parakeet",
            label: "Parakeet MLX",
            locality: "local",
            installed: parakeet_cli,
            available: parakeet_available,
            detail: if parakeet_available {
                "Local Parakeet model through the installed parakeet-mlx CLI. The model cache stays on this Mac."
            } else if !parakeet_cli {
                "Install the Parakeet MLX CLI, ffmpeg, and the local model to enable Apple Silicon transcription."
            } else if !ffmpeg {
                "Parakeet MLX is installed, but ffmpeg is still required."
            } else if model_state == "partial" {
                "The Parakeet model download is incomplete and can be resumed."
            } else {
                "Download and validate the Parakeet model to finish local setup."
            },
        },
    ]
}

#[tauri::command]
pub fn get_parakeet_status() -> ParakeetStatus {
    let executable = transcription::parakeet_executable();
    let ffmpeg = transcription::ffmpeg_available();
    let (model_state, cached_bytes) = transcription::parakeet_model_cache();
    let download_in_progress = PARAKEET_DOWNLOAD_IN_PROGRESS.load(Ordering::SeqCst);
    let download_error = parakeet_download_error();
    let detail = if download_in_progress {
        "The Parakeet model is downloading in the background. You can leave this page.".into()
    } else if let Some(error) = download_error.as_ref() {
        format!("The Parakeet model download stopped: {error}")
    } else {
        match (executable.is_some(), ffmpeg, model_state.as_str()) {
            (false, _, _) => "The parakeet-mlx CLI is not installed.".into(),
            (true, false, _) => {
                "Parakeet MLX is installed, but ffmpeg is required for audio loading.".into()
            }
            (true, true, "ready") => "Parakeet MLX and its local model cache are ready.".into(),
            (true, true, "partial") => {
                "The local model download is incomplete and can be resumed.".into()
            }
            _ => "Parakeet MLX is installed. Download the model before the first capture.".into(),
        }
    };
    ParakeetStatus {
        uv_installed: transcription::uv_executable().is_some(),
        cli_installed: executable.is_some(),
        ffmpeg_installed: ffmpeg,
        model_state,
        cached_bytes,
        model_total_bytes: transcription::PARAKEET_MODEL_DOWNLOAD_BYTES,
        download_in_progress,
        download_error,
        executable_path: executable.map(|path| path.to_string_lossy().to_string()),
        detail,
    }
}

#[tauri::command]
pub async fn install_parakeet_cli() -> AppResult<ParakeetStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let uv = transcription::ensure_uv_executable()?;
        let output = std::process::Command::new(uv)
            .args(["tool", "install", "parakeet-mlx", "-U"])
            .stdin(std::process::Stdio::null())
            .output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Err(AppError::UnsupportedProvider(
                if !stderr.is_empty() {
                    format!("Parakeet CLI installation failed: {stderr}")
                } else if !stdout.is_empty() {
                    format!("Parakeet CLI installation failed: {stdout}")
                } else {
                    "Parakeet CLI installation failed without an error message. Retry the installation."
                        .into()
                },
            ));
        }
        let status = get_parakeet_status();
        if !status.cli_installed {
            return Err(AppError::UnsupportedProvider(
                "Parakeet was installed, but the app could not find its CLI. Retry the installation."
                    .into(),
            ));
        }
        Ok(status)
    })
    .await
    .map_err(|error| AppError::UnsupportedProvider(error.to_string()))?
}

fn run_parakeet_model_download(python: PathBuf) -> AppResult<()> {
    let output = std::process::Command::new(python)
        .args([
            "-c",
            "from parakeet_mlx import from_pretrained; from_pretrained('mlx-community/parakeet-tdt-0.6b-v3'); print('ready')",
        ])
        .stdin(std::process::Stdio::null())
        .output()?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::UnsupportedProvider(if detail.is_empty() {
            "Parakeet model download failed without an error message. Retry to resume it.".into()
        } else {
            detail
        }));
    }
    if transcription::parakeet_model_cache().0 != "ready" {
        return Err(AppError::UnsupportedProvider(
            "Parakeet finished without a valid local model snapshot".into(),
        ));
    }
    Ok(())
}

fn launch_parakeet_download_job<F>(job: F) -> bool
where
    F: FnOnce() -> AppResult<()> + Send + 'static,
{
    if PARAKEET_DOWNLOAD_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return false;
    }
    set_parakeet_download_error(None);
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(job));
        match result {
            Ok(Ok(())) => set_parakeet_download_error(None),
            Ok(Err(error)) => {
                let message = error.to_string();
                let message = message
                    .strip_prefix("unsupported transcription provider: ")
                    .unwrap_or(&message)
                    .to_string();
                set_parakeet_download_error(Some(message));
            }
            Err(_) => set_parakeet_download_error(Some(
                "The background download stopped unexpectedly. Retry to resume it.".into(),
            )),
        }
        PARAKEET_DOWNLOAD_IN_PROGRESS.store(false, Ordering::SeqCst);
    });
    true
}

#[cfg(test)]
mod parakeet_background_tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn background_download_survives_its_caller_and_rejects_duplicate_starts() {
        PARAKEET_DOWNLOAD_IN_PROGRESS.store(false, Ordering::SeqCst);
        set_parakeet_download_error(None);
        let (started_sender, started_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();

        assert!(launch_parakeet_download_job(move || {
            started_sender.send(()).expect("announce start");
            release_receiver.recv().expect("wait for release");
            Ok(())
        }));
        started_receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("background job started");
        assert!(PARAKEET_DOWNLOAD_IN_PROGRESS.load(Ordering::SeqCst));
        assert!(!launch_parakeet_download_job(|| Ok(())));

        release_sender.send(()).expect("release background job");
        for _ in 0..100 {
            if !PARAKEET_DOWNLOAD_IN_PROGRESS.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(!PARAKEET_DOWNLOAD_IN_PROGRESS.load(Ordering::SeqCst));
        assert_eq!(parakeet_download_error(), None);
    }
}

#[tauri::command]
pub fn download_parakeet_model() -> AppResult<ParakeetStatus> {
    if PARAKEET_DOWNLOAD_IN_PROGRESS.load(Ordering::SeqCst) {
        return Ok(get_parakeet_status());
    }
    let python = transcription::parakeet_python().ok_or_else(|| {
        AppError::UnsupportedProvider(
            "Install the parakeet-mlx CLI before downloading its model.".into(),
        )
    })?;
    if !launch_parakeet_download_job(move || run_parakeet_model_download(python)) {
        return Ok(get_parakeet_status());
    }
    Ok(get_parakeet_status())
}

#[tauri::command]
pub fn reveal_brain_folder(app: AppHandle) -> AppResult<()> {
    let brain = active_brain(&app)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&brain).spawn()?;
    Ok(())
}

#[tauri::command]
pub fn open_microphone_settings() -> AppResult<()> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn open_speech_settings() -> AppResult<()> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition")
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn get_generation_provider_catalog(
    app: AppHandle,
    refresh: Option<bool>,
) -> AppResult<providers::ProviderCatalog> {
    providers::catalog(&app, refresh.unwrap_or(false))
}

#[tauri::command]
pub fn save_generation_provider(
    app: AppHandle,
    input: SaveGenerationProviderInput,
) -> AppResult<providers::ProviderCatalog> {
    providers::save_provider(&app, &input)?;
    providers::catalog(&app, false)
}

#[tauri::command]
pub fn delete_generation_provider(
    app: AppHandle,
    provider_id: String,
) -> AppResult<providers::ProviderCatalog> {
    providers::delete_provider(&app, &provider_id)?;
    providers::catalog(&app, false)
}

#[tauri::command]
pub fn save_provider_credential(
    app: AppHandle,
    input: SaveProviderCredentialInput,
) -> AppResult<providers::ProviderCatalog> {
    providers::save_credential(&app, &input)?;
    providers::catalog(&app, false)
}

#[tauri::command]
pub fn clear_provider_credential(
    app: AppHandle,
    provider_id: String,
) -> AppResult<providers::ProviderCatalog> {
    providers::clear_credential(&app, &provider_id)?;
    providers::catalog(&app, false)
}

#[tauri::command]
pub fn set_preferred_model(
    app: AppHandle,
    input: SetPreferredModelInput,
) -> AppResult<providers::ProviderCatalog> {
    providers::set_preferred_model(&app, &input)?;
    providers::catalog(&app, false)
}

#[tauri::command]
pub fn set_favorite_model(
    app: AppHandle,
    input: SetFavoriteModelInput,
) -> AppResult<providers::ProviderCatalog> {
    providers::set_favorite_model(&app, &input)?;
    providers::catalog(&app, false)
}

#[tauri::command]
pub fn set_default_provider_model(
    app: AppHandle,
    input: SetDefaultProviderModelInput,
) -> AppResult<providers::ProviderCatalog> {
    providers::set_default_provider_model(&app, &input)?;
    providers::catalog(&app, false)
}

#[tauri::command]
pub async fn test_generation_provider(
    app: AppHandle,
    input: TestGenerationProviderInput,
) -> AppResult<providers::ProviderDiagnostic> {
    tauri::async_runtime::spawn_blocking(move || {
        providers::test_provider(&app, &input.provider_id, &input.model_id)
    })
    .await
    .map_err(|error| {
        AppError::GenerationProvider(format!("provider test worker failed: {error}"))
    })?
}

#[tauri::command]
pub fn get_provider_cost_summary(app: AppHandle) -> AppResult<provider_costs::ProviderCostSummary> {
    let config = storage::read_config(&app)?;
    provider_costs::summary(&app, config.provider_monthly_budget_micros)
}

#[tauri::command]
pub fn save_provider_monthly_budget(
    app: AppHandle,
    monthly_budget_micros: Option<i64>,
) -> AppResult<provider_costs::ProviderCostSummary> {
    if monthly_budget_micros.is_some_and(|value| value <= 0 || value > 1_000_000_000_000) {
        return Err(AppError::InvalidGenerationProvider(
            "monthly provider budget must be between $0.01 and $1,000,000".into(),
        ));
    }
    let mut config = storage::read_config(&app)?;
    config.provider_monthly_budget_micros = monthly_budget_micros;
    storage::write_config(&app, &config)?;
    provider_costs::summary(&app, monthly_budget_micros)
}

#[tauri::command]
pub fn rebuild_search_index(app: AppHandle) -> AppResult<IndexStats> {
    let brain = active_brain(&app)?;
    search::rebuild_index(Path::new(&brain))
}

#[tauri::command]
pub fn clear_search_index(app: AppHandle) -> AppResult<IndexStats> {
    let brain = active_brain(&app)?;
    search::clear_index(Path::new(&brain))
}

#[tauri::command]
pub fn search_brain(app: AppHandle, query: SearchQuery) -> AppResult<Vec<SearchResult>> {
    let brain = active_brain(&app)?;
    search::search(Path::new(&brain), &query)
}

#[tauri::command]
pub fn list_indexed_sources(app: AppHandle) -> AppResult<Vec<IndexedSource>> {
    let brain = active_brain(&app)?;
    search::list_sources(Path::new(&brain))
}

#[tauri::command]
pub fn get_source_document(app: AppHandle, relative_path: String) -> AppResult<SourceDocument> {
    let brain = active_brain(&app)?;
    search::read_source(Path::new(&brain), &relative_path)
}

#[tauri::command]
pub fn reveal_source_in_finder(app: AppHandle, relative_path: String) -> AppResult<()> {
    let brain = active_brain(&app)?;
    let source = search::read_source(Path::new(&brain), &relative_path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("-R")
        .arg(source.absolute_path)
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn create_chat_conversation(
    app: AppHandle,
    title: Option<String>,
    scope: String,
) -> AppResult<ChatConversation> {
    let brain = active_brain(&app)?;
    chat::create_conversation(Path::new(&brain), title.as_deref(), &scope)
}

#[tauri::command]
pub fn list_conversations(app: AppHandle, kind: Option<String>) -> AppResult<Vec<Conversation>> {
    let brain = active_brain(&app)?;
    if kind.as_deref() == Some("interview") {
        interview::recover_interrupted_audio_turns(Path::new(&brain))?;
    }
    conversation::list(Path::new(&brain), kind.as_deref())
}

#[tauri::command]
pub fn list_conversation_messages(
    app: AppHandle,
    conversation_id: String,
) -> AppResult<Vec<ConversationMessage>> {
    let brain = active_brain(&app)?;
    conversation::list_messages(Path::new(&brain), &conversation_id)
}

#[tauri::command]
pub fn rename_chat_conversation(
    app: AppHandle,
    conversation_id: String,
    title: String,
) -> AppResult<ChatConversation> {
    let brain = active_brain(&app)?;
    chat::rename_conversation(Path::new(&brain), &conversation_id, &title)
}

#[tauri::command]
pub fn export_chat_conversation(app: AppHandle, conversation_id: String) -> AppResult<String> {
    let brain = active_brain(&app)?;
    Ok(chat::export_conversation(Path::new(&brain), &conversation_id)?
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub fn delete_chat_conversation(app: AppHandle, conversation_id: String) -> AppResult<()> {
    let brain = active_brain(&app)?;
    chat::delete_conversation(Path::new(&brain), &conversation_id)
}

#[tauri::command]
pub fn queue_chat_agent_proposal(
    app: AppHandle,
    input: QueueAgentProposalInput,
) -> AppResult<()> {
    let brain = active_brain(&app)?;
    review::write_agent_change(Path::new(&brain), &input.proposal, &input.conversation_id)
}

#[tauri::command]
pub async fn send_chat_message(app: AppHandle, input: SendChatInput) -> AppResult<ChatTurn> {
    let brain = active_brain(&app)?;
    let selection = providers::preferred_model(&app, "chat")?;
    tauri::async_runtime::spawn_blocking(move || {
        if providers::is_builtin(&selection.provider_id)? {
            return chat::send_message(Path::new(&brain), &input);
        }
        chat::send_message_with_provider(Path::new(&brain), &input, &selection, |system, prompt| {
            providers::generate(&app, &selection, system, prompt, "chat").map(|output| output.text)
        })
    })
    .await
    .map_err(|error| {
        AppError::GenerationProvider(format!("chat provider worker failed: {error}"))
    })?
}

#[tauri::command]
pub async fn submit_conversation_turn(
    app: AppHandle,
    input: SubmitConversationTurnInput,
) -> AppResult<ConversationExchange> {
    let kind = if let Some(id) = input.conversation_id.as_deref() {
        let brain = active_brain(&app)?;
        conversation::list(Path::new(&brain), None)?
            .into_iter()
            .find(|item| item.id == id)
            .map(|item| item.kind)
            .ok_or_else(|| AppError::MissingConversation(id.into()))?
    } else {
        input.kind.clone()
    };
    match kind.as_str() {
        "chat" => {
            let turn = send_chat_message(
                app,
                SendChatInput {
                    conversation_id: input.conversation_id,
                    message: input.message,
                    scope: input.scope,
                    selected_paths: input.selected_paths,
                    allow_general_knowledge: input.allow_general_knowledge,
                    retrieval_limit: input.retrieval_limit,
                    answer_mode: input.answer_mode,
                    agent_mode: input.agent_mode,
                },
            )
            .await?;
            let conversation = conversation::from_chat(turn.conversation);
            Ok(ConversationExchange {
                conversation,
                user_message: conversation::from_chat_message(turn.user_message),
                assistant_message: conversation::from_chat_message(turn.assistant_message),
                agent_proposal: turn.agent_proposal,
            })
        }
        "interview" => {
            let interview_id = input.conversation_id.ok_or_else(|| {
                AppError::InvalidInterview("start an interview with a host before submitting a turn".into())
            })?;
            let exchange = send_interview_turn(
                app,
                SendInterviewTurnInput {
                    interview_id,
                    message: input.message,
                    retrieval_limit: input.retrieval_limit,
                },
            )
            .await?;
            let session = conversation::from_interview(exchange.interview);
            Ok(ConversationExchange {
                user_message: conversation::from_interview_turn(exchange.user_turn, &session),
                assistant_message: conversation::from_interview_turn(exchange.host_turn, &session),
                conversation: session,
                agent_proposal: None,
            })
        }
        other => Err(AppError::InvalidChatMessage(format!(
            "unsupported conversation kind: {other}"
        ))),
    }
}

#[tauri::command]
pub fn list_interview_hosts(app: AppHandle) -> AppResult<Vec<InterviewHost>> {
    let brain = active_brain(&app)?;
    interview::list_hosts(Path::new(&brain))
}

#[tauri::command]
pub fn save_interview_host(
    app: AppHandle,
    input: SaveInterviewHostInput,
) -> AppResult<InterviewHost> {
    let brain = active_brain(&app)?;
    interview::save_host(Path::new(&brain), &input)
}

#[tauri::command]
pub async fn start_interview(
    app: AppHandle,
    input: StartInterviewInput,
) -> AppResult<InterviewStart> {
    let brain = active_brain(&app)?;
    let selection = providers::preferred_model(&app, "interview")?;
    tauri::async_runtime::spawn_blocking(move || {
        if providers::is_builtin(&selection.provider_id)? {
            return interview::start(Path::new(&brain), &input);
        }
        let host = interview::list_hosts(Path::new(&brain))?
            .into_iter()
            .find(|host| host.id == input.host_id)
            .ok_or_else(|| AppError::MissingInterviewHost(input.host_id.clone()))?;
        let system = format!(
            "You are the interview host named {}. Host instructions: {}. Ask exactly one concise opening question. Do not claim to have accessed the user's brain; no knowledge sources have been supplied yet.",
            host.name, host.instructions
        );
        let opening = providers::generate(
            &app,
            &selection,
            &system,
            "Open the interview by asking what idea the user wants to explore and why it matters now.",
            "interview",
        )?;
        interview::start_with_model(Path::new(&brain), &input, &selection, Some(opening.text))
    })
    .await
    .map_err(|error| AppError::GenerationProvider(format!("interview provider worker failed: {error}")))?
}

#[tauri::command]
pub fn rename_interview_session(
    app: AppHandle,
    interview_id: String,
    title: String,
) -> AppResult<InterviewSession> {
    let brain = active_brain(&app)?;
    interview::rename_interview(Path::new(&brain), &interview_id, &title)
}

#[tauri::command]
pub fn export_interview_session(app: AppHandle, interview_id: String) -> AppResult<String> {
    let brain = active_brain(&app)?;
    Ok(interview::export_interview(Path::new(&brain), &interview_id)?
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub fn trash_interview_session(app: AppHandle, interview_id: String) -> AppResult<()> {
    let brain = active_brain(&app)?;
    let trash = app
        .path()
        .home_dir()
        .map_err(|error| AppError::InvalidInterview(error.to_string()))?
        .join(".Trash");
    interview::trash_interview(Path::new(&brain), &interview_id, &trash)
}

#[tauri::command]
pub fn resume_interview_session(
    app: AppHandle,
    interview_id: String,
) -> AppResult<InterviewSession> {
    let brain = active_brain(&app)?;
    interview::resume(Path::new(&brain), &interview_id)
}

#[tauri::command]
pub async fn send_interview_turn(
    app: AppHandle,
    input: SendInterviewTurnInput,
) -> AppResult<InterviewExchange> {
    let brain = active_brain(&app)?;
    let session = interview::list_interviews(Path::new(&brain))?
        .into_iter()
        .find(|item| item.id == input.interview_id)
        .ok_or_else(|| AppError::MissingInterview(input.interview_id.clone()))?;
    let selection = crate::domain::ModelSelection {
        provider_id: session.provider,
        model_id: session.model,
    };
    tauri::async_runtime::spawn_blocking(move || {
        if providers::is_builtin(&selection.provider_id)? {
            return interview::send_turn(Path::new(&brain), &input);
        }
        interview::send_turn_with_provider(Path::new(&brain), &input, |system, prompt| {
            providers::generate(&app, &selection, system, prompt, "interview")
                .map(|output| output.text)
        })
    })
    .await
    .map_err(|error| {
        AppError::GenerationProvider(format!("interview provider worker failed: {error}"))
    })?
}

#[tauri::command]
pub fn begin_interview_audio_turn(
    app: AppHandle,
    interview_id: String,
) -> AppResult<InterviewTurn> {
    let brain = active_brain(&app)?;
    interview::begin_audio_turn(Path::new(&brain), &interview_id)
}

#[tauri::command]
pub fn save_interview_turn_audio(
    app: AppHandle,
    request: tauri::ipc::Request,
) -> AppResult<InterviewTurn> {
    let tauri::ipc::InvokeBody::Raw(audio) = request.body() else {
        return Err(AppError::AudioBodyMustBeRaw);
    };
    let interview_id = request
        .headers()
        .get("x-interview-id")
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::MissingHeader("x-interview-id"))?;
    let turn_id = request
        .headers()
        .get("x-turn-id")
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::MissingHeader("x-turn-id"))?;
    let mime_type = request
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("audio/webm");
    let brain = active_brain(&app)?;
    interview::save_turn_audio(Path::new(&brain), interview_id, turn_id, mime_type, audio)
}

#[tauri::command]
pub async fn complete_interview_audio_turn(
    app: AppHandle,
    input: CompleteInterviewAudioInput,
) -> AppResult<InterviewExchange> {
    let brain = active_brain(&app)?;
    let session = interview::list_interviews(Path::new(&brain))?
        .into_iter()
        .find(|item| item.id == input.interview_id)
        .ok_or_else(|| AppError::MissingInterview(input.interview_id.clone()))?;
    let selection = crate::domain::ModelSelection {
        provider_id: session.provider,
        model_id: session.model,
    };
    tauri::async_runtime::spawn_blocking(move || {
        if providers::is_builtin(&selection.provider_id)? {
            return interview::complete_audio(Path::new(&brain), &input);
        }
        interview::complete_audio_with_provider(Path::new(&brain), &input, |system, prompt| {
            providers::generate(&app, &selection, system, prompt, "interview")
                .map(|output| output.text)
        })
    })
    .await
    .map_err(|error| {
        AppError::GenerationProvider(format!("interview provider worker failed: {error}"))
    })?
}

#[tauri::command]
pub async fn process_interview_audio_turn(
    app: AppHandle,
    input: ProcessInterviewAudioInput,
) -> AppResult<InterviewExchange> {
    let brain = active_brain(&app)?;
    let transcription_provider = storage::read_config(&app)?.transcription_provider;
    let session = interview::list_interviews(Path::new(&brain))?
        .into_iter()
        .find(|item| item.id == input.interview_id)
        .ok_or_else(|| AppError::MissingInterview(input.interview_id.clone()))?;
    let selection = crate::domain::ModelSelection {
        provider_id: session.provider,
        model_id: session.model,
    };
    tauri::async_runtime::spawn_blocking(move || {
        if providers::is_builtin(&selection.provider_id)? {
            return interview::process_audio(Path::new(&brain), &input, &transcription_provider);
        }
        interview::process_audio_with_provider(
            Path::new(&brain),
            &input,
            &transcription_provider,
            |system, prompt| {
                providers::generate(&app, &selection, system, prompt, "interview")
                    .map(|output| output.text)
            },
        )
    })
    .await
    .map_err(|error| {
        AppError::GenerationProvider(format!("interview provider worker failed: {error}"))
    })?
}

#[tauri::command]
pub fn list_interview_access_log(
    app: AppHandle,
    interview_id: String,
) -> AppResult<Vec<InterviewAccessEntry>> {
    let brain = active_brain(&app)?;
    interview::list_access_log(Path::new(&brain), &interview_id)
}

#[tauri::command]
pub fn end_interview(app: AppHandle, interview_id: String) -> AppResult<InterviewSession> {
    let brain = active_brain(&app)?;
    interview::end(Path::new(&brain), &interview_id)
}

#[tauri::command]
pub fn list_content_skills(app: AppHandle) -> AppResult<Vec<ContentSkill>> {
    let brain = active_brain(&app)?;
    content::list_skills(Path::new(&brain))
}

#[tauri::command]
pub fn save_content_skill(app: AppHandle, input: SaveContentSkillInput) -> AppResult<ContentSkill> {
    let brain = active_brain(&app)?;
    content::save_skill(Path::new(&brain), &input)
}

#[tauri::command]
pub fn list_content_projects(app: AppHandle) -> AppResult<Vec<ContentProject>> {
    let brain = active_brain(&app)?;
    content::list_projects(Path::new(&brain))
}

#[tauri::command]
pub fn create_content_project(
    app: AppHandle,
    input: CreateContentProjectInput,
) -> AppResult<ContentProjectDetail> {
    let brain = active_brain(&app)?;
    let selection = providers::preferred_model(&app, "studio")?;
    content::create_project_with_model(Path::new(&brain), &input, &selection)
}

#[tauri::command]
pub fn get_content_project(app: AppHandle, project_id: String) -> AppResult<ContentProjectDetail> {
    let brain = active_brain(&app)?;
    content::get_project(Path::new(&brain), &project_id)
}

#[tauri::command]
pub async fn run_next_content_step(
    app: AppHandle,
    project_id: String,
    retrieval_limit: Option<usize>,
) -> AppResult<ContentStepRun> {
    let brain = active_brain(&app)?;
    let project = content::get_project(Path::new(&brain), &project_id)?.project;
    let selection = crate::domain::ModelSelection {
        provider_id: project.provider,
        model_id: project.model,
    };
    tauri::async_runtime::spawn_blocking(move || {
        let retrieval_limit = retrieval_limit.unwrap_or(18).clamp(6, 50);
        if providers::is_builtin(&selection.provider_id)? {
            return content::run_next_step_with_retrieval(
                Path::new(&brain),
                &project_id,
                retrieval_limit,
            );
        }
        content::run_next_step_with_provider_and_retrieval(
            Path::new(&brain),
            &project_id,
            retrieval_limit,
            |system, prompt| {
                providers::generate(&app, &selection, system, prompt, "studio")
                    .map(|output| output.text)
            },
        )
    })
    .await
    .map_err(|error| {
        AppError::GenerationProvider(format!("Studio provider worker failed: {error}"))
    })?
}

#[tauri::command]
pub fn save_content_step_revision(
    app: AppHandle,
    input: SaveContentStepRevisionInput,
) -> AppResult<ContentStepRun> {
    let brain = active_brain(&app)?;
    content::save_step_revision(Path::new(&brain), &input)
}

#[tauri::command]
pub fn get_sync_state(app: AppHandle) -> AppResult<SyncState> {
    sync::get_state(&app)
}

#[tauri::command]
pub fn save_sync_credentials(
    app: AppHandle,
    input: SaveSyncCredentialsInput,
) -> AppResult<SyncState> {
    sync::save_credentials(&app, &input)
}

#[tauri::command]
pub fn get_sync_access_token(app: AppHandle) -> AppResult<String> {
    sync::access_token(&app)
}

#[tauri::command]
pub fn clear_sync_credentials(app: AppHandle) -> AppResult<SyncState> {
    sync::clear_credentials(&app)
}

#[tauri::command]
pub fn list_sync_files(app: AppHandle) -> AppResult<Vec<SyncFileDescriptor>> {
    let brain = active_brain(&app)?;
    sync::list_files(Path::new(&brain))
}

#[tauri::command]
pub fn read_sync_file(app: AppHandle, relative_path: String) -> AppResult<Vec<u8>> {
    let brain = active_brain(&app)?;
    sync::read_file(Path::new(&brain), &relative_path)
}

#[tauri::command]
pub fn write_synced_file(
    app: AppHandle,
    input: WriteSyncedFileInput,
) -> AppResult<SyncWriteOutcome> {
    let brain = active_brain(&app)?;
    sync::write_file(Path::new(&brain), &input)
}

#[tauri::command]
pub fn load_sync_manifest(app: AppHandle) -> AppResult<SyncManifest> {
    let brain = active_brain(&app)?;
    sync::load_manifest(Path::new(&brain))
}

#[tauri::command]
pub fn save_sync_manifest(app: AppHandle, manifest: SyncManifest) -> AppResult<SyncManifest> {
    let brain = active_brain(&app)?;
    sync::save_manifest(&app, Path::new(&brain), manifest)
}
