use crate::error::{AppError, AppResult};
use crate::search;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

static WATCHERS: OnceLock<Mutex<BTreeMap<PathBuf, RecommendedWatcher>>> = OnceLock::new();

fn relevant(path: &Path) -> bool {
    if path.components().any(|component| {
        matches!(
            component.as_os_str().to_str(),
            Some(".second-brain" | "review" | "hosts" | "skills" | "projects")
        )
    }) {
        return false;
    }
    path.extension()
        .and_then(|value| value.to_str())
        .map(str::to_lowercase)
        .is_none_or(|extension| matches!(extension.as_str(), "md" | "markdown" | "txt"))
}

pub fn start(brain: &Path) -> AppResult<()> {
    let brain = brain.canonicalize()?;
    let watchers = WATCHERS.get_or_init(|| Mutex::new(BTreeMap::new()));
    let mut watchers = watchers
        .lock()
        .map_err(|_| AppError::InvalidBrain("filesystem watcher lock was poisoned".into()))?;
    if watchers.contains_key(&brain) {
        return Ok(());
    }
    let pending = Arc::new(AtomicBool::new(false));
    let watched_brain = brain.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let Ok(event) = event else {
            return;
        };
        if !event.paths.iter().any(|path| relevant(path)) || pending.swap(true, Ordering::AcqRel) {
            return;
        }
        let brain = watched_brain.clone();
        let pending = Arc::clone(&pending);
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(250));
            if let Err(error) = search::reconcile_external_changes(&brain) {
                eprintln!(
                    "filesystem reconciliation failed for {}: {error}",
                    brain.display()
                );
            }
            pending.store(false, Ordering::Release);
        });
    })
    .map_err(|error| AppError::InvalidBrain(format!("filesystem watcher failed: {error}")))?;
    watcher
        .watch(&brain, RecursiveMode::Recursive)
        .map_err(|error| {
            AppError::InvalidBrain(format!("could not watch brain folder: {error}"))
        })?;
    watchers.insert(brain, watcher);
    Ok(())
}

#[cfg(test)]
pub fn active(brain: &Path) -> bool {
    let Ok(brain) = brain.canonicalize() else {
        return false;
    };
    WATCHERS
        .get()
        .and_then(|watchers| watchers.lock().ok())
        .is_some_and(|watchers| watchers.contains_key(&brain))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_one_recursive_watcher_per_brain() {
        let temporary = tempfile::tempdir().expect("brain");
        start(temporary.path()).expect("watcher");
        start(temporary.path()).expect("idempotent watcher");
        assert!(active(temporary.path()));
    }
}
