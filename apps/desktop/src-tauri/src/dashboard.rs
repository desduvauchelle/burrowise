use crate::domain::{DashboardActivity, DashboardOverview, DashboardStats};
use crate::error::AppResult;
use crate::{chat, content, image_memory, interview, storage};
use chrono::{DateTime, Utc};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

fn markdown_files(folder: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut pending = vec![folder.to_path_buf()];
    while let Some(current) = pending.pop() {
        let Ok(entries) = fs::read_dir(current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if path.extension().and_then(|value| value.to_str()) == Some("md") {
                files.push(path);
            }
        }
    }
    files
}

fn directory_bytes(folder: &Path) -> u64 {
    let mut total = 0_u64;
    let mut pending = vec![folder.to_path_buf()];
    while let Some(current) = pending.pop() {
        let Ok(entries) = fs::read_dir(current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.is_dir() {
                pending.push(path);
            } else if metadata.is_file() {
                total = total.saturating_add(metadata.len());
            }
        }
    }
    total
}

fn frontmatter_type(markdown: &str) -> String {
    markdown
        .lines()
        .take(30)
        .find_map(|line| line.trim().strip_prefix("type:"))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("other")
        .to_string()
}

fn note_activity(brain: &Path, path: &Path) -> Option<DashboardActivity> {
    let markdown = fs::read_to_string(path).ok()?;
    let title = markdown
        .lines()
        .find_map(|line| line.trim().strip_prefix("# "))
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Note")
        })
        .to_string();
    let modified: DateTime<Utc> = fs::metadata(path).ok()?.modified().ok()?.into();
    let relative_path = path.strip_prefix(brain).ok()?.to_string_lossy().to_string();
    Some(DashboardActivity {
        id: format!("note:{relative_path}"),
        kind: "note".into(),
        label: "Note updated".into(),
        title,
        updated_at: modified.to_rfc3339(),
        target: "knowledge".into(),
        relative_path: Some(relative_path),
    })
}

fn image_activity_label(status: &str) -> &'static str {
    match status {
        "ready" => "Image converted to knowledge",
        "analysis_failed" | "needs_model" => "Image review needs attention",
        _ => "Image saved",
    }
}

pub fn overview(brain: &Path) -> AppResult<DashboardOverview> {
    let sessions = storage::list_sessions(brain)?;
    let notes = markdown_files(&brain.join("notes"));
    let review_files = fs::read_dir(brain.join("review"))
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| {
                    path.is_file()
                        && path.extension().and_then(|value| value.to_str()) == Some("md")
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut review_counts = BTreeMap::new();
    for path in &review_files {
        let kind = fs::read_to_string(path)
            .map(|markdown| frontmatter_type(&markdown))
            .unwrap_or_else(|_| "other".into());
        *review_counts.entry(kind).or_insert(0) += 1;
    }

    let mut recent_activity = sessions
        .iter()
        .map(|session| DashboardActivity {
            id: format!("capture:{}", session.id),
            kind: "capture".into(),
            label: match session.status.as_str() {
                "ready" => "Capture organized",
                "recording_failed" | "transcription_failed" | "enrichment_failed" => {
                    "Capture needs attention"
                }
                _ => "Capture saved",
            }
            .into(),
            title: session.title.clone(),
            updated_at: session.updated_at.clone(),
            target: "capture".into(),
            relative_path: Some(session.relative_folder.clone()),
        })
        .collect::<Vec<_>>();
    recent_activity.extend(notes.iter().filter_map(|path| note_activity(brain, path)));
    recent_activity.extend(
        image_memory::list(brain)?
            .into_iter()
            .map(|item| DashboardActivity {
                id: format!("image:{}", item.id),
                kind: "image".into(),
                label: image_activity_label(&item.status).into(),
                title: item.title,
                updated_at: item.updated_at,
                target: "knowledge".into(),
                relative_path: Some(item.relative_folder),
            }),
    );
    recent_activity.extend(chat::list_conversations(brain)?.into_iter().map(|item| {
        DashboardActivity {
            id: format!("chat:{}", item.id),
            kind: "chat".into(),
            label: "Chat continued".into(),
            title: item.title,
            updated_at: item.updated_at,
            target: "chat".into(),
            relative_path: None,
        }
    }));
    recent_activity.extend(interview::list_interviews(brain)?.into_iter().map(|item| {
        DashboardActivity {
            id: format!("interview:{}", item.id),
            kind: "interview".into(),
            label: if item.status == "active" {
                "Interview in progress"
            } else {
                "Interview completed"
            }
            .into(),
            title: item.title,
            updated_at: item.updated_at,
            target: "interviews".into(),
            relative_path: Some(item.relative_folder),
        }
    }));
    recent_activity.extend(content::list_projects(brain)?.into_iter().map(|item| {
        DashboardActivity {
            id: format!("project:{}", item.id),
            kind: "project".into(),
            label: "Studio project updated".into(),
            title: item.title,
            updated_at: item.updated_at,
            target: "studio".into(),
            relative_path: Some(item.relative_folder),
        }
    }));
    recent_activity.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    recent_activity.truncate(8);

    Ok(DashboardOverview {
        stats: DashboardStats {
            note_count: notes.len(),
            capture_count: sessions.len(),
            retained_audio_bytes: sessions.iter().filter_map(|item| item.audio_bytes).sum(),
            storage_bytes: directory_bytes(brain),
            review_count: review_files.len(),
        },
        recent_activity,
        review_counts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_real_brain_counts_and_recent_activity() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in [
            "notes",
            "review",
            "sessions",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        fs::write(
            brain.join("notes/one.md"),
            "# One note\n\nUseful knowledge.",
        )
        .expect("note");
        fs::write(
            brain.join("review/proposal.md"),
            "---\ntype: atomic-note\n---\n# Proposal",
        )
        .expect("review");
        let session = storage::create_session(brain).expect("session");
        storage::save_audio(brain, &session.id, "audio/wav", b"RIFF....WAVEfixture")
            .expect("audio");

        let result = overview(brain).expect("overview");
        assert_eq!(result.stats.note_count, 1);
        assert_eq!(result.stats.capture_count, 1);
        assert_eq!(result.stats.review_count, 1);
        assert!(result.stats.storage_bytes > 0);
        assert_eq!(result.review_counts.get("atomic-note"), Some(&1));
        let capture = result
            .recent_activity
            .iter()
            .find(|item| item.kind == "capture")
            .expect("capture activity");
        assert_eq!(capture.target, "capture");
        assert_eq!(capture.id, format!("capture:{}", session.id));
        assert_eq!(
            capture.relative_path.as_deref(),
            Some(session.relative_folder.as_str())
        );
        let note = result
            .recent_activity
            .iter()
            .find(|item| item.kind == "note")
            .expect("note activity");
        assert_eq!(note.target, "knowledge");
        assert_eq!(note.relative_path.as_deref(), Some("notes/one.md"));
    }

    #[test]
    fn image_activity_surfaces_review_failures() {
        assert_eq!(
            image_activity_label("analysis_failed"),
            "Image review needs attention"
        );
        assert_eq!(
            image_activity_label("needs_model"),
            "Image review needs attention"
        );
        assert_eq!(
            image_activity_label("ready"),
            "Image converted to knowledge"
        );
    }
}
