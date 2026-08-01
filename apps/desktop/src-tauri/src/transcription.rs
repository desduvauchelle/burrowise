use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};

const UV_INSTALLER_URL: &str = "https://astral.sh/uv/install.sh";
pub const PARAKEET_MODEL_DOWNLOAD_BYTES: u64 = 2_509_044_141;

#[derive(Debug, Clone)]
pub struct TranscriptionResult {
    pub text: String,
    pub confidence: Option<u8>,
}

pub fn parakeet_executable() -> Option<std::path::PathBuf> {
    executable_named("parakeet-mlx")
}

pub fn parakeet_available() -> bool {
    parakeet_executable().is_some() && ffmpeg_available() && parakeet_model_cache().0 == "ready"
}

fn executable_candidates(name: &str, home: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(output) = std::process::Command::new("/usr/bin/which")
        .arg(name)
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                candidates.push(path.into());
            }
        }
    }
    if let Some(home) = home {
        candidates.push(home.join(".local/bin").join(name));
        candidates.push(home.join(".cargo/bin").join(name));
    }
    candidates.push(Path::new("/opt/homebrew/bin").join(name));
    candidates.push(Path::new("/usr/local/bin").join(name));
    candidates
}

fn executable_named(name: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let candidates = executable_candidates(name, home.as_deref());
    candidates.into_iter().find(|candidate| candidate.is_file())
}

pub fn uv_executable() -> Option<std::path::PathBuf> {
    executable_named("uv")
}

pub fn ensure_uv_executable() -> AppResult<PathBuf> {
    if let Some(uv) = uv_executable() {
        return Ok(uv);
    }

    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or_else(|| {
        AppError::UnsupportedProvider(
            "uv could not be installed because the user home folder is unavailable.".into(),
        )
    })?;
    let install_dir = home.join(".local/bin");
    std::fs::create_dir_all(&install_dir)?;
    let installer_path =
        std::env::temp_dir().join(format!("second-brain-uv-{}.sh", uuid::Uuid::new_v4()));

    let download = std::process::Command::new("/usr/bin/curl")
        .args([
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "--output",
        ])
        .arg(&installer_path)
        .arg(UV_INSTALLER_URL)
        .stdin(std::process::Stdio::null())
        .output()?;
    if !download.status.success() {
        let _ = std::fs::remove_file(&installer_path);
        let detail = String::from_utf8_lossy(&download.stderr).trim().to_string();
        return Err(AppError::UnsupportedProvider(if detail.is_empty() {
            "Could not download uv from Astral. Check your internet connection and retry.".into()
        } else {
            format!("Could not download uv from Astral: {detail}")
        }));
    }

    // Astral's official installer supports a fixed destination and can skip shell-profile edits.
    let install = std::process::Command::new("/bin/sh")
        .arg(&installer_path)
        .env("UV_INSTALL_DIR", &install_dir)
        .env("UV_NO_MODIFY_PATH", "1")
        .stdin(std::process::Stdio::null())
        .output();
    let _ = std::fs::remove_file(&installer_path);
    let install = install?;
    if !install.status.success() {
        let detail = String::from_utf8_lossy(&install.stderr).trim().to_string();
        return Err(AppError::UnsupportedProvider(if detail.is_empty() {
            "uv setup did not finish. Check your internet connection and retry.".into()
        } else {
            format!("uv setup did not finish: {detail}")
        }));
    }

    let uv = install_dir.join("uv");
    if uv.is_file() {
        Ok(uv)
    } else {
        uv_executable().ok_or_else(|| {
            AppError::UnsupportedProvider(
                "uv reported a successful install, but its executable could not be found.".into(),
            )
        })
    }
}

pub fn ffmpeg_available() -> bool {
    executable_named("ffmpeg").is_some()
}

fn directory_bytes(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            let path = entry.path();
            if path.is_dir() {
                directory_bytes(&path)
            } else {
                entry.metadata().map(|metadata| metadata.len()).unwrap_or(0)
            }
        })
        .sum()
}

fn parakeet_model_cache_at(root: &Path) -> (String, u64) {
    let model = root.join("models--mlx-community--parakeet-tdt-0.6b-v3");
    // Hugging Face snapshots contain symlinks back into blobs. Count only blobs so
    // cached bytes represent real downloaded data instead of counting files twice.
    let bytes = directory_bytes(&model.join("blobs"));
    let has_snapshot = model.join("snapshots").is_dir();
    let state = if has_snapshot && bytes > 100_000_000 {
        "ready"
    } else if bytes > 0 {
        "partial"
    } else {
        "not-downloaded"
    };
    (state.into(), bytes)
}

pub fn parakeet_model_cache() -> (String, u64) {
    let root = std::env::var("HF_HUB_CACHE")
        .map(std::path::PathBuf::from)
        .or_else(|_| std::env::var("HF_HOME").map(|home| Path::new(&home).join("hub")))
        .or_else(|_| {
            std::env::var("HOME").map(|home| Path::new(&home).join(".cache/huggingface/hub"))
        });
    let Ok(root) = root else {
        return ("not-downloaded".into(), 0);
    };
    parakeet_model_cache_at(&root)
}

pub fn parakeet_python() -> Option<std::path::PathBuf> {
    let executable = parakeet_executable()?;
    let resolved = executable.canonicalize().unwrap_or(executable);
    let python = resolved.parent()?.join("python");
    python.is_file().then_some(python)
}

pub fn transcribe_parakeet(path: &Path) -> AppResult<String> {
    use wait_timeout::ChildExt;
    let executable = parakeet_executable().ok_or_else(|| {
        AppError::UnsupportedProvider(
            "Parakeet MLX is not installed. Install the parakeet-mlx CLI in Settings first.".into(),
        )
    })?;
    let output_dir =
        std::env::temp_dir().join(format!("second-brain-parakeet-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&output_dir)?;
    let mut child = std::process::Command::new(executable)
        .arg(path)
        .arg("--output-dir")
        .arg(&output_dir)
        .arg("--output-format")
        .arg("txt")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;
    let status = child
        .wait_timeout(std::time::Duration::from_secs(900))?
        .ok_or_else(|| {
            let _ = child.kill();
            AppError::SpeechRecognition("Parakeet timed out after 15 minutes".into())
        })?;
    if !status.success() {
        let output = child.wait_with_output()?;
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let _ = std::fs::remove_dir_all(&output_dir);
        return Err(AppError::SpeechRecognition(if message.is_empty() {
            format!("Parakeet exited with {status}")
        } else {
            message
        }));
    }
    let transcript = std::fs::read_dir(&output_dir)?
        .flatten()
        .map(|entry| entry.path())
        .find(|candidate| candidate.extension().and_then(|value| value.to_str()) == Some("txt"))
        .map(std::fs::read_to_string)
        .transpose()?
        .unwrap_or_default();
    let _ = std::fs::remove_dir_all(&output_dir);
    let transcript = transcript.trim().to_string();
    if transcript.is_empty() {
        Err(AppError::SpeechRecognition(
            "Parakeet completed without returning transcript text".into(),
        ))
    } else {
        Ok(transcript)
    }
}

#[cfg(target_os = "macos")]
mod apple {
    use super::*;
    use block2::RcBlock;
    use objc2::rc::autoreleasepool;
    use objc2::AnyThread;
    use objc2_foundation::{NSError, NSLocale, NSOperationQueue, NSString, NSURL};
    use objc2_speech::{
        SFSpeechRecognitionRequest, SFSpeechRecognitionResult, SFSpeechRecognizer,
        SFSpeechRecognizerAuthorizationStatus, SFSpeechURLRecognitionRequest,
    };
    use std::sync::mpsc;
    use std::time::Duration;

    fn status_name(status: SFSpeechRecognizerAuthorizationStatus) -> &'static str {
        match status {
            SFSpeechRecognizerAuthorizationStatus::Authorized => "granted",
            SFSpeechRecognizerAuthorizationStatus::Denied => "denied",
            SFSpeechRecognizerAuthorizationStatus::Restricted => "restricted",
            _ => "not-requested",
        }
    }

    pub fn authorization_status() -> String {
        autoreleasepool(|_| unsafe {
            status_name(SFSpeechRecognizer::authorizationStatus()).to_string()
        })
    }

    pub fn request_authorization() -> AppResult<String> {
        autoreleasepool(|_| {
            let current = unsafe { SFSpeechRecognizer::authorizationStatus() };
            if current != SFSpeechRecognizerAuthorizationStatus::NotDetermined {
                return Ok(status_name(current).to_string());
            }
            let (sender, receiver) = mpsc::channel();
            let handler = RcBlock::new(move |status: SFSpeechRecognizerAuthorizationStatus| {
                let _ = sender.send(status);
            });
            unsafe { SFSpeechRecognizer::requestAuthorization(&handler) };
            receiver
                .recv_timeout(Duration::from_secs(120))
                .map(|status| status_name(status).to_string())
                .map_err(|_| {
                    AppError::SpeechRecognition(
                        "macOS did not return a speech-permission decision".into(),
                    )
                })
        })
    }

    fn transcribe_file_once(
        path: &Path,
        locale_identifier: &str,
    ) -> AppResult<TranscriptionResult> {
        let path = path.to_path_buf();
        let locale_identifier = locale_identifier.to_string();
        autoreleasepool(|_| {
            let authorization = unsafe { SFSpeechRecognizer::authorizationStatus() };
            if authorization != SFSpeechRecognizerAuthorizationStatus::Authorized {
                return Err(AppError::SpeechPermission(
                    status_name(authorization).to_string(),
                ));
            }

            let locale_name = NSString::from_str(&locale_identifier);
            let locale = NSLocale::localeWithLocaleIdentifier(&locale_name);
            let recognizer =
                unsafe { SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale) }
                    .ok_or_else(|| {
                        AppError::SpeechRecognition(format!(
                            "Apple Speech does not support locale {locale_identifier}"
                        ))
                    })?;
            if !unsafe { recognizer.isAvailable() } {
                return Err(AppError::SpeechRecognition(
                    "Apple Speech is currently unavailable".into(),
                ));
            }
            if !unsafe { recognizer.supportsOnDeviceRecognition() } {
                return Err(AppError::SpeechRecognition(format!(
                    "on-device Apple Speech is unavailable for {locale_identifier}; no audio was sent to Apple"
                )));
            }

            let queue = NSOperationQueue::new();
            unsafe { recognizer.setQueue(&queue) };
            let file_path = NSString::from_str(&path.to_string_lossy());
            let file_url = NSURL::fileURLWithPath(&file_path);
            let request = unsafe {
                SFSpeechURLRecognitionRequest::initWithURL(
                    SFSpeechURLRecognitionRequest::alloc(),
                    &file_url,
                )
            };
            let recognition_request: &SFSpeechRecognitionRequest = &request;
            unsafe {
                recognition_request.setShouldReportPartialResults(false);
                recognition_request.setRequiresOnDeviceRecognition(true);
                recognition_request.setAddsPunctuation(true);
            }

            let (sender, receiver) = mpsc::channel::<Result<TranscriptionResult, String>>();
            let handler = RcBlock::new(
                move |result: *mut SFSpeechRecognitionResult, error: *mut NSError| {
                    if !error.is_null() {
                        let description = unsafe { (&*error).localizedDescription().to_string() };
                        let _ = sender.send(Err(description));
                        return;
                    }
                    if result.is_null() {
                        return;
                    }
                    let result = unsafe { &*result };
                    if unsafe { result.isFinal() } {
                        let transcription = unsafe { result.bestTranscription() };
                        let transcript = unsafe { transcription.formattedString().to_string() };
                        let segments = unsafe { transcription.segments() };
                        let confidence = if segments.is_empty() {
                            None
                        } else {
                            let average = segments
                                .iter()
                                .map(|segment| unsafe { segment.confidence() })
                                .sum::<f32>()
                                / segments.len() as f32;
                            Some((average * 100.0).round().clamp(0.0, 100.0) as u8)
                        };
                        let _ = sender.send(Ok(TranscriptionResult {
                            text: transcript,
                            confidence,
                        }));
                    }
                },
            );
            let task = unsafe {
                recognizer.recognitionTaskWithRequest_resultHandler(recognition_request, &handler)
            };
            let outcome = receiver.recv_timeout(Duration::from_secs(180));
            drop(task);
            match outcome {
                Ok(Ok(result)) if !result.text.trim().is_empty() => Ok(result),
                Ok(Ok(_)) => Err(AppError::SpeechRecognition(
                    "Apple Speech returned an empty transcript".into(),
                )),
                Ok(Err(error)) => Err(AppError::SpeechRecognition(error)),
                Err(_) => Err(AppError::SpeechRecognition(
                    "Apple Speech timed out while processing the recording".into(),
                )),
            }
        })
    }

    pub fn transcribe_file_with_confidence(
        path: &Path,
        locale_identifier: &str,
    ) -> AppResult<TranscriptionResult> {
        match transcribe_file_once(path, locale_identifier) {
            Err(AppError::SpeechRecognition(message))
                if message.contains("Cannot Open") || message.contains("couldn’t be opened") =>
            {
                // Apple Speech can briefly race a newly closed recording even though
                // the file has already been flushed. A single bounded retry keeps the
                // original audio untouched and avoids turning that transient state
                // into a failed capture.
                std::thread::sleep(Duration::from_millis(500));
                transcribe_file_once(path, locale_identifier)
            }
            outcome => outcome,
        }
    }

    pub fn transcribe_file(path: &Path, locale_identifier: &str) -> AppResult<String> {
        transcribe_file_with_confidence(path, locale_identifier).map(|result| result.text)
    }
}

#[cfg(target_os = "macos")]
pub use apple::{
    authorization_status, request_authorization, transcribe_file, transcribe_file_with_confidence,
};

#[cfg(not(target_os = "macos"))]
pub fn authorization_status() -> String {
    "unsupported".into()
}

#[cfg(not(target_os = "macos"))]
pub fn request_authorization() -> AppResult<String> {
    Err(AppError::SpeechRecognition(
        "Apple Speech is available only on macOS".into(),
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn transcribe_file(_path: &Path, _locale_identifier: &str) -> AppResult<String> {
    Err(AppError::SpeechRecognition(
        "Apple Speech is available only on macOS".into(),
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn transcribe_file_with_confidence(
    _path: &Path,
    _locale_identifier: &str,
) -> AppResult<TranscriptionResult> {
    Err(AppError::SpeechRecognition(
        "Apple Speech is available only on macOS".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn executable_candidates_include_gui_app_locations() {
        let home = Path::new("/Users/example");
        let candidates = executable_candidates("uv", Some(home));

        assert!(candidates.contains(&home.join(".local/bin/uv")));
        assert!(candidates.contains(&home.join(".cargo/bin/uv")));
        assert!(candidates.contains(&PathBuf::from("/opt/homebrew/bin/uv")));
        assert!(candidates.contains(&PathBuf::from("/usr/local/bin/uv")));
    }

    #[test]
    fn model_cache_counts_downloaded_blobs_without_snapshot_duplicates() {
        let temporary = tempfile::tempdir().expect("temporary cache");
        let model = temporary
            .path()
            .join("models--mlx-community--parakeet-tdt-0.6b-v3");
        std::fs::create_dir_all(model.join("blobs")).expect("blob folder");
        std::fs::create_dir_all(model.join("snapshots/revision")).expect("snapshot folder");
        std::fs::write(model.join("blobs/model.incomplete"), [0_u8; 128]).expect("partial blob");
        std::fs::write(
            model.join("snapshots/revision/model.safetensors"),
            [0_u8; 64],
        )
        .expect("snapshot file");

        assert_eq!(
            parakeet_model_cache_at(temporary.path()),
            ("partial".into(), 128)
        );
    }
}
