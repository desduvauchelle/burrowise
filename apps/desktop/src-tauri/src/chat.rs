use crate::domain::{
    AgentProposal, ChatConversation, ChatMessage, ChatTurn, Citation, ModelSelection, SendChatInput,
};
use crate::error::{AppError, AppResult};
use crate::{conversation, notes, review, storage};
#[cfg(test)]
use crate::search;
use chrono::Utc;
use rusqlite::params;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const PROVIDER: &str = "local-retrieval";
const MODEL: &str = "extractive-v1";

fn validate_scope(scope: &str) -> AppResult<()> {
    if !["all", "session", "selected"].contains(&scope) {
        return Err(AppError::InvalidChatMessage(format!(
            "unsupported knowledge scope: {scope}"
        )));
    }
    Ok(())
}

fn conversation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChatConversation> {
    let selected_paths_json: String = row.get(5)?;
    Ok(ChatConversation {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
        scope: row.get(4)?,
        selected_paths: serde_json::from_str(&selected_paths_json).unwrap_or_default(),
        provider: row.get(6)?,
        model: row.get(7)?,
        preview: row.get(8)?,
    })
}

fn message_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChatMessage> {
    let citations_json: String = row.get(5)?;
    Ok(ChatMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
        citations: serde_json::from_str(&citations_json).unwrap_or_default(),
        provider: row.get(6)?,
        model: row.get(7)?,
        general_knowledge_used: row.get::<_, i64>(8)? != 0,
    })
}

fn title_for_message(message: &str) -> String {
    let words = message
        .split_whitespace()
        .take(7)
        .collect::<Vec<_>>()
        .join(" ");
    if words.len() < message.trim().len() {
        format!("{words}…")
    } else {
        words
    }
}

pub fn create_conversation(
    brain: &Path,
    title: Option<&str>,
    scope: &str,
) -> AppResult<ChatConversation> {
    validate_scope(scope)?;
    let connection = storage::open_database(brain)?;
    let now = Utc::now().to_rfc3339();
    let conversation = ChatConversation {
        id: Uuid::new_v4().to_string(),
        title: title.unwrap_or("Untitled chat").to_string(),
        created_at: now.clone(),
        updated_at: now,
        scope: scope.to_string(),
        selected_paths: Vec::new(),
        provider: PROVIDER.to_string(),
        model: MODEL.to_string(),
        preview: "Start a new cited conversation".to_string(),
    };
    connection.execute(
        "INSERT INTO conversations (id, kind, title, created_at, updated_at, scope, selected_paths_json, provider, model, preview)
         VALUES (?1, 'chat', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![conversation.id, conversation.title, conversation.created_at, conversation.updated_at, conversation.scope, serde_json::to_string(&conversation.selected_paths)?, conversation.provider, conversation.model, conversation.preview],
    )?;
    Ok(conversation)
}

pub fn list_conversations(brain: &Path) -> AppResult<Vec<ChatConversation>> {
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, title, created_at, updated_at, scope, selected_paths_json, provider, model, preview
         FROM conversations WHERE kind = 'chat' ORDER BY updated_at DESC",
    )?;
    let rows = statement.query_map([], conversation_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_messages(brain: &Path, conversation_id: &str) -> AppResult<Vec<ChatMessage>> {
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, conversation_id, role, content, created_at, citations_json, provider, model, general_knowledge_used
         FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = statement.query_map([conversation_id], message_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn rename_conversation(brain: &Path, conversation_id: &str, title: &str) -> AppResult<ChatConversation> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 120 || title.contains(['\n', '\r']) {
        return Err(AppError::InvalidChatMessage(
            "a conversation title must be one line and no more than 120 characters".into(),
        ));
    }
    let connection = storage::open_database(brain)?;
    let changed = connection.execute(
        "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, Utc::now().to_rfc3339(), conversation_id],
    )?;
    if changed == 0 {
        return Err(AppError::MissingConversation(conversation_id.into()));
    }
    list_conversations(brain)?
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
        .ok_or_else(|| AppError::MissingConversation(conversation_id.into()))
}

fn export_filename(title: &str, id: &str) -> String {
    let slug = title
        .to_lowercase()
        .chars()
        .map(|character| if character.is_alphanumeric() { character } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    format!("chat-{}-{}.md", if slug.is_empty() { "conversation" } else { &slug }, &id[..8.min(id.len())])
}

pub fn export_conversation(brain: &Path, conversation_id: &str) -> AppResult<PathBuf> {
    let conversation = list_conversations(brain)?
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
        .ok_or_else(|| AppError::MissingConversation(conversation_id.into()))?;
    let messages = list_messages(brain, conversation_id)?;
    let body = messages
        .iter()
        .map(|message| {
            let sources = if message.citations.is_empty() {
                String::new()
            } else {
                format!(
                    "\n\nSources:\n{}",
                    message
                        .citations
                        .iter()
                        .map(|citation| format!("- [{}] `{}` — {}", citation.number, citation.relative_path, citation.quote))
                        .collect::<Vec<_>>()
                        .join("\n")
                )
            };
            format!("## {}\n\n{}{}", if message.role == "user" { "You" } else { "Assistant" }, message.content, sources)
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let directory = brain.join("exports");
    fs::create_dir_all(&directory)?;
    let path = directory.join(export_filename(&conversation.title, &conversation.id));
    fs::write(
        &path,
        format!(
            "---\ntype: chat-export\nid: {}\ncreated_at: {}\nexported_at: {}\nprovider: {}\nmodel: {}\n---\n\n# {}\n\n{}\n",
            conversation.id,
            conversation.created_at,
            Utc::now().to_rfc3339(),
            conversation.provider,
            conversation.model,
            conversation.title,
            body
        ),
    )?;
    Ok(path)
}

pub fn delete_conversation(brain: &Path, conversation_id: &str) -> AppResult<()> {
    let connection = storage::open_database(brain)?;
    let transaction = connection.unchecked_transaction()?;
    transaction.execute("DELETE FROM knowledge_access_log WHERE conversation_id = ?1", [conversation_id])?;
    transaction.execute("DELETE FROM messages WHERE conversation_id = ?1", [conversation_id])?;
    let changed = transaction.execute("DELETE FROM conversations WHERE id = ?1 AND kind = 'chat'", [conversation_id])?;
    if changed == 0 {
        return Err(AppError::MissingConversation(conversation_id.into()));
    }
    transaction.commit()?;
    Ok(())
}

fn save_message(connection: &rusqlite::Connection, message: &ChatMessage) -> AppResult<()> {
    connection.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, citations_json, provider, model, general_knowledge_used)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![message.id, message.conversation_id, message.role, message.content, message.created_at, serde_json::to_string(&message.citations)?, message.provider, message.model, i64::from(message.general_knowledge_used)],
    )?;
    Ok(())
}

fn shortened_quote(quote: &str) -> String {
    let compact = quote.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= 280 {
        compact
    } else {
        format!("{}…", compact.chars().take(277).collect::<String>())
    }
}

fn answer_from_citations(
    citations: &[Citation],
    allow_general_knowledge: bool,
    answer_mode: &str,
) -> String {
    if citations.is_empty() {
        return if allow_general_knowledge {
            "I couldn’t find supporting material in the selected brain scope. The active Local Retrieval provider has no general-knowledge mode, so it did not invent an answer. Choose a configured generation provider or broaden the scope.".to_string()
        } else {
            "I couldn’t find supporting material in the selected brain scope. General model knowledge was not used. Try a broader scope or different wording.".to_string()
        };
    }
    let heading = if answer_mode == "deep" {
        "I completed a deeper evidence sweep of your brain:"
    } else {
        "I found these relevant points in your brain:"
    };
    let shown = match answer_mode {
        "concise" => 3,
        "deep" => citations.len(),
        _ => 6,
    };
    let mut answer = format!("{heading}\n\n");
    for citation in citations.iter().take(shown) {
        answer.push_str(&format!(
            "- {} [{}]\n",
            shortened_quote(&citation.quote),
            citation.number
        ));
    }
    answer.push_str("\nThis answer is extractive: it stays close to your source wording and does not add general model knowledge.");
    answer
}

fn generation_prompt(input: &SendChatInput, citations: &[Citation]) -> (String, String) {
    let knowledge_rule = if input.allow_general_knowledge {
        "You may add general knowledge, but clearly label claims that are not supported by the supplied sources."
    } else {
        "Use only the supplied sources. If they do not support an answer, say so. Do not add general knowledge."
    };
    let depth_rule = match input.answer_mode.as_str() {
        "concise" => "Answer directly and briefly. Prefer the strongest evidence.",
        "deep" => "Perform a thorough synthesis across all supplied evidence. Compare sources, surface agreements, tensions, gaps, and uncertainty, then give a structured conclusion.",
        _ => "Give a clear synthesis with enough detail to explain the supporting evidence.",
    };
    let system = format!(
        "You are Burrowise's cited knowledge assistant. {knowledge_rule} {depth_rule} Cite source-backed claims using the supplied bracket numbers such as [1]. Never claim to have accessed a source that is not included below."
    );
    let sources = conversation::scoped_sources(citations);
    (
        system,
        format!(
            "QUESTION:\n{}\n\nSCOPED SOURCES:\n{sources}",
            input.message.trim()
        ),
    )
}

fn validate_agent_mode(input: &SendChatInput) -> AppResult<()> {
    if !["read-only", "read-and-propose", "read-write"].contains(&input.agent_mode.as_str()) {
        return Err(AppError::InvalidChatMessage(format!(
            "unsupported agent mode: {}",
            input.agent_mode
        )));
    }
    if input.agent_mode != "read-only"
        && (input.scope != "selected" || input.selected_paths.len() != 1)
    {
        return Err(AppError::InvalidChatMessage(
            "change modes require Selected notes scope with exactly one target note".into(),
        ));
    }
    Ok(())
}

fn deterministic_revision(original: &str, instruction: &str) -> AppResult<String> {
    let instruction = instruction.trim();
    let lower = instruction.to_lowercase();
    if lower.starts_with("append:") {
        let addition = instruction["append:".len()..].trim();
        if addition.is_empty() {
            return Err(AppError::InvalidChatMessage("Append needs text after the colon".into()));
        }
        return Ok(format!("{}\n\n{}", original.trim(), addition));
    }
    if lower.starts_with("replace:") {
        let replacement = instruction["replace:".len()..].trim();
        let (from, to) = replacement.split_once("=>").ok_or_else(|| {
            AppError::InvalidChatMessage("Use `Replace: exact old text => new text` with the local agent".into())
        })?;
        let from = from.trim();
        let to = to.trim();
        if from.is_empty() || !original.contains(from) {
            return Err(AppError::InvalidChatMessage(
                "the exact replacement text was not found in the selected note".into(),
            ));
        }
        return Ok(original.replacen(from, to, 1));
    }
    Err(AppError::InvalidChatMessage(
        "The local agent supports `Append: text` or `Replace: exact old text => new text`. A configured generation provider can interpret natural-language edit requests.".into(),
    ))
}

fn agent_prompt(title: &str, body: &str, instruction: &str) -> (String, String) {
    (
        "You are a careful Markdown editor. Return only the complete revised note body: no frontmatter, no title, no fences, and no commentary. Preserve claims and wording unless the instruction explicitly changes them. Never add facts not present in the note or instruction.".into(),
        format!("NOTE TITLE:\n{title}\n\nCURRENT BODY:\n{body}\n\nEDIT INSTRUCTION:\n{}", instruction.trim()),
    )
}

fn delete_empty_conversation(brain: &Path, conversation_id: &str) {
    if let Ok(connection) = storage::open_database(brain) {
        let _ = connection.execute(
            "DELETE FROM conversations WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = ?1)",
            [conversation_id],
        );
    }
}

pub fn send_message_with_provider<F>(
    brain: &Path,
    input: &SendChatInput,
    selection: &ModelSelection,
    generate: F,
) -> AppResult<ChatTurn>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    send_message_inner(brain, input, selection, Some(generate))
}

pub fn send_message(brain: &Path, input: &SendChatInput) -> AppResult<ChatTurn> {
    send_message_inner(
        brain,
        input,
        &ModelSelection {
            provider_id: PROVIDER.into(),
            model_id: MODEL.into(),
        },
        Option::<fn(&str, &str) -> AppResult<String>>::None,
    )
}

fn send_message_inner<F>(
    brain: &Path,
    input: &SendChatInput,
    selection: &ModelSelection,
    generate: Option<F>,
) -> AppResult<ChatTurn>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    if input.message.trim().is_empty() {
        return Err(AppError::InvalidChatMessage(
            "message cannot be empty".into(),
        ));
    }
    validate_scope(&input.scope)?;
    validate_agent_mode(input)?;
    if input.scope == "selected" && input.selected_paths.is_empty() {
        return Err(AppError::InvalidChatMessage(
            "selected-note scope requires at least one exact note path".into(),
        ));
    }
    let created_new = input.conversation_id.is_none();
    let mut conversation = match &input.conversation_id {
        Some(id) => list_conversations(brain)?
            .into_iter()
            .find(|conversation| conversation.id == *id)
            .ok_or_else(|| AppError::MissingConversation(id.clone()))?,
        None => create_conversation(
            brain,
            Some(&title_for_message(&input.message)),
            &input.scope,
        )?,
    };
    let now = Utc::now().to_rfc3339();
    let user_message = ChatMessage {
        id: Uuid::new_v4().to_string(),
        conversation_id: conversation.id.clone(),
        role: "user".into(),
        content: input.message.trim().to_string(),
        created_at: now.clone(),
        citations: Vec::new(),
        provider: "user".into(),
        model: "human".into(),
        general_knowledge_used: false,
    };

    let citations = conversation::retrieve(
        brain,
        &input.message,
        &conversation::RetrievalPolicy {
        scope: input.scope.clone(),
        selected_paths: input.selected_paths.clone(),
        limit: input.retrieval_limit,
        passages_per_source: if input.answer_mode == "deep" { 2 } else { 4 },
    })?;
    let mut agent_proposal = None;
    let generated_content = if input.agent_mode == "read-only" {
        if let Some(generate) = generate {
            let (system, prompt) = generation_prompt(input, &citations);
            match generate(&system, &prompt) {
                Ok(content) => Some(content),
                Err(error) => {
                    if created_new {
                        delete_empty_conversation(brain, &conversation.id);
                    }
                    return Err(error);
                }
            }
        } else {
            None
        }
    } else {
        let note = notes::get(brain, &input.selected_paths[0])?;
        let proposed_body = if let Some(generate) = generate {
            let (system, prompt) = agent_prompt(&note.title, &note.body, &input.message);
            match generate(&system, &prompt) {
                Ok(body) => body,
                Err(error) => {
                    if created_new {
                        delete_empty_conversation(brain, &conversation.id);
                    }
                    return Err(error);
                }
            }
        } else {
            deterministic_revision(&note.body, &input.message)?
        };
        let proposed_body = proposed_body.trim().to_string();
        if proposed_body.is_empty() || proposed_body.starts_with("---") || proposed_body == note.body.trim() {
            return Err(AppError::InvalidChatMessage(
                "the agent did not return a changed Markdown body".into(),
            ));
        }
        let proposal = AgentProposal {
            id: Uuid::new_v4().to_string(),
            target_relative_path: note.relative_path,
            target_title: note.title,
            instruction: input.message.trim().into(),
            original_body: note.body,
            proposed_body,
            queued_for_review: input.agent_mode == "read-write",
        };
        if proposal.queued_for_review {
            review::write_agent_change(brain, &proposal, &conversation.id)?;
        }
        let state = if proposal.queued_for_review {
            "I prepared the requested revision and queued it in Review. The canonical note is unchanged until you approve it there."
        } else {
            "I prepared the requested revision without changing the note. Inspect it below, then explicitly send it to Review if you want an approval decision."
        };
        agent_proposal = Some(proposal);
        Some(state.into())
    };
    let assistant_message = ChatMessage {
        id: Uuid::new_v4().to_string(),
        conversation_id: conversation.id.clone(),
        role: "assistant".into(),
        content: generated_content.unwrap_or_else(|| {
            answer_from_citations(
                &citations,
                input.allow_general_knowledge,
                &input.answer_mode,
            )
        }),
        created_at: Utc::now().to_rfc3339(),
        citations,
        provider: selection.provider_id.clone(),
        model: selection.model_id.clone(),
        general_knowledge_used: input.allow_general_knowledge && selection.provider_id != PROVIDER,
    };

    let connection = storage::open_database(brain)?;
    let transaction = connection.unchecked_transaction()?;
    save_message(&transaction, &user_message)?;
    save_message(&transaction, &assistant_message)?;
    if conversation.title == "Untitled chat" {
        conversation.title = title_for_message(&input.message);
    }
    conversation.preview = input.message.chars().take(100).collect();
    conversation.scope = input.scope.clone();
    conversation.selected_paths = input.selected_paths.clone();
    conversation.provider = selection.provider_id.clone();
    conversation.model = selection.model_id.clone();
    conversation.updated_at = assistant_message.created_at.clone();
    transaction.execute(
        "UPDATE conversations SET title = ?1, updated_at = ?2, scope = ?3, selected_paths_json = ?4, preview = ?5, provider = ?6, model = ?7 WHERE id = ?8",
        params![conversation.title, conversation.updated_at, conversation.scope, serde_json::to_string(&conversation.selected_paths)?, conversation.preview, conversation.provider, conversation.model, conversation.id],
    )?;
    for citation in &assistant_message.citations {
        transaction.execute(
            "INSERT INTO knowledge_access_log (id, conversation_id, message_id, passage_id, relative_path, accessed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![Uuid::new_v4().to_string(), conversation.id, assistant_message.id, citation.passage_id, citation.relative_path, assistant_message.created_at],
        )?;
    }
    transaction.commit()?;
    Ok(ChatTurn {
        conversation,
        user_message,
        assistant_message,
        agent_proposal,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn persists_cited_chat_and_records_every_accessed_passage() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::write(
            brain.join("notes/capture.md"),
            "# Reliable capture\n\nOriginal audio must be saved locally before transcription or enrichment begins.",
        )
        .expect("note");
        search::rebuild_index(brain).expect("index");

        let turn = send_message(
            brain,
            &SendChatInput {
                conversation_id: None,
                message: "How should original audio be saved?".into(),
                scope: "all".into(),
                selected_paths: Vec::new(),
                allow_general_knowledge: false,
                retrieval_limit: 12,
                answer_mode: "standard".into(),
                agent_mode: "read-only".into(),
            },
        )
        .expect("chat turn");
        assert!(!turn.assistant_message.citations.is_empty());
        assert!(!turn.assistant_message.general_knowledge_used);
        assert_eq!(list_conversations(brain).expect("conversations").len(), 1);
        assert_eq!(
            list_messages(brain, &turn.conversation.id)
                .expect("messages")
                .len(),
            2
        );
        let connection = storage::open_database(brain).expect("database");
        let access_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM knowledge_access_log", [], |row| {
                row.get(0)
            })
            .expect("access count");
        assert_eq!(
            access_count as usize,
            turn.assistant_message.citations.len()
        );
    }

    #[test]
    fn persists_selected_note_scope_and_never_reads_unselected_files() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::write(
            brain.join("notes/private.md"),
            "# Private boundary\n\nCloud fallback must always require confirmation.",
        )
        .expect("private note");
        fs::write(
            brain.join("notes/unselected.md"),
            "# Unselected secret\n\nThe launch password is ultraviolet marmalade.",
        )
        .expect("unselected note");
        search::rebuild_index(brain).expect("index");

        let turn = send_message(
            brain,
            &SendChatInput {
                conversation_id: None,
                message: "What is the launch password and what requires confirmation?".into(),
                scope: "selected".into(),
                selected_paths: vec!["notes/private.md".into()],
                allow_general_knowledge: false,
                retrieval_limit: 12,
                answer_mode: "standard".into(),
                agent_mode: "read-only".into(),
            },
        )
        .expect("selected chat");

        assert_eq!(turn.conversation.selected_paths, vec!["notes/private.md"]);
        assert!(turn
            .assistant_message
            .citations
            .iter()
            .all(|citation| citation.relative_path == "notes/private.md"));
        assert!(!turn.assistant_message.content.contains("ultraviolet"));
        let reloaded = list_conversations(brain).expect("reloaded");
        assert_eq!(reloaded[0].scope, "selected");
        assert_eq!(reloaded[0].selected_paths, vec!["notes/private.md"]);
    }

    #[test]
    fn rejects_invalid_scopes_without_creating_a_ghost_conversation() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");

        for (scope, selected_paths) in [("corrupted", vec![]), ("selected", vec![])] {
            let error = send_message(
                brain,
                &SendChatInput {
                    conversation_id: None,
                    message: "Do not create a ghost chat".into(),
                    scope: scope.into(),
                    selected_paths,
                    allow_general_knowledge: false,
                    retrieval_limit: 12,
                    answer_mode: "standard".into(),
                    agent_mode: "read-only".into(),
                },
            )
            .expect_err("invalid scope");
            assert!(error.to_string().contains("scope"));
        }
        assert!(list_conversations(brain).expect("conversations").is_empty());
    }

    #[test]
    fn external_generation_snapshots_model_and_removes_failed_new_chats() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::write(
            brain.join("notes/source.md"),
            "# Source\n\nExact scoped evidence.",
        )
        .expect("source");
        search::rebuild_index(brain).expect("index");
        let input = SendChatInput {
            conversation_id: None,
            message: "What is the evidence?".into(),
            scope: "all".into(),
            selected_paths: vec![],
            allow_general_knowledge: false,
            retrieval_limit: 12,
            answer_mode: "standard".into(),
            agent_mode: "read-only".into(),
        };
        let selection = ModelSelection {
            provider_id: "ollama".into(),
            model_id: "test-model".into(),
        };
        let turn = send_message_with_provider(brain, &input, &selection, |_system, prompt| {
            assert!(prompt.contains("notes/source.md"));
            Ok("Grounded generated answer [1].".into())
        })
        .expect("generated turn");
        assert_eq!(turn.assistant_message.provider, "ollama");
        assert_eq!(turn.conversation.model, "test-model");

        let failed = send_message_with_provider(brain, &input, &selection, |_system, _prompt| {
            Err(AppError::GenerationProvider("offline".into()))
        });
        assert!(failed.is_err());
        assert_eq!(list_conversations(brain).expect("conversations").len(), 1);
    }

    #[test]
    fn conversation_lifecycle_renames_exports_and_deletes_all_operational_rows() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        let conversation = create_conversation(brain, Some("Original title"), "all")
            .expect("conversation");
        let renamed = rename_conversation(brain, &conversation.id, "Durable title")
            .expect("rename");
        assert_eq!(renamed.title, "Durable title");

        let export = export_conversation(brain, &conversation.id).expect("export");
        let markdown = fs::read_to_string(export).expect("export markdown");
        assert!(markdown.contains("# Durable title"));
        assert!(markdown.contains("type: chat-export"));

        delete_conversation(brain, &conversation.id).expect("delete");
        assert!(list_conversations(brain).expect("conversations").is_empty());
        assert!(list_messages(brain, &conversation.id).expect("messages").is_empty());
    }

    #[test]
    fn agent_modes_never_change_a_note_before_review_approval() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::create_dir_all(brain.join("review")).expect("review");
        let note = notes::save(
            brain,
            &crate::domain::SaveNoteInput {
                relative_path: None,
                title: "Agent safety".into(),
                body: "Canonical text stays stable.".into(),
                tags: vec!["safety".into()],
            },
        )
        .expect("note");
        search::rebuild_index(brain).expect("index");
        let proposal_turn = send_message(
            brain,
            &SendChatInput {
                conversation_id: None,
                message: "Append: A proposed sentence.".into(),
                scope: "selected".into(),
                selected_paths: vec![note.relative_path.clone()],
                allow_general_knowledge: false,
                retrieval_limit: 12,
                answer_mode: "standard".into(),
                agent_mode: "read-and-propose".into(),
            },
        )
        .expect("proposal");
        let proposal = proposal_turn.agent_proposal.expect("agent proposal");
        assert!(!proposal.queued_for_review);
        assert_eq!(notes::get(brain, &note.relative_path).expect("unchanged").body, note.body);
        assert!(review::list(brain).expect("review").is_empty());

        review::write_agent_change(brain, &proposal, &proposal_turn.conversation.id)
            .expect("queue proposal");
        let record = review::list(brain).expect("review").remove(0);
        assert_eq!(record.item_type, "agent-change");
        review::resolve(
            brain,
            &crate::domain::ResolveReviewInput {
                id: record.id,
                decision: "approved".into(),
            },
        )
        .expect("approve");
        assert!(notes::get(brain, &note.relative_path)
            .expect("updated")
            .body
            .contains("A proposed sentence."));

        let write_turn = send_message(
            brain,
            &SendChatInput {
                conversation_id: Some(proposal_turn.conversation.id),
                message: "Append: A second gated sentence.".into(),
                scope: "selected".into(),
                selected_paths: vec![note.relative_path.clone()],
                allow_general_knowledge: false,
                retrieval_limit: 12,
                answer_mode: "standard".into(),
                agent_mode: "read-write".into(),
            },
        )
        .expect("review-gated write");
        assert!(write_turn.agent_proposal.expect("write proposal").queued_for_review);
        assert!(!notes::get(brain, &note.relative_path)
            .expect("still gated")
            .body
            .contains("A second gated sentence."));
        assert_eq!(review::list(brain).expect("queued review").len(), 1);
    }
}
