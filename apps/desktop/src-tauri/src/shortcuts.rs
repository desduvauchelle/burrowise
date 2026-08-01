use crate::domain::ShortcutSettingsState;
use crate::error::{AppError, AppResult};
use crate::storage;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn shortcut_error(error: impl std::fmt::Display) -> AppError {
    AppError::InvalidShortcut(error.to_string())
}

fn validate(shortcut: &str) -> AppResult<&str> {
    let shortcut = shortcut.trim();
    if shortcut.is_empty() {
        return Err(AppError::InvalidShortcut("enter a key combination".into()));
    }
    if !shortcut.contains('+') {
        return Err(AppError::InvalidShortcut(
            "a global shortcut must include at least one modifier".into(),
        ));
    }
    Ok(shortcut)
}

pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("second-brain://quick-capture", ());
        })
        .build()
}

pub fn initialize(app: &AppHandle) {
    let Ok(config) = storage::read_config(app) else {
        return;
    };
    if config.quick_capture_shortcut_enabled {
        let _ = app
            .global_shortcut()
            .register(config.quick_capture_shortcut.as_str());
    }
}

pub fn get(app: &AppHandle) -> AppResult<ShortcutSettingsState> {
    let config = storage::read_config(app)?;
    let registered = if config.quick_capture_shortcut_enabled {
        app.global_shortcut()
            .is_registered(config.quick_capture_shortcut.as_str())
    } else {
        false
    };
    let detail = if registered {
        "Registered with macOS and available while Burrowise is in the background.".into()
    } else if config.quick_capture_shortcut_enabled {
        "Enabled in settings, but macOS could not register it. Another app may already use this combination.".into()
    } else {
        "Disabled. The in-app Capture button remains available.".into()
    };
    Ok(ShortcutSettingsState {
        enabled: config.quick_capture_shortcut_enabled,
        shortcut: config.quick_capture_shortcut,
        registered,
        local_enabled: config.local_capture_shortcut_enabled,
        local_shortcut: config.local_capture_shortcut,
        detail,
    })
}

pub fn update(
    app: &AppHandle,
    shortcut: &str,
    enabled: bool,
    local_shortcut: &str,
    local_enabled: bool,
) -> AppResult<ShortcutSettingsState> {
    let shortcut = validate(shortcut)?.to_string();
    let local_shortcut = validate(local_shortcut)?.to_string();
    let mut config = storage::read_config(app)?;
    let previous = config.quick_capture_shortcut.clone();
    let previous_enabled = config.quick_capture_shortcut_enabled;

    if enabled
        && (!previous_enabled
            || previous != shortcut
            || !app.global_shortcut().is_registered(shortcut.as_str()))
    {
        app.global_shortcut()
            .register(shortcut.as_str())
            .map_err(|error| {
                shortcut_error(format!(
                    "{error}. Choose another combination; this one may be used by another app"
                ))
            })?;
    }
    if previous_enabled && (!enabled || previous != shortcut) {
        if let Err(error) = app.global_shortcut().unregister(previous.as_str()) {
            if enabled {
                let _ = app.global_shortcut().unregister(shortcut.as_str());
            }
            return Err(shortcut_error(error));
        }
    }

    config.quick_capture_shortcut = shortcut;
    config.quick_capture_shortcut_enabled = enabled;
    config.local_capture_shortcut = local_shortcut;
    config.local_capture_shortcut_enabled = local_enabled;
    if let Err(error) = storage::write_config(app, &config) {
        if enabled {
            let _ = app
                .global_shortcut()
                .unregister(config.quick_capture_shortcut.as_str());
        }
        if previous_enabled {
            let _ = app.global_shortcut().register(previous.as_str());
        }
        return Err(error);
    }
    get(app)
}

#[cfg(test)]
mod tests {
    use super::validate;

    #[test]
    fn global_shortcuts_require_a_modifier_and_key() {
        assert!(validate("").is_err());
        assert!(validate("Space").is_err());
        assert_eq!(
            validate("CommandOrControl+Shift+Space").expect("valid shortcut"),
            "CommandOrControl+Shift+Space"
        );
    }
}
