use crate::domain::{
    AppConfig, SaveSyncCredentialsInput, SyncFileDescriptor, SyncManifest, SyncState,
    SyncWriteOutcome, WriteSyncedFileInput,
};
use crate::error::{AppError, AppResult};
use crate::storage;
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;
use uuid::Uuid;

const KEYCHAIN_SERVICE: &str = "com.secondbrain.sync.access-token";
const MANIFEST_FILE: &str = "sync-manifest.json";

fn normalized_service_url(value: &str) -> AppResult<String> {
    let candidate = value.trim();
    let parsed = reqwest::Url::parse(candidate)
        .map_err(|_| AppError::InvalidSync("enter a valid sync service URL".into()))?;
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(AppError::InvalidSync(
            "the sync service URL must not contain credentials".into(),
        ));
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(AppError::InvalidSync(
            "the sync service URL must not contain a query or fragment".into(),
        ));
    }
    let local_http = parsed.scheme() == "http"
        && matches!(
            parsed.host_str(),
            Some("localhost" | "127.0.0.1" | "::1" | "[::1]")
        );
    if parsed.scheme() != "https" && !local_http {
        return Err(AppError::InvalidSync(
            "use HTTPS, except for a localhost development service".into(),
        ));
    }
    Ok(candidate.trim_end_matches('/').to_string())
}

fn device_id(config: &AppConfig) -> String {
    config
        .sync_device_id
        .clone()
        .unwrap_or_else(|| format!("mac-{}", Uuid::new_v4()))
}

fn keychain_account(config: &AppConfig) -> AppResult<&str> {
    config
        .sync_account_email
        .as_deref()
        .ok_or(AppError::MissingSyncCredential)
}

#[cfg(target_os = "macos")]
fn store_keychain(account: &str, token: &str) -> AppResult<()> {
    let status = Command::new("security")
        .args([
            "add-generic-password",
            "-a",
            account,
            "-s",
            KEYCHAIN_SERVICE,
            "-w",
            token,
            "-U",
        ])
        .status()?;
    if !status.success() {
        return Err(AppError::InvalidSync(
            "macOS Keychain refused the access token".into(),
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn store_keychain(_account: &str, _token: &str) -> AppResult<()> {
    Err(AppError::InvalidSync(
        "secure credential storage is not configured on this platform".into(),
    ))
}

#[cfg(target_os = "macos")]
fn read_keychain(account: &str) -> AppResult<String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-a",
            account,
            "-s",
            KEYCHAIN_SERVICE,
            "-w",
        ])
        .output()?;
    if !output.status.success() {
        return Err(AppError::MissingSyncCredential);
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(not(target_os = "macos"))]
fn read_keychain(_account: &str) -> AppResult<String> {
    Err(AppError::MissingSyncCredential)
}

#[cfg(target_os = "macos")]
fn delete_keychain(account: &str) {
    let _ = Command::new("security")
        .args([
            "delete-generic-password",
            "-a",
            account,
            "-s",
            KEYCHAIN_SERVICE,
        ])
        .status();
}

#[cfg(not(target_os = "macos"))]
fn delete_keychain(_account: &str) {}

fn state_from_config(config: &AppConfig) -> SyncState {
    let has_access_token = config.sync_enabled && config.sync_account_email.is_some();
    SyncState {
        service_url: config.sync_service_url.clone(),
        account_email: config.sync_account_email.clone(),
        key_salt: config.sync_key_salt.clone(),
        token_expires_at: config.sync_token_expires_at.clone(),
        enabled: config.sync_enabled,
        device_id: device_id(config),
        last_sync_at: config.last_sync_at.clone(),
        has_access_token,
    }
}

pub fn get_state(app: &AppHandle) -> AppResult<SyncState> {
    let mut config = storage::read_config(app)?;
    if config.sync_device_id.is_none() {
        config.sync_device_id = Some(device_id(&config));
        storage::write_config(app, &config)?;
    }
    Ok(state_from_config(&config))
}

pub fn save_credentials(app: &AppHandle, input: &SaveSyncCredentialsInput) -> AppResult<SyncState> {
    let service_url = normalized_service_url(&input.service_url)?;
    if input.email.trim().is_empty()
        || input.key_salt.trim().is_empty()
        || input.access_token.trim().is_empty()
    {
        return Err(AppError::InvalidSync(
            "the service response is missing account or key information".into(),
        ));
    }
    let mut config = storage::read_config(app)?;
    if let Some(previous) = config.sync_account_email.as_deref() {
        if previous != input.email.trim() {
            delete_keychain(previous);
        }
    }
    store_keychain(input.email.trim(), input.access_token.trim())?;
    config.sync_service_url = Some(service_url);
    config.sync_account_email = Some(input.email.trim().to_lowercase());
    config.sync_key_salt = Some(input.key_salt.clone());
    config.sync_token_expires_at = Some(input.expires_at.clone());
    config.sync_enabled = true;
    if config.sync_device_id.is_none() {
        config.sync_device_id = Some(device_id(&config));
    }
    storage::write_config(app, &config)?;
    Ok(state_from_config(&config))
}

pub fn access_token(app: &AppHandle) -> AppResult<String> {
    let config = storage::read_config(app)?;
    read_keychain(keychain_account(&config)?)
}

pub fn clear_credentials(app: &AppHandle) -> AppResult<SyncState> {
    let mut config = storage::read_config(app)?;
    if let Some(account) = config.sync_account_email.as_deref() {
        delete_keychain(account);
    }
    config.sync_service_url = None;
    config.sync_account_email = None;
    config.sync_key_salt = None;
    config.sync_token_expires_at = None;
    config.sync_enabled = false;
    storage::write_config(app, &config)?;
    Ok(state_from_config(&config))
}

fn safe_relative_path(relative_path: &str) -> AppResult<PathBuf> {
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
        || path
            .components()
            .next()
            .is_some_and(|component| component.as_os_str() == ".second-brain")
    {
        return Err(AppError::UnsafeSyncPath(relative_path.into()));
    }
    Ok(path.to_path_buf())
}

fn hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn mime_type(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("md" | "txt") => "text/markdown",
        Some("json") => "application/json",
        Some("m4a" | "mp4") => "audio/mp4",
        Some("wav") => "audio/wav",
        Some("webm") => "audio/webm",
        Some("ogg") => "audio/ogg",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        _ => "application/octet-stream",
    }
}

fn collect_files(
    directory: &Path,
    brain: &Path,
    files: &mut Vec<SyncFileDescriptor>,
) -> AppResult<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let relative = path
            .strip_prefix(brain)
            .map_err(|_| AppError::UnsafeSyncPath(path.to_string_lossy().into()))?;
        if relative
            .components()
            .next()
            .is_some_and(|component| component.as_os_str() == ".second-brain")
            || relative.starts_with("review/sync-conflicts")
        {
            continue;
        }
        if path.is_dir() {
            collect_files(&path, brain, files)?;
        } else if path.is_file() {
            let bytes = fs::read(&path)?;
            let metadata = fs::metadata(&path)?;
            let modified: DateTime<Utc> = metadata
                .modified()
                .map(DateTime::from)
                .unwrap_or_else(|_| Utc::now());
            files.push(SyncFileDescriptor {
                relative_path: relative.to_string_lossy().to_string(),
                size: bytes.len() as u64,
                modified_at: modified.to_rfc3339(),
                content_hash: hash_bytes(&bytes),
                mime_type: mime_type(&path).into(),
            });
        }
    }
    Ok(())
}

pub fn list_files(brain: &Path) -> AppResult<Vec<SyncFileDescriptor>> {
    let mut files = Vec::new();
    collect_files(brain, brain, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

pub fn read_file(brain: &Path, relative_path: &str) -> AppResult<Vec<u8>> {
    let relative = safe_relative_path(relative_path)?;
    let path = brain.join(relative);
    let canonical_brain = brain.canonicalize()?;
    let canonical_file = path.canonicalize()?;
    if !canonical_file.starts_with(canonical_brain) {
        return Err(AppError::UnsafeSyncPath(relative_path.into()));
    }
    Ok(fs::read(canonical_file)?)
}

pub fn write_file(brain: &Path, input: &WriteSyncedFileInput) -> AppResult<SyncWriteOutcome> {
    let relative = safe_relative_path(&input.relative_path)?;
    let target = brain.join(&relative);
    let incoming_hash = hash_bytes(&input.content);
    let disposition;
    let written_path;
    if target.exists() {
        let current_hash = hash_bytes(&fs::read(&target)?);
        if current_hash == incoming_hash {
            disposition = "unchanged";
            written_path = target;
        } else if input.expected_local_hash.as_deref() == Some(current_hash.as_str()) {
            fs::write(&target, &input.content)?;
            disposition = "updated";
            written_path = target;
        } else {
            let conflict_root = brain
                .join("review/sync-conflicts")
                .join(Utc::now().format("%Y%m%d-%H%M%S").to_string());
            let conflict = conflict_root.join(&relative);
            if let Some(parent) = conflict.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&conflict, &input.content)?;
            disposition = "conflict";
            written_path = conflict;
        }
    } else {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&target, &input.content)?;
        disposition = "created";
        written_path = target;
    }
    Ok(SyncWriteOutcome {
        relative_path: input.relative_path.clone(),
        disposition: disposition.into(),
        written_path: written_path.to_string_lossy().to_string(),
        content_hash: incoming_hash,
    })
}

pub fn load_manifest(brain: &Path) -> AppResult<SyncManifest> {
    let path = brain.join(".second-brain").join(MANIFEST_FILE);
    if !path.exists() {
        return Ok(SyncManifest::default());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

pub fn save_manifest(
    app: &AppHandle,
    brain: &Path,
    mut manifest: SyncManifest,
) -> AppResult<SyncManifest> {
    let now = Utc::now().to_rfc3339();
    manifest.last_sync_at = Some(now.clone());
    fs::write(
        brain.join(".second-brain").join(MANIFEST_FILE),
        serde_json::to_vec_pretty(&manifest)?,
    )?;
    let mut config = storage::read_config(app)?;
    config.last_sync_at = Some(now);
    storage::write_config(app, &config)?;
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_operational_data_and_writes_remote_conflicts_safely() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::create_dir_all(brain.join(".second-brain")).expect("metadata");
        fs::write(brain.join("notes/idea.md"), "local version").expect("local note");
        fs::write(brain.join(".second-brain/secret.json"), "never sync").expect("metadata file");
        let files = list_files(brain).expect("sync files");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].relative_path, "notes/idea.md");
        let outcome = write_file(
            brain,
            &WriteSyncedFileInput {
                relative_path: "notes/idea.md".into(),
                content: b"remote version".to_vec(),
                expected_local_hash: None,
            },
        )
        .expect("conflict write");
        assert_eq!(outcome.disposition, "conflict");
        assert_eq!(
            fs::read_to_string(brain.join("notes/idea.md")).expect("local"),
            "local version"
        );
        assert!(Path::new(&outcome.written_path).exists());
        assert!(read_file(brain, "../escape").is_err());
    }

    #[test]
    fn validates_sync_service_transport_and_rejects_url_credentials() {
        assert_eq!(
            normalized_service_url(" https://sync.example.com/ ").expect("https"),
            "https://sync.example.com"
        );
        assert!(normalized_service_url("http://localhost:3000").is_ok());
        assert!(normalized_service_url("http://127.0.0.1:3000").is_ok());
        assert!(normalized_service_url("http://[::1]:3000").is_ok());
        assert!(normalized_service_url("http://sync.example.com").is_err());
        assert!(normalized_service_url("https://user:secret@sync.example.com").is_err());
        assert!(normalized_service_url("https://sync.example.com?tenant=one").is_err());
    }
}
