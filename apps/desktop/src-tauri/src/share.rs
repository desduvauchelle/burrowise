use crate::domain::{LibraryOverview, ShareImportReport};
use crate::error::{AppError, AppResult};
use crate::{library, search, storage, transcription};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub const APP_GROUP_ID: &str = "group.ai.recursivesolutions.secondbrain";
const MAX_VIDEO_BYTES: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoRecord {
    id: String,
    title: String,
    imported_at: String,
    original_name: String,
    original_relative_path: String,
    original_bytes: u64,
    audio_relative_path: Option<String>,
    transcription_provider: String,
    status: String,
    processing_error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareManifest {
    file_name: String,
    #[serde(default)]
    original_name: String,
}

fn supported_video(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(str::to_lowercase)
            .as_deref(),
        Some("mp4" | "mov" | "m4v")
    )
}

fn clean_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Shared video")
        .replace(['-', '_'], " ")
}

fn slug(value: &str) -> String {
    let mut result = String::new();
    let mut separator = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            result.push(character);
            separator = false;
        } else if !result.is_empty() && !separator {
            result.push('-');
            separator = true;
        }
    }
    result.trim_matches('-').chars().take(64).collect()
}

fn write_video_source(folder: &Path, record: &VideoRecord, transcript: &str) -> AppResult<()> {
    fs::write(
        folder.join("video.json"),
        serde_json::to_vec_pretty(record)?,
    )?;
    let transcript_section = if transcript.trim().is_empty() {
        match record.processing_error.as_deref() {
            Some(error) => format!(
                "## Processing\n\nThe original video is safe. Transcription needs attention: {error}"
            ),
            None => "## Processing\n\nThe original video is stored locally and is awaiting transcription."
                .to_string(),
        }
    } else {
        format!("## Transcript\n\n{}", transcript.trim())
    };
    fs::write(
        folder.join("source.md"),
        format!(
            "---\nid: {}\ntype: video\nstatus: {}\nimported_at: {}\noriginal: {}\ntranscription_provider: {}\n---\n\n# {}\n\nShared with Burrowise and preserved locally as `{}`.\n\n{}\n",
            record.id,
            record.status,
            record.imported_at,
            record.original_relative_path,
            record.transcription_provider,
            record.title,
            record.original_name,
            transcript_section,
        ),
    )?;
    Ok(())
}

pub fn import_videos(
    brain: &Path,
    paths: &[String],
    transcription_provider: &str,
) -> AppResult<LibraryOverview> {
    if paths.is_empty() {
        return library::overview(brain);
    }
    let validated = paths
        .iter()
        .map(|requested| {
            let source = PathBuf::from(requested);
            if !source.is_absolute() || !source.is_file() {
                return Err(AppError::InvalidSource(format!(
                    "video file is unavailable: {requested}"
                )));
            }
            if !supported_video(&source) {
                return Err(AppError::InvalidSource(
                    "Burrowise currently supports MP4, MOV, and M4V video files".into(),
                ));
            }
            let size = fs::metadata(&source)?.len();
            if size == 0 || size > MAX_VIDEO_BYTES {
                return Err(AppError::InvalidSource(format!(
                    "{} must be between 1 byte and 4 GB",
                    source.display()
                )));
            }
            Ok((source, size))
        })
        .collect::<AppResult<Vec<_>>>()?;

    for (source, original_bytes) in validated {
        let id = Uuid::new_v4().to_string();
        let title = clean_title(&source);
        let folder = brain.join("sources/videos").join(format!(
            "{}-{}",
            {
                let value = slug(&title);
                if value.is_empty() {
                    "video".into()
                } else {
                    value
                }
            },
            &id[..8]
        ));
        fs::create_dir_all(&folder)?;
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("mp4")
            .to_lowercase();
        let original = folder.join(format!("original.{extension}"));
        fs::copy(&source, &original)?;

        let relative_original = original
            .strip_prefix(brain)
            .unwrap_or(&original)
            .to_string_lossy()
            .to_string();
        let relative_folder = folder
            .strip_prefix(brain)
            .unwrap_or(&folder)
            .to_string_lossy()
            .to_string();
        let mut record = VideoRecord {
            id,
            title,
            imported_at: Utc::now().to_rfc3339(),
            original_name: source
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("video")
                .to_string(),
            original_relative_path: relative_original,
            original_bytes,
            audio_relative_path: None,
            transcription_provider: transcription_provider.to_string(),
            status: "stored".into(),
            processing_error: None,
        };
        // Persist a receipt before media processing so the original is never orphaned.
        write_video_source(&folder, &record, "")?;

        if transcription_provider == "none" {
            record.status = "awaiting_transcription".into();
            write_video_source(&folder, &record, "")?;
            continue;
        }

        let audio = folder.join("audio.m4a");
        let conversion = Command::new("/usr/bin/avconvert")
            .args(["--source"])
            .arg(&original)
            .args(["--preset", "PresetAppleM4A", "--output"])
            .arg(&audio)
            .arg("--replace")
            .output();
        match conversion {
            Ok(output) if output.status.success() && audio.is_file() => {
                record.audio_relative_path = Some(format!("{relative_folder}/audio.m4a"));
                match transcription_provider {
                    "apple-speech" => transcription::transcribe_file(&audio, "en-US"),
                    "parakeet" => transcription::transcribe_parakeet(&audio),
                    other => Err(AppError::UnsupportedProvider(other.into())),
                }
                .map(|transcript| {
                    record.status = "ready".into();
                    write_video_source(&folder, &record, &transcript)
                })
                .unwrap_or_else(|error| {
                    record.status = "transcription_failed".into();
                    record.processing_error = Some(error.to_string());
                    write_video_source(&folder, &record, "")
                })?;
            }
            Ok(output) => {
                record.status = "audio_extraction_failed".into();
                record.processing_error = Some(
                    String::from_utf8_lossy(&output.stderr)
                        .trim()
                        .chars()
                        .take(400)
                        .collect(),
                );
                write_video_source(&folder, &record, "")?;
            }
            Err(error) => {
                record.status = "audio_extraction_failed".into();
                record.processing_error = Some(error.to_string());
                write_video_source(&folder, &record, "")?;
            }
        }
    }
    search::rebuild_index(brain)?;
    library::overview(brain)
}

#[cfg(target_os = "macos")]
fn share_inboxes(app: &AppHandle) -> AppResult<Vec<PathBuf>> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| AppError::InvalidSource(error.to_string()))?;
    Ok(vec![
        home.join("Library/Group Containers")
            .join(APP_GROUP_ID)
            .join("Share Inbox"),
        home.join("Library/Containers/ai.recursivesolutions.secondbrain.share/Data/Library/Application Support/Burrowise/Share Inbox"),
    ])
}

#[cfg(not(target_os = "macos"))]
fn share_inboxes(app: &AppHandle) -> AppResult<Vec<PathBuf>> {
    Ok(vec![app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::InvalidSource(error.to_string()))?
        .join("Share Inbox")])
}

pub fn drain_inbox(app: &AppHandle) -> AppResult<ShareImportReport> {
    let config = storage::read_config(app)?;
    let Some(active_brain) = config.active_brain else {
        return Ok(ShareImportReport {
            imported: 0,
            failed: 0,
            message: "A shared video is waiting. Choose a brain folder to import it.".into(),
        });
    };
    let mut imported = 0;
    let mut failed = 0;
    for inbox in share_inboxes(app)? {
        fs::create_dir_all(&inbox)?;
        let entries = fs::read_dir(&inbox)?;
        for entry in entries.flatten() {
            let manifest_path = entry.path();
            if manifest_path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let result = (|| -> AppResult<()> {
                let manifest: ShareManifest = serde_json::from_slice(&fs::read(&manifest_path)?)?;
                let file_name = Path::new(&manifest.file_name);
                if file_name.components().count() != 1 {
                    return Err(AppError::InvalidSource(
                        "unsafe share-inbox filename".into(),
                    ));
                }
                let video_path = inbox.join(file_name);
                let canonical_inbox = inbox.canonicalize()?;
                let canonical_video = video_path.canonicalize()?;
                if !canonical_video.starts_with(&canonical_inbox) {
                    return Err(AppError::InvalidSource(
                        "shared video escaped its inbox".into(),
                    ));
                }
                let original_name = Path::new(&manifest.original_name)
                    .file_name()
                    .filter(|_| !manifest.original_name.trim().is_empty())
                    .map(PathBuf::from);
                let import_path = if let Some(name) = original_name {
                    let named_path = inbox.join(name);
                    if supported_video(&named_path) && !named_path.exists() {
                        fs::rename(&canonical_video, &named_path)?;
                        named_path
                    } else {
                        canonical_video
                    }
                } else {
                    canonical_video
                };
                import_videos(
                    Path::new(&active_brain),
                    &[import_path.to_string_lossy().to_string()],
                    &config.transcription_provider,
                )?;
                fs::remove_file(import_path)?;
                fs::remove_file(&manifest_path)?;
                Ok(())
            })();
            if result.is_ok() {
                imported += 1;
            } else {
                failed += 1;
                let _ = fs::rename(&manifest_path, manifest_path.with_extension("failed"));
            }
        }
    }
    Ok(ShareImportReport {
        imported,
        failed,
        message: if imported > 0 {
            format!(
                "{imported} shared video{} stored locally and sent through the transcription pipeline.",
                if imported == 1 { "" } else { "s" }
            )
        } else if failed > 0 {
            "A shared video could not be imported; it remains safe in the Share Inbox.".into()
        } else {
            String::new()
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_an_original_even_when_audio_extraction_fails() {
        let temporary = tempfile::tempdir().expect("temporary");
        let brain = temporary.path().join("brain");
        let incoming = temporary.path().join("meeting.mp4");
        fs::create_dir_all(&brain).expect("brain");
        fs::write(&incoming, b"not actually a movie").expect("fixture");

        let overview = import_videos(
            &brain,
            &[incoming.to_string_lossy().to_string()],
            "apple-speech",
        )
        .expect("durable import");

        assert_eq!(overview.stats.video_count, 1);
        let item = overview
            .items
            .iter()
            .find(|item| item.kind == "video")
            .expect("video item");
        let folder = brain.join(Path::new(&item.relative_path).parent().unwrap());
        assert!(folder.join("original.mp4").is_file());
        assert!(fs::read_to_string(folder.join("source.md"))
            .expect("source")
            .contains("original video is safe"));
    }
}
