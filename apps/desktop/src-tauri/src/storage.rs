use crate::domain::{AppConfig, AtomicNoteProposal, CaptureSession};
use crate::enrichment::AtomicNoteDraft;
use crate::error::{AppError, AppResult};
use crate::notes;
use chrono::{DateTime, Local, Utc};
use rusqlite::{params, Connection};
use std::collections::BTreeSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const SETTINGS_FILE: &str = "settings.json";
const BRAIN_META_DIR: &str = ".second-brain";
const DB_FILE: &str = "metadata.sqlite3";

fn app_data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::InvalidBrain(error.to_string()))?;
    fs::create_dir_all(&path)?;
    Ok(path)
}

pub fn read_config(app: &AppHandle) -> AppResult<AppConfig> {
    let path = app_data_dir(app)?.join(SETTINGS_FILE);
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let mut config: AppConfig = serde_json::from_slice(&fs::read(&path)?)?;
    if config.capture_pipeline_version < 1 {
        if cfg!(target_os = "macos") {
            config.transcription_provider = "apple-speech".into();
            config.speech_permission = "not-requested".into();
        }
        config.capture_pipeline_version = 1;
        fs::write(path, serde_json::to_vec_pretty(&config)?)?;
    }
    Ok(config)
}

pub fn write_config(app: &AppHandle, config: &AppConfig) -> AppResult<()> {
    let path = app_data_dir(app)?.join(SETTINGS_FILE);
    fs::write(path, serde_json::to_vec_pretty(config)?)?;
    Ok(())
}

fn brain_database(brain: &Path) -> PathBuf {
    brain.join(BRAIN_META_DIR).join(DB_FILE)
}

fn ensure_table_column(
    connection: &Connection,
    table: &str,
    name: &str,
    definition: &str,
) -> AppResult<()> {
    let columns = {
        let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        columns
    };
    if !columns.iter().any(|column| column == name) {
        connection.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {name} {definition}"),
            [],
        )?;
    }
    Ok(())
}

fn ensure_session_column(connection: &Connection, name: &str, definition: &str) -> AppResult<()> {
    ensure_table_column(connection, "sessions", name, definition)
}

fn repair_session_locations(connection: &Connection, brain: &Path) -> AppResult<()> {
    let records = {
        let mut statement = connection.prepare(
            "SELECT id, relative_folder, folder_path, transcript_path, audio_path FROM sessions",
        )?;
        let records = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        records
    };

    for (id, relative_folder, current_folder, current_transcript, audio_path) in records {
        let folder = brain.join(&relative_folder);
        if !folder.exists() {
            continue;
        }
        let expected_transcript = folder.join("transcript.md");
        let transcript = if expected_transcript.exists() {
            expected_transcript.to_string_lossy().to_string()
        } else {
            current_transcript
        };
        let repaired_audio = audio_path
            .as_deref()
            .and_then(|path| Path::new(path).file_name())
            .map(|name| folder.join(name))
            .filter(|path| path.exists())
            .map(|path| path.to_string_lossy().to_string())
            .or(audio_path);
        connection.execute(
            "UPDATE sessions SET folder_path = ?1, transcript_path = ?2, audio_path = ?3 WHERE id = ?4",
            params![
                if folder.exists() { folder.to_string_lossy().to_string() } else { current_folder },
                transcript,
                repaired_audio,
                id,
            ],
        )?;
    }
    Ok(())
}

fn repair_generic_session_audio(connection: &Connection) -> AppResult<()> {
    let records = {
        let mut statement = connection.prepare(
            "SELECT id, folder_path, audio_path, audio_mime_type FROM sessions
             WHERE audio_path IS NOT NULL AND
             (audio_mime_type IS NULL OR audio_mime_type = 'application/octet-stream')",
        )?;
        let records = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        records
    };

    for (id, folder_path, audio_path, requested_mime) in records {
        let current_path = PathBuf::from(&audio_path);
        if !current_path.exists() {
            continue;
        }
        let mut file = fs::File::open(&current_path)?;
        let mut header = [0_u8; 16];
        let header_length = file.read(&mut header)?;
        let mime_type = detected_audio_mime_type(
            requested_mime
                .as_deref()
                .unwrap_or("application/octet-stream"),
            &header[..header_length],
        );
        let desired_path =
            Path::new(&folder_path).join(format!("audio.{}", audio_extension(mime_type)));
        let repaired_path = if current_path == desired_path {
            current_path
        } else if desired_path.exists() {
            desired_path
        } else {
            fs::rename(&current_path, &desired_path)?;
            desired_path
        };
        connection.execute(
            "UPDATE sessions SET audio_path = ?1, audio_mime_type = ?2 WHERE id = ?3",
            params![repaired_path.to_string_lossy(), mime_type, id],
        )?;
    }
    Ok(())
}

pub(crate) fn open_database(brain: &Path) -> AppResult<Connection> {
    let metadata = brain.join(BRAIN_META_DIR);
    fs::create_dir_all(&metadata)?;
    let connection = Connection::open(brain_database(brain))?;
    connection.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS sessions (
           id TEXT PRIMARY KEY,
           title TEXT NOT NULL,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           folder_path TEXT NOT NULL,
           relative_folder TEXT NOT NULL,
           status TEXT NOT NULL,
           audio_path TEXT,
           audio_mime_type TEXT,
           audio_bytes INTEGER,
           transcript_path TEXT NOT NULL,
           transcript TEXT NOT NULL DEFAULT '',
           summary TEXT NOT NULL DEFAULT '',
           tags_json TEXT NOT NULL DEFAULT '[]',
           processing_error TEXT,
           transcription_provider TEXT,
           atomic_notes_json TEXT NOT NULL DEFAULT '[]'
         );
         CREATE INDEX IF NOT EXISTS sessions_created_at ON sessions(created_at DESC);
         CREATE TABLE IF NOT EXISTS passages (
           id TEXT PRIMARY KEY,
           relative_path TEXT NOT NULL,
           title TEXT NOT NULL,
           source_type TEXT NOT NULL,
           content TEXT NOT NULL,
           embedding_json TEXT NOT NULL,
           ordinal INTEGER NOT NULL,
           indexed_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS passages_path ON passages(relative_path);
         CREATE TABLE IF NOT EXISTS search_source_state (
           relative_path TEXT PRIMARY KEY,
           modified_nanos INTEGER NOT NULL,
           size_bytes INTEGER NOT NULL,
           document_id TEXT
         );
         CREATE TABLE IF NOT EXISTS conversations (
           id TEXT PRIMARY KEY,
           kind TEXT NOT NULL DEFAULT 'chat',
           title TEXT NOT NULL,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           scope TEXT NOT NULL,
           selected_paths_json TEXT NOT NULL DEFAULT '[]',
           provider TEXT NOT NULL,
           model TEXT NOT NULL,
           preview TEXT NOT NULL DEFAULT '',
           status TEXT NOT NULL DEFAULT 'active',
           host_id TEXT,
           host_name TEXT,
           folder_path TEXT,
           relative_folder TEXT
         );
         CREATE TABLE IF NOT EXISTS messages (
           id TEXT PRIMARY KEY,
           conversation_id TEXT NOT NULL,
           role TEXT NOT NULL,
           content TEXT NOT NULL,
           created_at TEXT NOT NULL,
           citations_json TEXT NOT NULL DEFAULT '[]',
           provider TEXT NOT NULL,
           model TEXT NOT NULL,
           general_knowledge_used INTEGER NOT NULL DEFAULT 0,
           audio_path TEXT,
           audio_mime_type TEXT,
           stage TEXT NOT NULL DEFAULT '',
           analysis TEXT NOT NULL DEFAULT '',
           status TEXT NOT NULL DEFAULT 'complete',
           FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
         );
         CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, created_at);
         CREATE TABLE IF NOT EXISTS knowledge_access_log (
           id TEXT PRIMARY KEY,
           conversation_id TEXT NOT NULL,
           message_id TEXT NOT NULL,
           passage_id TEXT NOT NULL,
           relative_path TEXT NOT NULL,
           title TEXT NOT NULL DEFAULT '',
           quote TEXT NOT NULL DEFAULT '',
           accessed_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS content_projects (
           id TEXT PRIMARY KEY,
           title TEXT NOT NULL,
           brief TEXT NOT NULL,
           skill_id TEXT NOT NULL,
           skill_name TEXT NOT NULL,
           output_type TEXT NOT NULL,
           scope TEXT NOT NULL,
           selected_paths_json TEXT NOT NULL DEFAULT '[]',
           status TEXT NOT NULL,
           current_step INTEGER NOT NULL DEFAULT 0,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           folder_path TEXT NOT NULL,
           relative_folder TEXT NOT NULL,
           provider TEXT NOT NULL,
           model TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS content_projects_updated_at ON content_projects(updated_at DESC);
         CREATE TABLE IF NOT EXISTS content_steps (
           id TEXT PRIMARY KEY,
           project_id TEXT NOT NULL,
           ordinal INTEGER NOT NULL,
           name TEXT NOT NULL,
           status TEXT NOT NULL,
           revision INTEGER NOT NULL DEFAULT 0,
           output_path TEXT,
           output_markdown TEXT NOT NULL DEFAULT '',
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           citations_json TEXT NOT NULL DEFAULT '[]',
           FOREIGN KEY(project_id) REFERENCES content_projects(id) ON DELETE CASCADE,
           UNIQUE(project_id, ordinal)
         );
         CREATE INDEX IF NOT EXISTS content_steps_project ON content_steps(project_id, ordinal);
         CREATE TABLE IF NOT EXISTS content_access_log (
           id TEXT PRIMARY KEY,
           project_id TEXT NOT NULL,
           step_id TEXT NOT NULL,
           passage_id TEXT NOT NULL,
           title TEXT NOT NULL,
           relative_path TEXT NOT NULL,
           quote TEXT NOT NULL,
           accessed_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS background_jobs (
           id TEXT PRIMARY KEY,
           kind TEXT NOT NULL,
           session_id TEXT NOT NULL,
           status TEXT NOT NULL,
           attempts INTEGER NOT NULL DEFAULT 0,
           last_error TEXT,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           UNIQUE(kind, session_id)
         );",
    )?;
    ensure_session_column(&connection, "transcript", "TEXT NOT NULL DEFAULT ''")?;
    ensure_session_column(&connection, "summary", "TEXT NOT NULL DEFAULT ''")?;
    ensure_session_column(&connection, "tags_json", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_session_column(&connection, "processing_error", "TEXT")?;
    ensure_session_column(&connection, "transcription_provider", "TEXT")?;
    ensure_session_column(
        &connection,
        "atomic_notes_json",
        "TEXT NOT NULL DEFAULT '[]'",
    )?;
    ensure_table_column(
        &connection,
        "conversations",
        "selected_paths_json",
        "TEXT NOT NULL DEFAULT '[]'",
    )?;
    ensure_table_column(&connection, "conversations", "kind", "TEXT NOT NULL DEFAULT 'chat'")?;
    ensure_table_column(&connection, "conversations", "status", "TEXT NOT NULL DEFAULT 'active'")?;
    ensure_table_column(&connection, "conversations", "host_id", "TEXT")?;
    ensure_table_column(&connection, "conversations", "host_name", "TEXT")?;
    ensure_table_column(&connection, "conversations", "folder_path", "TEXT")?;
    ensure_table_column(&connection, "conversations", "relative_folder", "TEXT")?;
    ensure_table_column(&connection, "messages", "audio_path", "TEXT")?;
    ensure_table_column(&connection, "messages", "audio_mime_type", "TEXT")?;
    ensure_table_column(&connection, "messages", "stage", "TEXT NOT NULL DEFAULT ''")?;
    ensure_table_column(&connection, "messages", "analysis", "TEXT NOT NULL DEFAULT ''")?;
    ensure_table_column(&connection, "messages", "status", "TEXT NOT NULL DEFAULT 'complete'")?;
    ensure_table_column(&connection, "knowledge_access_log", "title", "TEXT NOT NULL DEFAULT ''")?;
    ensure_table_column(&connection, "knowledge_access_log", "quote", "TEXT NOT NULL DEFAULT ''")?;
    migrate_legacy_interviews(&connection)?;
    ensure_table_column(&connection, "search_source_state", "document_id", "TEXT")?;
    repair_session_locations(&connection, brain)?;
    repair_generic_session_audio(&connection)?;
    Ok(connection)
}

/// Moves records from the original parallel interview schema into the canonical
/// conversation tables. `INSERT OR IGNORE` makes this safe on every open while
/// older development databases are still encountered.
fn migrate_legacy_interviews(connection: &Connection) -> AppResult<()> {
    let legacy_exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'interviews')",
        [],
        |row| row.get(0),
    )?;
    if !legacy_exists {
        return Ok(());
    }
    connection.execute_batch(
        "INSERT OR IGNORE INTO conversations
         (id, kind, title, created_at, updated_at, scope, selected_paths_json, provider, model,
          preview, status, host_id, host_name, folder_path, relative_folder)
         SELECT id, 'interview', title, created_at, updated_at, scope, selected_paths_json,
                provider, model, '', status, host_id, host_name, folder_path, relative_folder
         FROM interviews;
         INSERT OR IGNORE INTO messages
         (id, conversation_id, role, content, created_at, citations_json, provider, model,
          general_knowledge_used, audio_path, audio_mime_type, stage, analysis, status)
         SELECT turn.id, turn.interview_id, turn.role, turn.content, turn.created_at,
                turn.citations_json,
                CASE WHEN turn.role = 'user' THEN 'user' ELSE conversation.provider END,
                CASE WHEN turn.role = 'user' THEN 'human' ELSE conversation.model END,
                0, turn.audio_path, turn.audio_mime_type, turn.stage, turn.analysis, turn.status
         FROM interview_turns turn
         JOIN interviews conversation ON conversation.id = turn.interview_id;
         INSERT OR IGNORE INTO knowledge_access_log
         (id, conversation_id, message_id, passage_id, relative_path, title, quote, accessed_at)
         SELECT id, interview_id, turn_id, passage_id, relative_path, title, quote, accessed_at
         FROM interview_access_log;
         DROP TABLE interview_access_log;
         DROP TABLE interview_turns;
         DROP TABLE interviews;",
    )?;
    Ok(())
}

pub fn enqueue_capture_enrichment(brain: &Path, session_id: &str) -> AppResult<String> {
    let connection = open_database(brain)?;
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    connection.execute(
        "INSERT INTO background_jobs
         (id, kind, session_id, status, attempts, last_error, created_at, updated_at)
         VALUES (?1, 'capture-enrichment', ?2, 'pending', 0, NULL, ?3, ?3)
         ON CONFLICT(kind, session_id) DO UPDATE SET
           status = 'pending', last_error = NULL, updated_at = excluded.updated_at",
        params![id, session_id, now],
    )?;
    connection
        .query_row(
            "SELECT id FROM background_jobs WHERE kind = 'capture-enrichment' AND session_id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .map_err(Into::into)
}

pub fn start_capture_enrichment_job(brain: &Path, session_id: &str) -> AppResult<String> {
    let connection = open_database(brain)?;
    let now = Utc::now().to_rfc3339();
    let changed = connection.execute(
        "UPDATE background_jobs SET status = 'running', attempts = attempts + 1,
         updated_at = ?1 WHERE kind = 'capture-enrichment' AND session_id = ?2
         AND status IN ('pending', 'failed')",
        params![now, session_id],
    )?;
    if changed == 0 {
        return Err(AppError::InvalidReview(format!(
            "capture enrichment job is not runnable for {session_id}"
        )));
    }
    connection
        .query_row(
            "SELECT id FROM background_jobs WHERE kind = 'capture-enrichment' AND session_id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .map_err(Into::into)
}

pub fn finish_capture_enrichment_job(
    brain: &Path,
    session_id: &str,
    error: Option<&str>,
) -> AppResult<()> {
    let connection = open_database(brain)?;
    connection.execute(
        "UPDATE background_jobs SET status = ?1, last_error = ?2, updated_at = ?3
         WHERE kind = 'capture-enrichment' AND session_id = ?4",
        params![
            if error.is_some() {
                "failed"
            } else {
                "completed"
            },
            error,
            Utc::now().to_rfc3339(),
            session_id
        ],
    )?;
    Ok(())
}

pub fn recover_capture_enrichment_jobs(brain: &Path) -> AppResult<Vec<String>> {
    let connection = open_database(brain)?;
    connection.execute(
        "UPDATE background_jobs SET status = 'pending',
         last_error = COALESCE(last_error, 'The app closed while enrichment was running.'),
         updated_at = ?1 WHERE kind = 'capture-enrichment' AND status = 'running'",
        [Utc::now().to_rfc3339()],
    )?;
    let mut statement = connection.prepare(
        "SELECT session_id FROM background_jobs
         WHERE kind = 'capture-enrichment' AND status = 'pending' ORDER BY created_at",
    )?;
    let rows = statement.query_map([], |row| row.get(0))?;
    rows.collect::<Result<Vec<String>, _>>().map_err(Into::into)
}

#[cfg(test)]
pub fn capture_enrichment_job_state(
    brain: &Path,
    session_id: &str,
) -> AppResult<(String, u32, Option<String>)> {
    open_database(brain)?
        .query_row(
            "SELECT status, attempts, last_error FROM background_jobs
             WHERE kind = 'capture-enrichment' AND session_id = ?1",
            [session_id],
            |row| Ok((row.get(0)?, row.get::<_, i64>(1)? as u32, row.get(2)?)),
        )
        .map_err(Into::into)
}

pub fn configure_brain(app: &AppHandle, requested_path: &str) -> AppResult<AppConfig> {
    let requested = PathBuf::from(requested_path);
    if !requested.is_absolute() {
        return Err(AppError::InvalidBrain(
            "choose an absolute folder path".into(),
        ));
    }
    fs::create_dir_all(&requested)?;
    let brain = requested.canonicalize()?;
    for directory in [
        "sessions",
        "notes",
        "sources",
        "review",
        "hosts",
        "skills/content",
        "projects",
        BRAIN_META_DIR,
    ] {
        fs::create_dir_all(brain.join(directory))?;
    }
    open_database(&brain)?;
    crate::interview::seed_default_hosts(&brain)?;
    crate::content::seed_default_skills(&brain)?;

    let brain_string = brain.to_string_lossy().to_string();
    let mut config = read_config(app)?;
    if !config.brain_folders.contains(&brain_string) {
        config.brain_folders.push(brain_string.clone());
    }
    config.active_brain = Some(brain_string);
    write_config(app, &config)?;
    Ok(config)
}

pub fn list_sessions(brain: &Path) -> AppResult<Vec<CaptureSession>> {
    let connection = open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, title, created_at, updated_at, folder_path, relative_folder,
                status, audio_path, audio_mime_type, audio_bytes, transcript_path,
                transcript, summary, tags_json, processing_error, transcription_provider,
                atomic_notes_json
         FROM sessions ORDER BY created_at DESC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(CaptureSession {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
            folder_path: row.get(4)?,
            relative_folder: row.get(5)?,
            status: row.get(6)?,
            audio_path: row.get(7)?,
            audio_mime_type: row.get(8)?,
            audio_bytes: row.get::<_, Option<i64>>(9)?.map(|value| value as u64),
            transcript_path: row.get(10)?,
            transcript: row.get(11)?,
            summary: row.get(12)?,
            tags: serde_json::from_str(&row.get::<_, String>(13)?).unwrap_or_default(),
            processing_error: row.get(14)?,
            transcription_provider: row.get(15)?,
            atomic_notes: serde_json::from_str(&row.get::<_, String>(16)?).unwrap_or_default(),
        })
    })?;
    let sessions = rows.collect::<Result<Vec<_>, _>>()?;
    for session in &sessions {
        persist_session_files(session)?;
    }
    Ok(sessions)
}

fn session_markdown(session: &CaptureSession) -> String {
    let tags = session
        .tags
        .iter()
        .map(|tag| format!("\"{}\"", tag.replace('"', "")))
        .collect::<Vec<_>>()
        .join(", ");
    let summary = if session.summary.is_empty() {
        "_Summary will be created after transcription._"
    } else {
        &session.summary
    };
    format!(
        "---\nid: {}\ntype: capture\ncreated_at: {}\nstatus: {}\ntranscription_provider: {}\ntags: [{}]\n---\n\n# {}\n\n{}\n\n## Files\n\n- [Transcript](transcript.md)\n- Original audio: {}\n",
        session.id,
        session.created_at,
        session.status,
        session.transcription_provider.as_deref().unwrap_or("none"),
        tags,
        session.title,
        summary,
        session.audio_path.as_deref().unwrap_or("pending")
    )
}

fn persist_session_files(session: &CaptureSession) -> AppResult<()> {
    let folder = Path::new(&session.folder_path);
    fs::write(folder.join("session.md"), session_markdown(session))?;
    fs::write(
        folder.join("session.json"),
        serde_json::to_vec_pretty(session)?,
    )?;
    Ok(())
}

pub fn create_session(brain: &Path) -> AppResult<CaptureSession> {
    let id = Uuid::new_v4().to_string();
    let now_utc = Utc::now();
    let local: DateTime<Local> = DateTime::from(now_utc);
    let slug = format!("{}-voice-capture-{}", local.format("%Y-%m-%d"), &id[..8]);
    let relative_folder = format!("sessions/{slug}");
    let folder = brain.join(&relative_folder);
    fs::create_dir_all(folder.join("extractions"))?;
    let transcript_path = folder.join("transcript.md");
    fs::write(
        &transcript_path,
        "# Transcript\n\n_Transcription has not run yet._\n",
    )?;

    let timestamp = now_utc.to_rfc3339();
    let session = CaptureSession {
        id,
        title: "Untitled voice capture".into(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
        folder_path: folder.to_string_lossy().to_string(),
        relative_folder,
        status: "recording".into(),
        audio_path: None,
        audio_mime_type: None,
        audio_bytes: None,
        transcript_path: transcript_path.to_string_lossy().to_string(),
        transcript: String::new(),
        summary: String::new(),
        tags: Vec::new(),
        processing_error: None,
        transcription_provider: None,
        atomic_notes: Vec::new(),
    };
    persist_session_files(&session)?;

    let connection = open_database(brain)?;
    connection.execute(
        "INSERT INTO sessions (id, title, created_at, updated_at, folder_path, relative_folder,
         status, audio_path, audio_mime_type, audio_bytes, transcript_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            session.id,
            session.title,
            session.created_at,
            session.updated_at,
            session.folder_path,
            session.relative_folder,
            session.status,
            session.audio_path,
            session.audio_mime_type,
            session.audio_bytes.map(|value| value as i64),
            session.transcript_path,
        ],
    )?;
    Ok(session)
}

fn detected_audio_mime_type(requested: &str, bytes: &[u8]) -> &'static str {
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        "audio/wav"
    } else if bytes.starts_with(b"OggS") {
        "audio/ogg"
    } else if bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        "audio/webm"
    } else if bytes.len() >= 8 && &bytes[4..8] == b"ftyp" {
        "audio/mp4"
    } else if requested.contains("wav") {
        "audio/wav"
    } else if requested.contains("mp4") || requested.contains("m4a") {
        "audio/mp4"
    } else if requested.contains("ogg") {
        "audio/ogg"
    } else {
        "audio/webm"
    }
}

fn audio_extension(mime_type: &str) -> &'static str {
    if mime_type.contains("mp4") || mime_type.contains("m4a") {
        "m4a"
    } else if mime_type.contains("ogg") {
        "ogg"
    } else if mime_type.contains("wav") {
        "wav"
    } else {
        "webm"
    }
}

pub fn save_audio(
    brain: &Path,
    session_id: &str,
    mime_type: &str,
    bytes: &[u8],
) -> AppResult<CaptureSession> {
    let connection = open_database(brain)?;
    let (folder, previous_audio): (String, Option<String>) = connection
        .query_row(
            "SELECT folder_path, audio_path FROM sessions WHERE id = ?1",
            [session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => AppError::MissingSession(session_id.into()),
            other => AppError::Database(other),
        })?;
    if bytes.len() <= 44 {
        let message = "The recording was too short to contain audible audio. Hold the button while speaking, then release.";
        connection.execute(
            "UPDATE sessions SET status = 'recording_failed', updated_at = ?1,
             audio_path = NULL, audio_mime_type = NULL, audio_bytes = 0,
             processing_error = ?2 WHERE id = ?3",
            params![Utc::now().to_rfc3339(), message, session_id],
        )?;
        let session = get_session(brain, session_id)?;
        persist_session_files(&session)?;
        if let Some(previous) = previous_audio {
            let previous = PathBuf::from(previous);
            if previous.is_file() {
                let _ = fs::remove_file(previous);
            }
        }
        return Ok(session);
    }
    let mime_type = detected_audio_mime_type(mime_type, bytes);
    let audio_path = Path::new(&folder).join(format!("audio.{}", audio_extension(mime_type)));
    fs::write(&audio_path, bytes)?;
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "UPDATE sessions SET status = 'awaiting_transcription', updated_at = ?1,
         audio_path = ?2, audio_mime_type = ?3, audio_bytes = ?4 WHERE id = ?5",
        params![
            now,
            audio_path.to_string_lossy(),
            mime_type,
            bytes.len() as i64,
            session_id
        ],
    )?;
    if let Some(previous) = previous_audio {
        let previous = PathBuf::from(previous);
        if previous != audio_path && previous.is_file() {
            let _ = fs::remove_file(previous);
        }
    }
    // A snapshot and the final recorder callback can overlap. Remove every
    // partial variant after the canonical file has won the database update.
    if let Ok(entries) = fs::read_dir(&folder) {
        for entry in entries.flatten() {
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with("audio.partial.")
            {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    let session = list_sessions(brain)?
        .into_iter()
        .find(|session| session.id == session_id)
        .ok_or_else(|| AppError::MissingSession(session_id.into()))?;
    persist_session_files(&session)?;
    Ok(session)
}

pub fn save_audio_snapshot(
    brain: &Path,
    session_id: &str,
    mime_type: &str,
    bytes: &[u8],
) -> AppResult<CaptureSession> {
    if bytes.len() <= 44 {
        return get_session(brain, session_id);
    }
    let session = get_session(brain, session_id)?;
    if session.status != "recording" {
        return Ok(session);
    }
    let mime_type = detected_audio_mime_type(mime_type, bytes);
    let audio_path = Path::new(&session.folder_path)
        .join(format!("audio.partial.{}", audio_extension(mime_type)));
    fs::write(&audio_path, bytes)?;
    let connection = open_database(brain)?;
    let changed = connection.execute(
        "UPDATE sessions SET updated_at = ?1, audio_path = ?2, audio_mime_type = ?3,
         audio_bytes = ?4 WHERE id = ?5 AND status = 'recording'",
        params![
            Utc::now().to_rfc3339(),
            audio_path.to_string_lossy(),
            mime_type,
            bytes.len() as i64,
            session_id
        ],
    )?;
    if changed == 0 {
        // The final recording may have completed while this snapshot was being
        // written. It is no longer canonical and must not be left behind.
        let _ = fs::remove_file(&audio_path);
        return get_session(brain, session_id);
    }
    let saved = get_session(brain, session_id)?;
    persist_session_files(&saved)?;
    Ok(saved)
}

pub fn repair_session_audio_format(brain: &Path, session_id: &str) -> AppResult<CaptureSession> {
    let session = get_session(brain, session_id)?;
    let Some(current_path) = session.audio_path.as_deref().map(PathBuf::from) else {
        return Err(AppError::MissingSessionAudio(session_id.into()));
    };
    if !current_path.exists() {
        return Err(AppError::MissingSessionAudio(session_id.into()));
    }
    let mut file = fs::File::open(&current_path)?;
    let mut header = [0_u8; 16];
    let header_length = file.read(&mut header)?;
    let mime_type = detected_audio_mime_type(
        session
            .audio_mime_type
            .as_deref()
            .unwrap_or("application/octet-stream"),
        &header[..header_length],
    );
    let desired_path =
        Path::new(&session.folder_path).join(format!("audio.{}", audio_extension(mime_type)));
    if current_path != desired_path {
        if !desired_path.exists() {
            fs::rename(&current_path, &desired_path)?;
        }
    }
    let connection = open_database(brain)?;
    connection.execute(
        "UPDATE sessions SET audio_path = ?1, audio_mime_type = ?2 WHERE id = ?3",
        params![desired_path.to_string_lossy(), mime_type, session_id],
    )?;
    let repaired = get_session(brain, session_id)?;
    persist_session_files(&repaired)?;
    Ok(repaired)
}

pub fn get_session(brain: &Path, session_id: &str) -> AppResult<CaptureSession> {
    list_sessions(brain)?
        .into_iter()
        .find(|session| session.id == session_id)
        .ok_or_else(|| AppError::MissingSession(session_id.into()))
}

pub fn mark_session_processing(
    brain: &Path,
    session_id: &str,
    status: &str,
    provider: &str,
    error: Option<&str>,
) -> AppResult<CaptureSession> {
    let connection = open_database(brain)?;
    let changed = connection.execute(
        "UPDATE sessions SET status = ?1, updated_at = ?2, transcription_provider = ?3,
         processing_error = ?4 WHERE id = ?5",
        params![status, Utc::now().to_rfc3339(), provider, error, session_id],
    )?;
    if changed == 0 {
        return Err(AppError::MissingSession(session_id.into()));
    }
    let session = get_session(brain, session_id)?;
    persist_session_files(&session)?;
    Ok(session)
}

pub fn mark_recording_failed(
    brain: &Path,
    session_id: &str,
    message: &str,
) -> AppResult<CaptureSession> {
    mark_session_processing(brain, session_id, "recording_failed", "none", Some(message))
}

pub fn save_transcript_for_enrichment(
    brain: &Path,
    session_id: &str,
    provider: &str,
    transcript: &str,
) -> AppResult<CaptureSession> {
    let transcript = transcript.trim();
    let connection = open_database(brain)?;
    let changed = connection.execute(
        "UPDATE sessions SET status = 'tagging', updated_at = ?1, transcript = ?2,
         transcription_provider = ?3, processing_error = NULL WHERE id = ?4",
        params![Utc::now().to_rfc3339(), transcript, provider, session_id],
    )?;
    if changed == 0 {
        return Err(AppError::MissingSession(session_id.into()));
    }
    let session = get_session(brain, session_id)?;
    fs::write(
        &session.transcript_path,
        format!("# Transcript\n\n{}\n", session.transcript),
    )?;
    persist_session_files(&session)?;
    Ok(session)
}

pub fn recover_interrupted_sessions(brain: &Path) -> AppResult<usize> {
    let interrupted = list_sessions(brain)?
        .into_iter()
        .filter(|session| {
            matches!(
                session.status.as_str(),
                "recording" | "transcribing" | "tagging"
            )
        })
        .collect::<Vec<_>>();
    let mut recovered = 0;
    for session in interrupted {
        let provider = session.transcription_provider.as_deref().unwrap_or("none");
        let (status, message) = match session.status.as_str() {
            "recording" if session.audio_path.is_some() => (
                "awaiting_transcription",
                "Recording was interrupted after the original audio was saved. Retry transcription when ready.",
            ),
            "recording" => (
                "recording_failed",
                "Recording was interrupted before original audio could be saved.",
            ),
            "transcribing" if !session.transcript.trim().is_empty() => (
                "enrichment_failed",
                "Processing was interrupted after transcription. Retry local enrichment.",
            ),
            "transcribing" => (
                "transcription_failed",
                "Transcription was interrupted. The original audio remains safe and retryable.",
            ),
            "tagging" => (
                "enrichment_failed",
                "Local enrichment was interrupted. The transcript remains safe and retryable.",
            ),
            _ => continue,
        };
        mark_session_processing(brain, &session.id, status, provider, Some(message))?;
        recovered += 1;
    }
    Ok(recovered)
}

pub fn complete_session_processing(
    brain: &Path,
    session_id: &str,
    provider: &str,
    transcript: &str,
    title: &str,
    summary: &str,
    tags: &[String],
    atomic_note_drafts: &[AtomicNoteDraft],
) -> AppResult<CaptureSession> {
    let mut session = get_session(brain, session_id)?;
    let confidence_review = brain
        .join("review")
        .join(format!("low-confidence-transcript-{}.md", &session.id[..8]));
    if confidence_review.exists() {
        fs::remove_file(confidence_review)?;
    }
    let existing_tags = existing_tags_except(brain, session_id);
    session.status = "ready".into();
    session.updated_at = Utc::now().to_rfc3339();
    session.transcription_provider = Some(provider.into());
    session.processing_error = None;
    session.transcript = transcript.trim().to_string();
    session.title = title.trim().to_string();
    session.summary = summary.trim().to_string();
    session.tags = tags.to_vec();
    if session.atomic_notes.is_empty() {
        session.atomic_notes = persist_atomic_note_proposals(brain, &session, atomic_note_drafts)?;
    }
    persist_uncertain_tag_reviews(brain, &session, &existing_tags)?;

    fs::write(
        &session.transcript_path,
        format!("# Transcript\n\n{}\n", session.transcript),
    )?;
    persist_session_files(&session)?;

    let connection = open_database(brain)?;
    let changed = connection.execute(
        "UPDATE sessions SET title = ?1, status = ?2, updated_at = ?3, transcript = ?4,
         summary = ?5, tags_json = ?6, processing_error = NULL,
         transcription_provider = ?7, atomic_notes_json = ?8 WHERE id = ?9",
        params![
            session.title,
            session.status,
            session.updated_at,
            session.transcript,
            session.summary,
            serde_json::to_string(&session.tags)?,
            provider,
            serde_json::to_string(&session.atomic_notes)?,
            session_id
        ],
    )?;
    if changed == 0 {
        return Err(AppError::MissingSession(session_id.into()));
    }
    Ok(session)
}

fn normalized_tag_shape(value: &str) -> String {
    let mut value = value
        .trim()
        .trim_start_matches('#')
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect::<String>();
    if value.ends_with('s') && value.len() > 4 {
        value.pop();
    }
    value
}

fn edit_distance(left: &str, right: &str) -> usize {
    let right_chars = right.chars().collect::<Vec<_>>();
    let mut previous = (0..=right_chars.len()).collect::<Vec<_>>();
    for (row, left_char) in left.chars().enumerate() {
        let mut current = vec![row + 1];
        for (column, right_char) in right_chars.iter().enumerate() {
            current.push(
                (current[column] + 1)
                    .min(previous[column + 1] + 1)
                    .min(previous[column] + usize::from(left_char != *right_char)),
            );
        }
        previous = current;
    }
    previous[right_chars.len()]
}

fn existing_tags_except(brain: &Path, session_id: &str) -> BTreeSet<String> {
    let note_tags = notes::list(brain)
        .unwrap_or_default()
        .into_iter()
        .flat_map(|note| note.tags);
    let session_tags = list_sessions(brain)
        .unwrap_or_default()
        .into_iter()
        .filter(|session| session.id != session_id)
        .flat_map(|session| session.tags);
    note_tags.chain(session_tags).collect()
}

fn persist_uncertain_tag_reviews(
    brain: &Path,
    session: &CaptureSession,
    existing_tags: &BTreeSet<String>,
) -> AppResult<()> {
    let review = brain.join("review");
    fs::create_dir_all(&review)?;
    for tag in &session.tags {
        let shape = normalized_tag_shape(tag);
        let candidate = existing_tags
            .iter()
            .filter(|candidate| !candidate.eq_ignore_ascii_case(tag))
            .map(|candidate| {
                let distance = edit_distance(&shape, &normalized_tag_shape(candidate));
                (candidate, distance)
            })
            .filter(|(_, distance)| *distance <= 2)
            .min_by_key(|(_, distance)| *distance);
        let Some((replacement, distance)) = candidate else {
            continue;
        };
        let slug = tag
            .chars()
            .map(|character| {
                if character.is_alphanumeric() {
                    character
                } else {
                    '-'
                }
            })
            .collect::<String>()
            .trim_matches('-')
            .to_lowercase();
        let id = format!("uncertain-tag-{}-{slug}", &session.id[..8]);
        let filename = format!("{id}.md");
        if brain
            .join("review/decisions/approved")
            .join(&filename)
            .exists()
            || brain
                .join("review/decisions/denied")
                .join(&filename)
                .exists()
        {
            continue;
        }
        let source = format!("{}/transcript.md", session.relative_folder);
        let confidence = 100_u8.saturating_sub((distance as u8).saturating_mul(12));
        let markdown = format!(
            "---\nid: {id}\ntype: uncertain-tag\nstatus: pending\nsession_id: {}\nsource: {source}\naction: replace-tag\ncurrent_tag: {tag}\nreplacement_tag: {replacement}\nconfidence: {confidence}\n---\n\n# Review tag #{tag}\n\n## What happened\n\nThe new tag is very similar to an existing tag.\n\n## Supporting quote\n\n> {}\n\n## Why it needs attention\n\nKeeping both spellings may fragment browsing and counts. The original tag remains unchanged until approval.\n\n## Proposed action\n\nReplace #{tag} with the existing tag #{replacement} on this capture.\n",
            session.id,
            session.transcript.split_whitespace().take(32).collect::<Vec<_>>().join(" ")
        );
        fs::write(review.join(filename), markdown)?;
    }
    Ok(())
}

pub fn replace_session_tag(
    brain: &Path,
    session_id: &str,
    current: &str,
    replacement: &str,
) -> AppResult<CaptureSession> {
    let mut session = get_session(brain, session_id)?;
    if !session.tags.iter().any(|tag| tag == current) {
        return Err(AppError::InvalidReview(format!(
            "capture no longer contains tag #{current}"
        )));
    }
    session.tags = session
        .tags
        .into_iter()
        .map(|tag| {
            if tag == current {
                replacement.to_string()
            } else {
                tag
            }
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let connection = open_database(brain)?;
    connection.execute(
        "UPDATE sessions SET tags_json = ?1, updated_at = ?2 WHERE id = ?3",
        params![
            serde_json::to_string(&session.tags)?,
            Utc::now().to_rfc3339(),
            session_id
        ],
    )?;
    let saved = get_session(brain, session_id)?;
    persist_session_files(&saved)?;
    crate::search::rebuild_index(brain)?;
    Ok(saved)
}

fn safe_title(title: &str) -> AppResult<String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 120 || title.contains(['\n', '\r']) {
        return Err(AppError::InvalidCaptureTitle(
            "use a title between 1 and 120 characters on one line".into(),
        ));
    }
    Ok(title.to_string())
}

pub fn rename_session(brain: &Path, session_id: &str, title: &str) -> AppResult<CaptureSession> {
    let title = safe_title(title)?;
    let connection = open_database(brain)?;
    let changed = connection.execute(
        "UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, Utc::now().to_rfc3339(), session_id],
    )?;
    if changed == 0 {
        return Err(AppError::MissingSession(session_id.into()));
    }
    let session = get_session(brain, session_id)?;
    persist_session_files(&session)?;
    Ok(session)
}

pub fn trash_session(brain: &Path, session_id: &str, trash_folder: &Path) -> AppResult<()> {
    let session = get_session(brain, session_id)?;
    fs::create_dir_all(trash_folder)?;
    let source = PathBuf::from(&session.folder_path);
    if !source.exists() {
        return Err(AppError::MissingSession(session_id.into()));
    }
    let original_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("second-brain-capture");
    let mut destination = trash_folder.join(original_name);
    if destination.exists() {
        destination = trash_folder.join(format!("{original_name}-{}", &session.id[..8]));
    }
    fs::rename(&source, &destination)?;
    let connection = open_database(brain)?;
    if let Err(error) = connection.execute("DELETE FROM sessions WHERE id = ?1", [session_id]) {
        let _ = fs::rename(&destination, &source);
        return Err(error.into());
    }
    for proposal in &session.atomic_notes {
        let review_path = brain.join(&proposal.review_relative_path);
        if review_path.exists() {
            let _ = fs::remove_file(review_path);
        }
    }
    let _ = crate::search::rebuild_index(brain);
    Ok(())
}

pub fn apply_audio_retention(
    brain: &Path,
    days: Option<u32>,
    trash_folder: &Path,
) -> AppResult<(usize, u64)> {
    let Some(days) = days else {
        return Ok((0, 0));
    };
    fs::create_dir_all(trash_folder)?;
    let cutoff = Utc::now() - chrono::Duration::days(i64::from(days));
    let candidates = list_sessions(brain)?
        .into_iter()
        .filter(|session| session.status == "ready" && session.audio_path.is_some())
        .filter(|session| {
            DateTime::parse_from_rfc3339(&session.created_at)
                .map(|created| created.with_timezone(&Utc) <= cutoff)
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    let mut removed_files = 0;
    let mut removed_bytes = 0;
    for session in candidates {
        let source = PathBuf::from(session.audio_path.as_deref().unwrap_or_default());
        if !source.is_file() || !source.starts_with(&session.folder_path) {
            continue;
        }
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("audio");
        let mut destination = trash_folder.join(format!(
            "second-brain-audio-{}.{}",
            &session.id[..8],
            extension
        ));
        if destination.exists() {
            destination = trash_folder.join(format!(
                "second-brain-audio-{}-{}.{}",
                &session.id[..8],
                Utc::now().timestamp_millis(),
                extension
            ));
        }
        fs::rename(&source, &destination)?;
        let connection = open_database(brain)?;
        if let Err(error) = connection.execute(
            "UPDATE sessions SET audio_path = NULL, audio_bytes = NULL, updated_at = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), session.id],
        ) {
            let _ = fs::rename(&destination, &source);
            return Err(error.into());
        }
        removed_files += 1;
        removed_bytes += session.audio_bytes.unwrap_or(0);
        persist_session_files(&get_session(brain, &session.id)?)?;
    }
    let interview_audio = {
        let connection = open_database(brain)?;
        let mut statement = connection.prepare(
            "SELECT message.id, message.audio_path, conversation.folder_path FROM messages message
             JOIN conversations conversation ON conversation.id = message.conversation_id
             WHERE conversation.kind = 'interview' AND message.status = 'complete'
             AND message.audio_path IS NOT NULL AND message.created_at <= ?1",
        )?;
        let rows = statement.query_map([cutoff.to_rfc3339()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    for (turn_id, audio_path, folder_path) in interview_audio {
        let source = PathBuf::from(audio_path);
        if !source.is_file() || !source.starts_with(&folder_path) {
            continue;
        }
        let bytes = fs::metadata(&source).map(|metadata| metadata.len()).unwrap_or(0);
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("audio");
        let prefix = &turn_id[..8.min(turn_id.len())];
        let mut destination = trash_folder.join(format!(
            "second-brain-interview-audio-{prefix}.{extension}"
        ));
        if destination.exists() {
            destination = trash_folder.join(format!(
                "second-brain-interview-audio-{prefix}-{}.{}",
                Utc::now().timestamp_millis(),
                extension
            ));
        }
        fs::rename(&source, &destination)?;
        let connection = open_database(brain)?;
        if let Err(error) = connection.execute(
            "UPDATE messages SET audio_path = NULL, audio_mime_type = NULL WHERE id = ?1",
            [&turn_id],
        ) {
            let _ = fs::rename(&destination, &source);
            return Err(error.into());
        }
        removed_files += 1;
        removed_bytes += bytes;
    }
    Ok((removed_files, removed_bytes))
}

pub fn update_atomic_proposal_status(
    brain: &Path,
    session_id: &str,
    proposal_id: &str,
    status: &str,
) -> AppResult<()> {
    let mut session = get_session(brain, session_id)?;
    let proposal = session
        .atomic_notes
        .iter_mut()
        .find(|proposal| proposal.id == proposal_id)
        .ok_or_else(|| AppError::MissingReviewItem(proposal_id.into()))?;
    proposal.status = status.into();
    let extraction_name = Path::new(&proposal.review_relative_path)
        .file_name()
        .map(|value| value.to_owned());
    let connection = open_database(brain)?;
    connection.execute(
        "UPDATE sessions SET atomic_notes_json = ?1, updated_at = ?2 WHERE id = ?3",
        params![
            serde_json::to_string(&session.atomic_notes)?,
            Utc::now().to_rfc3339(),
            session_id
        ],
    )?;
    if let Some(filename) = extraction_name {
        let path = Path::new(&session.folder_path)
            .join("extractions")
            .join(filename);
        if path.exists() {
            let markdown = fs::read_to_string(&path)?;
            fs::write(
                path,
                markdown.replacen("status: pending", &format!("status: {status}"), 1),
            )?;
        }
    }
    let session = get_session(brain, session_id)?;
    persist_session_files(&session)?;
    Ok(())
}

pub fn save_edited_transcript(
    brain: &Path,
    session_id: &str,
    transcript: &str,
    preparing_enrichment: bool,
) -> AppResult<CaptureSession> {
    let transcript = transcript.trim();
    if transcript.is_empty() {
        return Err(AppError::InvalidReview("transcript cannot be empty".into()));
    }
    if transcript.len() > 2_000_000 {
        return Err(AppError::InvalidReview(
            "transcript is larger than the 2 MB editing limit".into(),
        ));
    }
    let mut session = get_session(brain, session_id)?;
    let confidence_review = brain
        .join("review")
        .join(format!("low-confidence-transcript-{}.md", &session.id[..8]));
    if confidence_review.exists() {
        fs::remove_file(confidence_review)?;
    }
    fs::write(
        &session.transcript_path,
        format!("# Transcript\n\n{transcript}\n"),
    )?;
    if preparing_enrichment {
        for proposal in &session.atomic_notes {
            if proposal.status != "pending" {
                continue;
            }
            let review_path = brain.join(&proposal.review_relative_path);
            if review_path.exists() {
                fs::remove_file(review_path)?;
            }
            if let Some(filename) = Path::new(&proposal.review_relative_path).file_name() {
                let extraction = Path::new(&session.folder_path)
                    .join("extractions")
                    .join(filename);
                if extraction.exists() {
                    fs::remove_file(extraction)?;
                }
            }
        }
        session.atomic_notes.clear();
    }
    let connection = open_database(brain)?;
    connection.execute(
        "UPDATE sessions SET transcript = ?1, status = ?2, updated_at = ?3,
         processing_error = NULL, atomic_notes_json = ?4 WHERE id = ?5",
        params![
            transcript,
            if preparing_enrichment {
                "tagging"
            } else {
                "ready"
            },
            Utc::now().to_rfc3339(),
            serde_json::to_string(&session.atomic_notes)?,
            session_id
        ],
    )?;
    let saved = get_session(brain, session_id)?;
    persist_session_files(&saved)?;
    crate::search::rebuild_index(brain)?;
    Ok(saved)
}

fn proposal_markdown(session: &CaptureSession, proposal: &AtomicNoteProposal) -> String {
    let target = proposal.matched_note_path.as_deref().unwrap_or("");
    let confidence = proposal
        .confidence
        .map(|value| value.to_string())
        .unwrap_or_default();
    let item_type = if proposal.suggested_action == "contradiction" {
        "contradiction"
    } else {
        "atomic-note"
    };
    format!(
        "---\nid: {}\ntype: {}\nstatus: pending\nsession_id: {}\nsource: {}\naction: {}\nmatched_note: {}\nconfidence: {}\n---\n\n# New atomic note: {}\n\n## Proposed note\n\n{}\n\n## Supporting quote\n\n> {}\n\nNo canonical content has changed yet. Approve or deny this proposal in Review.\n",
        proposal.id,
        item_type,
        session.id,
        proposal.source_relative_path,
        proposal.suggested_action,
        target,
        confidence,
        proposal.title,
        proposal.content,
        proposal.quote.replace('\n', " ")
    )
}

fn comparison_terms(value: &str) -> BTreeSet<String> {
    value
        .split(|character: char| !character.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|term| term.len() >= 3)
        .filter(|term| {
            !matches!(
                term.as_str(),
                "the"
                    | "and"
                    | "that"
                    | "this"
                    | "with"
                    | "from"
                    | "have"
                    | "will"
                    | "your"
                    | "into"
                    | "when"
                    | "then"
                    | "before"
                    | "after"
            )
        })
        .collect()
}

fn similarity(left: &str, right: &str) -> f64 {
    let left = comparison_terms(left);
    let right = comparison_terms(right);
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let intersection = left.intersection(&right).count() as f64;
    let union = left.union(&right).count() as f64;
    intersection / union
}

fn contains_negation(value: &str) -> bool {
    value
        .split(|character: char| !character.is_alphanumeric() && character != '\'')
        .map(str::to_lowercase)
        .any(|term| {
            matches!(
                term.as_str(),
                "no" | "not" | "never" | "cannot" | "can't" | "isn't" | "doesn't" | "won't"
            )
        })
}

fn suggested_note_action(
    brain: &Path,
    draft: &AtomicNoteDraft,
) -> (String, Option<String>, Option<u8>) {
    let best = notes::list(brain)
        .unwrap_or_default()
        .into_iter()
        .map(|note| {
            let score = similarity(&draft.content, &format!("{} {}", note.title, note.body));
            let conflicting_polarity =
                contains_negation(&draft.content) != contains_negation(&note.body);
            (note.relative_path, score, conflicting_polarity)
        })
        .max_by(|left, right| left.1.total_cmp(&right.1));
    let Some((path, score, conflicting_polarity)) = best else {
        return ("create".into(), None, None);
    };
    let confidence = Some((score * 100.0).round().clamp(0.0, 100.0) as u8);
    if score >= 0.42 && conflicting_polarity {
        ("contradiction".into(), Some(path), confidence)
    } else if score >= 0.82 {
        ("append-source".into(), Some(path), confidence)
    } else if score >= 0.48 {
        ("merge".into(), Some(path), confidence)
    } else {
        ("create".into(), None, confidence)
    }
}

fn persist_atomic_note_proposals(
    brain: &Path,
    session: &CaptureSession,
    drafts: &[AtomicNoteDraft],
) -> AppResult<Vec<AtomicNoteProposal>> {
    let review_folder = brain.join("review");
    let extraction_folder = Path::new(&session.folder_path).join("extractions");
    fs::create_dir_all(&review_folder)?;
    fs::create_dir_all(&extraction_folder)?;
    let source_relative_path = format!("{}/transcript.md", session.relative_folder);
    drafts
        .iter()
        .map(|draft| {
            let (suggested_action, matched_note_path, confidence) =
                suggested_note_action(brain, draft);
            let id = Uuid::new_v4().to_string();
            let filename = format!("atomic-note-{}.md", &id[..8]);
            let review_relative_path = format!("review/{filename}");
            let proposal = AtomicNoteProposal {
                id,
                title: draft.title.clone(),
                content: draft.content.clone(),
                source_relative_path: source_relative_path.clone(),
                quote: draft.quote.clone(),
                review_relative_path,
                status: "pending".into(),
                suggested_action,
                matched_note_path,
                confidence,
            };
            let markdown = proposal_markdown(session, &proposal);
            fs::write(review_folder.join(&filename), &markdown)?;
            fs::write(extraction_folder.join(&filename), markdown)?;
            Ok(proposal)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_session_persists_human_readable_files_and_audio_metadata() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        for directory in ["sessions", "notes", "review", "hosts"] {
            fs::create_dir_all(brain.join(directory)).expect("brain directory");
        }

        let created = create_session(brain).expect("session should be created");
        assert_eq!(created.status, "recording");
        assert!(Path::new(&created.folder_path).join("session.md").exists());
        assert!(Path::new(&created.transcript_path).exists());
        assert!(Path::new(&created.folder_path).join("extractions").is_dir());

        let audio = vec![7_u8; 128];
        let saved = save_audio(brain, &created.id, "audio/mp4", &audio).expect("audio should save");
        assert_eq!(saved.status, "awaiting_transcription");
        assert_eq!(saved.audio_bytes, Some(audio.len() as u64));
        assert!(Path::new(saved.audio_path.as_deref().expect("audio path")).exists());

        let session_json = fs::read_to_string(Path::new(&saved.folder_path).join("session.json"))
            .expect("session json");
        assert!(session_json.contains("awaiting_transcription"));
        assert!(brain.join(BRAIN_META_DIR).join(DB_FILE).exists());
        assert_eq!(list_sessions(brain).expect("sessions").len(), 1);
    }

    #[test]
    fn rolling_audio_snapshot_survives_interruption_and_final_audio_replaces_it() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        let interrupted = create_session(brain).expect("interrupted session");
        let snapshot = vec![7_u8; 256];

        let snapshotted = save_audio_snapshot(
            brain,
            &interrupted.id,
            "audio/wav",
            &snapshot,
        )
        .expect("snapshot should persist");
        let snapshot_path = PathBuf::from(
            snapshotted
                .audio_path
                .as_deref()
                .expect("snapshot audio path"),
        );
        assert_eq!(snapshotted.status, "recording");
        assert!(snapshot_path.is_file());
        assert!(snapshot_path
            .file_name()
            .expect("snapshot filename")
            .to_string_lossy()
            .starts_with("audio.partial."));

        assert_eq!(recover_interrupted_sessions(brain).expect("recovery"), 1);
        let recovered = get_session(brain, &interrupted.id).expect("recovered session");
        assert_eq!(recovered.status, "awaiting_transcription");
        assert!(snapshot_path.is_file());

        let completed = create_session(brain).expect("completed session");
        let partial = save_audio_snapshot(brain, &completed.id, "audio/wav", &snapshot)
            .expect("partial audio");
        let partial_path = PathBuf::from(partial.audio_path.expect("partial path"));
        let final_audio = vec![9_u8; 512];
        let finalized = save_audio(brain, &completed.id, "audio/wav", &final_audio)
            .expect("final audio");
        assert_eq!(finalized.status, "awaiting_transcription");
        assert_eq!(finalized.audio_bytes, Some(final_audio.len() as u64));
        assert!(!partial_path.exists());
        assert!(Path::new(finalized.audio_path.as_deref().expect("final path")).is_file());
    }

    #[test]
    fn marks_header_only_audio_as_a_visible_recording_failure() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        let created = create_session(brain).expect("session should be created");
        let header_only = [0_u8; 44];

        let failed = save_audio(brain, &created.id, "audio/wav", &header_only)
            .expect("short recordings should remain inspectable");

        assert_eq!(failed.status, "recording_failed");
        assert!(failed.audio_path.is_none());
        assert!(failed
            .processing_error
            .as_deref()
            .expect("clear failure")
            .contains("too short"));
    }

    #[test]
    fn recovers_interrupted_capture_states_on_startup() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();

        let recording = create_session(brain).expect("recording session");

        let transcribing = create_session(brain).expect("transcribing session");
        save_audio(brain, &transcribing.id, "audio/mp4", &[5_u8; 128]).expect("audio");
        mark_session_processing(brain, &transcribing.id, "transcribing", "test", None)
            .expect("transcribing");

        let tagging = create_session(brain).expect("tagging session");
        save_audio(brain, &tagging.id, "audio/mp4", &[6_u8; 128]).expect("audio");
        save_transcript_for_enrichment(
            brain,
            &tagging.id,
            "test",
            "A transcript that was saved before enrichment was interrupted.",
        )
        .expect("tagging");

        assert_eq!(recover_interrupted_sessions(brain).expect("recovery"), 3);
        assert_eq!(
            get_session(brain, &recording.id).expect("recording").status,
            "recording_failed"
        );
        assert_eq!(
            get_session(brain, &transcribing.id)
                .expect("transcribing")
                .status,
            "transcription_failed"
        );
        let recovered_tagging = get_session(brain, &tagging.id).expect("tagging");
        assert_eq!(recovered_tagging.status, "enrichment_failed");
        assert!(recovered_tagging
            .transcript
            .contains("saved before enrichment"));
    }

    #[test]
    fn detects_wave_audio_even_when_webview_sends_a_generic_mime_type() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        let created = create_session(brain).expect("session should be created");
        let mut wave = b"RIFF\x24\x00\x00\x00WAVEfmt ".to_vec();
        wave.extend_from_slice(&[0; 32]);

        let saved = save_audio(brain, &created.id, "application/octet-stream", &wave)
            .expect("wave should save");

        assert_eq!(saved.audio_mime_type.as_deref(), Some("audio/wav"));
        assert!(saved
            .audio_path
            .as_deref()
            .expect("audio path")
            .ends_with("audio.wav"));
    }

    #[test]
    fn repairs_absolute_session_paths_after_the_brain_folder_moves() {
        let temporary = tempfile::tempdir().expect("temporary root");
        let original = temporary.path().join("original-brain");
        let moved = temporary.path().join("moved-brain");
        fs::create_dir_all(&original).expect("original brain");
        let created = create_session(&original).expect("session should be created");
        let mut wave = b"RIFF\x24\x00\x00\x00WAVEfmt ".to_vec();
        wave.extend_from_slice(&[0; 32]);
        save_audio(&original, &created.id, "application/octet-stream", &wave)
            .expect("audio should save");
        fs::rename(&original, &moved).expect("brain should move");

        let repaired = list_sessions(&moved).expect("moved brain should open");

        assert_eq!(repaired.len(), 1);
        assert!(repaired[0]
            .folder_path
            .starts_with(&moved.to_string_lossy().to_string()));
        assert!(repaired[0]
            .transcript_path
            .starts_with(&moved.to_string_lossy().to_string()));
        assert!(repaired[0]
            .audio_path
            .as_deref()
            .expect("audio path")
            .starts_with(&moved.to_string_lossy().to_string()));
    }

    #[test]
    fn renames_readable_metadata_and_moves_deleted_sessions_to_trash() {
        let temporary = tempfile::tempdir().expect("temporary root");
        let brain = temporary.path().join("brain");
        let trash = temporary.path().join("trash");
        fs::create_dir_all(&brain).expect("brain");
        let created = create_session(&brain).expect("session");

        let renamed = rename_session(&brain, &created.id, "A durable capture title")
            .expect("rename should persist");
        assert_eq!(renamed.title, "A durable capture title");
        assert!(
            fs::read_to_string(Path::new(&renamed.folder_path).join("session.md"))
                .expect("session markdown")
                .contains("# A durable capture title")
        );

        let original_folder = PathBuf::from(&renamed.folder_path);
        trash_session(&brain, &created.id, &trash).expect("session should move to trash");
        assert!(!original_folder.exists());
        assert_eq!(
            list_sessions(&brain)
                .expect("sessions after deletion")
                .len(),
            0
        );
        assert_eq!(fs::read_dir(&trash).expect("trash directory").count(), 1);
    }

    #[test]
    fn transcript_edits_are_canonical_and_reorganization_replaces_only_pending_proposals() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        for directory in [
            "sessions",
            "notes",
            "review",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(directory)).expect("brain directory");
        }
        let created = create_session(brain).expect("session");
        save_audio(brain, &created.id, "audio/wav", &[8_u8; 128]).expect("audio");
        let enriched = crate::capture::finalize_transcript_for_test(
            brain,
            &created.id,
            "The first canonical transcript creates a pending atomic proposal.",
        )
        .expect("enrichment");
        assert!(!enriched.atomic_notes.is_empty());
        let proposal_path = brain.join(&enriched.atomic_notes[0].review_relative_path);

        let wording_only = save_edited_transcript(
            brain,
            &created.id,
            "The user corrected this exact canonical wording.",
            false,
        )
        .expect("wording edit");
        assert_eq!(
            wording_only.transcript,
            "The user corrected this exact canonical wording."
        );
        assert_eq!(wording_only.atomic_notes.len(), enriched.atomic_notes.len());
        assert!(proposal_path.exists());
        assert!(fs::read_to_string(&wording_only.transcript_path)
            .expect("transcript file")
            .contains("The user corrected this exact canonical wording."));

        let reorganizing = save_edited_transcript(
            brain,
            &created.id,
            "The user requests new derived organization from this wording.",
            true,
        )
        .expect("reorganize edit");
        assert_eq!(reorganizing.status, "tagging");
        assert!(reorganizing.atomic_notes.is_empty());
        assert!(!proposal_path.exists());
    }

    #[test]
    fn audio_retention_moves_only_ready_audio_to_recoverable_trash() {
        let temporary = tempfile::tempdir().expect("temporary root");
        let brain = temporary.path().join("brain");
        let trash = temporary.path().join("trash");
        fs::create_dir_all(&brain).expect("brain");
        let created = create_session(&brain).expect("session");
        save_audio(&brain, &created.id, "audio/wav", &[9_u8; 128]).expect("audio");
        save_edited_transcript(
            &brain,
            &created.id,
            "A retained canonical transcript.",
            false,
        )
        .expect("ready transcript");
        let interview_folder = brain.join("sessions/interview-retention-test");
        fs::create_dir_all(interview_folder.join("audio")).expect("interview audio folder");
        let interview_audio = interview_folder.join("audio/turn.wav");
        fs::write(&interview_audio, [4_u8; 64]).expect("interview audio");
        let old = (Utc::now() - chrono::Duration::seconds(1)).to_rfc3339();
        let connection = open_database(&brain).expect("database");
        connection.execute(
            "INSERT INTO conversations (id, kind, title, host_id, host_name, scope, selected_paths_json,
             created_at, updated_at, status, folder_path, relative_folder, provider, model, preview)
             VALUES ('interview-retention', 'interview', 'Retention interview', 'host', 'Host', 'session', '[]',
             ?1, ?1, 'complete', ?2, 'sessions/interview-retention-test', 'local', 'test', '')",
            params![old, interview_folder.to_string_lossy()],
        ).expect("interview");
        connection.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at, audio_path,
             audio_mime_type, citations_json, stage, analysis, status, provider, model, general_knowledge_used)
             VALUES ('turn-retention', 'interview-retention', 'user', 'Preserved transcript', ?1,
             ?2, 'audio/wav', '[]', '', '', 'complete', 'user', 'human', 0)",
            params![old, interview_audio.to_string_lossy()],
        ).expect("interview turn");

        assert_eq!(
            apply_audio_retention(&brain, None, &trash).expect("forever"),
            (0, 0)
        );
        assert!(get_session(&brain, &created.id)
            .expect("session")
            .audio_path
            .is_some());
        let removed = apply_audio_retention(&brain, Some(0), &trash).expect("expire");
        assert_eq!(removed, (2, 192));
        let session = get_session(&brain, &created.id).expect("session");
        assert!(session.audio_path.is_none());
        assert!(session.transcript.contains("retained canonical"));
        let retained_interview_audio: Option<String> = open_database(&brain)
            .expect("database")
            .query_row(
                "SELECT audio_path FROM messages WHERE id = 'turn-retention'",
                [],
                |row| row.get(0),
            )
            .expect("retained interview turn");
        assert!(retained_interview_audio.is_none());
        assert_eq!(fs::read_dir(trash).expect("trash").count(), 2);
    }

    #[test]
    fn migrates_legacy_interview_tables_into_canonical_conversations_once() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join(BRAIN_META_DIR)).expect("metadata");
        let connection = Connection::open(brain_database(brain)).expect("legacy database");
        connection.execute_batch(
            "CREATE TABLE interviews (id TEXT PRIMARY KEY, title TEXT NOT NULL, host_id TEXT NOT NULL,
             host_name TEXT NOT NULL, scope TEXT NOT NULL, selected_paths_json TEXT NOT NULL,
             created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL,
             folder_path TEXT NOT NULL, relative_folder TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL);
             CREATE TABLE interview_turns (id TEXT PRIMARY KEY, interview_id TEXT NOT NULL, role TEXT NOT NULL,
             content TEXT NOT NULL, created_at TEXT NOT NULL, audio_path TEXT, audio_mime_type TEXT,
             citations_json TEXT NOT NULL, stage TEXT NOT NULL, analysis TEXT NOT NULL, status TEXT NOT NULL);
             CREATE TABLE interview_access_log (id TEXT PRIMARY KEY, interview_id TEXT NOT NULL,
             turn_id TEXT NOT NULL, passage_id TEXT NOT NULL, title TEXT NOT NULL,
             relative_path TEXT NOT NULL, quote TEXT NOT NULL, accessed_at TEXT NOT NULL);
             INSERT INTO interviews VALUES ('legacy', 'Legacy interview', 'host', 'Host', 'all', '[]',
             '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'active', '/tmp/legacy',
             'sessions/legacy', 'local-interviewer', 'guided-v1');
             INSERT INTO interview_turns VALUES ('legacy-turn', 'legacy', 'host', 'Opening?',
             '2026-01-01T00:00:00Z', NULL, NULL, '[]', 'context', 'opening', 'complete');
             INSERT INTO interview_access_log VALUES ('legacy-access', 'legacy', 'legacy-turn',
             'passage', 'Source', 'notes/source.md', 'Evidence', '2026-01-01T00:00:00Z');",
        ).expect("legacy schema");
        drop(connection);

        let migrated = open_database(brain).expect("migrate");
        assert_eq!(migrated.query_row("SELECT kind FROM conversations WHERE id = 'legacy'", [], |row| row.get::<_, String>(0)).expect("conversation"), "interview");
        assert_eq!(migrated.query_row("SELECT stage FROM messages WHERE id = 'legacy-turn'", [], |row| row.get::<_, String>(0)).expect("message"), "context");
        assert_eq!(migrated.query_row("SELECT quote FROM knowledge_access_log WHERE id = 'legacy-access'", [], |row| row.get::<_, String>(0)).expect("access"), "Evidence");
        let old_table_count: i64 = migrated.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('interviews', 'interview_turns', 'interview_access_log')",
            [],
            |row| row.get(0),
        ).expect("old tables");
        assert_eq!(old_table_count, 0);
    }
}
