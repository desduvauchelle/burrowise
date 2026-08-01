fn main() {
    let mut arguments = std::env::args_os();
    let _executable = arguments.next();
    let command = arguments.next();
    if command.as_deref() == Some(std::ffi::OsStr::new("--transcribe-diagnostic")) {
        let Some(audio_path) = arguments.next() else {
            eprintln!("usage: second-brain-desktop --transcribe-diagnostic <audio-file>");
            std::process::exit(2);
        };
        match second_brain_desktop_lib::run_transcription_diagnostic(std::path::Path::new(
            &audio_path,
        )) {
            Ok(transcript) => {
                println!("{transcript}");
                return;
            }
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
    }
    if command.as_deref() == Some(std::ffi::OsStr::new("--process-capture-diagnostic")) {
        let Some(brain_path) = arguments.next() else {
            eprintln!("usage: second-brain-desktop --process-capture-diagnostic <brain-folder> <session-id>");
            std::process::exit(2);
        };
        let Some(session_id) = arguments.next() else {
            eprintln!("usage: second-brain-desktop --process-capture-diagnostic <brain-folder> <session-id>");
            std::process::exit(2);
        };
        match second_brain_desktop_lib::run_capture_diagnostic(
            std::path::Path::new(&brain_path),
            &session_id.to_string_lossy(),
        ) {
            Ok(session) => {
                println!("{session}");
                return;
            }
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
    }
    if command.as_deref() == Some(std::ffi::OsStr::new("--search-diagnostic")) {
        let Some(brain_path) = arguments.next() else {
            eprintln!("usage: second-brain-desktop --search-diagnostic <brain-folder> <query> [mode] [scope]");
            std::process::exit(2);
        };
        let Some(query) = arguments.next() else {
            eprintln!("usage: second-brain-desktop --search-diagnostic <brain-folder> <query> [mode] [scope]");
            std::process::exit(2);
        };
        let mode = arguments.next().unwrap_or_else(|| "hybrid".into());
        let scope = arguments.next().unwrap_or_else(|| "all".into());
        match second_brain_desktop_lib::run_search_diagnostic(
            std::path::Path::new(&brain_path),
            &query.to_string_lossy(),
            &mode.to_string_lossy(),
            &scope.to_string_lossy(),
        ) {
            Ok(results) => {
                println!("{results}");
                return;
            }
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
    }
    second_brain_desktop_lib::run();
}
