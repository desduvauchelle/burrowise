use std::cmp::Reverse;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct CaptureEnrichment {
    pub title: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub atomic_notes: Vec<AtomicNoteDraft>,
}

#[derive(Debug, Clone)]
pub struct AtomicNoteDraft {
    pub title: String,
    pub content: String,
    pub quote: String,
}

const STOP_WORDS: &[&str] = &[
    "about",
    "after",
    "again",
    "also",
    "because",
    "been",
    "before",
    "being",
    "between",
    "could",
    "does",
    "doing",
    "from",
    "going",
    "have",
    "here",
    "into",
    "just",
    "like",
    "make",
    "maybe",
    "more",
    "much",
    "need",
    "only",
    "other",
    "really",
    "should",
    "some",
    "something",
    "still",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "thing",
    "think",
    "this",
    "those",
    "through",
    "very",
    "want",
    "what",
    "when",
    "where",
    "which",
    "while",
    "with",
    "would",
    "your",
    "you're",
    "it's",
    "i'm",
    "don't",
    "can't",
];

const CONCEPTS: &[(&str, &[&str])] = &[
    (
        "voice-capture",
        &[
            "audio",
            "capture",
            "dictation",
            "microphone",
            "record",
            "recording",
            "speech",
            "voice",
        ],
    ),
    (
        "transcription",
        &[
            "caption",
            "dictation",
            "speech",
            "transcript",
            "transcription",
        ],
    ),
    (
        "local-first",
        &["local", "offline", "on-device", "private", "privacy"],
    ),
    (
        "second-brain",
        &["brain", "knowledge", "memory", "note", "notes", "obsidian"],
    ),
    (
        "writing",
        &[
            "article", "blog", "book", "draft", "essay", "story", "write", "writing",
        ],
    ),
    (
        "product",
        &["app", "customer", "feature", "product", "user", "users"],
    ),
    (
        "workflow",
        &["process", "stage", "step", "system", "workflow"],
    ),
    (
        "interview",
        &["conversation", "host", "interview", "podcast", "question"],
    ),
    (
        "research",
        &["evidence", "learn", "research", "source", "sources"],
    ),
    (
        "privacy",
        &[
            "consent",
            "encrypt",
            "permission",
            "privacy",
            "private",
            "secure",
            "security",
        ],
    ),
];

fn words(text: &str) -> Vec<String> {
    text.split(|character: char| {
        !character.is_alphanumeric() && character != '-' && character != '\''
    })
    .map(|word| word.trim_matches(['-', '\'']).to_lowercase())
    .filter(|word| word.len() >= 3)
    .collect()
}

fn sentences(text: &str) -> Vec<String> {
    text.split_inclusive(['.', '?', '!'])
        .map(str::trim)
        .filter(|sentence| !sentence.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn shorten_at_word(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.trim().to_string();
    }
    let shortened = text
        .split_whitespace()
        .scan(0usize, |length, word| {
            let next = *length + usize::from(*length > 0) + word.chars().count();
            if next > max_chars.saturating_sub(1) {
                None
            } else {
                *length = next;
                Some(word)
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    format!("{}…", shortened.trim_end_matches([',', ';', ':']))
}

fn title_from_transcript(transcript: &str) -> String {
    let first = sentences(transcript)
        .into_iter()
        .next()
        .unwrap_or_else(|| transcript.trim().to_string());
    let without_filler = first
        .trim_start_matches(|character: char| character.is_whitespace())
        .trim_start_matches("So ")
        .trim_start_matches("Okay, ")
        .trim_start_matches("Alright, ")
        .trim_end_matches(['.', '?', '!']);
    let mut title = shorten_at_word(without_filler, 72);
    if let Some(first) = title.get_mut(0..1) {
        first.make_ascii_uppercase();
    }
    if title.is_empty() {
        "Voice capture".into()
    } else {
        title
    }
}

fn summary_from_transcript(transcript: &str) -> String {
    let selected = sentences(transcript)
        .into_iter()
        .take(2)
        .collect::<Vec<_>>()
        .join(" ");
    shorten_at_word(
        if selected.is_empty() {
            transcript
        } else {
            &selected
        },
        360,
    )
}

fn atomic_notes_from_transcript(transcript: &str) -> Vec<AtomicNoteDraft> {
    sentences(transcript)
        .into_iter()
        .filter(|sentence| sentence.split_whitespace().count() >= 6)
        .take(6)
        .map(|quote| {
            let content = quote.trim().to_string();
            AtomicNoteDraft {
                title: shorten_at_word(content.trim_end_matches(['.', '?', '!']), 72),
                content: content.clone(),
                quote: content,
            }
        })
        .collect()
}

fn collect_markdown_files(folder: &Path, files: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.file_name().and_then(|name| name.to_str()) == Some(".second-brain") {
            continue;
        }
        if path.is_dir() {
            collect_markdown_files(&path, files);
        } else if path.extension().and_then(|extension| extension.to_str()) == Some("md") {
            files.push(path);
        }
    }
}

fn existing_tags(brain: &Path) -> BTreeSet<String> {
    let mut files = Vec::new();
    collect_markdown_files(brain, &mut files);
    let mut tags = BTreeSet::new();
    for path in files.into_iter().take(2_000) {
        let Ok(markdown) = fs::read_to_string(path) else {
            continue;
        };
        for line in markdown.lines().take(80) {
            let Some(raw) = line.trim().strip_prefix("tags:") else {
                continue;
            };
            for tag in raw
                .trim()
                .trim_matches(['[', ']'])
                .split(',')
                .map(|tag| tag.trim().trim_matches(['"', '\'']).trim_start_matches('#'))
                .filter(|tag| !tag.is_empty())
            {
                tags.insert(tag.to_lowercase());
            }
        }
    }
    tags
}

fn tags_from_transcript(brain: &Path, transcript: &str) -> Vec<String> {
    let transcript_words = words(transcript);
    let word_set = transcript_words
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut selected = Vec::new();

    for (tag, triggers) in CONCEPTS {
        if triggers.iter().any(|trigger| word_set.contains(trigger)) {
            selected.push((*tag).to_string());
        }
    }

    for tag in existing_tags(brain) {
        let parts = words(&tag);
        if !parts.is_empty()
            && parts.iter().all(|part| word_set.contains(part.as_str()))
            && !selected.contains(&tag)
        {
            selected.push(tag);
        }
    }

    let stop = STOP_WORDS.iter().copied().collect::<HashSet<_>>();
    let mut counts = HashMap::<String, usize>::new();
    for word in transcript_words {
        if word.len() >= 4 && !stop.contains(word.as_str()) && !word.chars().all(char::is_numeric) {
            *counts.entry(word).or_default() += 1;
        }
    }
    let mut ranked = counts.into_iter().collect::<Vec<_>>();
    ranked.sort_by_key(|(word, count)| (Reverse(*count), Reverse(word.len()), word.clone()));
    for (word, _) in ranked {
        if selected.len() >= 7 {
            break;
        }
        if !selected.iter().any(|tag| tag == &word) && !CONCEPTS.iter().any(|(tag, _)| tag == &word)
        {
            selected.push(word);
        }
    }
    if selected.is_empty() {
        selected.push("voice-capture".into());
    }
    selected.truncate(7);
    selected
}

pub fn enrich_capture(brain: &Path, transcript: &str) -> CaptureEnrichment {
    CaptureEnrichment {
        title: title_from_transcript(transcript),
        summary: summary_from_transcript(transcript),
        tags: tags_from_transcript(brain, transcript),
        atomic_notes: atomic_notes_from_transcript(transcript),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_readable_title_summary_and_tags_without_rewriting_the_transcript() {
        let brain = tempfile::tempdir().expect("brain");
        fs::write(
            brain.path().join("existing.md"),
            "---\ntags: [privacy, product-thinking]\n---\n# Existing\n",
        )
        .expect("existing tags");
        let transcript = "Okay, I want voice recording to work offline and preserve privacy. The product should save audio before transcription starts.";
        let enriched = enrich_capture(brain.path(), transcript);
        assert!(enriched.title.starts_with("I want voice recording"));
        assert_eq!(enriched.summary, transcript);
        assert!(enriched.tags.contains(&"voice-capture".into()));
        assert!(enriched.tags.contains(&"local-first".into()));
        assert!(enriched.tags.contains(&"privacy".into()));
        assert!(enriched.tags.contains(&"product".into()));
        assert_eq!(enriched.atomic_notes.len(), 2);
        assert_eq!(
            enriched.atomic_notes[0].quote,
            "Okay, I want voice recording to work offline and preserve privacy."
        );
    }
}
