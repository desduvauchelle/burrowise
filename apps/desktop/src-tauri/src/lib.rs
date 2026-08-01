mod capture;
mod chat;
mod commands;
mod conversation;
mod content;
mod dashboard;
mod domain;
mod enrichment;
mod error;
mod filesystem;
mod image_memory;
mod interview;
mod library;
mod notes;
mod permissions;
mod provider_costs;
mod providers;
mod review;
mod search;
mod share;
mod shortcuts;
mod storage;
mod sync;
mod tags;
mod transcription;

pub fn run_transcription_diagnostic(audio_path: &std::path::Path) -> Result<String, String> {
    let audio_path = audio_path.to_path_buf();
    std::thread::spawn(move || transcription::transcribe_file(&audio_path, "en-US"))
        .join()
        .map_err(|_| "speech-recognition worker panicked".to_string())?
        .map_err(|error| error.to_string())
}

pub fn run_capture_diagnostic(brain: &std::path::Path, session_id: &str) -> Result<String, String> {
    let brain = brain.to_path_buf();
    let session_id = session_id.to_string();
    let session =
        std::thread::spawn(move || capture::process_session(&brain, &session_id, "apple-speech"))
            .join()
            .map_err(|_| "capture-processing worker panicked".to_string())?
            .map_err(|error| error.to_string())?;
    serde_json::to_string_pretty(&session).map_err(|error| error.to_string())
}

pub fn run_search_diagnostic(
    brain: &std::path::Path,
    query: &str,
    mode: &str,
    scope: &str,
) -> Result<String, String> {
    let results = search::search(
        brain,
        &domain::SearchQuery {
            query: query.to_string(),
            mode: mode.to_string(),
            scope: scope.to_string(),
            limit: Some(20),
            selected_paths: Vec::new(),
        },
    )
    .map_err(|error| error.to_string())?;
    serde_json::to_string_pretty(&results).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(shortcuts::plugin())
        .setup(|app| {
            shortcuts::initialize(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::frontend_ready,
            commands::get_shortcut_settings,
            commands::update_quick_capture_shortcut,
            commands::get_bootstrap_state,
            commands::update_behavior_preferences,
            commands::get_dashboard_overview,
            commands::get_audio_retention,
            commands::set_audio_retention,
            commands::get_library_overview,
            commands::import_source_files,
            commands::import_image_files,
            commands::import_video_files,
            commands::import_shared_items,
            commands::get_image_memory,
            commands::process_image_memory,
            commands::read_image_memory,
            commands::reveal_image_memory,
            commands::list_notes,
            commands::save_note,
            commands::trash_note,
            commands::open_note_external,
            commands::list_review_items,
            commands::resolve_review_item,
            commands::get_tags_overview,
            commands::configure_brain_folder,
            commands::create_capture_session,
            commands::fail_capture_session,
            commands::save_capture_audio,
            commands::save_capture_audio_snapshot,
            commands::transcribe_capture_snapshot,
            commands::process_capture_session,
            commands::update_capture_transcript,
            commands::propose_transcript_cleanup,
            commands::reveal_capture_session,
            commands::open_capture_transcript,
            commands::reveal_capture_audio,
            commands::read_capture_audio,
            commands::rename_capture_session,
            commands::trash_capture_session,
            commands::request_speech_permission,
            commands::set_transcription_provider,
            commands::set_microphone_permission_state,
            commands::list_transcription_providers,
            commands::get_parakeet_status,
            commands::install_parakeet_cli,
            commands::download_parakeet_model,
            commands::reveal_brain_folder,
            commands::open_microphone_settings,
            commands::open_speech_settings,
            commands::get_generation_provider_catalog,
            commands::save_generation_provider,
            commands::delete_generation_provider,
            commands::save_provider_credential,
            commands::clear_provider_credential,
            commands::set_preferred_model,
            commands::set_favorite_model,
            commands::set_default_provider_model,
            commands::test_generation_provider,
            commands::get_provider_cost_summary,
            commands::save_provider_monthly_budget,
            commands::rebuild_search_index,
            commands::clear_search_index,
            commands::search_brain,
            commands::list_indexed_sources,
            commands::get_source_document,
            commands::reveal_source_in_finder,
            commands::create_chat_conversation,
            commands::list_conversations,
            commands::list_conversation_messages,
            commands::rename_chat_conversation,
            commands::export_chat_conversation,
            commands::delete_chat_conversation,
            commands::queue_chat_agent_proposal,
            commands::submit_conversation_turn,
            commands::list_interview_hosts,
            commands::save_interview_host,
            commands::start_interview,
            commands::rename_interview_session,
            commands::export_interview_session,
            commands::trash_interview_session,
            commands::resume_interview_session,
            commands::begin_interview_audio_turn,
            commands::save_interview_turn_audio,
            commands::complete_interview_audio_turn,
            commands::process_interview_audio_turn,
            commands::list_interview_access_log,
            commands::end_interview,
            commands::list_content_skills,
            commands::save_content_skill,
            commands::list_content_projects,
            commands::create_content_project,
            commands::get_content_project,
            commands::run_next_content_step,
            commands::save_content_step_revision,
            commands::get_sync_state,
            commands::save_sync_credentials,
            commands::get_sync_access_token,
            commands::clear_sync_credentials,
            commands::list_sync_files,
            commands::read_sync_file,
            commands::write_synced_file,
            commands::load_sync_manifest,
            commands::save_sync_manifest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Burrowise");
}
