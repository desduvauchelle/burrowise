use crate::domain::{ImageMemory, ImageMemoryPayload};
use crate::error::{AppError, AppResult};
use crate::{providers, search};
use chrono::{Local, Utc};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use uuid::Uuid;

const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
const METADATA_FILE: &str = "image.json";

#[derive(Clone, Copy)]
struct ImageType {
    mime_type: &'static str,
    extension: &'static str,
    needs_conversion: bool,
}

fn detected_image_type(path: &Path) -> AppResult<ImageType> {
    let mut file = fs::File::open(path)?;
    let mut header = [0_u8; 16];
    let count = file.read(&mut header)?;
    let bytes = &header[..count];
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Ok(ImageType {
            mime_type: "image/jpeg",
            extension: "jpg",
            needs_conversion: false,
        });
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok(ImageType {
            mime_type: "image/png",
            extension: "png",
            needs_conversion: false,
        });
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Ok(ImageType {
            mime_type: "image/gif",
            extension: "gif",
            needs_conversion: false,
        });
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Ok(ImageType {
            mime_type: "image/webp",
            extension: "webp",
            needs_conversion: false,
        });
    }
    if bytes.len() >= 12
        && &bytes[4..8] == b"ftyp"
        && matches!(
            &bytes[8..12],
            b"heic" | b"heix" | b"hevc" | b"hevx" | b"mif1"
        )
    {
        return Ok(ImageType {
            mime_type: "image/heic",
            extension: "heic",
            needs_conversion: true,
        });
    }
    Err(AppError::InvalidSource(format!(
        "{} is not a supported JPEG, PNG, WebP, GIF, or HEIC image",
        path.display()
    )))
}

fn safe_stem(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let slug = stem
        .chars()
        .flat_map(char::to_lowercase)
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let compact = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if compact.is_empty() {
        "image".into()
    } else {
        compact.chars().take(48).collect()
    }
}

fn readable_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.replace(['-', '_'], " "))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Image source".into())
}

fn write_metadata(memory: &ImageMemory) -> AppResult<()> {
    fs::write(
        Path::new(&memory.folder_path).join(METADATA_FILE),
        serde_json::to_vec_pretty(memory)?,
    )?;
    Ok(())
}

fn repair_paths(brain: &Path, mut memory: ImageMemory) -> ImageMemory {
    memory.folder_path = brain
        .join(&memory.relative_folder)
        .to_string_lossy()
        .to_string();
    memory.image_path = brain
        .join(&memory.relative_image_path)
        .to_string_lossy()
        .to_string();
    memory.source_path = brain
        .join(&memory.relative_source_path)
        .to_string_lossy()
        .to_string();
    if memory.analysis_image_path.is_empty() {
        memory.analysis_image_path = memory.image_path.clone();
    } else {
        let analysis_name = Path::new(&memory.analysis_image_path)
            .file_name()
            .map(|value| value.to_owned());
        if let Some(name) = analysis_name {
            memory.analysis_image_path = brain
                .join(&memory.relative_folder)
                .join(name)
                .to_string_lossy()
                .to_string();
        }
    }
    if memory.analysis_image_mime_type.is_empty() {
        memory.analysis_image_mime_type = memory.image_mime_type.clone();
    }
    memory
}

pub fn list(brain: &Path) -> AppResult<Vec<ImageMemory>> {
    let root = brain.join("sources/images");
    let Ok(entries) = fs::read_dir(root) else {
        return Ok(Vec::new());
    };
    let mut memories = entries
        .flatten()
        .map(|entry| entry.path().join(METADATA_FILE))
        .filter(|path| path.is_file() && !path.is_symlink())
        .filter_map(|path| {
            serde_json::from_slice::<ImageMemory>(&fs::read(path).ok()?)
                .ok()
                .map(|memory| repair_paths(brain, memory))
        })
        .collect::<Vec<_>>();
    memories.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    for memory in &memories {
        write_metadata(memory)?;
    }
    Ok(memories)
}

pub fn get(brain: &Path, image_id: &str) -> AppResult<ImageMemory> {
    list(brain)?
        .into_iter()
        .find(|memory| memory.id == image_id)
        .ok_or_else(|| AppError::MissingImageMemory(image_id.into()))
}

#[cfg(target_os = "macos")]
fn convert_heic(source: &Path, destination: &Path) -> AppResult<()> {
    let status = std::process::Command::new("/usr/bin/sips")
        .args(["-s", "format", "jpeg"])
        .arg(source)
        .arg("--out")
        .arg(destination)
        .status()?;
    if !status.success() || !destination.is_file() {
        return Err(AppError::InvalidSource(format!(
            "{} could not be converted to JPEG for image review",
            source.display()
        )));
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn convert_heic(source: &Path, _destination: &Path) -> AppResult<()> {
    Err(AppError::InvalidSource(format!(
        "{} is HEIC; convert it to JPEG or PNG before importing on this platform",
        source.display()
    )))
}

pub fn import_files(brain: &Path, paths: &[String]) -> AppResult<Vec<ImageMemory>> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    let validated = paths
        .iter()
        .map(|requested| {
            let source = PathBuf::from(requested);
            if !source.is_absolute() || !source.is_file() {
                return Err(AppError::InvalidSource(format!(
                    "image file is unavailable: {requested}"
                )));
            }
            let metadata = fs::metadata(&source)?;
            if metadata.len() == 0 || metadata.len() > MAX_IMAGE_BYTES {
                return Err(AppError::InvalidSource(format!(
                    "{} must be between 1 byte and 25 MB",
                    source.display()
                )));
            }
            Ok((
                source.clone(),
                metadata.len(),
                detected_image_type(&source)?,
            ))
        })
        .collect::<AppResult<Vec<_>>>()?;

    let root = brain.join("sources/images");
    fs::create_dir_all(&root)?;
    let mut created_folders = Vec::new();
    let mut imported = Vec::new();
    let result = (|| -> AppResult<()> {
        for (source, original_bytes, kind) in validated {
            let id = Uuid::new_v4().to_string();
            let slug = format!(
                "{}-{}-{}",
                Local::now().format("%Y-%m-%d"),
                safe_stem(&source),
                &id[..8]
            );
            let folder = root.join(&slug);
            fs::create_dir(&folder)?;
            created_folders.push(folder.clone());
            let original = folder.join(format!("original.{}", kind.extension));
            fs::copy(&source, &original)?;
            let (analysis_path, analysis_mime_type) = if kind.needs_conversion {
                let converted = folder.join("review-input.jpg");
                convert_heic(&original, &converted)?;
                (converted, "image/jpeg")
            } else {
                (original.clone(), kind.mime_type)
            };
            let relative_folder = folder
                .strip_prefix(brain)
                .map_err(|_| AppError::InvalidSource("image folder escaped the brain".into()))?
                .to_string_lossy()
                .to_string();
            let relative_image_path = original
                .strip_prefix(brain)
                .map_err(|_| AppError::InvalidSource("image file escaped the brain".into()))?
                .to_string_lossy()
                .to_string();
            let source_path = folder.join("source.md");
            let relative_source_path = source_path
                .strip_prefix(brain)
                .map_err(|_| AppError::InvalidSource("image source escaped the brain".into()))?
                .to_string_lossy()
                .to_string();
            let now = Utc::now().to_rfc3339();
            let memory = ImageMemory {
                id,
                title: readable_title(&source),
                created_at: now.clone(),
                updated_at: now,
                folder_path: folder.to_string_lossy().to_string(),
                relative_folder,
                image_path: original.to_string_lossy().to_string(),
                relative_image_path,
                image_mime_type: kind.mime_type.into(),
                image_bytes: original_bytes,
                analysis_image_path: analysis_path.to_string_lossy().to_string(),
                analysis_image_mime_type: analysis_mime_type.into(),
                source_path: source_path.to_string_lossy().to_string(),
                relative_source_path,
                status: "awaiting_analysis".into(),
                extracted_markdown: String::new(),
                processing_error: None,
                provider_id: None,
                model_id: None,
                locality: None,
            };
            write_metadata(&memory)?;
            imported.push(memory);
        }
        Ok(())
    })();
    if let Err(error) = result {
        for folder in created_folders.into_iter().rev() {
            let _ = fs::remove_dir_all(folder);
        }
        return Err(error);
    }
    Ok(imported)
}

fn strip_code_fence(markdown: &str) -> String {
    let trimmed = markdown.trim();
    if !trimmed.starts_with("```") {
        return trimmed.to_string();
    }
    let without_open = trimmed
        .split_once('\n')
        .map(|(_, remainder)| remainder)
        .unwrap_or_default();
    without_open
        .strip_suffix("```")
        .unwrap_or(without_open)
        .trim()
        .to_string()
}

fn title_from_markdown(markdown: &str, fallback: &str) -> String {
    markdown
        .lines()
        .find_map(|line| line.trim().strip_prefix("# "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(120).collect())
        .unwrap_or_else(|| fallback.to_string())
}

fn complete_analysis(
    brain: &Path,
    mut memory: ImageMemory,
    extracted: &str,
    provider_id: &str,
    model_id: &str,
    locality: &str,
) -> AppResult<ImageMemory> {
    let mut extracted = strip_code_fence(extracted);
    if extracted.trim().is_empty() {
        return Err(AppError::GenerationProvider(
            "the image model returned an empty transcription".into(),
        ));
    }
    if extracted.len() > 500_000 {
        return Err(AppError::GenerationProvider(
            "the image model returned more than 500 KB of text".into(),
        ));
    }
    memory.title = title_from_markdown(&extracted, &memory.title);
    if !extracted.lines().any(|line| line.trim().starts_with("# ")) {
        extracted = format!("# {}\n\n{extracted}", memory.title);
    }
    let original_name = Path::new(&memory.image_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("original image");
    let source = format!(
        "---\nid: {}\ntype: image-memory\ncreated_at: {}\nimage: {}\nanalysis_provider: {}\nanalysis_model: {}\nanalysis_locality: {}\n---\n\n![Original image]({})\n\n{}\n",
        memory.id,
        memory.created_at,
        memory.relative_image_path,
        provider_id,
        model_id,
        locality,
        original_name,
        extracted.trim()
    );
    fs::write(&memory.source_path, &source)?;
    memory.status = "ready".into();
    memory.updated_at = Utc::now().to_rfc3339();
    memory.extracted_markdown = extracted;
    memory.processing_error = None;
    memory.provider_id = Some(provider_id.into());
    memory.model_id = Some(model_id.into());
    memory.locality = Some(locality.into());
    write_metadata(&memory)?;
    search::rebuild_index(brain)?;
    Ok(memory)
}

fn mark_failed(mut memory: ImageMemory, status: &str, message: String) -> AppResult<ImageMemory> {
    memory.status = status.into();
    memory.updated_at = Utc::now().to_rfc3339();
    memory.processing_error = Some(message);
    write_metadata(&memory)?;
    Ok(memory)
}

pub fn process(app: &AppHandle, brain: &Path, image_id: &str) -> AppResult<ImageMemory> {
    let mut memory = get(brain, image_id)?;
    if memory.status == "ready" && Path::new(&memory.source_path).is_file() {
        return Ok(memory);
    }
    let selection = match providers::preferred_model(app, "vision") {
        Ok(selection) => selection,
        Err(error) => return mark_failed(memory, "needs_model", error.to_string()),
    };
    memory.status = "analyzing".into();
    memory.updated_at = Utc::now().to_rfc3339();
    memory.processing_error = None;
    memory.provider_id = Some(selection.provider_id.clone());
    memory.model_id = Some(selection.model_id.clone());
    write_metadata(&memory)?;
    let bytes = match fs::read(&memory.analysis_image_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            return mark_failed(
                memory,
                "analysis_failed",
                format!("the saved review image could not be read: {error}"),
            )
        }
    };
    let output = match providers::generate_with_image(
        app,
        &selection,
        "You convert personal images into faithful, searchable Markdown. Preserve the user's visible wording and structure. Never invent text, hidden context, or conclusions. Mark unreadable fragments as [illegible]. Return Markdown only.",
        "Review this image for a personal knowledge base. If it contains handwritten or printed notes, transcribe them faithfully while preserving headings, lists, checkboxes, and rough structure. If it is a diagram, whiteboard, or non-text image, transcribe every visible label and add a short factual description of the visible relationships. Start with one concise H1 title. Do not add advice or facts that are not visible.",
        &memory.analysis_image_mime_type,
        &bytes,
        "image-review",
    ) {
        Ok(output) => output,
        Err(error) => return mark_failed(memory, "analysis_failed", error.to_string()),
    };
    complete_analysis(
        brain,
        memory,
        &output.text,
        &output.provider_id,
        &output.model_id,
        &output.locality,
    )
    .or_else(|error| {
        let memory = get(brain, image_id)?;
        mark_failed(memory, "analysis_failed", error.to_string())
    })
}

pub fn read_image(brain: &Path, image_id: &str) -> AppResult<ImageMemoryPayload> {
    let memory = get(brain, image_id)?;
    Ok(ImageMemoryPayload {
        mime_type: memory.analysis_image_mime_type,
        bytes: fs::read(memory.analysis_image_path)?,
    })
}

pub fn reveal_path(brain: &Path, image_id: &str) -> AppResult<PathBuf> {
    Ok(PathBuf::from(get(brain, image_id)?.folder_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_png() -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        bytes.extend_from_slice(b"fixture image bytes");
        bytes
    }

    #[test]
    fn imports_original_images_into_readable_source_folders() {
        let temporary = tempfile::tempdir().expect("root");
        let brain = temporary.path().join("brain");
        let incoming = temporary.path().join("Workshop Notes.PNG");
        fs::create_dir_all(brain.join("sources")).expect("sources");
        fs::write(&incoming, tiny_png()).expect("image");

        let imported =
            import_files(&brain, &[incoming.to_string_lossy().to_string()]).expect("image import");
        assert_eq!(imported.len(), 1);
        let memory = &imported[0];
        assert_eq!(memory.status, "awaiting_analysis");
        assert_eq!(memory.image_mime_type, "image/png");
        assert!(Path::new(&memory.image_path).is_file());
        assert!(Path::new(&memory.folder_path).join(METADATA_FILE).is_file());
        assert_eq!(list(&brain).expect("list").len(), 1);
    }

    #[test]
    fn completed_analysis_becomes_searchable_markdown_with_provenance() {
        let temporary = tempfile::tempdir().expect("root");
        let brain = temporary.path().join("brain");
        let incoming = temporary.path().join("note.png");
        for folder in ["sources", "notes", "sessions"] {
            fs::create_dir_all(brain.join(folder)).expect("folder");
        }
        fs::write(&incoming, tiny_png()).expect("image");
        let memory = import_files(&brain, &[incoming.to_string_lossy().to_string()])
            .expect("import")
            .remove(0);
        let completed = complete_analysis(
            &brain,
            memory,
            "# Launch checklist\n\n- Preserve the original photograph\n- Confirm the transcription",
            "test-vision",
            "fixture-v1",
            "local",
        )
        .expect("complete");

        assert_eq!(completed.status, "ready");
        let source = fs::read_to_string(&completed.source_path).expect("source");
        assert!(source.contains("analysis_provider: test-vision"));
        assert!(!search::search(
            &brain,
            &crate::domain::SearchQuery {
                query: "preserve original photograph".into(),
                mode: "lexical".into(),
                scope: "sources".into(),
                limit: Some(5),
                selected_paths: vec![]
            }
        )
        .expect("search")
        .is_empty());
    }
}
