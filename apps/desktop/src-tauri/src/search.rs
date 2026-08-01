use crate::domain::{IndexStats, IndexedSource, SearchQuery, SearchResult, SourceDocument};
use crate::error::{AppError, AppResult};
use crate::storage;
use chrono::Utc;
use rusqlite::params;
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const EMBEDDING_DIMENSIONS: usize = 256;

fn collect_source_files(directory: &Path, brain: &Path, files: &mut Vec<PathBuf>) -> AppResult<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_symlink() {
            let Ok(canonical) = path.canonicalize() else {
                continue;
            };
            let canonical_brain = brain.canonicalize()?;
            if canonical.is_dir() || !canonical.starts_with(&canonical_brain) {
                continue;
            }
        }
        if path.file_name().and_then(|name| name.to_str()) == Some(".second-brain") {
            continue;
        }
        if path.is_dir() && path.parent() == Some(brain) {
            let top_level = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            if ["hosts", "review", "skills", "projects"].contains(&top_level) {
                continue;
            }
        }
        if path.is_dir() {
            collect_source_files(&path, brain, files)?;
        } else if matches!(
            path.extension()
                .and_then(|value| value.to_str())
                .map(str::to_lowercase)
                .as_deref(),
            Some("md" | "markdown" | "txt")
        ) && path.starts_with(brain)
        {
            files.push(path);
        }
    }
    Ok(())
}

fn file_state(brain: &Path, file: &Path) -> AppResult<(String, i64, i64)> {
    let relative_path = file
        .strip_prefix(brain)
        .map_err(|_| AppError::InvalidBrain("indexed file escaped the brain folder".into()))?
        .to_string_lossy()
        .to_string();
    let metadata = fs::metadata(file)?;
    let modified_nanos = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .min(i64::MAX as u128) as i64;
    Ok((
        relative_path,
        modified_nanos,
        metadata.len().min(i64::MAX as u64) as i64,
    ))
}

fn index_is_stale(brain: &Path) -> AppResult<bool> {
    let mut files = Vec::new();
    collect_source_files(brain, brain, &mut files)?;
    let current = files
        .iter()
        .map(|file| file_state(brain, file))
        .collect::<AppResult<Vec<_>>>()?
        .into_iter()
        .map(|(path, modified, size)| (path, (modified, size)))
        .collect::<BTreeMap<_, _>>();
    let connection = storage::open_database(brain)?;
    let indexed = {
        let mut statement = connection
            .prepare("SELECT relative_path, modified_nanos, size_bytes FROM search_source_state")?;
        let records = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    (row.get::<_, i64>(1)?, row.get::<_, i64>(2)?),
                ))
            })?
            .collect::<Result<BTreeMap<_, _>, _>>()?;
        records
    };
    Ok(current != indexed)
}

fn title_from_markdown(markdown: &str, path: &Path) -> String {
    markdown
        .lines()
        .find_map(|line| line.trim().strip_prefix("# ").map(str::trim))
        .filter(|title| !title.is_empty())
        .map(str::to_string)
        .or_else(|| {
            path.file_stem()
                .and_then(|value| value.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "Untitled source".to_string())
}

fn document_id(markdown: &str) -> Option<String> {
    if !markdown.trim_start().starts_with("---") {
        return None;
    }
    markdown
        .lines()
        .skip_while(|line| line.trim() != "---")
        .skip(1)
        .take_while(|line| line.trim() != "---")
        .find_map(|line| {
            line.trim()
                .strip_prefix("id:")
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn report_ambiguous_move(
    brain: &Path,
    id: &str,
    old_path: &str,
    candidates: &[String],
) -> AppResult<()> {
    let review = brain.join("review");
    fs::create_dir_all(&review)?;
    let safe_id = id
        .chars()
        .filter(|character| character.is_alphanumeric() || *character == '-')
        .take(40)
        .collect::<String>();
    let record_id = format!(
        "filesystem-move-{}",
        if safe_id.is_empty() {
            "unknown"
        } else {
            &safe_id
        }
    );
    let path = review.join(format!("{record_id}.md"));
    if path.exists()
        || brain
            .join("review/decisions/approved")
            .join(format!("{record_id}.md"))
            .exists()
        || brain
            .join("review/decisions/denied")
            .join(format!("{record_id}.md"))
            .exists()
    {
        return Ok(());
    }
    fs::write(
        path,
        format!(
            "---\nid: {record_id}\ntype: filesystem-conflict\nstatus: pending\nsource: {old_path}\naction: acknowledge-move-conflict\n---\n\n# Ambiguous external move\n\n## What happened\n\nThe document id `{id}` previously belonged to `{old_path}`, but now appears at more than one path.\n\n## Supporting quote\n\n> {}\n\n## Why it needs attention\n\nAutomatic link repair was skipped because choosing a destination would be a guess.\n\n## Proposed action\n\nResolve the duplicate document ids outside the app, then rebuild the index.\n",
            candidates.join(", ")
        ),
    )?;
    Ok(())
}

fn repair_links_for_move(brain: &Path, old_path: &str, new_path: &str) -> AppResult<usize> {
    let mut files = Vec::new();
    collect_source_files(brain, brain, &mut files)?;
    let old_absolute = brain.join(old_path);
    let new_absolute = brain.join(new_path);
    let old_stem = Path::new(old_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let new_stem = Path::new(new_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let mut repaired = 0;
    for file in files.into_iter().filter(|path| {
        matches!(
            path.extension()
                .and_then(|value| value.to_str())
                .map(str::to_lowercase)
                .as_deref(),
            Some("md" | "markdown")
        )
    }) {
        let parent = file.parent().unwrap_or(brain);
        let old_relative = pathdiff::diff_paths(&old_absolute, parent)
            .unwrap_or_else(|| PathBuf::from(old_path))
            .to_string_lossy()
            .to_string();
        let new_relative = pathdiff::diff_paths(&new_absolute, parent)
            .unwrap_or_else(|| PathBuf::from(new_path))
            .to_string_lossy()
            .to_string();
        let original = fs::read_to_string(&file)?;
        let mut updated = original.replace(&format!("[[{old_stem}]]"), &format!("[[{new_stem}]]"));
        updated = updated.replace(&format!("]({old_relative})"), &format!("]({new_relative})"));
        updated = updated.replace(&format!("](/{old_path})"), &format!("](/{new_path})"));
        if updated != original {
            fs::write(file, updated)?;
            repaired += 1;
        }
    }
    Ok(repaired)
}

fn reconcile_identified_moves(brain: &Path) -> AppResult<usize> {
    let connection = storage::open_database(brain)?;
    let previous = {
        let mut statement = connection.prepare(
            "SELECT relative_path, document_id FROM search_source_state WHERE document_id IS NOT NULL",
        )?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    let mut files = Vec::new();
    collect_source_files(brain, brain, &mut files)?;
    let mut current = BTreeMap::<String, Vec<String>>::new();
    for file in files {
        let markdown = fs::read_to_string(&file)?;
        if let Some(id) = document_id(&markdown) {
            let relative = file
                .strip_prefix(brain)
                .map_err(|_| AppError::InvalidBrain("reconciled file escaped the brain".into()))?
                .to_string_lossy()
                .to_string();
            current.entry(id).or_default().push(relative);
        }
    }
    let mut repaired = 0;
    for (old_path, id) in previous {
        if brain.join(&old_path).exists() {
            continue;
        }
        let Some(candidates) = current.get(&id) else {
            continue;
        };
        if candidates.len() == 1 {
            repaired += repair_links_for_move(brain, &old_path, &candidates[0])?;
        } else {
            report_ambiguous_move(brain, &id, &old_path, candidates)?;
        }
    }
    Ok(repaired)
}

pub fn reconcile_external_changes(brain: &Path) -> AppResult<bool> {
    if !index_is_stale(brain)? {
        return Ok(false);
    }
    reconcile_identified_moves(brain)?;
    rebuild_index(brain)?;
    Ok(true)
}

fn source_type(relative_path: &str) -> &'static str {
    if relative_path.starts_with("sessions/") {
        "session"
    } else if relative_path.starts_with("notes/") {
        "note"
    } else {
        "source"
    }
}

fn unicode_chunks(text: &str, maximum_bytes: usize) -> Vec<String> {
    if text.len() <= maximum_bytes {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let mut end = (start + maximum_bytes).min(text.len());
        while end > start && !text.is_char_boundary(end) {
            end -= 1;
        }
        if end == start {
            end = text[start..]
                .char_indices()
                .nth(1)
                .map(|(offset, _)| start + offset)
                .unwrap_or(text.len());
        }
        chunks.push(text[start..end].to_string());
        start = end;
    }
    chunks
}

fn split_passages(markdown: &str) -> Vec<(String, String)> {
    let mut passages = Vec::new();
    let mut current_heading = String::new();
    let mut in_frontmatter = markdown.trim_start().starts_with("---");
    for block in markdown.split("\n\n") {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }
        if in_frontmatter {
            if block.ends_with("---") && block != "---" {
                in_frontmatter = false;
            }
            continue;
        }
        if block.starts_with('#') {
            current_heading = block
                .lines()
                .next()
                .unwrap_or_default()
                .trim_matches('#')
                .trim()
                .to_string();
            continue;
        }
        if block.len() < 12 {
            continue;
        }
        for quote in unicode_chunks(block, 1000) {
            let search_text = if current_heading.is_empty() {
                quote.clone()
            } else {
                format!("{current_heading} {quote}")
            };
            passages.push((quote, search_text));
        }
    }
    passages
}

fn normalize_token(token: &str) -> String {
    match token {
        "recording" | "recorded" | "records" => "record".into(),
        "thoughts" | "ideas" => "idea".into(),
        "documents" | "docs" | "files" => "document".into(),
        "private" | "privacy" => "privacy".into(),
        "offline" | "local-first" => "local".into(),
        "transcripts" | "transcription" => "transcript".into(),
        value if value.ends_with("ing") && value.len() > 5 => value[..value.len() - 3].to_string(),
        value if value.ends_with('s') && value.len() > 4 => value[..value.len() - 1].to_string(),
        value => value.to_string(),
    }
}

fn tokens(text: &str) -> Vec<String> {
    const STOPWORDS: &[&str] = &[
        "the", "a", "an", "and", "or", "to", "of", "in", "is", "it", "that", "this", "for", "on",
        "with", "be", "as", "by", "i", "my", "we", "you",
    ];
    text.to_lowercase()
        .split(|character: char| !character.is_alphanumeric() && character != '-')
        .filter(|token| token.len() > 1 && !STOPWORDS.contains(token))
        .map(normalize_token)
        .collect()
}

fn semantic_tokens(text: &str) -> Vec<String> {
    let mut terms = tokens(text);
    let original = terms.clone();
    for term in original {
        let related: &[&str] = match term.as_str() {
            "privacy" | "confidential" | "security" => {
                &["privacy", "cloud", "local", "permission", "consent"]
            }
            "capture" | "record" | "voice" => {
                &["capture", "record", "audio", "voice", "microphone"]
            }
            "reliable" | "durable" | "failure" => {
                &["reliable", "durable", "save", "failure", "recover"]
            }
            "own" | "ownership" | "portable" => {
                &["ownership", "markdown", "file", "portable", "readable"]
            }
            "search" | "find" | "retrieve" => &["search", "retrieve", "index", "passage"],
            "interview" | "host" | "question" => &["interview", "host", "question", "conversation"],
            _ => &[],
        };
        terms.extend(related.iter().map(|value| value.to_string()));
    }
    terms.sort();
    terms.dedup();
    terms
}

fn stable_hash(value: &str) -> u64 {
    value
        .as_bytes()
        .iter()
        .fold(0xcbf29ce484222325, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        })
}

fn related_embed(text: &str) -> Vec<f32> {
    let terms = semantic_tokens(text);
    let mut vector = vec![0.0_f32; EMBEDDING_DIMENSIONS];
    for (index, term) in terms.iter().enumerate() {
        let hash = stable_hash(term);
        let slot = hash as usize % EMBEDDING_DIMENSIONS;
        vector[slot] += if hash & 1 == 0 { 1.0 } else { -1.0 };
        if let Some(next) = terms.get(index + 1) {
            let bigram = format!("{term}:{next}");
            let bigram_hash = stable_hash(&bigram);
            let bigram_slot = bigram_hash as usize % EMBEDDING_DIMENSIONS;
            vector[bigram_slot] += if bigram_hash & 1 == 0 { 0.65 } else { -0.65 };
        }
    }
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm > 0.0 {
        vector.iter_mut().for_each(|value| *value /= norm);
    }
    vector
}

#[cfg(target_os = "macos")]
fn model_embed(text: &str) -> Option<Vec<f32>> {
    use objc2::msg_send;
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2_foundation::{NSArray, NSNumber, NSString};

    autoreleasepool(|_| unsafe {
        let class = AnyClass::get(c"NLEmbedding")?;
        let language = NSString::from_str("en");
        let embedding: Option<Retained<AnyObject>> =
            msg_send![class, sentenceEmbeddingForLanguage: &*language];
        let embedding = embedding?;
        let sentence = NSString::from_str(text);
        let vector: Option<Retained<NSArray<NSNumber>>> =
            msg_send![&*embedding, vectorForString: &*sentence];
        vector.map(|values| {
            let mut vector = values
                .iter()
                .map(|number| number.doubleValue() as f32)
                .collect::<Vec<_>>();
            let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
            if norm > 0.0 {
                vector.iter_mut().for_each(|value| *value /= norm);
            }
            vector
        })
    })
}

#[cfg(not(target_os = "macos"))]
fn model_embed(_text: &str) -> Option<Vec<f32>> {
    None
}

fn cosine(left: &[f32], right: &[f32]) -> f64 {
    left.iter()
        .zip(right)
        .map(|(a, b)| f64::from(a * b))
        .sum::<f64>()
        .max(0.0)
}

fn lexical_score(query_terms: &[String], content: &str) -> f64 {
    let content_terms = tokens(content);
    if query_terms.is_empty() || content_terms.is_empty() {
        return 0.0;
    }
    let matches = query_terms
        .iter()
        .map(|term| {
            content_terms
                .iter()
                .filter(|candidate| *candidate == term)
                .count() as f64
        })
        .sum::<f64>();
    let coverage = query_terms
        .iter()
        .filter(|term| content_terms.contains(term))
        .count() as f64
        / query_terms.len() as f64;
    let raw = matches / (content_terms.len() as f64).sqrt() + coverage * 1.5;
    raw / (raw + 1.0)
}

pub fn rebuild_index(brain: &Path) -> AppResult<IndexStats> {
    let mut files = Vec::new();
    collect_source_files(brain, brain, &mut files)?;
    files.sort();
    let connection = storage::open_database(brain)?;
    let transaction = connection.unchecked_transaction()?;
    transaction.execute("DELETE FROM passages", [])?;
    transaction.execute("DELETE FROM search_source_state", [])?;
    let indexed_at = Utc::now().to_rfc3339();
    let mut passages_indexed = 0;
    for file in &files {
        let (state_path, modified_nanos, size_bytes) = file_state(brain, file)?;
        let markdown = fs::read_to_string(file)?;
        transaction.execute(
            "INSERT INTO search_source_state (relative_path, modified_nanos, size_bytes, document_id) VALUES (?1, ?2, ?3, ?4)",
            params![state_path, modified_nanos, size_bytes, document_id(&markdown)],
        )?;
        let relative = file
            .strip_prefix(brain)
            .map_err(|_| AppError::InvalidBrain("indexed file escaped the brain folder".into()))?;
        let relative_path = relative.to_string_lossy().to_string();
        let title = title_from_markdown(&markdown, file);
        for (ordinal, (quote, search_text)) in split_passages(&markdown).into_iter().enumerate() {
            let id = format!(
                "{:016x}",
                stable_hash(&format!("{relative_path}:{ordinal}:{quote}"))
            );
            let embedding_json =
                serde_json::to_string(&model_embed(&search_text).unwrap_or_default())?;
            transaction.execute(
                "INSERT INTO passages (id, relative_path, title, source_type, content, embedding_json, ordinal, indexed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![id, relative_path, title, source_type(&relative_path), quote, embedding_json, ordinal as i64, indexed_at],
            )?;
            passages_indexed += 1;
        }
    }
    transaction.commit()?;
    Ok(IndexStats {
        files_indexed: files.len(),
        passages_indexed,
        indexed_at,
    })
}

pub fn clear_index(brain: &Path) -> AppResult<IndexStats> {
    let connection = storage::open_database(brain)?;
    let transaction = connection.unchecked_transaction()?;
    transaction.execute("DELETE FROM passages", [])?;
    transaction.execute("DELETE FROM search_source_state", [])?;
    transaction.commit()?;
    Ok(IndexStats {
        files_indexed: 0,
        passages_indexed: 0,
        indexed_at: Utc::now().to_rfc3339(),
    })
}

fn scope_matches(query: &SearchQuery, source_type: &str, path: &str) -> bool {
    match query.scope.as_str() {
        "sessions" | "session" => source_type == "session",
        "notes" => source_type == "note",
        "selected" => {
            source_type == "note" && query.selected_paths.iter().any(|selected| selected == path)
        }
        "selected-any" => query.selected_paths.iter().any(|selected| selected == path),
        "sources" => source_type == "source",
        _ => true,
    }
}

pub fn list_sources(brain: &Path) -> AppResult<Vec<IndexedSource>> {
    reconcile_external_changes(brain)?;
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT title, relative_path, source_type FROM passages GROUP BY relative_path, title, source_type ORDER BY title",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(IndexedSource {
            title: row.get(0)?,
            relative_path: row.get(1)?,
            source_type: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn search(brain: &Path, query: &SearchQuery) -> AppResult<Vec<SearchResult>> {
    if !["hybrid", "lexical", "semantic", "related"].contains(&query.mode.as_str()) {
        return Err(AppError::InvalidSearch(format!(
            "unsupported mode: {}",
            query.mode
        )));
    }
    if ![
        "all",
        "sessions",
        "session",
        "notes",
        "selected",
        "selected-any",
        "sources",
    ]
    .contains(&query.scope.as_str())
    {
        return Err(AppError::InvalidSearch(format!(
            "unsupported scope: {}",
            query.scope
        )));
    }
    if matches!(query.scope.as_str(), "selected" | "selected-any")
        && query.selected_paths.is_empty()
    {
        return Err(AppError::InvalidSearch(
            "selected scope requires at least one exact source path".into(),
        ));
    }
    reconcile_external_changes(brain)?;
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, relative_path, title, source_type, content, embedding_json FROM passages",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;
    let query_terms = tokens(&query.query);
    let query_embedding = model_embed(&query.query);
    if query.mode == "semantic" && query_embedding.is_none() {
        return Err(AppError::InvalidSearch(
            "the macOS sentence-embedding model is unavailable for English".into(),
        ));
    }
    let related_query_embedding = related_embed(&query.query);
    let mut scored = Vec::new();
    for row in rows {
        let (passage_id, relative_path, title, source_type, content, embedding_json) = row?;
        if !scope_matches(query, &source_type, &relative_path) {
            continue;
        }
        let lexical = lexical_score(&query_terms, &format!("{title} {content}"));
        let embedding: Vec<f32> = serde_json::from_str(&embedding_json)?;
        let semantic = query_embedding
            .as_deref()
            .filter(|query_vector| !embedding.is_empty() && query_vector.len() == embedding.len())
            .map(|query_vector| cosine(query_vector, &embedding))
            .unwrap_or(0.0);
        let related = cosine(
            &related_query_embedding,
            &related_embed(&format!("{title} {content}")),
        );
        let score = match query.mode.as_str() {
            "lexical" => lexical,
            "semantic" => semantic,
            "related" => related,
            _ => lexical * 0.72 + semantic * 0.23 + related * 0.05,
        };
        if score <= 0.0 {
            continue;
        }
        scored.push(SearchResult {
            passage_id,
            title,
            relative_path,
            source_type,
            quote: content,
            score,
            lexical_score: lexical,
            semantic_score: if query.mode == "related" {
                related
            } else {
                semantic
            },
            match_type: query.mode.clone(),
        });
    }
    scored.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(Ordering::Equal)
    });
    scored.truncate(query.limit.unwrap_or(20).min(100));
    Ok(scored)
}

/// Retrieves a wider candidate pool, removes repeated passages, and gives
/// different source files a chance to contribute before filling remaining slots.
pub fn search_diverse(
    brain: &Path,
    query: &SearchQuery,
    max_per_source_first_pass: usize,
) -> AppResult<Vec<SearchResult>> {
    let target = query.limit.unwrap_or(20).clamp(1, 100);
    let mut candidate_query = query.clone();
    candidate_query.limit = Some((target * 4).min(100));
    let candidates = search(brain, &candidate_query)?;
    let mut seen_passages = BTreeSet::new();
    let mut source_counts = BTreeMap::<String, usize>::new();
    let mut selected = Vec::with_capacity(target);
    let mut deferred = Vec::new();

    for result in candidates {
        let normalized = result
            .quote
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        if !seen_passages.insert(normalized) {
            continue;
        }
        let count = source_counts
            .get(&result.relative_path)
            .copied()
            .unwrap_or(0);
        if count < max_per_source_first_pass.max(1) {
            source_counts.insert(result.relative_path.clone(), count + 1);
            selected.push(result);
        } else {
            deferred.push(result);
        }
        if selected.len() == target {
            return Ok(selected);
        }
    }
    selected.extend(
        deferred
            .into_iter()
            .take(target.saturating_sub(selected.len())),
    );
    Ok(selected)
}

pub fn read_source(brain: &Path, relative_path: &str) -> AppResult<SourceDocument> {
    let requested = brain.join(relative_path);
    let canonical_brain = brain.canonicalize()?;
    let canonical_file = requested.canonicalize()?;
    if !canonical_file.starts_with(&canonical_brain) {
        return Err(AppError::InvalidBrain(
            "source path escaped the active brain".into(),
        ));
    }
    let markdown = fs::read_to_string(&canonical_file)?;
    Ok(SourceDocument {
        title: title_from_markdown(&markdown, &canonical_file),
        relative_path: relative_path.to_string(),
        absolute_path: canonical_file.to_string_lossy().to_string(),
        markdown,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexes_markdown_and_returns_passage_level_hybrid_results() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes directory");
        fs::create_dir_all(brain.join("sessions/voice")).expect("session directory");
        fs::create_dir_all(brain.join("sources")).expect("sources directory");
        fs::write(
            brain.join("notes/privacy.md"),
            "# Privacy boundary\n\nThe brain remains local and private. Cloud fallback always requires explicit confirmation.",
        )
        .expect("privacy note");
        fs::write(
            brain.join("sessions/voice/transcript.md"),
            "# Voice capture\n\nRecording starts while the capture button is held and stops on release.",
        )
        .expect("transcript");
        fs::write(
            brain.join("sources/manual.txt"),
            "# Product manual\n\nImported source files remain readable and portable.",
        )
        .expect("imported source");

        let stats = rebuild_index(brain).expect("index");
        assert_eq!(stats.files_indexed, 3);
        assert_eq!(stats.passages_indexed, 3);
        let results = search(
            brain,
            &SearchQuery {
                query: "private local cloud permission".into(),
                mode: "hybrid".into(),
                scope: "all".into(),
                limit: Some(10),
                selected_paths: Vec::new(),
            },
        )
        .expect("search");
        assert_eq!(results[0].relative_path, "notes/privacy.md");
        assert_eq!(results[0].quote, "The brain remains local and private. Cloud fallback always requires explicit confirmation.");
        assert_eq!(
            read_source(brain, "notes/privacy.md")
                .expect("source")
                .title,
            "Privacy boundary"
        );

        fs::write(
            brain.join("notes/privacy.md"),
            "# Privacy boundary\n\nExternal editors remain authoritative. Tangerine changes are detected before the next search.",
        )
        .expect("external update");
        let refreshed = search(
            brain,
            &SearchQuery {
                query: "tangerine authoritative".into(),
                mode: "lexical".into(),
                scope: "notes".into(),
                limit: Some(5),
                selected_paths: Vec::new(),
            },
        )
        .expect("search after external edit");
        assert_eq!(refreshed.len(), 1);
        assert!(refreshed[0].quote.contains("External editors"));

        let session_only = search(
            brain,
            &SearchQuery {
                query: "capture button release".into(),
                mode: "lexical".into(),
                scope: "sessions".into(),
                limit: Some(5),
                selected_paths: Vec::new(),
            },
        )
        .expect("session scope");
        assert_eq!(session_only.len(), 1);
        assert_eq!(session_only[0].source_type, "session");

        let selected_note = search(
            brain,
            &SearchQuery {
                query: "authoritative tangerine".into(),
                mode: "lexical".into(),
                scope: "selected".into(),
                limit: Some(5),
                selected_paths: vec!["notes/privacy.md".into()],
            },
        )
        .expect("selected note scope");
        assert_eq!(selected_note.len(), 1);
        assert_eq!(selected_note[0].relative_path, "notes/privacy.md");

        let imported_only = search(
            brain,
            &SearchQuery {
                query: "portable readable".into(),
                mode: "related".into(),
                scope: "sources".into(),
                limit: Some(5),
                selected_paths: Vec::new(),
            },
        )
        .expect("imported source scope");
        assert_eq!(imported_only.len(), 1);
        assert_eq!(imported_only[0].relative_path, "sources/manual.txt");

        fs::remove_file(brain.join("notes/privacy.md")).expect("external delete");
        let after_delete = search(
            brain,
            &SearchQuery {
                query: "tangerine authoritative".into(),
                mode: "lexical".into(),
                scope: "all".into(),
                limit: Some(5),
                selected_paths: Vec::new(),
            },
        )
        .expect("search after external delete");
        assert!(after_delete.is_empty());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn semantic_mode_uses_the_macos_sentence_model_for_paraphrases() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::write(
            brain.join("notes/orders.md"),
            "# Delivery help\n\nHow do I check the status of my delivery order?",
        )
        .expect("note");
        let vector = model_embed("Where is the package I ordered?").expect("Apple sentence model");
        assert!(vector.len() > 100);
        rebuild_index(brain).expect("index");

        let results = search(
            brain,
            &SearchQuery {
                query: "Where is the package I ordered?".into(),
                mode: "semantic".into(),
                scope: "notes".into(),
                limit: Some(5),
                selected_paths: Vec::new(),
            },
        )
        .expect("semantic search");
        assert_eq!(results[0].relative_path, "notes/orders.md");
        assert!(results[0].semantic_score > 0.1);
    }

    #[test]
    fn reconciles_identified_external_moves_and_repairs_safe_links() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::write(
            brain.join("notes/original.md"),
            "---\nid: stable-note-id\n---\n\n# Original\n\nDurable content.",
        )
        .expect("original");
        fs::write(
            brain.join("notes/reference.md"),
            "---\nid: reference-id\n---\n\n# Reference\n\nSee [[original]] and [the source](original.md).",
        ).expect("reference");
        rebuild_index(brain).expect("initial index");
        fs::rename(
            brain.join("notes/original.md"),
            brain.join("notes/renamed.md"),
        )
        .expect("external move");

        assert!(reconcile_external_changes(brain).expect("reconcile"));
        let reference = fs::read_to_string(brain.join("notes/reference.md")).expect("reference");
        assert!(reference.contains("[[renamed]]"));
        assert!(reference.contains("](renamed.md)"));
        assert!(!reference.contains("original.md"));
        let sources = list_sources(brain).expect("sources");
        assert!(sources
            .iter()
            .any(|source| source.relative_path == "notes/renamed.md"));
        assert!(sources
            .iter()
            .all(|source| source.relative_path != "notes/original.md"));
    }

    #[test]
    fn ambiguous_external_moves_are_reported_in_review_without_link_guessing() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::create_dir_all(brain.join("review")).expect("review");
        fs::write(
            brain.join("notes/original.md"),
            "---\nid: duplicate-id\n---\n\n# Original\n\nContent.",
        )
        .expect("original");
        rebuild_index(brain).expect("index");
        fs::remove_file(brain.join("notes/original.md")).expect("remove");
        fs::write(
            brain.join("notes/copy-a.md"),
            "---\nid: duplicate-id\n---\n\n# A\n\nContent.",
        )
        .expect("copy a");
        fs::write(
            brain.join("notes/copy-b.md"),
            "---\nid: duplicate-id\n---\n\n# B\n\nContent.",
        )
        .expect("copy b");

        reconcile_external_changes(brain).expect("reconcile");
        let records = crate::review::list(brain).expect("review");
        assert!(records
            .iter()
            .any(|record| record.item_type == "filesystem-conflict"));
    }

    #[test]
    fn passage_chunks_preserve_utf8_and_source_wording() {
        let paragraph = format!("{} end marker", "éclair 🧠 ".repeat(180));
        let markdown = format!("# Unicode\n\n{paragraph}");
        let passages = split_passages(&markdown);

        assert!(passages.len() > 1);
        assert_eq!(
            passages
                .iter()
                .map(|(quote, _)| quote.as_str())
                .collect::<String>(),
            paragraph
        );
        assert!(passages
            .iter()
            .all(|(quote, context)| context.starts_with("Unicode ") && context.ends_with(quote)));
    }

    #[test]
    fn rejects_unknown_and_empty_selected_scopes_instead_of_searching_everything() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::write(
            brain.join("notes/private.md"),
            "# Private\n\nThis must not leak through an invalid scope.",
        )
        .expect("private note");
        rebuild_index(brain).expect("index");

        for query in [
            SearchQuery {
                query: "private leak".into(),
                mode: "hybrid".into(),
                scope: "corrupted".into(),
                limit: Some(5),
                selected_paths: vec![],
            },
            SearchQuery {
                query: "private leak".into(),
                mode: "hybrid".into(),
                scope: "selected".into(),
                limit: Some(5),
                selected_paths: vec![],
            },
        ] {
            assert!(search(brain, &query).is_err());
        }
    }

    #[test]
    fn diverse_search_prioritizes_coverage_across_source_files() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::write(brain.join("notes/alpha.md"), "# Alpha\n\nResearch evidence supports the shared launch decision.\n\nMore research evidence explains the shared launch decision.\n\nAdditional research evidence documents the shared launch decision.").expect("alpha");
        fs::write(
            brain.join("notes/beta.md"),
            "# Beta\n\nIndependent research evidence challenges the shared launch decision.",
        )
        .expect("beta");
        rebuild_index(brain).expect("index");
        let results = search_diverse(
            brain,
            &SearchQuery {
                query: "research evidence shared launch decision".into(),
                mode: "hybrid".into(),
                scope: "all".into(),
                limit: Some(3),
                selected_paths: vec![],
            },
            1,
        )
        .expect("diverse search");
        let sources = results
            .iter()
            .map(|result| result.relative_path.as_str())
            .collect::<BTreeSet<_>>();
        assert_eq!(results.len(), 3);
        assert!(
            sources.len() >= 2,
            "expected evidence from more than one source file"
        );
    }

    #[test]
    fn clearing_the_derived_index_never_removes_source_files() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        let source = brain.join("notes/durable.md");
        fs::write(&source, "# Durable\n\nThe Markdown source remains canonical.").expect("source");
        assert!(rebuild_index(brain).expect("index").passages_indexed > 0);

        let cleared = clear_index(brain).expect("clear derived data");
        assert_eq!(cleared.files_indexed, 0);
        assert_eq!(cleared.passages_indexed, 0);
        assert!(source.is_file());
        let connection = storage::open_database(brain).expect("database");
        let passage_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM passages", [], |row| row.get(0))
            .expect("passage count");
        assert_eq!(passage_count, 0);
    }
}
