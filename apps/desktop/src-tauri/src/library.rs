use crate::domain::{LibraryItem, LibraryOverview, LibraryStats};
use crate::error::{AppError, AppResult};
use crate::{image_memory, search, storage};
use chrono::{DateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_TEXT_SOURCE_BYTES: u64 = 25 * 1024 * 1024;

fn title_from_text(text: &str, path: &Path) -> String {
    text.lines()
        .find_map(|line| line.trim().strip_prefix("# "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            path.file_stem()
                .and_then(|value| value.to_str())
                .map(|value| value.replace(['-', '_'], " "))
        })
        .unwrap_or_else(|| "Untitled source".into())
}

fn source_files(brain: &Path) -> Vec<PathBuf> {
    let root = brain.join("sources");
    let mut files = Vec::new();
    let mut pending = vec![root];
    while let Some(folder) = pending.pop() {
        if folder.join("image.json").is_file() {
            continue;
        }
        let Ok(entries) = fs::read_dir(folder) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_symlink() {
                let Ok(canonical) = path.canonicalize() else {
                    continue;
                };
                let Ok(canonical_brain) = brain.canonicalize() else {
                    continue;
                };
                if canonical.is_dir() || !canonical.starts_with(&canonical_brain) {
                    continue;
                }
            }
            if path.is_dir() {
                pending.push(path);
            } else if matches!(
                path.extension()
                    .and_then(|value| value.to_str())
                    .map(str::to_lowercase)
                    .as_deref(),
                Some("md" | "markdown" | "txt")
            ) {
                files.push(path);
            }
        }
    }
    files
}

fn source_item(brain: &Path, path: &Path) -> Option<LibraryItem> {
    let text = fs::read_to_string(path).ok()?;
    let metadata = fs::metadata(path).ok()?;
    let modified: DateTime<Utc> = metadata.modified().ok()?.into();
    let relative_path = path.strip_prefix(brain).ok()?.to_string_lossy().to_string();
    let video_record = path
        .parent()
        .map(|folder| folder.join("video.json"))
        .filter(|record| record.is_file())
        .and_then(|record| fs::read(record).ok())
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    let video_bytes = video_record
        .as_ref()
        .and_then(|record| record.get("originalBytes"))
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    let kind = if video_record.is_some() { "video" } else { "file" };
    Some(LibraryItem {
        id: format!("source:{relative_path}"),
        title: title_from_text(&text, path),
        kind: kind.into(),
        relative_path,
        updated_at: modified.to_rfc3339(),
        detail: video_record.as_ref().map(|record| {
            let status = record.get("status").and_then(serde_json::Value::as_str).unwrap_or("stored");
            format!("Shared video · {} · {} bytes", status.replace('_', " "), video_bytes)
        }).unwrap_or_else(|| format!(
                "Imported {} · {} bytes",
                path.extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("text")
                    .to_uppercase(),
                metadata.len()
            )),
        session_id: None,
        has_audio: false,
        audio_bytes: 0,
        image_id: None,
        has_image: false,
        image_bytes: 0,
    })
}

pub fn overview(brain: &Path) -> AppResult<LibraryOverview> {
    let sessions = storage::list_sessions(brain)?;
    let source_paths = source_files(brain);
    let image_memories = image_memory::list(brain)?;
    let video_count = source_paths
        .iter()
        .filter(|path| path.parent().is_some_and(|folder| folder.join("video.json").is_file()))
        .count();
    let mut items = sessions
        .iter()
        .map(|session| LibraryItem {
            id: format!("capture:{}", session.id),
            title: session.title.clone(),
            kind: "capture".into(),
            relative_path: format!("{}/transcript.md", session.relative_folder),
            updated_at: session.updated_at.clone(),
            detail: match session.status.as_str() {
                "ready" => "Capture · transcript and original audio".into(),
                "recording_failed" => "Capture · recording needs attention".into(),
                "transcription_failed" => {
                    "Capture · audio safe · transcription needs attention".into()
                }
                "enrichment_failed" => {
                    "Capture · transcript safe · enrichment needs attention".into()
                }
                _ => format!("Capture · {}", session.status.replace('_', " ")),
            },
            session_id: Some(session.id.clone()),
            has_audio: session.audio_path.is_some(),
            audio_bytes: session.audio_bytes.unwrap_or(0),
            image_id: None,
            has_image: false,
            image_bytes: 0,
        })
        .collect::<Vec<_>>();
    items.extend(
        source_paths
            .iter()
            .filter_map(|path| source_item(brain, path)),
    );
    items.extend(image_memories.iter().map(|memory| LibraryItem {
        id: format!("image:{}", memory.id),
        title: memory.title.clone(),
        kind: "image".into(),
        relative_path: if memory.status == "ready" {
            memory.relative_source_path.clone()
        } else {
            memory.relative_image_path.clone()
        },
        updated_at: memory.updated_at.clone(),
        detail: match memory.status.as_str() {
            "ready" => format!(
                "Image source · searchable Markdown · {}",
                memory.provider_id.as_deref().unwrap_or("image model")
            ),
            "analyzing" => "Image source · AI review in progress".into(),
            "needs_model" => "Image source · stored locally · choose an image model".into(),
            "analysis_failed" => "Image source · original safe · AI review needs attention".into(),
            _ => "Image source · stored locally · awaiting AI review".into(),
        },
        session_id: None,
        has_audio: false,
        audio_bytes: 0,
        image_id: Some(memory.id.clone()),
        has_image: true,
        image_bytes: memory.image_bytes,
    }));
    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(LibraryOverview {
        stats: LibraryStats {
            capture_count: sessions.len(),
            file_count: source_paths.len().saturating_sub(video_count),
            video_count,
            image_count: image_memories.len(),
            retained_audio_bytes: sessions
                .iter()
                .filter_map(|session| session.audio_bytes)
                .sum(),
            retained_image_bytes: image_memories.iter().map(|memory| memory.image_bytes).sum(),
        },
        items,
    })
}

fn unique_destination(folder: &Path, source: &Path) -> PathBuf {
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("source");
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("txt");
    let mut destination = folder.join(format!("{stem}.{extension}"));
    let mut suffix = 2;
    while destination.exists() {
        destination = folder.join(format!("{stem}-{suffix}.{extension}"));
        suffix += 1;
    }
    destination
}

pub fn import_files(brain: &Path, paths: &[String]) -> AppResult<LibraryOverview> {
    if paths.is_empty() {
        return overview(brain);
    }
    let destination_folder = brain.join("sources");
    fs::create_dir_all(&destination_folder)?;
    let validated = paths
        .iter()
        .map(|requested| {
            let source = PathBuf::from(requested);
            if !source.is_absolute() || !source.is_file() {
                return Err(AppError::InvalidSource(format!(
                    "source file is unavailable: {requested}"
                )));
            }
            let extension = source
                .extension()
                .and_then(|value| value.to_str())
                .map(str::to_lowercase);
            if !matches!(extension.as_deref(), Some("md" | "markdown" | "txt")) {
                return Err(AppError::InvalidSource(
                    "only Markdown and plain-text files are supported in this build".into(),
                ));
            }
            let metadata = fs::metadata(&source)?;
            if metadata.len() > MAX_TEXT_SOURCE_BYTES {
                return Err(AppError::InvalidSource(format!(
                    "{} is larger than the 25 MB text-file limit",
                    source.display()
                )));
            }
            fs::read_to_string(&source).map_err(|_| {
                AppError::InvalidSource(format!("{} is not readable UTF-8 text", source.display()))
            })?;
            Ok(source)
        })
        .collect::<AppResult<Vec<_>>>()?;

    let mut created = Vec::new();
    let import_result = (|| -> AppResult<()> {
        for source in validated {
            let destination = unique_destination(&destination_folder, &source);
            fs::copy(&source, &destination)?;
            created.push(destination.clone());
            let receipt = destination_folder.join(format!(".import-{}.json", Uuid::new_v4()));
            fs::write(
                &receipt,
                serde_json::to_vec_pretty(&serde_json::json!({
                    "sourcePath": source.to_string_lossy(),
                    "importedPath": destination.strip_prefix(brain).unwrap_or(&destination).to_string_lossy(),
                    "importedAt": Utc::now().to_rfc3339()
                }))?,
            )?;
            created.push(receipt);
        }
        search::rebuild_index(brain)?;
        Ok(())
    })();
    if let Err(error) = import_result {
        for path in created.into_iter().rev() {
            let _ = fs::remove_file(path);
        }
        let _ = search::rebuild_index(brain);
        return Err(error);
    }
    overview(brain)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_real_captures_and_imports_readable_sources() {
        let temporary = tempfile::tempdir().expect("root");
        let brain = temporary.path().join("brain");
        let incoming = temporary.path().join("idea.md");
        fs::create_dir_all(&brain).expect("brain");
        fs::write(
            &incoming,
            "# Imported idea\n\nThis source remains readable.",
        )
        .expect("incoming");
        storage::create_session(&brain).expect("capture");

        let imported =
            import_files(&brain, &[incoming.to_string_lossy().to_string()]).expect("import");
        assert_eq!(imported.stats.capture_count, 1);
        assert_eq!(imported.stats.file_count, 1);
        assert!(imported
            .items
            .iter()
            .any(|item| item.title == "Imported idea" && item.kind == "file"));
        assert!(brain.join("sources/idea.md").exists());
        assert!(!search::search(
            &brain,
            &crate::domain::SearchQuery {
                query: "remains readable".into(),
                mode: "lexical".into(),
                scope: "sources".into(),
                limit: Some(5),
                selected_paths: vec![]
            }
        )
        .expect("search")
        .is_empty());

        fs::write(
            brain.join("sources/external.txt"),
            "External source added outside the app.",
        )
        .expect("external source");
        let refreshed = overview(&brain).expect("refreshed library");
        assert_eq!(refreshed.stats.file_count, 2);
        assert!(refreshed
            .items
            .iter()
            .any(|item| item.relative_path == "sources/external.txt"));
    }

    #[test]
    fn validates_the_entire_import_batch_before_copying_anything() {
        let temporary = tempfile::tempdir().expect("root");
        let brain = temporary.path().join("brain");
        let valid = temporary.path().join("VALID.MD");
        let invalid = temporary.path().join("image.png");
        fs::create_dir_all(&brain).expect("brain");
        fs::write(&valid, "# Valid source\n\nCobalt text remains readable.").expect("valid");
        fs::write(&invalid, b"not a supported source").expect("invalid");

        let error = import_files(
            &brain,
            &[
                valid.to_string_lossy().to_string(),
                invalid.to_string_lossy().to_string(),
            ],
        )
        .expect_err("mixed batch must fail before copying");

        assert!(error.to_string().contains("only Markdown and plain-text"));
        assert_eq!(source_files(&brain).len(), 0);
        assert_eq!(
            fs::read_dir(brain.join("sources"))
                .expect("sources")
                .count(),
            0
        );

        let imported = import_files(&brain, &[valid.to_string_lossy().to_string()])
            .expect("uppercase Markdown imports");
        assert_eq!(imported.stats.file_count, 1);
        assert!(!search::search(
            &brain,
            &crate::domain::SearchQuery {
                query: "cobalt readable".into(),
                mode: "lexical".into(),
                scope: "sources".into(),
                limit: Some(5),
                selected_paths: vec![]
            }
        )
        .expect("uppercase extension indexed")
        .is_empty());
    }
}
