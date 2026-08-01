use crate::domain::{
    ChatConversation, ChatMessage, Citation, Conversation, ConversationMessage, InterviewSession,
    InterviewTurn, SearchQuery,
};
use crate::error::AppResult;
use crate::{search, storage};
use std::path::Path;

/// Workflow-neutral knowledge boundary for every conversational mode.
#[derive(Debug, Clone)]
pub struct RetrievalPolicy {
    pub scope: String,
    pub selected_paths: Vec<String>,
    pub limit: usize,
    pub passages_per_source: usize,
}

/// The single retrieval path used by Chat, Interviews, and future conversation modes.
pub fn retrieve(
    brain: &Path,
    query: &str,
    policy: &RetrievalPolicy,
) -> AppResult<Vec<Citation>> {
    if policy.scope == "session" {
        return Ok(Vec::new());
    }
    let results = search::search_diverse(
        brain,
        &SearchQuery {
            query: query.to_string(),
            mode: "hybrid".into(),
            scope: policy.scope.clone(),
            limit: Some(policy.limit.clamp(3, 50)),
            selected_paths: policy.selected_paths.clone(),
        },
        policy.passages_per_source,
    )?;
    Ok(results
        .into_iter()
        .enumerate()
        .map(|(index, result)| Citation {
            passage_id: result.passage_id,
            number: index + 1,
            title: result.title,
            relative_path: result.relative_path,
            quote: result.quote,
        })
        .collect())
}

pub fn scoped_sources(citations: &[Citation]) -> String {
    if citations.is_empty() {
        return "No matching knowledge passages were found in the selected scope.".into();
    }
    citations
        .iter()
        .map(|citation| {
            format!(
                "[{}] FILE: {}\nTITLE: {}\nQUOTE: {}",
                citation.number, citation.relative_path, citation.title, citation.quote
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn conversation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Conversation> {
    let selected_paths: String = row.get(6)?;
    Ok(Conversation {
        id: row.get(0)?,
        kind: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        scope: row.get(5)?,
        selected_paths: serde_json::from_str(&selected_paths).unwrap_or_default(),
        provider: row.get(7)?,
        model: row.get(8)?,
        preview: row.get(9)?,
        status: row.get(10)?,
        host_id: row.get(11)?,
        host_name: row.get(12)?,
        folder_path: row.get(13)?,
        relative_folder: row.get(14)?,
    })
}

fn message_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConversationMessage> {
    let citations: String = row.get(5)?;
    Ok(ConversationMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
        citations: serde_json::from_str(&citations).unwrap_or_default(),
        provider: row.get(6)?,
        model: row.get(7)?,
        general_knowledge_used: row.get::<_, i64>(8)? != 0,
        audio_path: row.get(9)?,
        audio_mime_type: row.get(10)?,
        stage: row.get(11)?,
        analysis: row.get(12)?,
        status: row.get(13)?,
    })
}

pub fn list(brain: &Path, kind: Option<&str>) -> AppResult<Vec<Conversation>> {
    let connection = storage::open_database(brain)?;
    let columns = "id, kind, title, created_at, updated_at, scope, selected_paths_json, provider,
                   model, preview, status, host_id, host_name, folder_path, relative_folder";
    if let Some(kind) = kind {
        let mut statement = connection.prepare(&format!(
            "SELECT {columns} FROM conversations WHERE kind = ?1 ORDER BY updated_at DESC"
        ))?;
        let rows = statement.query_map([kind], conversation_from_row)?;
        return Ok(rows.collect::<Result<Vec<_>, _>>()?);
    }
    let mut statement = connection.prepare(&format!(
        "SELECT {columns} FROM conversations ORDER BY updated_at DESC"
    ))?;
    let rows = statement.query_map([], conversation_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_messages(brain: &Path, conversation_id: &str) -> AppResult<Vec<ConversationMessage>> {
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, conversation_id, role, content, created_at, citations_json, provider, model,
         general_knowledge_used, audio_path, audio_mime_type, stage, analysis, status
         FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC, rowid ASC",
    )?;
    let rows = statement.query_map([conversation_id], message_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn from_chat(value: ChatConversation) -> Conversation {
    Conversation {
        id: value.id,
        kind: "chat".into(),
        title: value.title,
        created_at: value.created_at,
        updated_at: value.updated_at,
        scope: value.scope,
        selected_paths: value.selected_paths,
        provider: value.provider,
        model: value.model,
        preview: value.preview,
        status: "active".into(),
        host_id: None,
        host_name: None,
        folder_path: None,
        relative_folder: None,
    }
}

pub fn from_interview(value: InterviewSession) -> Conversation {
    Conversation {
        id: value.id,
        kind: "interview".into(),
        title: value.title,
        created_at: value.created_at,
        updated_at: value.updated_at,
        scope: value.scope,
        selected_paths: value.selected_paths,
        provider: value.provider,
        model: value.model,
        preview: String::new(),
        status: value.status,
        host_id: Some(value.host_id),
        host_name: Some(value.host_name),
        folder_path: Some(value.folder_path),
        relative_folder: Some(value.relative_folder),
    }
}

pub fn from_chat_message(value: ChatMessage) -> ConversationMessage {
    ConversationMessage {
        id: value.id,
        conversation_id: value.conversation_id,
        role: value.role,
        content: value.content,
        created_at: value.created_at,
        citations: value.citations,
        provider: value.provider,
        model: value.model,
        general_knowledge_used: value.general_knowledge_used,
        audio_path: None,
        audio_mime_type: None,
        stage: String::new(),
        analysis: String::new(),
        status: "complete".into(),
    }
}

pub fn from_interview_turn(value: InterviewTurn, session: &Conversation) -> ConversationMessage {
    let is_user = value.role == "user";
    ConversationMessage {
        id: value.id,
        conversation_id: value.interview_id,
        role: value.role,
        content: value.content,
        created_at: value.created_at,
        citations: value.citations,
        provider: if is_user { "user".into() } else { session.provider.clone() },
        model: if is_user { "human".into() } else { session.model.clone() },
        general_knowledge_used: false,
        audio_path: value.audio_path,
        audio_mime_type: value.audio_mime_type,
        stage: value.stage,
        analysis: value.analysis,
        status: value.status,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn all_modes_share_identical_scoped_retrieval() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        fs::create_dir_all(temporary.path().join("notes")).expect("notes");
        fs::write(
            temporary.path().join("notes/shared.md"),
            "# Shared evidence\n\nConversation modes must enforce the same visible knowledge boundary.",
        )
        .expect("source");
        search::rebuild_index(temporary.path()).expect("index");
        let policy = RetrievalPolicy {
            scope: "all".into(),
            selected_paths: vec![],
            limit: 10,
            passages_per_source: 2,
        };
        let chat = retrieve(temporary.path(), "knowledge boundary", &policy).expect("chat");
        let interview = retrieve(temporary.path(), "knowledge boundary", &policy).expect("interview");
        assert_eq!(chat.len(), interview.len());
        assert_eq!(chat[0].passage_id, interview[0].passage_id);
    }
}
