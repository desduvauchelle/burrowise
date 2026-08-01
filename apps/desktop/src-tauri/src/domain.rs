use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub brain_folders: Vec<String>,
    pub active_brain: Option<String>,
    pub transcription_provider: String,
    #[serde(default = "default_microphone_permission")]
    pub microphone_permission: String,
    #[serde(default = "default_speech_permission")]
    pub speech_permission: String,
    #[serde(default)]
    pub capture_pipeline_version: u32,
    #[serde(default)]
    pub sync_service_url: Option<String>,
    #[serde(default)]
    pub sync_account_email: Option<String>,
    #[serde(default)]
    pub sync_key_salt: Option<String>,
    #[serde(default)]
    pub sync_token_expires_at: Option<String>,
    #[serde(default)]
    pub sync_enabled: bool,
    #[serde(default)]
    pub sync_device_id: Option<String>,
    #[serde(default)]
    pub last_sync_at: Option<String>,
    #[serde(default)]
    pub generation_providers: Vec<GenerationProviderConfig>,
    #[serde(default)]
    pub preferred_models: BTreeMap<String, ModelSelection>,
    #[serde(default)]
    pub favorite_models: Vec<ModelSelection>,
    #[serde(default)]
    pub audio_retention_days: Option<u32>,
    #[serde(default)]
    pub provider_monthly_budget_micros: Option<i64>,
    #[serde(default = "default_quick_capture_shortcut")]
    pub quick_capture_shortcut: String,
    #[serde(default)]
    pub quick_capture_shortcut_enabled: bool,
    #[serde(default = "default_local_capture_shortcut")]
    pub local_capture_shortcut: String,
    #[serde(default = "default_true")]
    pub local_capture_shortcut_enabled: bool,
    #[serde(default = "default_transcription_correction_preference")]
    pub transcription_correction_preference: String,
    #[serde(default = "default_agent_mode")]
    pub default_agent_mode: String,
    #[serde(default)]
    pub allow_general_knowledge_default: bool,
}

fn default_microphone_permission() -> String {
    "not-requested".to_string()
}

fn default_speech_permission() -> String {
    "not-requested".to_string()
}

fn default_quick_capture_shortcut() -> String {
    "CommandOrControl+Shift+Space".to_string()
}

fn default_local_capture_shortcut() -> String {
    "Control+Shift+C".to_string()
}

fn default_true() -> bool {
    true
}

fn default_transcription_correction_preference() -> String {
    "verbatim".into()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            brain_folders: Vec::new(),
            active_brain: None,
            transcription_provider: if cfg!(target_os = "macos") {
                "apple-speech".to_string()
            } else {
                "none".to_string()
            },
            microphone_permission: default_microphone_permission(),
            speech_permission: default_speech_permission(),
            capture_pipeline_version: 1,
            sync_service_url: None,
            sync_account_email: None,
            sync_key_salt: None,
            sync_token_expires_at: None,
            sync_enabled: false,
            sync_device_id: None,
            last_sync_at: None,
            generation_providers: Vec::new(),
            preferred_models: BTreeMap::new(),
            favorite_models: Vec::new(),
            audio_retention_days: None,
            provider_monthly_budget_micros: None,
            quick_capture_shortcut: default_quick_capture_shortcut(),
            quick_capture_shortcut_enabled: false,
            local_capture_shortcut: default_local_capture_shortcut(),
            local_capture_shortcut_enabled: true,
            transcription_correction_preference: default_transcription_correction_preference(),
            default_agent_mode: default_agent_mode(),
            allow_general_knowledge_default: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutSettingsState {
    pub enabled: bool,
    pub shortcut: String,
    pub registered: bool,
    pub local_enabled: bool,
    pub local_shortcut: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelSelection {
    pub provider_id: String,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationProviderConfig {
    pub provider_id: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub executable_path: Option<String>,
    #[serde(default)]
    pub default_model_id: Option<String>,
    #[serde(default)]
    pub cloud_confirmed: bool,
    #[serde(default)]
    pub last_tested_at: Option<String>,
    #[serde(default)]
    pub last_test_status: Option<String>,
    #[serde(default)]
    pub cached_models: Vec<CachedGenerationModel>,
    #[serde(default)]
    pub last_discovered_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPriceTier {
    pub cost_per_token: String,
    pub min_tokens: u64,
    #[serde(default)]
    pub max_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelPricing {
    #[serde(default)]
    pub input_per_token: Option<String>,
    #[serde(default)]
    pub output_per_token: Option<String>,
    #[serde(default)]
    pub cached_input_per_token: Option<String>,
    #[serde(default)]
    pub input_tiers: Vec<ModelPriceTier>,
    #[serde(default)]
    pub output_tiers: Vec<ModelPriceTier>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedGenerationModel {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub context_window: Option<u64>,
    #[serde(default)]
    pub pricing: Option<ModelPricing>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveGenerationProviderInput {
    pub provider_id: String,
    pub display_name: String,
    pub enabled: bool,
    pub base_url: Option<String>,
    pub executable_path: Option<String>,
    #[serde(default)]
    pub cloud_confirmed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProviderCredentialInput {
    pub provider_id: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPreferredModelInput {
    pub capability: String,
    pub provider_id: String,
    pub model_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetFavoriteModelInput {
    pub provider_id: String,
    pub model_id: String,
    pub favorite: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDefaultProviderModelInput {
    pub provider_id: String,
    pub model_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestGenerationProviderInput {
    pub provider_id: String,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSession {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub folder_path: String,
    pub relative_folder: String,
    pub status: String,
    pub audio_path: Option<String>,
    pub audio_mime_type: Option<String>,
    pub audio_bytes: Option<u64>,
    pub transcript_path: String,
    #[serde(default)]
    pub transcript: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub processing_error: Option<String>,
    #[serde(default)]
    pub transcription_provider: Option<String>,
    #[serde(default)]
    pub atomic_notes: Vec<AtomicNoteProposal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtomicNoteProposal {
    pub id: String,
    pub title: String,
    pub content: String,
    pub source_relative_path: String,
    pub quote: String,
    pub review_relative_path: String,
    pub status: String,
    #[serde(default = "default_review_action")]
    pub suggested_action: String,
    #[serde(default)]
    pub matched_note_path: Option<String>,
    #[serde(default)]
    pub confidence: Option<u8>,
}

fn default_review_action() -> String {
    "create".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureAudioPayload {
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptCleanupProposal {
    pub session_id: String,
    pub original: String,
    pub proposed: String,
    pub provider_id: String,
    pub model_id: String,
    pub locality: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioRetentionResult {
    pub days: Option<u32>,
    pub removed_files: usize,
    pub removed_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParakeetStatus {
    pub uv_installed: bool,
    pub cli_installed: bool,
    pub ffmpeg_installed: bool,
    pub model_state: String,
    pub cached_bytes: u64,
    pub model_total_bytes: u64,
    pub download_in_progress: bool,
    pub download_error: Option<String>,
    pub executable_path: Option<String>,
    pub detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapState {
    pub configured: bool,
    pub brain_folders: Vec<String>,
    pub active_brain: Option<String>,
    pub transcription_provider: String,
    pub microphone_permission: String,
    pub speech_permission: String,
    pub transcription_correction_preference: String,
    pub default_agent_mode: String,
    pub allow_general_knowledge_default: bool,
    pub sessions: Vec<CaptureSession>,
    pub runtime: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub note_count: usize,
    pub capture_count: usize,
    pub retained_audio_bytes: u64,
    pub storage_bytes: u64,
    pub review_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardActivity {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub title: String,
    pub updated_at: String,
    pub target: String,
    pub relative_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardOverview {
    pub stats: DashboardStats,
    pub recent_activity: Vec<DashboardActivity>,
    pub review_counts: std::collections::BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub capture_count: usize,
    pub file_count: usize,
    #[serde(default)]
    pub video_count: usize,
    #[serde(default)]
    pub image_count: usize,
    pub retained_audio_bytes: u64,
    #[serde(default)]
    pub retained_image_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub relative_path: String,
    pub updated_at: String,
    pub detail: String,
    pub session_id: Option<String>,
    pub has_audio: bool,
    pub audio_bytes: u64,
    #[serde(default)]
    pub image_id: Option<String>,
    #[serde(default)]
    pub has_image: bool,
    #[serde(default)]
    pub image_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryOverview {
    pub stats: LibraryStats,
    pub items: Vec<LibraryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareImportReport {
    pub imported: usize,
    pub failed: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMemory {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub folder_path: String,
    pub relative_folder: String,
    pub image_path: String,
    pub relative_image_path: String,
    pub image_mime_type: String,
    pub image_bytes: u64,
    #[serde(default)]
    pub analysis_image_path: String,
    #[serde(default)]
    pub analysis_image_mime_type: String,
    pub source_path: String,
    pub relative_source_path: String,
    pub status: String,
    #[serde(default)]
    pub extracted_markdown: String,
    #[serde(default)]
    pub processing_error: Option<String>,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub locality: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMemoryPayload {
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSource {
    pub relative_path: String,
    pub quote: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDocument {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub body: String,
    pub markdown: String,
    pub tags: Vec<String>,
    pub sources: Vec<NoteSource>,
    pub created_at: String,
    pub updated_at: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub relative_path: Option<String>,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRecord {
    pub id: String,
    pub item_type: String,
    pub title: String,
    pub detail: String,
    pub source_relative_path: String,
    pub quote: String,
    pub reason: String,
    pub proposed_action: String,
    pub confidence: Option<u8>,
    pub status: String,
    pub session_id: Option<String>,
    pub review_relative_path: String,
    pub suggested_action: String,
    pub target_relative_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveReviewInput {
    pub id: String,
    pub decision: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDecision {
    pub record: ReviewRecord,
    pub created_note: Option<NoteDocument>,
    pub decision_relative_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSummary {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaggedSource {
    pub id: String,
    pub title: String,
    pub relative_path: String,
    pub source_type: String,
    pub tags: Vec<String>,
    pub updated_at: String,
    pub source_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagsOverview {
    pub tags: Vec<TagSummary>,
    pub sources: Vec<TaggedSource>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDescriptor {
    pub id: &'static str,
    pub label: &'static str,
    pub locality: &'static str,
    pub installed: bool,
    pub available: bool,
    pub detail: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub query: String,
    pub mode: String,
    pub scope: String,
    pub limit: Option<usize>,
    #[serde(default)]
    pub selected_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub passage_id: String,
    pub title: String,
    pub relative_path: String,
    pub source_type: String,
    pub quote: String,
    pub score: f64,
    pub lexical_score: f64,
    pub semantic_score: f64,
    pub match_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStats {
    pub files_indexed: usize,
    pub passages_indexed: usize,
    pub indexed_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocument {
    pub title: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedSource {
    pub title: String,
    pub relative_path: String,
    pub source_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    pub passage_id: String,
    pub number: usize,
    pub title: String,
    pub relative_path: String,
    pub quote: String,
}

/// Canonical conversation record shared by Chat, Interviews, and future modes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub scope: String,
    pub selected_paths: Vec<String>,
    pub provider: String,
    pub model: String,
    pub preview: String,
    pub status: String,
    pub host_id: Option<String>,
    pub host_name: Option<String>,
    pub folder_path: Option<String>,
    pub relative_folder: Option<String>,
}

/// Canonical message record. Mode-specific state is optional instead of living
/// in a second turn table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub citations: Vec<Citation>,
    pub provider: String,
    pub model: String,
    pub general_knowledge_used: bool,
    pub audio_path: Option<String>,
    pub audio_mime_type: Option<String>,
    pub stage: String,
    pub analysis: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitConversationTurnInput {
    pub conversation_id: Option<String>,
    #[serde(default = "default_conversation_kind")]
    pub kind: String,
    pub message: String,
    #[serde(default = "default_conversation_scope")]
    pub scope: String,
    #[serde(default)]
    pub selected_paths: Vec<String>,
    #[serde(default)]
    pub allow_general_knowledge: bool,
    #[serde(default = "default_retrieval_limit")]
    pub retrieval_limit: usize,
    #[serde(default = "default_answer_mode")]
    pub answer_mode: String,
    #[serde(default = "default_agent_mode")]
    pub agent_mode: String,
}

fn default_conversation_kind() -> String { "chat".into() }
fn default_conversation_scope() -> String { "all".into() }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationExchange {
    pub conversation: Conversation,
    pub user_message: ConversationMessage,
    pub assistant_message: ConversationMessage,
    pub agent_proposal: Option<AgentProposal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub scope: String,
    pub selected_paths: Vec<String>,
    pub provider: String,
    pub model: String,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub citations: Vec<Citation>,
    pub provider: String,
    pub model: String,
    pub general_knowledge_used: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendChatInput {
    pub conversation_id: Option<String>,
    pub message: String,
    pub scope: String,
    #[serde(default)]
    pub selected_paths: Vec<String>,
    #[serde(default)]
    pub allow_general_knowledge: bool,
    #[serde(default = "default_retrieval_limit")]
    pub retrieval_limit: usize,
    #[serde(default = "default_answer_mode")]
    pub answer_mode: String,
    #[serde(default = "default_agent_mode")]
    pub agent_mode: String,
}

fn default_retrieval_limit() -> usize {
    12
}
fn default_answer_mode() -> String {
    "standard".into()
}
fn default_agent_mode() -> String {
    "read-only".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProposal {
    pub id: String,
    pub target_relative_path: String,
    pub target_title: String,
    pub instruction: String,
    pub original_body: String,
    pub proposed_body: String,
    pub queued_for_review: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueAgentProposalInput {
    pub proposal: AgentProposal,
    pub conversation_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurn {
    pub conversation: ChatConversation,
    pub user_message: ChatMessage,
    pub assistant_message: ChatMessage,
    pub agent_proposal: Option<AgentProposal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewHost {
    pub id: String,
    pub name: String,
    pub description: String,
    pub traits: Vec<String>,
    pub stages: Vec<String>,
    pub relative_path: String,
    pub instructions: String,
    pub built_in: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInterviewHostInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub traits: Vec<String>,
    #[serde(default)]
    pub stages: Vec<String>,
    pub instructions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewSession {
    pub id: String,
    pub title: String,
    pub host_id: String,
    pub host_name: String,
    pub scope: String,
    pub selected_paths: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub status: String,
    pub folder_path: String,
    pub relative_folder: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartInterviewInput {
    pub host_id: String,
    pub scope: String,
    #[serde(default)]
    pub selected_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewTurn {
    pub id: String,
    pub interview_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub audio_path: Option<String>,
    pub audio_mime_type: Option<String>,
    pub citations: Vec<Citation>,
    pub stage: String,
    pub analysis: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewStart {
    pub interview: InterviewSession,
    pub host_turn: InterviewTurn,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewExchange {
    pub interview: InterviewSession,
    pub user_turn: InterviewTurn,
    pub host_turn: InterviewTurn,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendInterviewTurnInput {
    pub interview_id: String,
    pub message: String,
    #[serde(default = "default_interview_retrieval_limit")]
    pub retrieval_limit: usize,
}

fn default_interview_retrieval_limit() -> usize {
    10
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteInterviewAudioInput {
    pub interview_id: String,
    pub turn_id: String,
    pub transcript: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInterviewAudioInput {
    pub interview_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewAccessEntry {
    pub id: String,
    pub interview_id: String,
    pub turn_id: String,
    pub passage_id: String,
    pub title: String,
    pub relative_path: String,
    pub quote: String,
    pub accessed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub output_type: String,
    pub stages: Vec<String>,
    pub relative_path: String,
    pub instructions: String,
    pub built_in: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveContentSkillInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub output_type: String,
    #[serde(default)]
    pub stages: Vec<String>,
    pub instructions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentProject {
    pub id: String,
    pub title: String,
    pub brief: String,
    pub skill_id: String,
    pub skill_name: String,
    pub output_type: String,
    pub scope: String,
    pub selected_paths: Vec<String>,
    pub status: String,
    pub current_step: usize,
    pub created_at: String,
    pub updated_at: String,
    pub folder_path: String,
    pub relative_folder: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentStep {
    pub id: String,
    pub project_id: String,
    pub ordinal: usize,
    pub name: String,
    pub status: String,
    pub revision: usize,
    pub output_path: Option<String>,
    pub output_markdown: String,
    pub created_at: String,
    pub updated_at: String,
    pub citations: Vec<Citation>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContentProjectInput {
    pub title: String,
    pub brief: String,
    pub skill_id: String,
    pub scope: String,
    #[serde(default)]
    pub selected_paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveContentStepRevisionInput {
    pub project_id: String,
    pub step_id: String,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentProjectDetail {
    pub project: ContentProject,
    pub steps: Vec<ContentStep>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentStepRun {
    pub project: ContentProject,
    pub step: ContentStep,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub service_url: Option<String>,
    pub account_email: Option<String>,
    pub key_salt: Option<String>,
    pub token_expires_at: Option<String>,
    pub enabled: bool,
    pub device_id: String,
    pub last_sync_at: Option<String>,
    pub has_access_token: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSyncCredentialsInput {
    pub service_url: String,
    pub email: String,
    pub key_salt: String,
    pub access_token: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncFileDescriptor {
    pub relative_path: String,
    pub size: u64,
    pub modified_at: String,
    pub content_hash: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteSyncedFileInput {
    pub relative_path: String,
    pub content: Vec<u8>,
    pub expected_local_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncWriteOutcome {
    pub relative_path: String,
    pub disposition: String,
    pub written_path: String,
    pub content_hash: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncManifestEntry {
    pub relative_path: String,
    pub content_hash: String,
    pub remote_revision: u64,
    pub ciphertext_hash: String,
    #[serde(default)]
    pub conflict: bool,
    #[serde(default)]
    pub conflict_path: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncManifest {
    pub brain_id: String,
    pub last_sync_at: Option<String>,
    pub objects: std::collections::HashMap<String, SyncManifestEntry>,
}
