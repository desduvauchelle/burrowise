use crate::domain::{AgentProposal, NoteSource, ResolveReviewInput, ReviewDecision, ReviewRecord, SaveNoteInput};
use crate::error::{AppError, AppResult};
use crate::{capture, notes, search, storage};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};

fn pending_files(brain: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(brain.join("review")) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            !path.is_symlink()
                && path.is_file()
                && matches!(
                    path.extension()
                        .and_then(|value| value.to_str())
                        .map(str::to_lowercase)
                        .as_deref(),
                    Some("md" | "markdown")
                )
        })
        .collect()
}

fn frontmatter(markdown: &str, key: &str) -> Option<String> {
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

fn section(markdown: &str, heading: &str) -> String {
    let marker = format!("## {heading}");
    let mut active = false;
    let mut lines = Vec::new();
    for line in markdown.lines() {
        if line.trim() == marker {
            active = true;
            continue;
        }
        if active && line.trim_start().starts_with("## ") {
            break;
        }
        if active {
            lines.push(line);
        }
    }
    lines.join("\n").trim().trim_start_matches("> ").to_string()
}

fn record_from_file(brain: &Path, path: &Path) -> AppResult<ReviewRecord> {
    let markdown = fs::read_to_string(path)?;
    let item_type = frontmatter(&markdown, "type").unwrap_or_else(|| "other".into());
    let id = frontmatter(&markdown, "id")
        .ok_or_else(|| AppError::InvalidReview("review file has no id".into()))?;
    let title = markdown
        .lines()
        .find_map(|line| line.trim().strip_prefix("# New atomic note: "))
        .or_else(|| {
            markdown
                .lines()
                .find_map(|line| line.trim().strip_prefix("# "))
        })
        .unwrap_or("Untitled proposal")
        .to_string();
    let source_relative_path = frontmatter(&markdown, "source").unwrap_or_default();
    let quote = section(&markdown, "Supporting quote");
    let suggested_action = frontmatter(&markdown, "action").unwrap_or_else(|| "create".into());
    let target_relative_path =
        frontmatter(&markdown, "matched_note").filter(|value| !value.is_empty());
    let confidence =
        frontmatter(&markdown, "confidence").and_then(|value| value.parse::<u8>().ok());
    let explicit_detail = section(&markdown, "What happened");
    let explicit_reason = section(&markdown, "Why it needs attention");
    let explicit_proposed_action = section(&markdown, "Proposed action");
    let (detail, reason, proposed_action) = match suggested_action.as_str() {
        "append-source" => (
            "A near-identical canonical note already exists".into(),
            "The proposed claim closely matches an existing note. Preserving this capture as an additional exact source avoids creating a duplicate.".into(),
            format!("Append this source and quote to {}", target_relative_path.as_deref().unwrap_or("the matching note")),
        ),
        "merge" => (
            "A related canonical note may overlap this proposal".into(),
            "The proposal is related to an existing note but is not identical. Review the wording before merging the distinct claim and its source.".into(),
            format!("Merge the claim and source into {}", target_relative_path.as_deref().unwrap_or("the related note")),
        ),
        "contradiction" => (
            "This claim appears to conflict with an existing canonical note".into(),
            "The proposal uses closely matching concepts with opposite polarity. Review both claims before preserving a separate sourced note.".into(),
            format!("Create a separate sourced note and keep the possible contradiction visible beside {}", target_relative_path.as_deref().unwrap_or("the related note")),
        ),
        _ => (
            if explicit_detail.is_empty() { "Automatically extracted from a completed capture".into() } else { explicit_detail },
            if explicit_reason.is_empty() { "This sentence is a self-contained claim that may be useful as permanent knowledge. No canonical note has been created yet.".into() } else { explicit_reason },
            if explicit_proposed_action.is_empty() { format!("Create a sourced Markdown note: {title}") } else { explicit_proposed_action },
        ),
    };
    Ok(ReviewRecord {
        id,
        item_type,
        title: title.clone(),
        detail,
        source_relative_path,
        quote,
        reason,
        proposed_action,
        confidence,
        status: frontmatter(&markdown, "status").unwrap_or_else(|| "pending".into()),
        session_id: frontmatter(&markdown, "session_id"),
        review_relative_path: path
            .strip_prefix(brain)
            .map_err(|_| AppError::InvalidReview("review file escaped the brain".into()))?
            .to_string_lossy()
            .to_string(),
        suggested_action,
        target_relative_path,
    })
}

pub fn list(brain: &Path) -> AppResult<Vec<ReviewRecord>> {
    let mut records = pending_files(brain)
        .iter()
        .map(|path| record_from_file(brain, path))
        .collect::<AppResult<Vec<_>>>()?;
    records.retain(|record| {
        record.status == "pending"
            && !review_requires_missing_note(brain, record)
    });
    records.sort_by(|left, right| left.title.cmp(&right.title));
    Ok(records)
}

fn review_requires_missing_note(brain: &Path, record: &ReviewRecord) -> bool {
    let requires_target = matches!(
        record.suggested_action.as_str(),
        "append-source" | "merge" | "apply-agent-change"
    );
    requires_target
        && record
            .target_relative_path
            .as_ref()
            .is_none_or(|relative_path| !brain.join(relative_path).is_file())
}

pub fn discard_for_target(brain: &Path, target_relative_path: &str) -> AppResult<usize> {
    let mut discarded = 0;
    for path in pending_files(brain) {
        let record = record_from_file(brain, &path)?;
        if record.status != "pending"
            || record.target_relative_path.as_deref() != Some(target_relative_path)
        {
            continue;
        }
        fs::remove_file(path)?;
        if let Some(session_id) = record.session_id.as_deref() {
            let _ = storage::update_atomic_proposal_status(
                brain,
                session_id,
                &record.id,
                "obsolete",
            );
        }
        discarded += 1;
    }
    Ok(discarded)
}

pub fn write_failed_enrichment_job(
    brain: &Path,
    session: &crate::domain::CaptureSession,
    error: &str,
) -> AppResult<()> {
    let folder = brain.join("review");
    fs::create_dir_all(&folder)?;
    let path = folder.join(format!("failed-enrichment-{}.md", &session.id[..8]));
    let source = format!("{}/transcript.md", session.relative_folder);
    let quote = session
        .transcript
        .split_whitespace()
        .take(32)
        .collect::<Vec<_>>()
        .join(" ");
    let markdown = format!(
        "---\nid: failed-enrichment-{}\ntype: failed-processing-job\nstatus: pending\nsession_id: {}\nsource: {}\naction: retry-enrichment\n---\n\n# Enrichment failed for {}\n\n## What happened\n\n{}\n\n## Supporting quote\n\n> {}\n\n## Why it needs attention\n\nThe canonical transcript is safe, but its title, summary, tags, and atomic-note proposals could not be completed.\n\n## Proposed action\n\nRetry local enrichment from the saved transcript.\n",
        session.id, session.id, source, session.title, error, quote
    );
    fs::write(path, markdown)?;
    Ok(())
}

pub fn write_low_confidence_transcript(
    brain: &Path,
    session: &crate::domain::CaptureSession,
    confidence: u8,
) -> AppResult<()> {
    let folder = brain.join("review");
    fs::create_dir_all(&folder)?;
    let path = folder.join(format!("low-confidence-transcript-{}.md", &session.id[..8]));
    let source = format!("{}/transcript.md", session.relative_folder);
    let quote = session
        .transcript
        .split_whitespace()
        .take(48)
        .collect::<Vec<_>>()
        .join(" ");
    fs::write(path, format!(
        "---\nid: low-confidence-transcript-{}\ntype: low-confidence-transcription\nstatus: pending\nsession_id: {}\nsource: {}\naction: accept-transcript\nconfidence: {}\n---\n\n# Check the transcript for {}\n\n## What happened\n\nThe speech recognizer reported low average confidence for this transcript.\n\n## Supporting quote\n\n> {}\n\n## Why it needs attention\n\nThe audio and recognized wording are preserved, but the transcript may contain recognition errors.\n\n## Proposed action\n\nAccept the transcript as written, or deny it to mark the capture as needing a manual correction.\n",
        session.id, session.id, source, confidence, session.title, quote
    ))?;
    Ok(())
}

pub fn write_agent_change(
    brain: &Path,
    proposal: &AgentProposal,
    conversation_id: &str,
) -> AppResult<()> {
    let note = notes::get(brain, &proposal.target_relative_path)?;
    if note.body != proposal.original_body {
        return Err(AppError::InvalidReview(
            "the target note changed after this proposal was prepared; request a fresh proposal".into(),
        ));
    }
    let proposed = proposal.proposed_body.trim();
    if proposed.is_empty() || proposed.len() > 2_000_000 || proposed == note.body.trim() {
        return Err(AppError::InvalidReview(
            "the proposed note body must be non-empty, changed, and under 2 MB".into(),
        ));
    }
    let folder = brain.join("review");
    fs::create_dir_all(&folder)?;
    let path = folder.join(format!("agent-change-{}.md", &proposal.id[..8.min(proposal.id.len())]));
    if path.exists() {
        return Err(AppError::InvalidReview("this agent proposal is already queued".into()));
    }
    fs::write(path, format!(
        "---\nid: {}\ntype: agent-change\nstatus: pending\nsource: {}\naction: apply-agent-change\nmatched_note: {}\nconversation_id: {}\n---\n\n# Agent change: {}\n\n## What happened\n\nChat prepared a revision in confirmation-gated agent mode.\n\n## Supporting quote\n\n> {}\n\n## Why it needs attention\n\nCanonical Markdown never changes directly from Chat. Compare the original and proposed bodies before approval.\n\n## Proposed action\n\nReplace the body of `{}` while preserving its ID, title, tags, and sources.\n\n## Instruction\n\n{}\n\n## Original note\n\n{}\n\n## Proposed note\n\n{}\n",
        proposal.id,
        proposal.target_relative_path,
        proposal.target_relative_path,
        conversation_id,
        proposal.target_title,
        proposal.instruction.trim(),
        proposal.target_relative_path,
        proposal.instruction.trim(),
        proposal.original_body.trim(),
        proposed,
    ))?;
    Ok(())
}

fn decided_markdown(markdown: &str, decision: &str) -> String {
    let updated = markdown.replacen("status: pending", &format!("status: {decision}"), 1);
    updated.replacen(
        "---",
        &format!("---\ndecided_at: {}", Utc::now().to_rfc3339()),
        1,
    )
}

fn rollback_note_mutation(
    brain: &Path,
    created_note: &mut Option<crate::domain::NoteDocument>,
    backup: &Option<(PathBuf, String)>,
) {
    if let Some((path, markdown)) = backup {
        let _ = fs::write(path, markdown);
        created_note.take();
    } else if let Some(note) = created_note.take() {
        let _ = fs::remove_file(brain.join(note.relative_path));
    }
    let _ = search::rebuild_index(brain);
}

pub fn resolve(brain: &Path, input: &ResolveReviewInput) -> AppResult<ReviewDecision> {
    if !["approved", "denied"].contains(&input.decision.as_str()) {
        return Err(AppError::InvalidReview(
            "decision must be approved or denied".into(),
        ));
    }
    let record = list(brain)?
        .into_iter()
        .find(|record| record.id == input.id)
        .ok_or_else(|| AppError::MissingReviewItem(input.id.clone()))?;
    if ![
        "atomic-note",
        "contradiction",
        "uncertain-tag",
        "low-confidence-transcription",
        "failed-processing-job",
        "filesystem-conflict",
        "agent-change",
    ]
    .contains(&record.item_type.as_str())
    {
        return Err(AppError::InvalidReview(
            "this review type is not resolvable yet".into(),
        ));
    }
    let pending = brain.join(&record.review_relative_path);
    let original = fs::read_to_string(&pending)?;
    let decision_folder = brain.join("review/decisions").join(&input.decision);
    fs::create_dir_all(&decision_folder)?;
    let filename = pending
        .file_name()
        .ok_or_else(|| AppError::InvalidReview("review filename is unavailable".into()))?;
    let decision_path = decision_folder.join(filename);
    if decision_path.exists() {
        return Err(AppError::InvalidReview(
            "a decision file already exists for this proposal".into(),
        ));
    }
    let proposed_content = section(&original, "Proposed note");
    let source = NoteSource {
        relative_path: record.source_relative_path.clone(),
        quote: record.quote.clone(),
    };
    let note_backup = record
        .target_relative_path
        .as_ref()
        .filter(|_| {
            input.decision == "approved"
                && matches!(record.suggested_action.as_str(), "append-source" | "merge")
        })
        .map(|relative_path| {
            let path = brain.join(relative_path);
            fs::read_to_string(&path).map(|markdown| (path, markdown))
        })
        .transpose()?;
    let agent_backup = if input.decision == "approved" && record.item_type == "agent-change" {
        let target = record.target_relative_path.as_deref().ok_or_else(|| {
            AppError::InvalidReview("agent change has no target note".into())
        })?;
        let note = notes::get(brain, target)?;
        let expected = section(&original, "Original note");
        if note.body.trim() != expected.trim() {
            return Err(AppError::InvalidReview(
                "the target note changed after this proposal was queued; deny it and request a fresh proposal".into(),
            ));
        }
        Some((brain.join(target), note.markdown.clone(), note))
    } else {
        None
    };
    let mut created_note = if input.decision == "approved"
        && matches!(record.item_type.as_str(), "atomic-note" | "contradiction")
    {
        Some(match record.suggested_action.as_str() {
            "append-source" => notes::merge_from_review(
                brain,
                record.target_relative_path.as_deref().ok_or_else(|| {
                    AppError::InvalidReview("append proposal has no target note".into())
                })?,
                &proposed_content,
                source,
                false,
            )?,
            "merge" => notes::merge_from_review(
                brain,
                record.target_relative_path.as_deref().ok_or_else(|| {
                    AppError::InvalidReview("merge proposal has no target note".into())
                })?,
                &proposed_content,
                source,
                true,
            )?,
            _ => notes::create_from_review(brain, &record.title, &proposed_content, source)?,
        })
    } else {
        None
    };
    if let Some((_, _, note)) = &agent_backup {
        if input.decision == "approved" {
            created_note = Some(notes::save(
                brain,
                &SaveNoteInput {
                    relative_path: Some(note.relative_path.clone()),
                    title: note.title.clone(),
                    body: proposed_content.clone(),
                    tags: note.tags.clone(),
                },
            )?);
        }
    }
    if input.decision == "approved" && record.item_type == "failed-processing-job" {
        let session_id = record
            .session_id
            .as_deref()
            .ok_or_else(|| AppError::InvalidReview("failed job has no capture session".into()))?;
        let session = storage::get_session(brain, session_id)?;
        let provider = session
            .transcription_provider
            .as_deref()
            .unwrap_or("unknown");
        let retried = capture::process_session(brain, session_id, provider)?;
        if retried.status != "ready" {
            return Err(AppError::InvalidReview(
                retried
                    .processing_error
                    .unwrap_or_else(|| "enrichment retry did not complete".into()),
            ));
        }
    }
    if let Err(error) = fs::write(&decision_path, decided_markdown(&original, &input.decision)) {
        if let Some((path, markdown, _)) = &agent_backup {
            let _ = fs::write(path, markdown);
            created_note.take();
            let _ = search::rebuild_index(brain);
        } else {
            rollback_note_mutation(brain, &mut created_note, &note_backup);
        }
        return Err(error.into());
    }
    if let Err(error) = fs::remove_file(&pending) {
        let _ = fs::remove_file(&decision_path);
        if let Some((path, markdown, _)) = &agent_backup {
            let _ = fs::write(path, markdown);
            created_note.take();
            let _ = search::rebuild_index(brain);
        } else {
            rollback_note_mutation(brain, &mut created_note, &note_backup);
        }
        return Err(error.into());
    }
    if input.decision == "denied" && record.item_type == "low-confidence-transcription" {
        let outcome = (|| {
            let session_id = record.session_id.as_deref().ok_or_else(|| {
                AppError::InvalidReview("low-confidence transcript has no capture session".into())
            })?;
            let session = storage::get_session(brain, session_id)?;
            storage::mark_session_processing(
                brain,
                session_id,
                "transcription_needs_review",
                session
                    .transcription_provider
                    .as_deref()
                    .unwrap_or("unknown"),
                Some("The transcript was marked for manual correction in Review."),
            )?;
            Ok::<(), AppError>(())
        })();
        if let Err(error) = outcome {
            let _ = fs::remove_file(&decision_path);
            let _ = fs::write(&pending, &original);
            rollback_note_mutation(brain, &mut created_note, &note_backup);
            return Err(error);
        }
    }
    if input.decision == "approved" && record.item_type == "uncertain-tag" {
        let current = frontmatter(&original, "current_tag")
            .ok_or_else(|| AppError::InvalidReview("uncertain tag has no current value".into()))?;
        let replacement = frontmatter(&original, "replacement_tag")
            .ok_or_else(|| AppError::InvalidReview("uncertain tag has no replacement".into()))?;
        let session_id = record.session_id.as_deref().ok_or_else(|| {
            AppError::InvalidReview("uncertain tag has no capture session".into())
        })?;
        if let Err(error) = storage::replace_session_tag(brain, session_id, &current, &replacement)
        {
            let _ = fs::remove_file(&decision_path);
            let _ = fs::write(&pending, &original);
            rollback_note_mutation(brain, &mut created_note, &note_backup);
            return Err(error);
        }
    }
    if matches!(record.item_type.as_str(), "atomic-note" | "contradiction") {
        let session_id = record.session_id.as_ref().ok_or_else(|| {
            AppError::InvalidReview("atomic-note proposal has no capture session".into())
        })?;
        if let Err(error) =
            storage::update_atomic_proposal_status(brain, session_id, &record.id, &input.decision)
        {
            let _ = fs::remove_file(&decision_path);
            let _ = fs::write(&pending, &original);
            rollback_note_mutation(brain, &mut created_note, &note_backup);
            return Err(error);
        }
    }
    let _ = search::rebuild_index(brain);
    Ok(ReviewDecision {
        record,
        created_note,
        decision_relative_path: decision_path
            .strip_prefix(brain)
            .unwrap_or(&decision_path)
            .to_string_lossy()
            .to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture;

    fn processed_capture(brain: &Path) -> crate::domain::CaptureSession {
        let session = storage::create_session(brain).expect("session");
        storage::save_audio(brain, &session.id, "audio/wav", &[7_u8; 128]).expect("audio");
        capture::finalize_transcript_for_test(
            brain,
            &session.id,
            "A reliable capture preserves the original audio before transcription fails.",
        )
        .expect("process")
    }

    #[test]
    fn approves_once_into_a_sourced_note_and_preserves_denials() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in [
            "sessions",
            "notes",
            "review",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        let session = processed_capture(brain);
        let pending = list(brain).expect("pending");
        assert_eq!(pending.len(), 1);
        let approved = resolve(
            brain,
            &ResolveReviewInput {
                id: pending[0].id.clone(),
                decision: "approved".into(),
            },
        )
        .expect("approve");
        assert!(approved.created_note.as_ref().expect("note").sources[0]
            .quote
            .contains("original audio"));
        assert!(list(brain).expect("cleared").is_empty());
        assert!(resolve(
            brain,
            &ResolveReviewInput {
                id: pending[0].id.clone(),
                decision: "approved".into()
            }
        )
        .is_err());
        assert_eq!(
            storage::get_session(brain, &session.id)
                .expect("session")
                .atomic_notes[0]
                .status,
            "approved"
        );

        let second = processed_capture(brain);
        let second_record = list(brain).expect("second pending").remove(0);
        let denied = resolve(
            brain,
            &ResolveReviewInput {
                id: second_record.id,
                decision: "denied".into(),
            },
        )
        .expect("deny");
        assert!(denied.created_note.is_none());
        assert_eq!(
            storage::get_session(brain, &second.id)
                .expect("second session")
                .atomic_notes[0]
                .status,
            "denied"
        );
        assert!(brain.join(denied.decision_relative_path).exists());
    }

    #[test]
    fn failed_session_update_restores_the_pending_record_without_an_orphan_note() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in [
            "sessions",
            "notes",
            "review",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        let pending_path = brain.join("review/rollback.md");
        let original = "---\nid: rollback-proposal\ntype: atomic-note\nstatus: pending\nsession_id: missing-session\nsource: sources/example.md\n---\n\n# New atomic note: Rollback remains safe\n\n## Proposed note\n\nNo orphan should survive.\n\n## Supporting quote\n\n> Exact source wording.\n";
        fs::write(&pending_path, original).expect("pending proposal");

        let error = resolve(
            brain,
            &ResolveReviewInput {
                id: "rollback-proposal".into(),
                decision: "approved".into(),
            },
        )
        .expect_err("missing session must roll back");

        assert!(error.to_string().contains("missing-session"));
        assert_eq!(
            fs::read_to_string(&pending_path).expect("restored pending"),
            original
        );
        assert_eq!(list(brain).expect("pending list").len(), 1);
        assert_eq!(fs::read_dir(brain.join("notes")).expect("notes").count(), 0);
        assert!(!brain.join("review/decisions/approved/rollback.md").exists());
    }

    #[test]
    fn duplicate_proposal_appends_a_source_without_creating_a_second_note() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in [
            "sessions",
            "notes",
            "review",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        let claim = "A reliable capture preserves original audio before transcription begins.";
        let existing = notes::create_from_review(
            brain,
            "Reliable capture preserves original audio",
            claim,
            NoteSource {
                relative_path: "sources/first.md".into(),
                quote: claim.into(),
            },
        )
        .expect("existing note");
        let session = storage::create_session(brain).expect("session");
        storage::save_audio(brain, &session.id, "audio/wav", b"fixture").expect("audio");
        capture::finalize_transcript_for_test(brain, &session.id, claim).expect("proposal");

        let record = list(brain).expect("review").remove(0);
        assert_eq!(record.title, claim.trim_end_matches('.'));
        assert_eq!(record.suggested_action, "append-source");
        assert_eq!(
            record.target_relative_path.as_deref(),
            Some(existing.relative_path.as_str())
        );
        let result = resolve(
            brain,
            &ResolveReviewInput {
                id: record.id,
                decision: "approved".into(),
            },
        )
        .expect("approve");

        let notes = notes::list(brain).expect("notes");
        assert_eq!(notes.len(), 1);
        assert_eq!(result.created_note.expect("updated note").sources.len(), 2);
    }

    #[test]
    fn contradictory_claim_is_held_for_review_and_can_be_preserved_separately() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in [
            "sessions",
            "notes",
            "review",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        let existing = notes::create_from_review(
            brain,
            "Retention preserves original recordings",
            "Audio retention always preserves original recordings forever.",
            NoteSource {
                relative_path: "sources/policy.md".into(),
                quote: "Preserve recordings forever.".into(),
            },
        )
        .expect("existing note");
        let session = storage::create_session(brain).expect("session");
        storage::save_audio(brain, &session.id, "audio/wav", &[3_u8; 128]).expect("audio");
        capture::finalize_transcript_for_test(
            brain,
            &session.id,
            "Audio retention does not preserve original recordings forever.",
        )
        .expect("proposal");

        let record = list(brain)
            .expect("review")
            .into_iter()
            .find(|item| item.item_type == "contradiction")
            .expect("contradiction record");
        assert_eq!(record.suggested_action, "contradiction");
        assert_eq!(
            record.target_relative_path.as_deref(),
            Some(existing.relative_path.as_str())
        );
        let result = resolve(
            brain,
            &ResolveReviewInput {
                id: record.id,
                decision: "approved".into(),
            },
        )
        .expect("approve separate claim");
        assert_ne!(
            result.created_note.expect("new note").relative_path,
            existing.relative_path
        );
        assert_eq!(notes::list(brain).expect("notes").len(), 2);
    }

    #[test]
    fn uncertain_tag_approval_reuses_the_existing_tag_without_fragmentation() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in [
            "sessions",
            "notes",
            "review",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        notes::save(
            brain,
            &crate::domain::SaveNoteInput {
                relative_path: None,
                title: "Privacy policy".into(),
                body: "Privacy remains local.".into(),
                tags: vec!["privacy".into()],
            },
        )
        .expect("existing tag");
        let session = storage::create_session(brain).expect("session");
        storage::complete_session_processing(
            brain,
            &session.id,
            "test",
            "A capture with a near duplicate privacy tag.",
            "Near duplicate tag",
            "Tag review fixture.",
            &["privacys".into()],
            &[],
        )
        .expect("processing");

        let record = list(brain)
            .expect("review")
            .into_iter()
            .find(|item| item.item_type == "uncertain-tag")
            .expect("uncertain tag record");
        resolve(
            brain,
            &ResolveReviewInput {
                id: record.id,
                decision: "approved".into(),
            },
        )
        .expect("approve replacement");
        assert_eq!(
            storage::get_session(brain, &session.id)
                .expect("session")
                .tags,
            vec!["privacy"]
        );
    }

    #[test]
    fn low_confidence_transcript_denial_marks_manual_correction_without_losing_text() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in [
            "sessions",
            "notes",
            "review",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        let session = storage::create_session(brain).expect("session");
        let completed = storage::complete_session_processing(
            brain,
            &session.id,
            "apple-speech",
            "The recognizer preserved this uncertain wording.",
            "Uncertain wording",
            "A low confidence fixture.",
            &[],
            &[],
        )
        .expect("processing");
        write_low_confidence_transcript(brain, &completed, 42).expect("review record");
        let record = list(brain)
            .expect("review")
            .into_iter()
            .find(|item| item.item_type == "low-confidence-transcription")
            .expect("low confidence record");
        resolve(
            brain,
            &ResolveReviewInput {
                id: record.id,
                decision: "denied".into(),
            },
        )
        .expect("mark correction");
        let updated = storage::get_session(brain, &session.id).expect("session");
        assert_eq!(updated.status, "transcription_needs_review");
        assert_eq!(updated.transcript, completed.transcript);
    }

    #[test]
    fn failed_update_of_an_existing_note_restores_its_original_markdown() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in [
            "sessions",
            "notes",
            "review",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        let existing = notes::create_from_review(
            brain,
            "A canonical claim",
            "The canonical claim remains unchanged after rollback.",
            NoteSource {
                relative_path: "sources/original.md".into(),
                quote: "Original quote".into(),
            },
        )
        .expect("existing note");
        let note_path = brain.join(&existing.relative_path);
        let original_note = fs::read_to_string(&note_path).expect("original markdown");
        let pending_path = brain.join("review/rollback-existing.md");
        let proposal = format!(
            "---\nid: rollback-existing\ntype: atomic-note\nstatus: pending\nsession_id: missing-session\nsource: sources/second.md\naction: append-source\nmatched_note: {}\nconfidence: 100\n---\n\n# New atomic note: A canonical claim\n\n## Proposed note\n\nThe canonical claim remains unchanged after rollback.\n\n## Supporting quote\n\n> Second exact quote.\n",
            existing.relative_path
        );
        fs::write(&pending_path, &proposal).expect("proposal");

        resolve(
            brain,
            &ResolveReviewInput {
                id: "rollback-existing".into(),
                decision: "approved".into(),
            },
        )
        .expect_err("missing session must roll back");

        assert_eq!(
            fs::read_to_string(note_path).expect("restored note"),
            original_note
        );
        assert_eq!(
            fs::read_to_string(pending_path).expect("restored proposal"),
            proposal
        );
        assert_eq!(notes::list(brain).expect("notes").len(), 1);
    }

    #[test]
    fn failed_enrichment_job_is_reviewable_and_retryable_from_its_saved_transcript() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in [
            "sessions",
            "notes",
            "review",
            "hosts",
            "skills/content",
            "projects",
        ] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        let session = storage::create_session(brain).expect("session");
        storage::save_audio(brain, &session.id, "audio/wav", &[7_u8; 128]).expect("audio");
        let extraction_path = Path::new(&session.folder_path).join("extractions");
        fs::remove_dir(&extraction_path).expect("remove extraction directory");
        fs::write(&extraction_path, "blocks proposal output").expect("failure fixture");
        capture::finalize_transcript_for_test(
            brain,
            &session.id,
            "A failed background enrichment remains retryable from its durable transcript.",
        )
        .expect("inspectable failure");

        let failed = list(brain)
            .expect("review")
            .into_iter()
            .find(|record| record.item_type == "failed-processing-job")
            .expect("failed job record");
        assert_eq!(failed.suggested_action, "retry-enrichment");
        fs::remove_file(&extraction_path).expect("remove fixture");
        fs::create_dir_all(&extraction_path).expect("restore directory");

        let result = resolve(
            brain,
            &ResolveReviewInput {
                id: failed.id,
                decision: "approved".into(),
            },
        )
        .expect("retry from review");
        assert!(result.created_note.is_none());
        assert_eq!(
            storage::get_session(brain, &session.id)
                .expect("session")
                .status,
            "ready"
        );
        assert!(brain.join(result.decision_relative_path).exists());
        assert!(list(brain)
            .expect("review")
            .iter()
            .all(|record| record.item_type != "failed-processing-job"));
    }

    #[test]
    fn review_items_for_deleted_notes_are_discarded_or_hidden() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        for folder in ["notes", "review"] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        let note = notes::create_from_review(
            brain,
            "A temporary canonical note",
            "This note may be deleted before its proposal is reviewed.",
            NoteSource {
                relative_path: "sources/example.md".into(),
                quote: "An exact source quote.".into(),
            },
        )
        .expect("note");
        let proposal = format!(
            "---\nid: stale-review\ntype: atomic-note\nstatus: pending\nsource: sources/second.md\naction: append-source\nmatched_note: {}\n---\n\n# New atomic note: A temporary canonical note\n\n## Proposed note\n\nA related claim.\n\n## Supporting quote\n\n> Another exact quote.\n",
            note.relative_path
        );
        let pending = brain.join("review/stale-review.md");
        fs::write(&pending, &proposal).expect("proposal");
        assert_eq!(list(brain).expect("visible review").len(), 1);

        assert_eq!(
            discard_for_target(brain, &note.relative_path).expect("discard"),
            1
        );
        assert!(!pending.exists());

        fs::write(&pending, proposal).expect("replacement proposal");
        fs::remove_file(brain.join(&note.relative_path)).expect("delete note externally");
        assert!(list(brain).expect("filtered review").is_empty());
        assert!(pending.exists(), "external files are hidden without mutating them");
    }
}
