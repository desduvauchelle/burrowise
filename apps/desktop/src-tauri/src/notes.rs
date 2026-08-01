use crate::domain::{NoteDocument, NoteSource, SaveNoteInput};
use crate::error::{AppError, AppResult};
use crate::search;
use chrono::{DateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

fn note_files(folder: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut pending = vec![folder.to_path_buf()];
    while let Some(current) = pending.pop() {
        let Ok(entries) = fs::read_dir(current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_symlink() {
                continue;
            }
            if path.is_dir() {
                pending.push(path);
            } else if matches!(
                path.extension()
                    .and_then(|value| value.to_str())
                    .map(str::to_lowercase)
                    .as_deref(),
                Some("md" | "markdown")
            ) {
                files.push(path);
            }
        }
    }
    files
}

fn frontmatter_value(markdown: &str, key: &str) -> Option<String> {
    if !markdown.trim_start().starts_with("---") {
        return None;
    }
    markdown
        .lines()
        .skip(1)
        .take_while(|line| line.trim() != "---")
        .find_map(|line| {
            line.trim()
                .strip_prefix(&format!("{key}:"))
                .map(str::trim)
                .map(str::to_string)
        })
}

fn parse_list(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .trim()
        .trim_matches(['[', ']'])
        .split(',')
        .map(|item| {
            item.trim()
                .trim_matches(['\'', '"'])
                .trim_start_matches('#')
                .to_string()
        })
        .filter(|item| !item.is_empty())
        .collect()
}

fn body_without_frontmatter(markdown: &str) -> &str {
    if !markdown.trim_start().starts_with("---") {
        return markdown;
    }
    let mut boundaries = markdown.match_indices("---");
    let _ = boundaries.next();
    boundaries
        .next()
        .map(|(index, _)| markdown[index + 3..].trim_start())
        .unwrap_or(markdown)
}

fn title_and_body(markdown: &str, path: &Path) -> (String, String) {
    let content = body_without_frontmatter(markdown);
    let title = content
        .lines()
        .find_map(|line| line.trim().strip_prefix("# "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            path.file_stem()
                .and_then(|value| value.to_str())
                .map(|value| value.replace(['-', '_'], " "))
        })
        .unwrap_or_else(|| "Untitled note".into());
    let body = content
        .lines()
        .filter(|line| line.trim() != format!("# {title}"))
        .take_while(|line| line.trim() != "## Sources")
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    (title, body)
}

fn parse_sources(markdown: &str) -> Vec<NoteSource> {
    let mut sources = Vec::new();
    let mut in_sources = false;
    let mut current_path: Option<String> = None;
    for line in body_without_frontmatter(markdown).lines() {
        let trimmed = line.trim();
        if trimmed == "## Sources" {
            in_sources = true;
            continue;
        }
        if in_sources && trimmed.starts_with("## ") {
            break;
        }
        if !in_sources {
            continue;
        }
        if let Some(path) = trimmed.strip_prefix("- Source: ") {
            if let Some(previous) = current_path.replace(path.trim_matches('`').to_string()) {
                sources.push(NoteSource {
                    relative_path: previous,
                    quote: String::new(),
                });
            }
        } else if let Some(quote) = trimmed.strip_prefix("> ") {
            if let Some(path) = current_path.take() {
                sources.push(NoteSource {
                    relative_path: path,
                    quote: quote.to_string(),
                });
            }
        }
    }
    if let Some(path) = current_path {
        sources.push(NoteSource {
            relative_path: path,
            quote: String::new(),
        });
    }
    sources
}

fn excerpt(body: &str) -> String {
    let compact = body
        .lines()
        .filter(|line| !line.trim_start().starts_with('#'))
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if compact.chars().count() <= 180 {
        compact
    } else {
        format!("{}…", compact.chars().take(177).collect::<String>())
    }
}

fn read_note(brain: &Path, path: &Path) -> AppResult<NoteDocument> {
    let markdown = fs::read_to_string(path)?;
    let (title, body) = title_and_body(&markdown, path);
    let metadata = fs::metadata(path)?;
    let updated: DateTime<Utc> = metadata.modified()?.into();
    let created: DateTime<Utc> = metadata.created().or_else(|_| metadata.modified())?.into();
    let relative_path = path
        .strip_prefix(brain)
        .map_err(|_| AppError::InvalidNote("note escaped the active brain".into()))?
        .to_string_lossy()
        .to_string();
    Ok(NoteDocument {
        id: frontmatter_value(&markdown, "id").unwrap_or_else(|| relative_path.clone()),
        title,
        excerpt: excerpt(&body),
        body,
        markdown: markdown.clone(),
        tags: parse_list(frontmatter_value(&markdown, "tags")),
        sources: parse_sources(&markdown),
        created_at: frontmatter_value(&markdown, "created_at")
            .unwrap_or_else(|| created.to_rfc3339()),
        updated_at: updated.to_rfc3339(),
        relative_path,
    })
}

pub fn list(brain: &Path) -> AppResult<Vec<NoteDocument>> {
    let mut notes = note_files(&brain.join("notes"))
        .into_iter()
        .map(|path| read_note(brain, &path))
        .collect::<AppResult<Vec<_>>>()?;
    notes.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(notes)
}

pub fn get(brain: &Path, relative_path: &str) -> AppResult<NoteDocument> {
    list(brain)?
        .into_iter()
        .find(|note| note.relative_path == relative_path)
        .ok_or_else(|| AppError::InvalidNote(format!("note was not found: {relative_path}")))
}

fn safe_slug(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .take(9)
        .collect::<Vec<_>>()
        .join("-")
}

fn validated_title(title: &str) -> AppResult<String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 120 || title.contains(['\n', '\r']) {
        return Err(AppError::InvalidNote(
            "use a one-line title between 1 and 120 characters".into(),
        ));
    }
    Ok(title.into())
}

fn validated_tags(tags: &[String]) -> Vec<String> {
    let mut tags = tags
        .iter()
        .map(|tag| {
            tag.trim()
                .trim_start_matches('#')
                .to_lowercase()
                .replace(' ', "-")
        })
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();
    tags.sort();
    tags.dedup();
    tags.truncate(20);
    tags
}

pub fn save(brain: &Path, input: &SaveNoteInput) -> AppResult<NoteDocument> {
    let title = validated_title(&input.title)?;
    let body = input.body.trim();
    if body.is_empty() {
        return Err(AppError::InvalidNote("note body cannot be empty".into()));
    }
    let notes_folder = brain.join("notes");
    fs::create_dir_all(&notes_folder)?;
    let existing = input
        .relative_path
        .as_deref()
        .map(|relative| {
            let path = brain.join(relative);
            if !relative.starts_with("notes/")
                || path.extension().and_then(|value| value.to_str()) != Some("md")
            {
                return Err(AppError::InvalidNote(
                    "only Markdown files inside notes/ can be edited".into(),
                ));
            }
            let canonical_notes = notes_folder.canonicalize()?;
            let canonical_parent = path.parent().unwrap_or(&notes_folder).canonicalize()?;
            if !canonical_parent.starts_with(&canonical_notes) {
                return Err(AppError::InvalidNote("note path escaped notes/".into()));
            }
            Ok(path)
        })
        .transpose()?;
    let (path, id, created_at, sources) = if let Some(path) = existing {
        let prior = read_note(brain, &path)?;
        (path, prior.id, prior.created_at, prior.sources)
    } else {
        let id = Uuid::new_v4().to_string();
        let slug = safe_slug(&title);
        (
            notes_folder.join(format!(
                "{}-{}.md",
                if slug.is_empty() { "note" } else { &slug },
                &id[..8]
            )),
            id,
            Utc::now().to_rfc3339(),
            Vec::new(),
        )
    };
    let tags = validated_tags(&input.tags);
    let sources_markdown = if sources.is_empty() {
        String::new()
    } else {
        format!(
            "\n\n## Sources\n\n{}",
            sources
                .iter()
                .map(|source| format!(
                    "- Source: `{}`\n  > {}",
                    source.relative_path,
                    source.quote.replace('\n', " ")
                ))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };
    let markdown = format!("---\nid: {id}\ntype: atomic-note\ncreated_at: {created_at}\nupdated_at: {}\ntags: [{}]\n---\n\n# {title}\n\n{body}{sources_markdown}\n", Utc::now().to_rfc3339(), tags.join(", "));
    fs::write(&path, markdown)?;
    search::rebuild_index(brain)?;
    read_note(brain, &path)
}

pub fn create_from_review(
    brain: &Path,
    title: &str,
    content: &str,
    source: NoteSource,
) -> AppResult<NoteDocument> {
    let created = save(
        brain,
        &SaveNoteInput {
            relative_path: None,
            title: title.into(),
            body: content.into(),
            tags: Vec::new(),
        },
    )?;
    let path = brain.join(&created.relative_path);
    let markdown = format!(
        "---\nid: {}\ntype: atomic-note\ncreated_at: {}\nupdated_at: {}\ntags: []\n---\n\n# {}\n\n{}\n\n## Sources\n\n- Source: `{}`\n  > {}\n",
        created.id,
        created.created_at,
        Utc::now().to_rfc3339(),
        created.title,
        content.trim(),
        source.relative_path,
        source.quote.replace('\n', " ")
    );
    fs::write(&path, markdown)?;
    search::rebuild_index(brain)?;
    read_note(brain, &path)
}

pub fn merge_from_review(
    brain: &Path,
    relative_path: &str,
    proposed_content: &str,
    source: NoteSource,
    include_content: bool,
) -> AppResult<NoteDocument> {
    if !relative_path.starts_with("notes/") {
        return Err(AppError::InvalidNote(
            "review target must be inside notes/".into(),
        ));
    }
    let path = brain.join(relative_path);
    let mut note = read_note(brain, &path)?;
    if include_content {
        let compact_existing = note
            .body
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        let compact_proposed = proposed_content
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        if !compact_proposed.is_empty() && !compact_existing.contains(&compact_proposed) {
            note.body = format!(
                "{}\n\n## Merged claim\n\n{}",
                note.body.trim(),
                proposed_content.trim()
            );
        }
    }
    if !note.sources.iter().any(|existing| {
        existing.relative_path == source.relative_path && existing.quote == source.quote
    }) {
        note.sources.push(source);
    }
    let sources_markdown = note
        .sources
        .iter()
        .map(|item| {
            format!(
                "- Source: `{}`\n  > {}",
                item.relative_path,
                item.quote.replace('\n', " ")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let markdown = format!(
        "---\nid: {}\ntype: atomic-note\ncreated_at: {}\nupdated_at: {}\ntags: [{}]\n---\n\n# {}\n\n{}\n\n## Sources\n\n{}\n",
        note.id,
        note.created_at,
        Utc::now().to_rfc3339(),
        note.tags.join(", "),
        note.title,
        note.body.trim(),
        sources_markdown
    );
    fs::write(&path, markdown)?;
    search::rebuild_index(brain)?;
    read_note(brain, &path)
}

pub fn trash(brain: &Path, relative_path: &str, trash_folder: &Path) -> AppResult<()> {
    if !relative_path.starts_with("notes/") {
        return Err(AppError::InvalidNote(
            "only notes can be moved to Trash".into(),
        ));
    }
    let source = brain.join(relative_path).canonicalize()?;
    let canonical_notes = brain.join("notes").canonicalize()?;
    if !source.starts_with(canonical_notes) {
        return Err(AppError::InvalidNote("note escaped notes/".into()));
    }
    fs::create_dir_all(trash_folder)?;
    let filename = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("second-brain-note.md");
    let mut destination = trash_folder.join(filename);
    if destination.exists() {
        destination = trash_folder.join(format!(
            "{}-{}.md",
            source
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("note"),
            &Uuid::new_v4().to_string()[..8]
        ));
    }
    fs::rename(source, destination)?;
    search::rebuild_index(brain)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_edits_reads_and_trashes_markdown_notes() {
        let temporary = tempfile::tempdir().expect("root");
        let brain = temporary.path().join("brain");
        let trash_folder = temporary.path().join("trash");
        fs::create_dir_all(brain.join("notes")).expect("notes");
        let created = save(
            &brain,
            &SaveNoteInput {
                relative_path: None,
                title: "Durable idea".into(),
                body: "Raw audio survives transcription failure.".into(),
                tags: vec!["Capture".into(), "local first".into()],
            },
        )
        .expect("create");
        assert_eq!(created.tags, vec!["capture", "local-first"]);
        assert!(brain.join(&created.relative_path).exists());
        let updated = save(
            &brain,
            &SaveNoteInput {
                relative_path: Some(created.relative_path.clone()),
                title: "Durable capture".into(),
                body: "The canonical thought remains readable Markdown.".into(),
                tags: vec!["markdown".into()],
            },
        )
        .expect("edit");
        assert_eq!(updated.title, "Durable capture");
        assert_eq!(list(&brain).expect("list").len(), 1);
        trash(&brain, &updated.relative_path, &trash_folder).expect("trash");
        assert!(list(&brain).expect("empty list").is_empty());
        assert_eq!(fs::read_dir(trash_folder).expect("trash").count(), 1);
    }

    #[test]
    fn reads_source_paths_and_exact_quotes_from_external_markdown() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::write(
            brain.join("notes/linked.md"),
            "---\nid: linked\ntype: atomic-note\ntags: [capture, privacy]\n---\n\n# Linked note\n\nCanonical idea.\n\n## Sources\n\n- Source: `sessions/example/transcript.md`\n  > The exact supporting words remain visible.\n",
        )
        .expect("linked note");
        let note = list(brain).expect("notes").remove(0);
        assert_eq!(note.body, "Canonical idea.");
        assert_eq!(note.sources.len(), 1);
        assert_eq!(
            note.sources[0].relative_path,
            "sessions/example/transcript.md"
        );
        assert_eq!(
            note.sources[0].quote,
            "The exact supporting words remain visible."
        );
    }

    #[test]
    fn lists_case_insensitive_markdown_without_following_symlinks() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path().join("brain");
        let outside = temporary.path().join("outside");
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::create_dir_all(&outside).expect("outside");
        fs::write(
            brain.join("notes/portable.MARKDOWN"),
            "# Portable note\n\nReadable everywhere.",
        )
        .expect("portable note");
        fs::write(
            outside.join("private.md"),
            "# Outside note\n\nMust not be traversed.",
        )
        .expect("outside note");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, brain.join("notes/linked-outside")).expect("symlink");

        let listed = list(&brain).expect("list notes");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "Portable note");
    }
}
