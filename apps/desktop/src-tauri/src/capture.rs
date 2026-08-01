use crate::domain::CaptureSession;
use crate::enrichment;
use crate::error::{AppError, AppResult};
use crate::{review, search, storage, transcription};
use std::path::{Path, PathBuf};

fn audio_path(session: &CaptureSession) -> AppResult<PathBuf> {
    session
        .audio_path
        .as_deref()
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .ok_or_else(|| AppError::MissingSessionAudio(session.id.clone()))
}

pub fn process_session(
    brain: &Path,
    session_id: &str,
    provider: &str,
) -> AppResult<CaptureSession> {
    let session = storage::repair_session_audio_format(brain, session_id)?;
    let audio = audio_path(&session)?;

    if matches!(session.status.as_str(), "enrichment_failed" | "tagging")
        && !session.transcript.trim().is_empty()
    {
        storage::enqueue_capture_enrichment(brain, session_id)?;
        return run_enrichment_job(brain, session_id, provider);
    }

    if provider == "none" {
        return storage::mark_session_processing(
            brain,
            session_id,
            "awaiting_transcription",
            provider,
            None,
        );
    }
    storage::mark_session_processing(brain, session_id, "transcribing", provider, None)?;

    let transcription = match provider {
        "apple-speech" => transcription::transcribe_file_with_confidence(&audio, "en-US"),
        "parakeet" => transcription::transcribe_parakeet(&audio).map(|text| {
            transcription::TranscriptionResult {
                text,
                confidence: None,
            }
        }),
        other => Err(AppError::UnsupportedProvider(other.into())),
    };

    let transcription = match transcription {
        Ok(transcription) => transcription,
        Err(error) => {
            return storage::mark_session_processing(
                brain,
                session_id,
                "transcription_failed",
                provider,
                Some(&error.to_string()),
            );
        }
    };

    let completed = finalize_transcript(brain, session_id, provider, &transcription.text)?;
    if let Some(confidence) = transcription.confidence.filter(|value| *value < 65) {
        review::write_low_confidence_transcript(brain, &completed, confidence)?;
    }
    Ok(completed)
}

fn finalize_transcript(
    brain: &Path,
    session_id: &str,
    provider: &str,
    transcript: &str,
) -> AppResult<CaptureSession> {
    storage::save_transcript_for_enrichment(brain, session_id, provider, transcript)?;
    storage::enqueue_capture_enrichment(brain, session_id)?;
    run_enrichment_job(brain, session_id, provider)
}

pub fn run_enrichment_job(
    brain: &Path,
    session_id: &str,
    provider: &str,
) -> AppResult<CaptureSession> {
    storage::start_capture_enrichment_job(brain, session_id)?;
    let transcript = storage::get_session(brain, session_id)?.transcript;
    let enriched = enrichment::enrich_capture(brain, &transcript);
    let completed = storage::complete_session_processing(
        brain,
        session_id,
        provider,
        &transcript,
        &enriched.title,
        &enriched.summary,
        &enriched.tags,
        &enriched.atomic_notes,
    );
    let completed = match completed {
        Ok(session) => session,
        Err(error) => {
            let message = format!("Local enrichment failed: {error}");
            storage::finish_capture_enrichment_job(brain, session_id, Some(&message))?;
            let failed = storage::mark_session_processing(
                brain,
                session_id,
                "enrichment_failed",
                provider,
                Some(&message),
            )?;
            let _ = review::write_failed_enrichment_job(brain, &failed, &message);
            return Ok(failed);
        }
    };
    storage::finish_capture_enrichment_job(brain, session_id, None)?;
    let _ = search::rebuild_index(brain);
    Ok(completed)
}

pub fn recover_pending_enrichment(brain: &Path) -> AppResult<usize> {
    let session_ids = storage::recover_capture_enrichment_jobs(brain)?;
    let mut completed = 0;
    for session_id in session_ids {
        let session = match storage::get_session(brain, &session_id) {
            Ok(session) => session,
            Err(error) => {
                storage::finish_capture_enrichment_job(
                    brain,
                    &session_id,
                    Some(&error.to_string()),
                )?;
                continue;
            }
        };
        if session.transcript.trim().is_empty() {
            storage::finish_capture_enrichment_job(
                brain,
                &session_id,
                Some("The saved transcript is empty."),
            )?;
            continue;
        }
        let provider = session
            .transcription_provider
            .as_deref()
            .unwrap_or("unknown");
        if run_enrichment_job(brain, &session_id, provider).is_ok() {
            completed += 1;
        }
    }
    Ok(completed)
}

#[cfg(test)]
pub(crate) fn finalize_transcript_for_test(
    brain: &Path,
    session_id: &str,
    transcript: &str,
) -> AppResult<CaptureSession> {
    finalize_transcript(brain, session_id, "test-transcriber", transcript)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn finalizes_a_real_transcript_into_searchable_session_files_and_tags() {
        let temporary = tempfile::tempdir().expect("brain");
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
        let created = storage::create_session(brain).expect("session");
        storage::save_audio(brain, &created.id, "audio/wav", b"fixture").expect("durable audio");
        let transcript = "I want voice capture to work offline. The original audio should remain private before transcription and tagging begin.";
        let completed = finalize_transcript(brain, &created.id, "test-transcriber", transcript)
            .expect("processed session");

        assert_eq!(completed.status, "ready");
        assert_eq!(completed.transcript, transcript);
        assert!(completed.tags.contains(&"voice-capture".into()));
        assert!(completed.tags.contains(&"local-first".into()));
        assert!(completed.tags.contains(&"privacy".into()));
        assert_eq!(completed.atomic_notes.len(), 2);
        assert!(brain
            .join(&completed.atomic_notes[0].review_relative_path)
            .exists());
        assert!(fs::read_to_string(&completed.transcript_path)
            .expect("transcript markdown")
            .contains(transcript));
        let metadata = fs::read_to_string(Path::new(&completed.folder_path).join("session.md"))
            .expect("session markdown");
        assert!(metadata.contains("status: ready"));
        assert!(metadata.contains("voice-capture"));

        let results = search::search(
            brain,
            &crate::domain::SearchQuery {
                query: "original audio private".into(),
                mode: "hybrid".into(),
                scope: "sessions".into(),
                limit: Some(5),
                selected_paths: Vec::new(),
            },
        )
        .expect("search");
        assert!(!results.is_empty());
        assert!(results[0].quote.contains("original audio"));
    }

    #[test]
    fn enrichment_failure_preserves_transcript_and_retries_without_retranscription() {
        let temporary = tempfile::tempdir().expect("brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        let created = storage::create_session(brain).expect("session");
        storage::save_audio(brain, &created.id, "audio/mp4", &[7_u8; 128]).expect("durable audio");
        fs::write(brain.join("review"), b"blocks the review directory").expect("failure fixture");
        let transcript = "This durable transcript should survive a failed atomic note proposal write and remain retryable.";

        let failed = finalize_transcript_for_test(brain, &created.id, transcript)
            .expect("failure should become inspectable state");
        assert_eq!(failed.status, "enrichment_failed");
        let failed_job = storage::capture_enrichment_job_state(brain, &created.id).expect("job");
        assert_eq!(failed_job.0, "failed");
        assert_eq!(failed_job.1, 1);
        assert!(failed_job
            .2
            .as_deref()
            .unwrap_or_default()
            .contains("Local enrichment failed"));
        assert_eq!(failed.transcript, transcript);
        assert!(fs::read_to_string(&failed.transcript_path)
            .expect("canonical transcript")
            .contains(transcript));

        fs::remove_file(brain.join("review")).expect("remove fixture");
        fs::create_dir_all(brain.join("review")).expect("review directory");
        let retried = process_session(brain, &created.id, "test-transcriber")
            .expect("retry saved transcript");
        assert_eq!(retried.status, "ready");
        assert_eq!(retried.transcript, transcript);
        let completed_job = storage::capture_enrichment_job_state(brain, &created.id).expect("job");
        assert_eq!(completed_job.0, "completed");
        assert_eq!(completed_job.1, 2);
    }

    #[test]
    fn startup_runner_reclaims_an_interrupted_enrichment_job() {
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
        let created = storage::create_session(brain).expect("session");
        storage::save_audio(brain, &created.id, "audio/wav", b"fixture").expect("audio");
        storage::save_transcript_for_enrichment(
            brain,
            &created.id,
            "test-transcriber",
            "An interrupted enrichment job resumes from the durable transcript after restart.",
        )
        .expect("transcript");
        storage::enqueue_capture_enrichment(brain, &created.id).expect("enqueue");
        storage::start_capture_enrichment_job(brain, &created.id).expect("start");

        assert_eq!(recover_pending_enrichment(brain).expect("recover"), 1);
        assert_eq!(
            storage::get_session(brain, &created.id)
                .expect("session")
                .status,
            "ready"
        );
        let job = storage::capture_enrichment_job_state(brain, &created.id).expect("job");
        assert_eq!(job.0, "completed");
        assert_eq!(job.1, 2);
    }
}
