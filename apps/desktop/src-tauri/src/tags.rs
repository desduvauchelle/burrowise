use crate::domain::{TagSummary, TaggedSource, TagsOverview};
use crate::error::AppResult;
use crate::{notes, storage};
use std::collections::BTreeMap;
use std::path::Path;

fn normalized_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized = tags
        .into_iter()
        .map(|tag| {
            tag.trim()
                .trim_start_matches('#')
                .split_whitespace()
                .collect::<Vec<_>>()
                .join("-")
                .to_lowercase()
        })
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized
}

pub fn overview(brain: &Path) -> AppResult<TagsOverview> {
    let mut sources = notes::list(brain)?
        .into_iter()
        .map(|note| TaggedSource {
            id: format!("note:{}", note.id),
            title: note.title,
            relative_path: note.relative_path,
            source_type: "note".into(),
            tags: normalized_tags(note.tags),
            updated_at: note.updated_at,
            source_count: note.sources.len(),
        })
        .collect::<Vec<_>>();
    sources.extend(
        storage::list_sessions(brain)?
            .into_iter()
            .filter(|session| !session.tags.is_empty())
            .map(|session| TaggedSource {
                id: format!("capture:{}", session.id),
                title: session.title,
                relative_path: format!("{}/transcript.md", session.relative_folder),
                source_type: "capture".into(),
                tags: normalized_tags(session.tags),
                updated_at: session.updated_at,
                source_count: 1,
            }),
    );
    sources.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then(left.title.cmp(&right.title))
    });
    let mut counts = BTreeMap::new();
    for source in &sources {
        for tag in &source.tags {
            *counts.entry(tag.clone()).or_insert(0_usize) += 1;
        }
    }
    let mut tags = counts
        .into_iter()
        .map(|(name, count)| TagSummary { name, count })
        .collect::<Vec<_>>();
    tags.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then(left.name.cmp(&right.name))
    });
    Ok(TagsOverview { tags, sources })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::SaveNoteInput;
    use crate::notes;
    use std::fs;

    #[test]
    fn derives_counts_and_sources_from_real_markdown_and_sessions() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in ["notes", "sessions", "review"] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        notes::save(
            brain,
            &SaveNoteInput {
                relative_path: None,
                title: "Private capture".into(),
                body: "Audio stays local.".into(),
                tags: vec!["privacy".into(), "capture".into()],
            },
        )
        .expect("note");
        let session = storage::create_session(brain).expect("session");
        storage::complete_session_processing(
            brain,
            &session.id,
            "test",
            "Local capture protects privacy.",
            "Local capture",
            "Summary",
            &["privacy".into()],
            &[],
        )
        .expect("complete");
        fs::write(
            brain.join("notes/external.md"),
            "---\ntags: [Privacy, #privacy, local first]\n---\n\n# External note\n\nEdited outside the app.",
        )
        .expect("external note");
        let result = overview(brain).expect("overview");
        assert_eq!(
            result
                .tags
                .iter()
                .find(|tag| tag.name == "privacy")
                .expect("privacy")
                .count,
            3
        );
        assert_eq!(
            result
                .tags
                .iter()
                .find(|tag| tag.name == "local-first")
                .expect("normalized tag")
                .count,
            1
        );
        assert_eq!(result.sources.len(), 3);
        assert!(result
            .sources
            .iter()
            .any(|source| source.source_type == "capture"));
    }
}
