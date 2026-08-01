use crate::domain::{
    AppConfig, CachedGenerationModel, GenerationProviderConfig, ModelPriceTier, ModelPricing,
    ModelSelection, SaveGenerationProviderInput, SaveProviderCredentialInput,
    SetDefaultProviderModelInput, SetFavoriteModelInput, SetPreferredModelInput,
};
use crate::error::{AppError, AppResult};
use crate::provider_costs::{self, ProviderCostRecord};
use crate::storage;
use base64::Engine;
use reqwest::blocking::{Client, RequestBuilder};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::AppHandle;
use wait_timeout::ChildExt;

const KEYCHAIN_SERVICE: &str = "ai.recursivesolutions.secondbrain.provider";
const CAPABILITIES: &[&str] = &[
    "general",
    "chat",
    "interview",
    "studio",
    "vision",
    "embedding",
    "background",
];

#[derive(Clone, Copy, PartialEq, Eq)]
enum Transport {
    BuiltIn,
    OpenAiResponses,
    OpenAiCompatible,
    AnthropicMessages,
    Terminal,
}

#[derive(Clone, Copy)]
struct ProviderSpec {
    id: &'static str,
    label: &'static str,
    transport: Transport,
    locality: &'static str,
    default_base_url: Option<&'static str>,
    executable: Option<&'static str>,
    requires_credential: bool,
    default_enabled: bool,
    model_discovery: &'static str,
    capabilities: &'static [&'static str],
    detail: &'static str,
}

const TEXT: &[&str] = &["text-generation"];
const TEXT_AND_VISION: &[&str] = &["text-generation", "image-understanding"];
const BUILTIN_CHAT: &[&str] = &["text-generation", "citations"];
const BUILTIN_STUDIO: &[&str] = &["structured-scaffolding", "citations"];

const PROVIDERS: &[ProviderSpec] = &[
    ProviderSpec {
        id: "local-retrieval",
        label: "Local Retrieval",
        transport: Transport::BuiltIn,
        locality: "local",
        default_base_url: None,
        executable: None,
        requires_credential: false,
        default_enabled: true,
        model_discovery: "builtin",
        capabilities: BUILTIN_CHAT,
        detail: "Deterministic cited extraction with general knowledge off.",
    },
    ProviderSpec {
        id: "local-interviewer",
        label: "Local Interviewer",
        transport: Transport::BuiltIn,
        locality: "local",
        default_base_url: None,
        executable: None,
        requires_credential: false,
        default_enabled: true,
        model_discovery: "builtin",
        capabilities: BUILTIN_CHAT,
        detail: "Deterministic host stages and scoped retrieval.",
    },
    ProviderSpec {
        id: "local-workflow",
        label: "Local Workflow",
        transport: Transport::BuiltIn,
        locality: "local",
        default_base_url: None,
        executable: None,
        requires_credential: false,
        default_enabled: true,
        model_discovery: "builtin",
        capabilities: BUILTIN_STUDIO,
        detail: "Deterministic, readable workflow scaffolding.",
    },
    ProviderSpec {
        id: "ollama",
        label: "Ollama",
        transport: Transport::OpenAiCompatible,
        locality: "local",
        default_base_url: Some("http://127.0.0.1:11434"),
        executable: Some("ollama"),
        requires_credential: false,
        default_enabled: false,
        model_discovery: "ollama",
        capabilities: TEXT_AND_VISION,
        detail: "User-run local Ollama server and installed models.",
    },
    ProviderSpec {
        id: "lmstudio",
        label: "LM Studio",
        transport: Transport::OpenAiCompatible,
        locality: "local",
        default_base_url: Some("http://127.0.0.1:1234/v1"),
        executable: Some("lms"),
        requires_credential: false,
        default_enabled: false,
        model_discovery: "openai",
        capabilities: TEXT_AND_VISION,
        detail: "User-run LM Studio local server.",
    },
    ProviderSpec {
        id: "llamacpp",
        label: "llama.cpp",
        transport: Transport::OpenAiCompatible,
        locality: "local",
        default_base_url: Some("http://127.0.0.1:8080/v1"),
        executable: Some("llama-server"),
        requires_credential: false,
        default_enabled: false,
        model_discovery: "openai",
        capabilities: TEXT_AND_VISION,
        detail: "User-run llama.cpp HTTP server.",
    },
    ProviderSpec {
        id: "openai",
        label: "OpenAI API",
        transport: Transport::OpenAiResponses,
        locality: "cloud",
        default_base_url: Some("https://api.openai.com/v1"),
        executable: None,
        requires_credential: true,
        default_enabled: false,
        model_discovery: "openai",
        capabilities: TEXT_AND_VISION,
        detail: "Direct OpenAI Responses API using a user-supplied API key.",
    },
    ProviderSpec {
        id: "anthropic",
        label: "Anthropic API",
        transport: Transport::AnthropicMessages,
        locality: "cloud",
        default_base_url: Some("https://api.anthropic.com/v1"),
        executable: None,
        requires_credential: true,
        default_enabled: false,
        model_discovery: "anthropic",
        capabilities: TEXT_AND_VISION,
        detail: "Direct Anthropic Messages API using a user-supplied API key.",
    },
    ProviderSpec {
        id: "gemini",
        label: "Gemini API",
        transport: Transport::OpenAiCompatible,
        locality: "cloud",
        default_base_url: Some("https://generativelanguage.googleapis.com/v1beta/openai"),
        executable: None,
        requires_credential: true,
        default_enabled: false,
        model_discovery: "openai",
        capabilities: TEXT_AND_VISION,
        detail: "Direct Gemini API through its documented OpenAI-compatible endpoint.",
    },
    ProviderSpec {
        id: "openrouter",
        label: "OpenRouter",
        transport: Transport::OpenAiCompatible,
        locality: "cloud",
        default_base_url: Some("https://openrouter.ai/api/v1"),
        executable: None,
        requires_credential: true,
        default_enabled: false,
        model_discovery: "openai",
        capabilities: TEXT_AND_VISION,
        detail: "OpenAI-compatible multi-provider gateway using a user-supplied key.",
    },
    ProviderSpec {
        id: "vercel",
        label: "Vercel AI Gateway",
        transport: Transport::OpenAiCompatible,
        locality: "cloud",
        default_base_url: Some("https://ai-gateway.vercel.sh/v1"),
        executable: None,
        requires_credential: true,
        default_enabled: false,
        model_discovery: "vercel",
        capabilities: TEXT_AND_VISION,
        detail: "Vercel AI Gateway using creator/model identifiers.",
    },
    ProviderSpec {
        id: "codex-cli",
        label: "Codex CLI",
        transport: Transport::Terminal,
        locality: "local",
        default_base_url: None,
        executable: Some("codex"),
        requires_credential: false,
        default_enabled: false,
        model_discovery: "terminal",
        capabilities: TEXT_AND_VISION,
        detail: "Experimental text and image adapter using the existing Codex CLI login.",
    },
    ProviderSpec {
        id: "claude-cli",
        label: "Claude Code CLI",
        transport: Transport::Terminal,
        locality: "local",
        default_base_url: None,
        executable: Some("claude"),
        requires_credential: false,
        default_enabled: false,
        model_discovery: "terminal",
        capabilities: TEXT,
        detail: "Experimental text-only adapter using the existing Claude Code login.",
    },
    ProviderSpec {
        id: "gemini-cli",
        label: "Gemini CLI",
        transport: Transport::Terminal,
        locality: "local",
        default_base_url: None,
        executable: Some("gemini"),
        requires_credential: false,
        default_enabled: false,
        model_discovery: "terminal",
        capabilities: TEXT,
        detail: "Experimental text-only adapter using the existing Gemini CLI login.",
    },
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationModel {
    pub id: String,
    pub label: String,
    pub provider_id: String,
    pub capabilities: Vec<String>,
    pub context_window: Option<u64>,
    pub pricing: Option<ModelPricing>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationProviderState {
    pub id: String,
    pub label: String,
    pub template_label: String,
    pub saved: bool,
    pub transport: String,
    pub locality: String,
    pub enabled: bool,
    pub configured: bool,
    pub credential_configured: bool,
    pub cloud_confirmed: bool,
    pub installed: bool,
    pub reachable: bool,
    pub authenticated: bool,
    pub tested: bool,
    pub status: String,
    pub detail: String,
    pub base_url: Option<String>,
    pub executable_path: Option<String>,
    pub default_model_id: Option<String>,
    pub capabilities: Vec<String>,
    pub models: Vec<GenerationModel>,
    pub last_tested_at: Option<String>,
    pub last_test_status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCatalog {
    pub providers: Vec<GenerationProviderState>,
    pub preferred_models: BTreeMap<String, ModelSelection>,
    pub favorite_models: Vec<ModelSelection>,
    pub refreshed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationOutput {
    pub text: String,
    pub provider_id: String,
    pub model_id: String,
    pub locality: String,
}

#[derive(Debug, Clone, Default)]
struct UsageMetrics {
    provider_request_id: Option<String>,
    upstream_provider: Option<String>,
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
    cached_input_tokens: u64,
    reasoning_tokens: u64,
    reported_cost_micros: Option<i64>,
}

#[derive(Debug, Clone)]
struct HttpGeneration {
    text: Option<String>,
    usage: UsageMetrics,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDiagnostic {
    pub provider_id: String,
    pub model_id: String,
    pub status: String,
    pub message: String,
    pub output_preview: String,
    pub tested_at: String,
}

fn transport_name(transport: Transport) -> &'static str {
    match transport {
        Transport::BuiltIn => "builtin",
        Transport::OpenAiResponses => "openai-responses",
        Transport::OpenAiCompatible => "openai-compatible",
        Transport::AnthropicMessages => "anthropic-messages",
        Transport::Terminal => "terminal-cli",
    }
}

fn spec(provider_id: &str) -> AppResult<&'static ProviderSpec> {
    PROVIDERS
        .iter()
        .find(|provider| provider.id == provider_id)
        .ok_or_else(|| AppError::MissingGenerationProvider(provider_id.to_string()))
}

fn stored_config<'a>(
    config: &'a AppConfig,
    provider_id: &str,
) -> Option<&'a GenerationProviderConfig> {
    config
        .generation_providers
        .iter()
        .find(|item| item.provider_id == provider_id)
}

fn effective_config(config: &AppConfig, provider: &ProviderSpec) -> GenerationProviderConfig {
    stored_config(config, provider.id)
        .cloned()
        .unwrap_or_else(|| GenerationProviderConfig {
            provider_id: provider.id.to_string(),
            display_name: None,
            enabled: provider.default_enabled,
            base_url: provider.default_base_url.map(str::to_string),
            executable_path: None,
            default_model_id: None,
            cloud_confirmed: false,
            last_tested_at: None,
            last_test_status: None,
            cached_models: Vec::new(),
            last_discovered_at: None,
        })
}

fn default_preferences() -> BTreeMap<String, ModelSelection> {
    BTreeMap::from([
        (
            "chat".into(),
            ModelSelection {
                provider_id: "local-retrieval".into(),
                model_id: "extractive-v1".into(),
            },
        ),
        (
            "interview".into(),
            ModelSelection {
                provider_id: "local-interviewer".into(),
                model_id: "guided-v1".into(),
            },
        ),
        (
            "studio".into(),
            ModelSelection {
                provider_id: "local-workflow".into(),
                model_id: "structured-v1".into(),
            },
        ),
    ])
}

pub fn resolved_preferences(config: &AppConfig) -> BTreeMap<String, ModelSelection> {
    let mut preferences = default_preferences();
    preferences.extend(config.preferred_models.clone());
    preferences
}

pub fn preferred_model(app: &AppHandle, capability: &str) -> AppResult<ModelSelection> {
    resolved_preferences(&storage::read_config(app)?)
        .get(capability)
        .cloned()
        .ok_or_else(|| {
            AppError::InvalidGenerationProvider(format!(
                "no preferred model is configured for {capability}"
            ))
        })
}

pub fn is_builtin(provider_id: &str) -> AppResult<bool> {
    Ok(spec(provider_id)?.transport == Transport::BuiltIn)
}

#[cfg(target_os = "macos")]
fn store_credential(provider_id: &str, secret: &str) -> AppResult<()> {
    let status = Command::new("security")
        .args([
            "add-generic-password",
            "-a",
            provider_id,
            "-s",
            KEYCHAIN_SERVICE,
            "-w",
            secret,
            "-U",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::InvalidGenerationProvider(
            "macOS Keychain refused the provider credential".into(),
        ))
    }
}

#[cfg(not(target_os = "macos"))]
fn store_credential(_provider_id: &str, _secret: &str) -> AppResult<()> {
    Err(AppError::InvalidGenerationProvider(
        "secure provider credentials are not configured on this platform".into(),
    ))
}

#[cfg(target_os = "macos")]
fn credential_exists(provider_id: &str) -> bool {
    Command::new("security")
        .args([
            "find-generic-password",
            "-a",
            provider_id,
            "-s",
            KEYCHAIN_SERVICE,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

#[cfg(not(target_os = "macos"))]
fn credential_exists(_provider_id: &str) -> bool {
    false
}

#[cfg(target_os = "macos")]
pub(crate) fn read_credential(provider_id: &str) -> AppResult<String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-a",
            provider_id,
            "-s",
            KEYCHAIN_SERVICE,
            "-w",
        ])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()?;
    if !output.status.success() {
        return Err(AppError::MissingProviderCredential(provider_id.to_string()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn read_credential(provider_id: &str) -> AppResult<String> {
    Err(AppError::MissingProviderCredential(provider_id.to_string()))
}

#[cfg(target_os = "macos")]
fn delete_credential(provider_id: &str) {
    let _ = Command::new("security")
        .args([
            "delete-generic-password",
            "-a",
            provider_id,
            "-s",
            KEYCHAIN_SERVICE,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(target_os = "macos"))]
fn delete_credential(_provider_id: &str) {}

fn executable_candidates(name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(output) = Command::new("/usr/bin/which").arg(name).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                candidates.push(PathBuf::from(path));
            }
        }
    }
    candidates.extend([
        PathBuf::from(format!("/opt/homebrew/bin/{name}")),
        PathBuf::from(format!("/usr/local/bin/{name}")),
    ]);
    candidates
}

fn locate_executable(provider: &ProviderSpec, configured_path: Option<&str>) -> Option<String> {
    if let Some(path) = configured_path {
        if Path::new(path).is_file() {
            return Some(path.to_string());
        }
    }
    provider.executable.and_then(|name| {
        executable_candidates(name)
            .into_iter()
            .find(|candidate| candidate.is_file())
            .map(|path| path.to_string_lossy().to_string())
    })
}

fn client() -> AppResult<Client> {
    Client::builder()
        .connect_timeout(Duration::from_millis(900))
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|error| AppError::GenerationProvider(error.to_string()))
}

fn generation_client() -> AppResult<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| AppError::GenerationProvider(error.to_string()))
}

fn authenticated_request(
    request: RequestBuilder,
    provider: &ProviderSpec,
    credential: Option<&str>,
) -> RequestBuilder {
    match provider.transport {
        Transport::AnthropicMessages => match credential {
            Some(key) => request
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01"),
            None => request,
        },
        _ => match credential {
            Some(key) => request.bearer_auth(key),
            None => request,
        },
    }
}

fn common_models(provider: &ProviderSpec, value: &Value) -> Vec<GenerationModel> {
    value
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?.to_string();
            let label = item
                .get("name")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| id.clone());
            let context_window = item
                .get("context_window")
                .or_else(|| item.get("context_length"))
                .and_then(Value::as_u64);
            let pricing = extract_model_pricing(item);
            Some(GenerationModel {
                id,
                label,
                provider_id: provider.id.into(),
                capabilities: provider
                    .capabilities
                    .iter()
                    .map(|item| item.to_string())
                    .collect(),
                context_window,
                pricing,
                source: "discovered".into(),
            })
        })
        .collect()
}

fn price_string(value: Option<&Value>) -> Option<String> {
    value.and_then(|item| match item {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    })
}

fn price_tiers(value: Option<&Value>) -> Vec<ModelPriceTier> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tier| {
            Some(ModelPriceTier {
                cost_per_token: price_string(tier.get("cost"))?,
                min_tokens: tier.get("min").and_then(Value::as_u64).unwrap_or(0),
                max_tokens: tier.get("max").and_then(Value::as_u64),
            })
        })
        .collect()
}

fn extract_model_pricing(model: &Value) -> Option<ModelPricing> {
    let pricing = model.get("pricing")?;
    let result = ModelPricing {
        input_per_token: price_string(pricing.get("input").or_else(|| pricing.get("prompt"))),
        output_per_token: price_string(pricing.get("output").or_else(|| pricing.get("completion"))),
        cached_input_per_token: price_string(
            pricing
                .get("input_cache_read")
                .or_else(|| pricing.get("cached_input")),
        ),
        input_tiers: price_tiers(
            pricing
                .get("input_tiers")
                .or_else(|| pricing.get("prompt_tiers")),
        ),
        output_tiers: price_tiers(
            pricing
                .get("output_tiers")
                .or_else(|| pricing.get("completion_tiers")),
        ),
    };
    (result.input_per_token.is_some()
        || result.output_per_token.is_some()
        || !result.input_tiers.is_empty()
        || !result.output_tiers.is_empty())
    .then_some(result)
}

fn discover_models(
    provider: &ProviderSpec,
    config: &GenerationProviderConfig,
    credential: Option<&str>,
) -> AppResult<Vec<GenerationModel>> {
    if provider.transport == Transport::BuiltIn {
        let model_id = match provider.id {
            "local-retrieval" => "extractive-v1",
            "local-interviewer" => "guided-v1",
            _ => "structured-v1",
        };
        return Ok(vec![GenerationModel {
            id: model_id.into(),
            label: model_id.into(),
            provider_id: provider.id.into(),
            capabilities: provider
                .capabilities
                .iter()
                .map(|item| item.to_string())
                .collect(),
            context_window: None,
            pricing: None,
            source: "builtin".into(),
        }]);
    }
    if provider.transport == Transport::Terminal {
        return Ok(vec![GenerationModel {
            id: "default".into(),
            label: "CLI default".into(),
            provider_id: provider.id.into(),
            capabilities: vec!["text-generation".into()],
            context_window: None,
            pricing: None,
            source: "terminal".into(),
        }]);
    }
    let base_url = config
        .base_url
        .as_deref()
        .or(provider.default_base_url)
        .ok_or_else(|| {
            AppError::InvalidGenerationProvider(format!("{} has no base URL", provider.label))
        })?
        .trim_end_matches('/');
    let url = if provider.model_discovery == "ollama" {
        format!("{}/api/tags", base_url.trim_end_matches("/v1"))
    } else {
        format!("{base_url}/models")
    };
    let response = authenticated_request(client()?.get(url), provider, credential)
        .send()
        .map_err(|error| {
            AppError::GenerationProvider(format!("{} discovery failed: {error}", provider.label))
        })?;
    let status = response.status();
    let value: Value = response.json().map_err(|error| {
        AppError::GenerationProvider(format!(
            "{} returned invalid model data: {error}",
            provider.label
        ))
    })?;
    if !status.is_success() {
        let message = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .or_else(|| value.get("error").and_then(Value::as_str))
            .unwrap_or("the provider rejected model discovery");
        return Err(AppError::GenerationProvider(format!(
            "{} returned {}: {message}",
            provider.label,
            status.as_u16()
        )));
    }
    if provider.model_discovery == "ollama" {
        return Ok(value
            .get("models")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|item| {
                let id = item
                    .get("model")
                    .or_else(|| item.get("name"))?
                    .as_str()?
                    .to_string();
                let detail = item
                    .pointer("/details/parameter_size")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let label = if detail.is_empty() {
                    id.clone()
                } else {
                    format!("{id} · {detail}")
                };
                Some(GenerationModel {
                    id,
                    label,
                    provider_id: provider.id.into(),
                    capabilities: vec!["text-generation".into()],
                    context_window: None,
                    pricing: None,
                    source: "discovered".into(),
                })
            })
            .collect());
    }
    Ok(common_models(provider, &value))
}

fn validate_base_url(provider: &ProviderSpec, base_url: Option<&str>) -> AppResult<Option<String>> {
    let Some(value) = base_url.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(provider.default_base_url.map(str::to_string));
    };
    let parsed = reqwest::Url::parse(value).map_err(|_| {
        AppError::InvalidGenerationProvider("enter an absolute provider URL".into())
    })?;
    let host = parsed.host_str().unwrap_or_default();
    let loopback = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if provider.locality == "cloud" && parsed.scheme() != "https" {
        return Err(AppError::InvalidGenerationProvider(
            "cloud provider URLs must use HTTPS".into(),
        ));
    }
    if provider.locality == "local" && parsed.scheme() == "http" && !loopback {
        return Err(AppError::InvalidGenerationProvider("unencrypted local-provider URLs are limited to this Mac; use HTTPS for LAN or remote servers".into()));
    }
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::InvalidGenerationProvider(
            "provider URLs must use HTTP or HTTPS".into(),
        ));
    }
    Ok(Some(value.trim_end_matches('/').to_string()))
}

fn validate_executable_path(
    provider: &ProviderSpec,
    executable_path: Option<&str>,
) -> AppResult<Option<String>> {
    if provider.transport != Transport::Terminal {
        return Ok(None);
    }
    let path = executable_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if path
        .as_deref()
        .is_some_and(|value| !Path::new(value).is_file())
    {
        return Err(AppError::InvalidGenerationProvider(
            "the selected executable path is not a readable file".into(),
        ));
    }
    Ok(path)
}

fn response_error(provider: &ProviderSpec, status: u16, value: &Value) -> AppError {
    let message = value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| value.get("error").and_then(Value::as_str))
        .or_else(|| value.get("message").and_then(Value::as_str))
        .unwrap_or("the provider rejected the request");
    AppError::GenerationProvider(format!(
        "{} returned HTTP {status}: {message}",
        provider.label
    ))
}

fn extract_chat_text(value: &Value) -> Option<String> {
    let content = value.pointer("/choices/0/message/content")?;
    if let Some(text) = content.as_str() {
        return Some(text.trim().to_string());
    }
    content.as_array().map(|parts| {
        parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(Value::as_str)
                    .or_else(|| part.pointer("/text/value").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join("")
            .trim()
            .to_string()
    })
}

fn extract_responses_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        return Some(text.trim().to_string());
    }
    let text = value
        .get("output")?
        .as_array()?
        .iter()
        .filter_map(|item| item.get("content").and_then(Value::as_array))
        .flatten()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("");
    (!text.trim().is_empty()).then(|| text.trim().to_string())
}

fn extract_anthropic_text(value: &Value) -> Option<String> {
    let text = value
        .get("content")?
        .as_array()?
        .iter()
        .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("");
    (!text.trim().is_empty()).then(|| text.trim().to_string())
}

fn text_request(
    provider: &ProviderSpec,
    base_url: &str,
    model_id: &str,
    system: &str,
    prompt: &str,
) -> AppResult<(String, Value)> {
    match provider.transport {
        Transport::OpenAiResponses => Ok((
            format!("{base_url}/responses"),
            json!({
                "model": model_id,
                "instructions": system,
                "input": prompt,
                "store": false
            }),
        )),
        Transport::OpenAiCompatible => Ok((
            openai_compatible_chat_endpoint(provider, base_url),
            json!({
                "model": model_id,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                "stream": false
            }),
        )),
        Transport::AnthropicMessages => Ok((
            format!("{base_url}/messages"),
            json!({
                "model": model_id,
                "max_tokens": 2048,
                "system": system,
                "messages": [{"role": "user", "content": prompt}]
            }),
        )),
        _ => Err(AppError::InvalidGenerationProvider(
            "this provider does not use an HTTP generation transport".into(),
        )),
    }
}

fn openai_compatible_chat_endpoint(provider: &ProviderSpec, base_url: &str) -> String {
    if provider.id == "ollama" && !base_url.ends_with("/v1") {
        format!("{base_url}/v1/chat/completions")
    } else {
        format!("{base_url}/chat/completions")
    }
}

fn numeric_value(value: Option<&Value>) -> Option<f64> {
    value.and_then(|item| match item {
        Value::Number(value) => value.as_f64(),
        Value::String(value) => value.parse().ok(),
        _ => None,
    })
}

fn token_value(value: Option<&Value>) -> u64 {
    numeric_value(value)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value.round() as u64)
        .unwrap_or(0)
}

fn usage_metrics(value: &Value) -> UsageMetrics {
    let usage = value.get("usage").unwrap_or(&Value::Null);
    let input_tokens = token_value(
        usage
            .get("prompt_tokens")
            .or_else(|| usage.get("input_tokens")),
    );
    let output_tokens = token_value(
        usage
            .get("completion_tokens")
            .or_else(|| usage.get("output_tokens")),
    );
    let total_tokens =
        token_value(usage.get("total_tokens")).max(input_tokens.saturating_add(output_tokens));
    let cached_input_tokens = token_value(
        usage
            .pointer("/prompt_tokens_details/cached_tokens")
            .or_else(|| usage.pointer("/input_tokens_details/cached_tokens"))
            .or_else(|| usage.get("cache_read_input_tokens")),
    );
    let reasoning_tokens = token_value(
        usage
            .pointer("/completion_tokens_details/reasoning_tokens")
            .or_else(|| usage.pointer("/output_tokens_details/reasoning_tokens"))
            .or_else(|| usage.get("reasoning_tokens")),
    );
    let reported_cost_micros = numeric_value(usage.get("cost"))
        .filter(|cost| cost.is_finite() && *cost >= 0.0)
        .map(|cost| (cost * 1_000_000.0).round() as i64);
    UsageMetrics {
        provider_request_id: value.get("id").and_then(Value::as_str).map(str::to_string),
        upstream_provider: value
            .get("provider")
            .and_then(Value::as_str)
            .map(str::to_string),
        input_tokens,
        output_tokens,
        total_tokens,
        cached_input_tokens,
        reasoning_tokens,
        reported_cost_micros,
    }
}

fn price_for_tokens(base: Option<&str>, tiers: &[ModelPriceTier], token_count: u64) -> Option<f64> {
    tiers
        .iter()
        .find(|tier| {
            token_count >= tier.min_tokens
                && tier
                    .max_tokens
                    .map(|maximum| token_count < maximum)
                    .unwrap_or(true)
        })
        .and_then(|tier| tier.cost_per_token.parse::<f64>().ok())
        .or_else(|| base.and_then(|value| value.parse::<f64>().ok()))
        .filter(|value| value.is_finite() && *value >= 0.0)
}

fn estimate_cost_micros(usage: &UsageMetrics, pricing: Option<&ModelPricing>) -> Option<i64> {
    let pricing = pricing?;
    if usage.input_tokens == 0 && usage.output_tokens == 0 {
        return None;
    }
    let input_rate = price_for_tokens(
        pricing.input_per_token.as_deref(),
        &pricing.input_tiers,
        usage.input_tokens,
    );
    let output_rate = price_for_tokens(
        pricing.output_per_token.as_deref(),
        &pricing.output_tiers,
        usage.input_tokens,
    );
    if (usage.input_tokens > 0 && input_rate.is_none())
        || (usage.output_tokens > 0 && output_rate.is_none())
    {
        return None;
    }
    let cached_tokens = usage.cached_input_tokens.min(usage.input_tokens);
    let regular_input_tokens = usage.input_tokens.saturating_sub(cached_tokens);
    let cached_rate = pricing
        .cached_input_per_token
        .as_deref()
        .and_then(|value| value.parse::<f64>().ok())
        .or(input_rate);
    let cost = regular_input_tokens as f64 * input_rate.unwrap_or(0.0)
        + cached_tokens as f64 * cached_rate.unwrap_or(0.0)
        + usage.output_tokens as f64 * output_rate.unwrap_or(0.0);
    Some((cost * 1_000_000.0).round() as i64)
}

fn generate_http(
    provider: &ProviderSpec,
    config: &GenerationProviderConfig,
    model_id: &str,
    system: &str,
    prompt: &str,
    credential: Option<&str>,
) -> AppResult<HttpGeneration> {
    let base_url = config
        .base_url
        .as_deref()
        .or(provider.default_base_url)
        .ok_or_else(|| {
            AppError::InvalidGenerationProvider(format!("{} has no base URL", provider.label))
        })?
        .trim_end_matches('/');
    let (endpoint, body) = text_request(provider, base_url, model_id, system, prompt)?;
    let response = authenticated_request(
        generation_client()?.post(endpoint).json(&body),
        provider,
        credential,
    )
    .send()
    .map_err(|error| {
        AppError::GenerationProvider(format!("{} request failed: {error}", provider.label))
    })?;
    let status = response.status().as_u16();
    let value: Value = response.json().map_err(|error| {
        AppError::GenerationProvider(format!("{} returned invalid JSON: {error}", provider.label))
    })?;
    if !(200..300).contains(&status) {
        return Err(response_error(provider, status, &value));
    }
    let text = match provider.transport {
        Transport::OpenAiResponses => extract_responses_text(&value),
        Transport::OpenAiCompatible => extract_chat_text(&value),
        Transport::AnthropicMessages => extract_anthropic_text(&value),
        _ => None,
    };
    Ok(HttpGeneration {
        text: text.filter(|value| !value.trim().is_empty()),
        usage: usage_metrics(&value),
    })
}

fn generate_image_http(
    provider: &ProviderSpec,
    config: &GenerationProviderConfig,
    model_id: &str,
    system: &str,
    prompt: &str,
    image_mime_type: &str,
    image_bytes: &[u8],
    credential: Option<&str>,
) -> AppResult<HttpGeneration> {
    let base_url = config
        .base_url
        .as_deref()
        .or(provider.default_base_url)
        .ok_or_else(|| {
            AppError::InvalidGenerationProvider(format!("{} has no base URL", provider.label))
        })?
        .trim_end_matches('/');
    let encoded = base64::engine::general_purpose::STANDARD.encode(image_bytes);
    let data_url = format!("data:{image_mime_type};base64,{encoded}");
    let (endpoint, body) = match provider.transport {
        Transport::OpenAiResponses => (
            format!("{base_url}/responses"),
            json!({
                "model": model_id,
                "instructions": system,
                "input": [{
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_url": data_url}
                    ]
                }],
                "max_output_tokens": 4096,
                "store": false
            }),
        ),
        Transport::OpenAiCompatible => (
            openai_compatible_chat_endpoint(provider, base_url),
            json!({
                "model": model_id,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}}
                    ]}
                ],
                "stream": false
            }),
        ),
        Transport::AnthropicMessages => (
            format!("{base_url}/messages"),
            json!({
                "model": model_id,
                "max_tokens": 4096,
                "system": system,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {
                            "type": "base64",
                            "media_type": image_mime_type,
                            "data": encoded
                        }},
                        {"type": "text", "text": prompt}
                    ]
                }]
            }),
        ),
        _ => {
            return Err(AppError::InvalidGenerationProvider(
                "this provider cannot receive image input".into(),
            ))
        }
    };
    let response = authenticated_request(
        generation_client()?.post(endpoint).json(&body),
        provider,
        credential,
    )
    .send()
    .map_err(|error| {
        AppError::GenerationProvider(format!("{} image request failed: {error}", provider.label))
    })?;
    let status = response.status().as_u16();
    let value: Value = response.json().map_err(|error| {
        AppError::GenerationProvider(format!("{} returned invalid JSON: {error}", provider.label))
    })?;
    if !(200..300).contains(&status) {
        return Err(response_error(provider, status, &value));
    }
    let text = match provider.transport {
        Transport::OpenAiResponses => extract_responses_text(&value),
        Transport::OpenAiCompatible => extract_chat_text(&value),
        Transport::AnthropicMessages => extract_anthropic_text(&value),
        _ => None,
    };
    Ok(HttpGeneration {
        text: text.filter(|value| !value.trim().is_empty()),
        usage: usage_metrics(&value),
    })
}

fn terminal_args(
    provider: &ProviderSpec,
    model_id: &str,
    image_path: Option<&Path>,
) -> AppResult<Vec<String>> {
    let model_is_default = model_id == "default" || model_id.trim().is_empty();
    let mut args = match provider.id {
        "codex-cli" => vec![
            "exec".into(),
            "--ignore-user-config".into(),
            "--ignore-rules".into(),
            "--ephemeral".into(),
            "--skip-git-repo-check".into(),
            "--sandbox".into(),
            "read-only".into(),
            "--color".into(),
            "never".into(),
        ],
        "claude-cli" => vec![
            "-p".into(),
            "--output-format".into(),
            "json".into(),
            "--permission-mode".into(),
            "plan".into(),
            "--max-turns".into(),
            "1".into(),
        ],
        "gemini-cli" => vec![
            "--output-format".into(),
            "json".into(),
            "--approval-mode".into(),
            "plan".into(),
            "--sandbox".into(),
        ],
        _ => {
            return Err(AppError::InvalidGenerationProvider(
                "unsupported terminal provider".into(),
            ))
        }
    };
    if !model_is_default {
        args.extend(["--model".into(), model_id.into()]);
    }
    if provider.id == "codex-cli" {
        if let Some(path) = image_path {
            args.extend(["--image".into(), path.to_string_lossy().into_owned()]);
        }
        args.push("-".into());
    } else if image_path.is_some() {
        return Err(AppError::InvalidGenerationProvider(format!(
            "{} does not support image attachments through its terminal adapter",
            provider.label
        )));
    }
    Ok(args)
}

fn extract_terminal_text(provider: &ProviderSpec, stdout: &str) -> AppResult<String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err(AppError::GenerationProvider(format!(
            "{} returned no output",
            provider.label
        )));
    }
    if provider.id == "codex-cli" {
        return Ok(trimmed.to_string());
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        for pointer in ["/result", "/response", "/text", "/output"] {
            if let Some(text) = value.pointer(pointer).and_then(Value::as_str) {
                if !text.trim().is_empty() {
                    return Ok(text.trim().to_string());
                }
            }
        }
    }
    Ok(trimmed.to_string())
}

fn generate_terminal(
    provider: &ProviderSpec,
    config: &GenerationProviderConfig,
    model_id: &str,
    system: &str,
    prompt: &str,
    image: Option<(&str, &[u8])>,
) -> AppResult<String> {
    let executable =
        locate_executable(provider, config.executable_path.as_deref()).ok_or_else(|| {
            AppError::GenerationProvider(format!("{} executable was not found", provider.label))
        })?;
    let temporary =
        std::env::temp_dir().join(format!("second-brain-provider-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&temporary)?;
    let stdout_path = temporary.join("stdout.txt");
    let stderr_path = temporary.join("stderr.txt");
    let image_path = image
        .map(|(mime_type, bytes)| {
            let extension = match mime_type {
                "image/jpeg" => "jpg",
                "image/png" => "png",
                "image/webp" => "webp",
                "image/gif" => "gif",
                _ => "bin",
            };
            let path = temporary.join(format!("image-input.{extension}"));
            fs::write(&path, bytes)?;
            Ok::<PathBuf, AppError>(path)
        })
        .transpose()?;
    let stdout_file = fs::File::create(&stdout_path)?;
    let stderr_file = fs::File::create(&stderr_path)?;
    let mut child = Command::new(executable)
        .args(terminal_args(provider, model_id, image_path.as_deref())?)
        .current_dir(&temporary)
        .env("NO_COLOR", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .map_err(|error| {
            AppError::GenerationProvider(format!("{} could not start: {error}", provider.label))
        })?;
    let combined = format!("SYSTEM INSTRUCTIONS:\n{system}\n\nUSER REQUEST:\n{prompt}");
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(combined.as_bytes())?;
    }
    let status = match child.wait_timeout(Duration::from_secs(120))? {
        Some(status) => status,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            let _ = fs::remove_dir_all(&temporary);
            return Err(AppError::GenerationProvider(format!(
                "{} timed out after 120 seconds",
                provider.label
            )));
        }
    };
    let stdout = fs::read_to_string(&stdout_path).unwrap_or_default();
    let stderr = fs::read_to_string(&stderr_path).unwrap_or_default();
    let _ = fs::remove_dir_all(&temporary);
    if !status.success() {
        let detail = stderr.lines().take(8).collect::<Vec<_>>().join(" ");
        return Err(AppError::GenerationProvider(format!(
            "{} exited with status {}: {}",
            provider.label,
            status.code().unwrap_or(-1),
            if detail.is_empty() {
                "no diagnostic output"
            } else {
                &detail
            }
        )));
    }
    extract_terminal_text(provider, &stdout)
}

fn record_usage(
    app: &AppHandle,
    provider: &ProviderSpec,
    config: &GenerationProviderConfig,
    model_id: &str,
    operation: &str,
    usage: &UsageMetrics,
) {
    if provider.locality != "cloud" {
        return;
    }
    let pricing = config
        .cached_models
        .iter()
        .find(|model| model.id == model_id)
        .and_then(|model| model.pricing.as_ref());
    let (cost_micros, cost_source) = if let Some(cost) = usage.reported_cost_micros {
        (Some(cost), "provider-reported")
    } else if let Some(cost) = estimate_cost_micros(usage, pricing) {
        (Some(cost), "catalog-estimate")
    } else {
        (None, "unpriced")
    };
    let record = ProviderCostRecord {
        provider_request_id: usage.provider_request_id.clone(),
        provider_id: provider.id.into(),
        model_id: model_id.into(),
        upstream_provider: usage.upstream_provider.clone(),
        operation: operation.into(),
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
        cached_input_tokens: usage.cached_input_tokens,
        reasoning_tokens: usage.reasoning_tokens,
        cost_micros,
        cost_source: cost_source.into(),
    };
    if let Err(error) = provider_costs::record(app, &record) {
        eprintln!(
            "provider request {} succeeded but cost tracking failed: {error}",
            usage.provider_request_id.as_deref().unwrap_or("without-id")
        );
    }
}

pub fn generate(
    app: &AppHandle,
    selection: &ModelSelection,
    system: &str,
    prompt: &str,
    operation: &str,
) -> AppResult<GenerationOutput> {
    let provider = spec(&selection.provider_id)?;
    if provider.transport == Transport::BuiltIn {
        return Err(AppError::InvalidGenerationProvider(
            "built-in deterministic output is generated by its workflow, not the model adapter"
                .into(),
        ));
    }
    let config = storage::read_config(app)?;
    let effective = effective_config(&config, provider);
    if !effective.enabled {
        return Err(AppError::InvalidGenerationProvider(format!(
            "{} is disabled",
            provider.label
        )));
    }
    if provider.locality == "cloud" && !effective.cloud_confirmed {
        return Err(AppError::InvalidGenerationProvider(
            "cloud data-boundary consent is required".into(),
        ));
    }
    let credential = if provider.requires_credential || credential_exists(provider.id) {
        Some(read_credential(provider.id)?)
    } else {
        None
    };
    let text = match provider.transport {
        Transport::Terminal => generate_terminal(
            provider,
            &effective,
            &selection.model_id,
            system,
            prompt,
            None,
        )?,
        _ => {
            let output = generate_http(
                provider,
                &effective,
                &selection.model_id,
                system,
                prompt,
                credential.as_deref(),
            )?;
            record_usage(
                app,
                provider,
                &effective,
                &selection.model_id,
                operation,
                &output.usage,
            );
            output.text.ok_or_else(|| {
                AppError::GenerationProvider(format!(
                    "{} returned no assistant text",
                    provider.label
                ))
            })?
        }
    };
    Ok(GenerationOutput {
        text,
        provider_id: provider.id.into(),
        model_id: selection.model_id.clone(),
        locality: provider.locality.into(),
    })
}

pub fn generate_with_image(
    app: &AppHandle,
    selection: &ModelSelection,
    system: &str,
    prompt: &str,
    image_mime_type: &str,
    image_bytes: &[u8],
    operation: &str,
) -> AppResult<GenerationOutput> {
    let provider = spec(&selection.provider_id)?;
    if !provider.capabilities.contains(&"image-understanding") {
        return Err(AppError::InvalidGenerationProvider(format!(
            "{} is a text-only provider and cannot review images",
            provider.label
        )));
    }
    if !matches!(
        image_mime_type,
        "image/jpeg" | "image/png" | "image/webp" | "image/gif"
    ) {
        return Err(AppError::InvalidSource(format!(
            "the normalized image type {image_mime_type} is not supported for AI review"
        )));
    }
    let config = storage::read_config(app)?;
    let effective = effective_config(&config, provider);
    if !effective.enabled {
        return Err(AppError::InvalidGenerationProvider(format!(
            "{} is disabled",
            provider.label
        )));
    }
    if provider.locality == "cloud" && !effective.cloud_confirmed {
        return Err(AppError::InvalidGenerationProvider(
            "cloud data-boundary consent is required".into(),
        ));
    }
    let credential = if provider.requires_credential || credential_exists(provider.id) {
        Some(read_credential(provider.id)?)
    } else {
        None
    };
    let text = match provider.transport {
        Transport::Terminal => generate_terminal(
            provider,
            &effective,
            &selection.model_id,
            system,
            prompt,
            Some((image_mime_type, image_bytes)),
        )?,
        _ => {
            let output = generate_image_http(
                provider,
                &effective,
                &selection.model_id,
                system,
                prompt,
                image_mime_type,
                image_bytes,
                credential.as_deref(),
            )?;
            record_usage(
                app,
                provider,
                &effective,
                &selection.model_id,
                operation,
                &output.usage,
            );
            output.text.ok_or_else(|| {
                AppError::GenerationProvider(format!(
                    "{} returned no image analysis",
                    provider.label
                ))
            })?
        }
    };
    Ok(GenerationOutput {
        text,
        provider_id: provider.id.into(),
        model_id: selection.model_id.clone(),
        locality: provider.locality.into(),
    })
}

fn record_diagnostic(
    app: &AppHandle,
    provider_id: &str,
    status: &str,
    tested_at: &str,
) -> AppResult<()> {
    let provider = spec(provider_id)?;
    let mut config = storage::read_config(app)?;
    let mut effective = effective_config(&config, provider);
    effective.last_tested_at = Some(tested_at.into());
    effective.last_test_status = Some(status.into());
    config
        .generation_providers
        .retain(|item| item.provider_id != provider_id);
    config.generation_providers.push(effective);
    storage::write_config(app, &config)
}

pub fn test_provider(
    app: &AppHandle,
    provider_id: &str,
    model_id: &str,
) -> AppResult<ProviderDiagnostic> {
    let tested_at = chrono::Utc::now().to_rfc3339();
    let selection = ModelSelection {
        provider_id: provider_id.into(),
        model_id: model_id.into(),
    };
    let result = generate(
        app,
        &selection,
        "Return a short plain-text diagnostic response. Do not use tools or access files.",
        "Reply with exactly: Burrowise provider test passed",
        "provider-diagnostic",
    );
    match result {
        Ok(output) => {
            record_diagnostic(app, provider_id, "success", &tested_at)?;
            Ok(ProviderDiagnostic {
                provider_id: provider_id.into(),
                model_id: model_id.into(),
                status: "success".into(),
                message: "A real text-generation request completed.".into(),
                output_preview: output.text.chars().take(240).collect(),
                tested_at,
            })
        }
        Err(error) => {
            let _ = record_diagnostic(app, provider_id, "failed", &tested_at);
            Err(error)
        }
    }
}

pub fn save_provider(app: &AppHandle, input: &SaveGenerationProviderInput) -> AppResult<()> {
    let provider = spec(&input.provider_id)?;
    if provider.transport == Transport::BuiltIn {
        return Err(AppError::InvalidGenerationProvider(
            "built-in providers cannot be reconfigured".into(),
        ));
    }
    if provider.locality == "cloud" && input.enabled && !input.cloud_confirmed {
        return Err(AppError::InvalidGenerationProvider(
            "confirm the cloud data boundary before enabling this provider".into(),
        ));
    }
    let display_name = input.display_name.trim();
    if display_name.is_empty() || display_name.chars().count() > 64 {
        return Err(AppError::InvalidGenerationProvider(
            "enter a connection name between 1 and 64 characters".into(),
        ));
    }
    let base_url = validate_base_url(provider, input.base_url.as_deref())?;
    let executable_path = validate_executable_path(provider, input.executable_path.as_deref())?;
    let mut config = storage::read_config(app)?;
    let previous = stored_config(&config, provider.id).cloned();
    let next = GenerationProviderConfig {
        provider_id: provider.id.into(),
        display_name: Some(display_name.into()),
        enabled: input.enabled,
        base_url,
        executable_path,
        default_model_id: previous
            .as_ref()
            .and_then(|item| item.default_model_id.clone()),
        cloud_confirmed: input.cloud_confirmed,
        last_tested_at: previous
            .as_ref()
            .and_then(|item| item.last_tested_at.clone()),
        last_test_status: previous
            .as_ref()
            .and_then(|item| item.last_test_status.clone()),
        cached_models: previous
            .as_ref()
            .map(|item| item.cached_models.clone())
            .unwrap_or_default(),
        last_discovered_at: previous
            .as_ref()
            .and_then(|item| item.last_discovered_at.clone()),
    };
    config
        .generation_providers
        .retain(|item| item.provider_id != provider.id);
    config.generation_providers.push(next);
    storage::write_config(app, &config)
}

pub fn delete_provider(app: &AppHandle, provider_id: &str) -> AppResult<()> {
    let provider = spec(provider_id)?;
    if provider.transport == Transport::BuiltIn {
        return Err(AppError::InvalidGenerationProvider(
            "built-in connections cannot be deleted".into(),
        ));
    }
    let mut config = storage::read_config(app)?;
    if !remove_provider_references(&mut config, provider_id) {
        return Err(AppError::InvalidGenerationProvider(
            "this connection has not been added".into(),
        ));
    }
    delete_credential(provider_id);
    storage::write_config(app, &config)
}

fn remove_provider_references(config: &mut AppConfig, provider_id: &str) -> bool {
    let previous_len = config.generation_providers.len();
    config
        .generation_providers
        .retain(|item| item.provider_id != provider_id);
    config
        .preferred_models
        .retain(|_, selection| selection.provider_id != provider_id);
    config
        .favorite_models
        .retain(|selection| selection.provider_id != provider_id);
    previous_len != config.generation_providers.len()
}

pub fn save_credential(app: &AppHandle, input: &SaveProviderCredentialInput) -> AppResult<()> {
    let provider = spec(&input.provider_id)?;
    if provider.locality != "cloud" && provider.id != "lmstudio" && provider.id != "llamacpp" {
        return Err(AppError::InvalidGenerationProvider(
            "this provider does not use an app-managed credential".into(),
        ));
    }
    let secret = input.api_key.trim();
    if secret.len() < 8 || secret.len() > 4096 {
        return Err(AppError::InvalidGenerationProvider(
            "the provider credential is not a plausible API key".into(),
        ));
    }
    store_credential(provider.id, secret)?;
    let mut config = storage::read_config(app)?;
    if stored_config(&config, provider.id).is_none() {
        let mut next = effective_config(&config, provider);
        next.enabled = provider.locality == "local";
        config.generation_providers.push(next);
        storage::write_config(app, &config)?;
    }
    Ok(())
}

pub fn clear_credential(app: &AppHandle, provider_id: &str) -> AppResult<()> {
    spec(provider_id)?;
    delete_credential(provider_id);
    let mut config = storage::read_config(app)?;
    config
        .preferred_models
        .retain(|_, selection| selection.provider_id != provider_id);
    storage::write_config(app, &config)
}

pub fn set_preferred_model(app: &AppHandle, input: &SetPreferredModelInput) -> AppResult<()> {
    if !CAPABILITIES.contains(&input.capability.as_str()) {
        return Err(AppError::InvalidGenerationProvider(format!(
            "unknown preference capability: {}",
            input.capability
        )));
    }
    let provider = spec(&input.provider_id)?;
    if input.capability == "vision" && !provider.capabilities.contains(&"image-understanding") {
        return Err(AppError::InvalidGenerationProvider(format!(
            "{} does not support image input",
            provider.label
        )));
    }
    let config = storage::read_config(app)?;
    let provider_config = effective_config(&config, provider);
    if !provider_config.enabled {
        return Err(AppError::InvalidGenerationProvider(
            "enable the provider before selecting it".into(),
        ));
    }
    if provider.locality == "cloud" && !provider_config.cloud_confirmed {
        return Err(AppError::InvalidGenerationProvider(
            "confirm the cloud data boundary before selecting this provider".into(),
        ));
    }
    if provider.requires_credential && !credential_exists(provider.id) {
        return Err(AppError::MissingProviderCredential(provider.id.into()));
    }
    if input.model_id.trim().is_empty() || input.model_id.len() > 240 {
        return Err(AppError::InvalidGenerationProvider(
            "enter a model identifier".into(),
        ));
    }
    let mut next = config;
    next.preferred_models.insert(
        input.capability.clone(),
        ModelSelection {
            provider_id: provider.id.into(),
            model_id: input.model_id.trim().into(),
        },
    );
    storage::write_config(app, &next)
}

pub fn set_favorite_model(app: &AppHandle, input: &SetFavoriteModelInput) -> AppResult<()> {
    spec(&input.provider_id)?;
    if input.model_id.trim().is_empty() || input.model_id.len() > 240 {
        return Err(AppError::InvalidGenerationProvider(
            "enter a model identifier".into(),
        ));
    }
    let selection = ModelSelection {
        provider_id: input.provider_id.clone(),
        model_id: input.model_id.trim().into(),
    };
    let mut config = storage::read_config(app)?;
    config.favorite_models.retain(|item| item != &selection);
    if input.favorite {
        config.favorite_models.push(selection);
    }
    storage::write_config(app, &config)
}

pub fn set_default_provider_model(
    app: &AppHandle,
    input: &SetDefaultProviderModelInput,
) -> AppResult<()> {
    let provider = spec(&input.provider_id)?;
    let model_id = input.model_id.trim();
    if model_id.is_empty() || model_id.len() > 240 {
        return Err(AppError::InvalidGenerationProvider(
            "enter a model identifier".into(),
        ));
    }
    let mut config = storage::read_config(app)?;
    let Some(stored) = config
        .generation_providers
        .iter_mut()
        .find(|item| item.provider_id == provider.id)
    else {
        return Err(AppError::InvalidGenerationProvider(
            "save the connection before choosing its default model".into(),
        ));
    };
    stored.default_model_id = Some(model_id.into());
    storage::write_config(app, &config)
}

pub fn catalog(app: &AppHandle, refresh: bool) -> AppResult<ProviderCatalog> {
    let mut config = storage::read_config(app)?;
    let mut states = Vec::new();
    let mut cache_updates = Vec::new();
    for provider in PROVIDERS {
        let saved = stored_config(&config, provider.id).is_some();
        let effective = effective_config(&config, provider);
        let credential_configured = credential_exists(provider.id);
        let executable_path = if provider.transport == Transport::Terminal {
            locate_executable(provider, effective.executable_path.as_deref())
        } else {
            None
        };
        let installed = provider.transport == Transport::BuiltIn
            || provider.transport != Transport::Terminal
            || executable_path.is_some();
        let tested = effective.last_test_status.as_deref() == Some("success");
        let test_failed = effective.last_test_status.as_deref() == Some("failed");
        let mut reachable = provider.transport == Transport::BuiltIn;
        let mut authenticated = provider.transport == Transport::BuiltIn;
        let mut models = effective
            .cached_models
            .iter()
            .map(|model| GenerationModel {
                id: model.id.clone(),
                label: model.label.clone(),
                provider_id: provider.id.into(),
                capabilities: provider
                    .capabilities
                    .iter()
                    .map(|item| item.to_string())
                    .collect(),
                context_window: model.context_window,
                pricing: model.pricing.clone(),
                source: "cached".into(),
            })
            .collect::<Vec<_>>();
        let mut default_model_id = effective.default_model_id.clone();
        let mut diagnostic_error = None;
        let can_discover = provider.transport == Transport::BuiltIn
            || provider.transport == Transport::Terminal
            || !provider.requires_credential
            || credential_configured
            || provider.model_discovery == "vercel";
        if can_discover
            && (refresh || matches!(provider.transport, Transport::BuiltIn | Transport::Terminal))
        {
            let credential = if credential_configured {
                read_credential(provider.id).ok()
            } else {
                None
            };
            match discover_models(provider, &effective, credential.as_deref()) {
                Ok(items) => {
                    models = items;
                    if default_model_id.is_none() {
                        default_model_id = models.first().map(|model| model.id.clone());
                    }
                    reachable = installed;
                    authenticated =
                        installed && (!provider.requires_credential || credential_configured);
                    if refresh && saved && provider.transport != Transport::BuiltIn {
                        let mut updated = effective.clone();
                        if provider.transport != Transport::Terminal {
                            updated.cached_models = models
                                .iter()
                                .map(|model| CachedGenerationModel {
                                    id: model.id.clone(),
                                    label: model.label.clone(),
                                    context_window: model.context_window,
                                    pricing: model.pricing.clone(),
                                })
                                .collect();
                        }
                        updated.default_model_id = default_model_id.clone();
                        updated.last_discovered_at = Some(chrono::Utc::now().to_rfc3339());
                        cache_updates.push(updated);
                    }
                }
                Err(error) => diagnostic_error = Some(error.to_string()),
            }
        }
        let (status, detail) = if !effective.enabled {
            (
                "disabled",
                "Provider is configured but disabled.".to_string(),
            )
        } else if provider.transport == Transport::Terminal && !installed {
            (
                "not-installed",
                format!(
                    "{} was not found. Choose its executable after installation.",
                    provider.label
                ),
            )
        } else if provider.locality == "cloud" && !effective.cloud_confirmed {
            (
                "needs-consent",
                "Confirm the remote data boundary before enabling requests.".to_string(),
            )
        } else if provider.requires_credential && !credential_configured {
            (
                "needs-credential",
                "Add an API key; it will be stored in macOS Keychain.".to_string(),
            )
        } else if let Some(error) = diagnostic_error {
            (
                if provider.locality == "local" {
                    "not-running"
                } else {
                    "error"
                },
                error,
            )
        } else if tested {
            (
                "live-tested",
                "A real generation diagnostic passed.".to_string(),
            )
        } else if test_failed {
            (
                "test-failed",
                "The most recent real generation diagnostic failed. Review the provider configuration and run it again.".to_string(),
            )
        } else if provider.transport == Transport::BuiltIn {
            (
                "live-tested",
                "Built-in deterministic provider is ready offline.".to_string(),
            )
        } else if reachable && authenticated {
            (
                "authenticated",
                format!(
                    "Model discovery returned {} model{}.",
                    models.len(),
                    if models.len() == 1 { "" } else { "s" }
                ),
            )
        } else if provider.transport == Transport::Terminal && installed {
            (
                "discovered",
                "Executable found; authentication has not been tested.".to_string(),
            )
        } else {
            (
                "configured",
                "Configured but not probed during this refresh.".to_string(),
            )
        };
        states.push(GenerationProviderState {
            id: provider.id.into(),
            label: effective
                .display_name
                .clone()
                .unwrap_or_else(|| provider.label.into()),
            template_label: provider.label.into(),
            saved: saved || provider.transport == Transport::BuiltIn,
            transport: transport_name(provider.transport).into(),
            locality: provider.locality.into(),
            enabled: effective.enabled,
            configured: saved || effective.enabled || credential_configured,
            credential_configured,
            cloud_confirmed: effective.cloud_confirmed,
            installed,
            reachable,
            authenticated,
            tested,
            status: status.into(),
            detail: format!("{} {}", provider.detail, detail),
            base_url: effective.base_url,
            executable_path,
            default_model_id,
            capabilities: provider
                .capabilities
                .iter()
                .map(|item| item.to_string())
                .collect(),
            models,
            last_tested_at: effective.last_tested_at,
            last_test_status: effective.last_test_status,
        });
    }
    if !cache_updates.is_empty() {
        for update in cache_updates {
            config
                .generation_providers
                .retain(|item| item.provider_id != update.provider_id);
            config.generation_providers.push(update);
        }
        storage::write_config(app, &config)?;
    }
    Ok(ProviderCatalog {
        providers: states,
        preferred_models: resolved_preferences(&config),
        favorite_models: config.favorite_models,
        refreshed: refresh,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

    #[test]
    fn defaults_keep_every_workflow_local() {
        let preferences = resolved_preferences(&AppConfig::default());
        assert_eq!(preferences["chat"].provider_id, "local-retrieval");
        assert_eq!(preferences["interview"].provider_id, "local-interviewer");
        assert_eq!(preferences["studio"].provider_id, "local-workflow");
    }

    #[test]
    fn configurable_connection_templates_are_opt_in() {
        assert!(PROVIDERS
            .iter()
            .filter(|provider| provider.transport != Transport::BuiltIn)
            .all(|provider| !provider.default_enabled));
    }

    #[test]
    fn deleting_connection_clears_routes_and_favorites() {
        let mut config = AppConfig::default();
        config.generation_providers.push(GenerationProviderConfig {
            provider_id: "vercel".into(),
            display_name: Some("Production Gateway".into()),
            enabled: true,
            base_url: Some("https://ai-gateway.vercel.sh/v1".into()),
            executable_path: None,
            default_model_id: None,
            cloud_confirmed: true,
            last_tested_at: None,
            last_test_status: None,
            cached_models: Vec::new(),
            last_discovered_at: None,
        });
        let selection = ModelSelection {
            provider_id: "vercel".into(),
            model_id: "anthropic/claude-sonnet-4".into(),
        };
        config
            .preferred_models
            .insert("chat".into(), selection.clone());
        config.favorite_models.push(selection);

        assert!(remove_provider_references(&mut config, "vercel"));
        assert!(config.generation_providers.is_empty());
        assert!(config.preferred_models.is_empty());
        assert!(config.favorite_models.is_empty());
        assert!(!remove_provider_references(&mut config, "vercel"));
    }

    #[test]
    fn rejects_plain_http_away_from_loopback() {
        assert!(
            validate_base_url(spec("ollama").unwrap(), Some("http://192.168.1.10:11434")).is_err()
        );
        assert!(validate_base_url(spec("ollama").unwrap(), Some("http://127.0.0.1:11434")).is_ok());
        assert!(
            validate_base_url(spec("openai").unwrap(), Some("http://api.openai.com/v1")).is_err()
        );
    }

    #[test]
    fn http_connections_ignore_detected_executable_paths() {
        assert_eq!(
            validate_executable_path(spec("ollama").unwrap(), Some("/usr/local/bin/ollama"))
                .unwrap(),
            None
        );
        assert!(validate_executable_path(
            spec("codex-cli").unwrap(),
            Some("/definitely/not/a/codex-binary")
        )
        .is_err());
    }

    #[test]
    fn normalizes_supported_text_response_shapes() {
        assert_eq!(
            extract_chat_text(&json!({"choices": [{"message": {"content": "chat text"}}]}))
                .as_deref(),
            Some("chat text")
        );
        assert_eq!(
            extract_responses_text(&json!({"output": [{"content": [{"type": "output_text", "text": "response text"}]}]}))
                .as_deref(),
            Some("response text")
        );
        assert_eq!(
            extract_anthropic_text(
                &json!({"content": [{"type": "text", "text": "anthropic text"}]})
            )
            .as_deref(),
            Some("anthropic text")
        );
    }

    #[test]
    fn normalizes_gateway_usage_and_prefers_reported_cost() {
        let usage = usage_metrics(&json!({
            "id": "gen-fixture",
            "provider": "Anthropic",
            "usage": {
                "prompt_tokens": 120,
                "completion_tokens": 30,
                "total_tokens": 150,
                "cost": 0.000328,
                "prompt_tokens_details": {"cached_tokens": 40},
                "completion_tokens_details": {"reasoning_tokens": 12}
            }
        }));
        assert_eq!(usage.provider_request_id.as_deref(), Some("gen-fixture"));
        assert_eq!(usage.upstream_provider.as_deref(), Some("Anthropic"));
        assert_eq!(usage.input_tokens, 120);
        assert_eq!(usage.output_tokens, 30);
        assert_eq!(usage.cached_input_tokens, 40);
        assert_eq!(usage.reasoning_tokens, 12);
        assert_eq!(usage.reported_cost_micros, Some(328));
    }

    #[test]
    fn estimates_gateway_cost_from_discovered_catalog_pricing() {
        let pricing = ModelPricing {
            input_per_token: Some("0.000002".into()),
            output_per_token: Some("0.00001".into()),
            cached_input_per_token: Some("0.0000002".into()),
            input_tiers: Vec::new(),
            output_tiers: Vec::new(),
        };
        let usage = UsageMetrics {
            input_tokens: 100,
            output_tokens: 20,
            total_tokens: 120,
            cached_input_tokens: 40,
            ..UsageMetrics::default()
        };
        assert_eq!(estimate_cost_micros(&usage, Some(&pricing)), Some(328));
    }

    #[test]
    fn discovers_vercel_and_openrouter_pricing_without_hardcoded_rates() {
        let vercel = common_models(
            spec("vercel").unwrap(),
            &json!({"data": [{
                "id": "creator/model",
                "pricing": {
                    "input": "0.000002",
                    "output": "0.000012",
                    "input_cache_read": "0.0000002",
                    "input_tiers": [{"cost": "0.000004", "min": 200001}]
                }
            }]}),
        );
        let openrouter = common_models(
            spec("openrouter").unwrap(),
            &json!({"data": [{
                "id": "creator/model",
                "pricing": {"prompt": "0.000003", "completion": "0.000015"}
            }]}),
        );
        assert_eq!(
            vercel[0]
                .pricing
                .as_ref()
                .and_then(|pricing| pricing.input_per_token.as_deref()),
            Some("0.000002")
        );
        assert_eq!(
            vercel[0]
                .pricing
                .as_ref()
                .map(|pricing| pricing.input_tiers.len()),
            Some(1)
        );
        assert_eq!(
            openrouter[0]
                .pricing
                .as_ref()
                .and_then(|pricing| pricing.output_per_token.as_deref()),
            Some("0.000015")
        );
    }

    #[test]
    fn every_configurable_text_provider_builds_its_documented_transport_contract() {
        let expected = [
            ("ollama", "/chat/completions"),
            ("lmstudio", "/chat/completions"),
            ("llamacpp", "/chat/completions"),
            ("openai", "/responses"),
            ("anthropic", "/messages"),
            ("gemini", "/chat/completions"),
            ("openrouter", "/chat/completions"),
            ("vercel", "/chat/completions"),
        ];
        for (provider_id, path) in expected {
            let provider = spec(provider_id).expect("registered provider");
            let (endpoint, body) = text_request(
                provider,
                "https://provider.test/v1",
                "model-fixture",
                "system fixture",
                "prompt fixture",
            )
            .expect("request contract");
            assert_eq!(endpoint, format!("https://provider.test/v1{path}"));
            assert_eq!(body["model"], "model-fixture");
            assert!(body.to_string().contains("system fixture"));
            assert!(body.to_string().contains("prompt fixture"));
        }
    }

    #[test]
    fn ollama_generation_uses_openai_compatible_v1_without_breaking_custom_v1_urls() {
        let provider = spec("ollama").expect("ollama provider");
        assert_eq!(
            openai_compatible_chat_endpoint(provider, "http://127.0.0.1:11434"),
            "http://127.0.0.1:11434/v1/chat/completions"
        );
        assert_eq!(
            openai_compatible_chat_endpoint(provider, "http://127.0.0.1:11434/v1"),
            "http://127.0.0.1:11434/v1/chat/completions"
        );
    }

    #[test]
    fn cloud_authentication_uses_anthropic_or_bearer_headers_as_required() {
        let client = Client::new();
        let anthropic = authenticated_request(
            client.get("https://provider.test"),
            spec("anthropic").unwrap(),
            Some("secret-fixture"),
        )
        .build()
        .unwrap();
        assert_eq!(anthropic.headers()["x-api-key"], "secret-fixture");
        assert_eq!(anthropic.headers()["anthropic-version"], "2023-06-01");

        for provider_id in ["openai", "gemini", "openrouter", "vercel"] {
            let request = authenticated_request(
                client.get("https://provider.test"),
                spec(provider_id).unwrap(),
                Some("secret-fixture"),
            )
            .build()
            .unwrap();
            assert_eq!(request.headers()["authorization"], "Bearer secret-fixture");
        }
    }

    #[test]
    fn terminal_adapters_enforce_noninteractive_read_only_codex_mode() {
        let args = terminal_args(spec("codex-cli").unwrap(), "gpt-5.6-sol", None).unwrap();
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--sandbox", "read-only"]));
        assert!(args.contains(&"--ephemeral".to_string()));
        assert!(args.contains(&"--skip-git-repo-check".to_string()));
        assert!(args.contains(&"--ignore-user-config".to_string()));
        assert!(args.contains(&"--ignore-rules".to_string()));
        assert_eq!(args.last().map(String::as_str), Some("-"));

        let claude = terminal_args(spec("claude-cli").unwrap(), "claude-fixture", None).unwrap();
        assert!(claude
            .windows(2)
            .any(|pair| pair == ["--permission-mode", "plan"]));
        assert!(claude.windows(2).any(|pair| pair == ["--max-turns", "1"]));
        assert!(claude
            .windows(2)
            .any(|pair| pair == ["--output-format", "json"]));

        let gemini = terminal_args(spec("gemini-cli").unwrap(), "gemini-fixture", None).unwrap();
        assert!(gemini
            .windows(2)
            .any(|pair| pair == ["--approval-mode", "plan"]));
        assert!(gemini.contains(&"--sandbox".to_string()));
        assert!(gemini
            .windows(2)
            .any(|pair| pair == ["--output-format", "json"]));
    }

    #[test]
    fn codex_terminal_adapter_attaches_images_without_relaxing_sandboxing() {
        let image_path = Path::new("/tmp/burrowise-image-fixture.png");
        let args =
            terminal_args(spec("codex-cli").unwrap(), "gpt-5.6-sol", Some(image_path)).unwrap();

        assert!(spec("codex-cli")
            .unwrap()
            .capabilities
            .contains(&"image-understanding"));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--image", "/tmp/burrowise-image-fixture.png"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--sandbox", "read-only"]));
        assert_eq!(args.last().map(String::as_str), Some("-"));

        let error = terminal_args(spec("claude-cli").unwrap(), "default", Some(image_path))
            .expect_err("unsupported terminal image attachment");
        assert!(error
            .to_string()
            .contains("does not support image attachments"));
    }

    #[test]
    fn openai_compatible_image_request_sends_data_url_and_normalizes_text() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("mock provider");
        let address = listener.local_addr().expect("address");
        let (sender, receiver) = mpsc::channel();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("request");
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .expect("timeout");
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            loop {
                let count = stream.read(&mut buffer).expect("read");
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
                let Some(header_end) = request.windows(4).position(|bytes| bytes == b"\r\n\r\n")
                else {
                    continue;
                };
                let headers = String::from_utf8_lossy(&request[..header_end + 4]);
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .map(str::trim)
                            .and_then(|value| value.parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if request.len() >= header_end + 4 + content_length {
                    break;
                }
            }
            sender
                .send(String::from_utf8_lossy(&request).to_string())
                .expect("capture");
            let body = r##"{"choices":[{"message":{"content":"# Workshop notes\n\n- Keep the original"}}]}"##;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("response");
        });
        let provider = spec("ollama").expect("provider");
        let config = GenerationProviderConfig {
            provider_id: "ollama".into(),
            display_name: Some("Workshop Ollama".into()),
            enabled: true,
            base_url: Some(format!("http://{address}")),
            executable_path: None,
            default_model_id: None,
            cloud_confirmed: false,
            last_tested_at: None,
            last_test_status: None,
            cached_models: Vec::new(),
            last_discovered_at: None,
        };
        let output = generate_image_http(
            provider,
            &config,
            "vision-fixture",
            "Return Markdown.",
            "Transcribe this image.",
            "image/png",
            b"abc",
            None,
        )
        .expect("generation");
        server.join().expect("server");
        let request = receiver.recv().expect("captured request");

        assert!(request.starts_with("POST /v1/chat/completions"));
        assert!(request.contains(r#""type":"image_url""#));
        assert!(request.contains("data:image/png;base64,YWJj"));
        assert!(output
            .text
            .as_deref()
            .is_some_and(|text| text.contains("Keep the original")));
    }
}
