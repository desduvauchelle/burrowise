use crate::domain::{
    CompleteInterviewAudioInput, InterviewAccessEntry, InterviewExchange, InterviewHost,
    InterviewSession, InterviewStart, InterviewTurn, ModelSelection, ProcessInterviewAudioInput,
    SaveInterviewHostInput, SendInterviewTurnInput, StartInterviewInput,
};
use crate::error::{AppError, AppResult};
use crate::{conversation, storage, transcription};
#[cfg(test)]
use crate::search;
use chrono::{DateTime, Local, Utc};
use rusqlite::{params, OptionalExtension};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const PROVIDER: &str = "local-interviewer";
const MODEL: &str = "guided-v1";

const DEFAULT_HOSTS: &[(&str, &str)] = &[
    (
        "open-ended-explorer.md",
        r#"---
id: open-ended-explorer
name: Open-ended explorer
description: Curious, informal, and willing to follow useful tangents.
traits: [warm, curious]
stages: [context, example, meaning, next thread]
built_in: true
---
Ask one clear question at a time. Follow the user's energy, invite concrete stories, and prefer discovery over forcing a conclusion.
"#,
    ),
    (
        "friendly-challenger.md",
        r#"---
id: friendly-challenger
name: Friendly challenger
description: Direct follow-ups, contradictions, and supportive accountability.
traits: [direct, probing]
stages: [claim, evidence, contradiction, commitment]
built_in: true
---
Ask one clear question at a time. Test assumptions without becoming combative. Surface contradictions and ask what evidence would change the user's mind.
"#,
    ),
    (
        "first-principles-thinker.md",
        r#"---
id: first-principles-thinker
name: First-principles thinker
description: Patient, philosophical, and technically deep.
traits: [calm, analytical]
stages: [definition, assumptions, fundamentals, implications]
built_in: true
---
Ask one clear question at a time. Clarify definitions, separate facts from assumptions, and rebuild the idea from its most basic constraints.
"#,
    ),
    (
        "product-excavator.md",
        r#"---
id: product-excavator
name: Product excavator
description: Moves from a real problem through evidence, alternatives, and commitment.
traits: [structured, practical]
stages: [context, problem, evidence, alternatives, commitment]
built_in: true
---
Ask one clear question at a time. Seek concrete user behavior, distinguish symptoms from problems, test alternatives, and finish with a falsifiable next step.
"#,
    ),
    (
        "story-miner.md",
        r#"---
id: story-miner
name: Story miner
description: Draws out scenes, sensory details, tension, and emotional change.
traits: [empathetic, vivid]
stages: [scene, desire, tension, turning point, meaning]
built_in: true
---
Ask one clear question at a time. Invite scenes rather than summaries and ask for specific details, stakes, emotion, and what changed.
"#,
    ),
];

fn slugify(value: &str) -> String {
    let mut slug = value
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    slug.trim_matches('-').to_string()
}

fn parse_list(value: &str) -> Vec<String> {
    value
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .map(|item| item.trim().trim_matches(['\'', '"']).to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn parse_host(markdown: &str, relative_path: String) -> AppResult<InterviewHost> {
    let mut lines = markdown.lines();
    if lines.next() != Some("---") {
        return Err(AppError::InvalidInterview(format!(
            "host {relative_path} is missing Markdown frontmatter"
        )));
    }
    let mut metadata = HashMap::new();
    let mut body = Vec::new();
    let mut in_body = false;
    for line in lines {
        if !in_body && line.trim() == "---" {
            in_body = true;
            continue;
        }
        if in_body {
            body.push(line);
        } else if let Some((key, value)) = line.split_once(':') {
            metadata.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    let required = |key: &str| {
        metadata
            .get(key)
            .cloned()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                AppError::InvalidInterview(format!("host {relative_path} is missing {key}"))
            })
    };
    Ok(InterviewHost {
        id: required("id")?,
        name: required("name")?,
        description: required("description")?,
        traits: metadata
            .get("traits")
            .map(|value| parse_list(value))
            .unwrap_or_default(),
        stages: metadata
            .get("stages")
            .map(|value| parse_list(value))
            .unwrap_or_default(),
        relative_path,
        instructions: body.join("\n").trim().to_string(),
        built_in: metadata
            .get("built_in")
            .is_some_and(|value| value == "true"),
    })
}

fn host_markdown(host: &SaveInterviewHostInput, id: &str) -> String {
    format!(
        "---\nid: {id}\nname: {}\ndescription: {}\ntraits: [{}]\nstages: [{}]\nbuilt_in: false\n---\n{}\n",
        host.name.trim(),
        host.description.trim().replace('\n', " "),
        host.traits.join(", "),
        host.stages.join(", "),
        host.instructions.trim()
    )
}

pub fn seed_default_hosts(brain: &Path) -> AppResult<()> {
    let directory = brain.join("hosts");
    fs::create_dir_all(&directory)?;
    for (filename, markdown) in DEFAULT_HOSTS {
        let path = directory.join(filename);
        if !path.exists() {
            fs::write(path, markdown)?;
        }
    }
    Ok(())
}

pub fn list_hosts(brain: &Path) -> AppResult<Vec<InterviewHost>> {
    seed_default_hosts(brain)?;
    let mut hosts = Vec::new();
    for entry in fs::read_dir(brain.join("hosts"))? {
        let path = entry?.path();
        if path.is_symlink()
            || !matches!(
                path.extension()
                    .and_then(|value| value.to_str())
                    .map(str::to_lowercase)
                    .as_deref(),
                Some("md" | "markdown")
            )
        {
            continue;
        }
        let relative_path = path
            .strip_prefix(brain)
            .map_err(|_| AppError::InvalidBrain("host escaped the brain folder".into()))?
            .to_string_lossy()
            .to_string();
        if let Ok(host) = parse_host(&fs::read_to_string(path)?, relative_path) {
            hosts.push(host);
        }
    }
    hosts.sort_by(|left, right| {
        right
            .built_in
            .cmp(&left.built_in)
            .then(left.name.cmp(&right.name))
    });
    Ok(hosts)
}

pub fn save_host(brain: &Path, input: &SaveInterviewHostInput) -> AppResult<InterviewHost> {
    let name = input.name.trim();
    if name.is_empty()
        || name.chars().count() > 80
        || name.contains(['\n', '\r'])
        || input.instructions.trim().is_empty()
    {
        return Err(AppError::InvalidInterview(
            "a host needs a one-line name up to 80 characters and non-empty instructions".into(),
        ));
    }
    if input
        .traits
        .iter()
        .chain(input.stages.iter())
        .any(|value| value.contains(['\n', '\r']))
    {
        return Err(AppError::InvalidInterview(
            "host traits and stages must stay on one line".into(),
        ));
    }
    let requested_id = input
        .id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| slugify(&input.name));
    let id = slugify(&requested_id);
    if id.is_empty() {
        return Err(AppError::InvalidInterview("host id cannot be empty".into()));
    }
    if let Some(existing) = list_hosts(brain)?.into_iter().find(|host| host.id == id) {
        if existing.built_in {
            return Err(AppError::InvalidInterview(
                "built-in hosts are seeded defaults; duplicate one to customize it".into(),
            ));
        }
    }
    let path = brain.join("hosts").join(format!("{id}.md"));
    fs::write(&path, host_markdown(input, &id))?;
    parse_host(&fs::read_to_string(&path)?, format!("hosts/{id}.md"))
}

fn session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<InterviewSession> {
    let selected_paths: String = row.get(5)?;
    Ok(InterviewSession {
        id: row.get(0)?,
        title: row.get(1)?,
        host_id: row.get(2)?,
        host_name: row.get(3)?,
        scope: row.get(4)?,
        selected_paths: serde_json::from_str(&selected_paths).unwrap_or_default(),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        status: row.get(8)?,
        folder_path: row.get(9)?,
        relative_folder: row.get(10)?,
        provider: row.get(11)?,
        model: row.get(12)?,
    })
}

fn turn_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<InterviewTurn> {
    let citations: String = row.get(7)?;
    Ok(InterviewTurn {
        id: row.get(0)?,
        interview_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
        audio_path: row.get(5)?,
        audio_mime_type: row.get(6)?,
        citations: serde_json::from_str(&citations).unwrap_or_default(),
        stage: row.get(8)?,
        analysis: row.get(9)?,
        status: row.get(10)?,
    })
}

fn insert_turn(connection: &rusqlite::Connection, turn: &InterviewTurn) -> AppResult<()> {
    connection.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, audio_path,
         audio_mime_type, citations_json, stage, analysis, status, provider, model,
         general_knowledge_used)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
           CASE WHEN ?3 = 'user' THEN 'user' ELSE (SELECT provider FROM conversations WHERE id = ?2) END,
           CASE WHEN ?3 = 'user' THEN 'human' ELSE (SELECT model FROM conversations WHERE id = ?2) END,
           0)",
        params![
            turn.id,
            turn.interview_id,
            turn.role,
            turn.content,
            turn.created_at,
            turn.audio_path,
            turn.audio_mime_type,
            serde_json::to_string(&turn.citations)?,
            turn.stage,
            turn.analysis,
            turn.status
        ],
    )?;
    Ok(())
}

pub fn list_interviews(brain: &Path) -> AppResult<Vec<InterviewSession>> {
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, title, host_id, host_name, scope, selected_paths_json, created_at, updated_at,
         status, folder_path, relative_folder, provider, model FROM conversations
         WHERE kind = 'interview' ORDER BY updated_at DESC",
    )?;
    let rows = statement.query_map([], session_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn recover_interrupted_audio_turns(brain: &Path) -> AppResult<usize> {
    let connection = storage::open_database(brain)?;
    Ok(connection.execute(
        "UPDATE messages SET status = 'interrupted', content = '[Recording interrupted before audio was saved]'
         WHERE status = 'recording' AND conversation_id IN
         (SELECT id FROM conversations WHERE kind = 'interview')",
        [],
    )?)
}

fn get_interview(brain: &Path, id: &str) -> AppResult<InterviewSession> {
    list_interviews(brain)?
        .into_iter()
        .find(|interview| interview.id == id)
        .ok_or_else(|| AppError::MissingInterview(id.to_string()))
}

pub fn rename_interview(brain: &Path, id: &str, title: &str) -> AppResult<InterviewSession> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 120 || title.contains(['\n', '\r']) {
        return Err(AppError::InvalidInterview(
            "an interview title must be one line and no more than 120 characters".into(),
        ));
    }
    let original = get_interview(brain, id)?;
    let connection = storage::open_database(brain)?;
    connection.execute(
        "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3 AND kind = 'interview'",
        params![title, Utc::now().to_rfc3339(), id],
    )?;
    let updated = get_interview(brain, id)?;
    if let Err(error) = persist_interview_files(brain, &updated) {
        let _ = connection.execute(
            "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3 AND kind = 'interview'",
            params![original.title, original.updated_at, id],
        );
        let _ = persist_interview_files(brain, &original);
        return Err(error);
    }
    Ok(updated)
}

pub fn export_interview(brain: &Path, id: &str) -> AppResult<PathBuf> {
    let interview = get_interview(brain, id)?;
    persist_interview_files(brain, &interview)?;
    let directory = brain.join("exports");
    fs::create_dir_all(&directory)?;
    let path = directory.join(format!("interview-{}.md", &id[..8.min(id.len())]));
    let transcript = fs::read_to_string(Path::new(&interview.folder_path).join("transcript.md"))?;
    fs::write(
        &path,
        format!(
            "---\ntype: interview-export\nid: {}\nhost: {}\nscope: {}\ncreated_at: {}\nexported_at: {}\nprovider: {}\nmodel: {}\n---\n\n{}",
            interview.id,
            interview.host_name,
            interview.scope,
            interview.created_at,
            Utc::now().to_rfc3339(),
            interview.provider,
            interview.model,
            transcript
        ),
    )?;
    Ok(path)
}

pub fn trash_interview(brain: &Path, id: &str, trash: &Path) -> AppResult<()> {
    let interview = get_interview(brain, id)?;
    let folder = PathBuf::from(&interview.folder_path);
    if !folder.starts_with(brain) || !folder.is_dir() {
        return Err(AppError::InvalidInterview(
            "the interview folder is missing or outside the active brain".into(),
        ));
    }
    fs::create_dir_all(trash)?;
    let base = format!("Burrowise Interview {}", &id[..8.min(id.len())]);
    let mut destination = trash.join(&base);
    let mut suffix = 2;
    while destination.exists() {
        destination = trash.join(format!("{base} {suffix}"));
        suffix += 1;
    }
    fs::rename(&folder, &destination)?;
    let result = (|| -> AppResult<()> {
        let connection = storage::open_database(brain)?;
        let transaction = connection.unchecked_transaction()?;
        transaction.execute("DELETE FROM knowledge_access_log WHERE conversation_id = ?1", [id])?;
        transaction.execute("DELETE FROM messages WHERE conversation_id = ?1", [id])?;
        let changed = transaction.execute("DELETE FROM conversations WHERE id = ?1 AND kind = 'interview'", [id])?;
        if changed == 0 {
            return Err(AppError::MissingInterview(id.into()));
        }
        transaction.commit()?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::rename(&destination, &folder);
        return Err(error);
    }
    Ok(())
}

pub fn list_turns(brain: &Path, interview_id: &str) -> AppResult<Vec<InterviewTurn>> {
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, conversation_id, role, content, created_at, audio_path, audio_mime_type,
         citations_json, stage, analysis, status FROM messages
         WHERE conversation_id = ?1 ORDER BY created_at ASC, rowid ASC",
    )?;
    let rows = statement.query_map([interview_id], turn_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn persist_interview_files(brain: &Path, interview: &InterviewSession) -> AppResult<()> {
    let folder = Path::new(&interview.folder_path);
    let turns = list_turns(brain, &interview.id)?;
    let transcript = turns
        .iter()
        .map(|turn| {
            let speaker = if turn.role == "host" {
                &interview.host_name
            } else {
                "You"
            };
            let sources = if turn.citations.is_empty() {
                String::new()
            } else {
                format!(
                    "\n\nSources: {}",
                    turn.citations
                        .iter()
                        .map(|citation| format!("[{}] {}", citation.number, citation.relative_path))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            };
            format!(
                "## {speaker}\n\n{}{}",
                if turn.content.is_empty() {
                    "_[Awaiting transcript]_"
                } else {
                    &turn.content
                },
                sources
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    fs::write(
        folder.join("transcript.md"),
        format!("# {}\n\n{transcript}\n", interview.title),
    )?;
    fs::write(
        folder.join("session.md"),
        format!(
            "---\nid: {}\ntype: interview\nhost: {}\nscope: {}\nstatus: {}\ncreated_at: {}\nupdated_at: {}\n---\n\n# {}\n\nProvider: `{}` · Model: `{}`\n",
            interview.id,
            interview.host_name,
            interview.scope,
            interview.status,
            interview.created_at,
            interview.updated_at,
            interview.title,
            interview.provider,
            interview.model
        ),
    )?;
    fs::write(
        folder.join("session.json"),
        serde_json::to_vec_pretty(interview)?,
    )?;
    Ok(())
}

fn initial_question(host: &InterviewHost) -> String {
    let stage = host.stages.first().map(String::as_str).unwrap_or("context");
    format!(
        "I’m your {} host. We’ll take this one question at a time, and I’ll only read the knowledge scope you selected. What idea would you like to explore, and why does it matter to you now?",
        stage
    )
}

pub fn start(brain: &Path, input: &StartInterviewInput) -> AppResult<InterviewStart> {
    start_with_model(
        brain,
        input,
        &ModelSelection {
            provider_id: PROVIDER.into(),
            model_id: MODEL.into(),
        },
        None,
    )
}

pub fn start_with_model(
    brain: &Path,
    input: &StartInterviewInput,
    selection: &ModelSelection,
    generated_opening: Option<String>,
) -> AppResult<InterviewStart> {
    if !["session", "selected", "all"].contains(&input.scope.as_str()) {
        return Err(AppError::InvalidInterview(
            "unsupported knowledge scope".into(),
        ));
    }
    if input.scope == "selected" && input.selected_paths.is_empty() {
        return Err(AppError::InvalidInterview(
            "select at least one note for this knowledge scope".into(),
        ));
    }
    let host = list_hosts(brain)?
        .into_iter()
        .find(|host| host.id == input.host_id)
        .ok_or_else(|| AppError::MissingInterviewHost(input.host_id.clone()))?;
    let id = Uuid::new_v4().to_string();
    let now_utc = Utc::now();
    let local: DateTime<Local> = DateTime::from(now_utc);
    let relative_folder = format!(
        "sessions/{}-interview-{}",
        local.format("%Y-%m-%d"),
        &id[..8]
    );
    let folder = brain.join(&relative_folder);
    fs::create_dir_all(folder.join("audio"))?;
    let timestamp = now_utc.to_rfc3339();
    let interview = InterviewSession {
        id: id.clone(),
        title: format!("Interview with {}", host.name),
        host_id: host.id.clone(),
        host_name: host.name.clone(),
        scope: input.scope.clone(),
        selected_paths: input.selected_paths.clone(),
        created_at: timestamp.clone(),
        updated_at: timestamp.clone(),
        status: "active".into(),
        folder_path: folder.to_string_lossy().to_string(),
        relative_folder,
        provider: selection.provider_id.clone(),
        model: selection.model_id.clone(),
    };
    let host_turn = InterviewTurn {
        id: Uuid::new_v4().to_string(),
        interview_id: id,
        role: "host".into(),
        content: generated_opening.unwrap_or_else(|| initial_question(&host)),
        created_at: timestamp,
        audio_path: None,
        audio_mime_type: None,
        citations: Vec::new(),
        stage: host
            .stages
            .first()
            .cloned()
            .unwrap_or_else(|| "context".into()),
        analysis: "Opening question · no knowledge accessed".into(),
        status: "complete".into(),
    };
    let connection = storage::open_database(brain)?;
    connection.execute(
        "INSERT INTO conversations (id, kind, title, host_id, host_name, scope, selected_paths_json,
         created_at, updated_at, status, folder_path, relative_folder, provider, model, preview)
         VALUES (?1, 'interview', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, '')",
        params![
            interview.id,
            interview.title,
            interview.host_id,
            interview.host_name,
            interview.scope,
            serde_json::to_string(&interview.selected_paths)?,
            interview.created_at,
            interview.updated_at,
            interview.status,
            interview.folder_path,
            interview.relative_folder,
            interview.provider,
            interview.model
        ],
    )?;
    insert_turn(&connection, &host_turn)?;
    persist_interview_files(brain, &interview)?;
    Ok(InterviewStart {
        interview,
        host_turn,
    })
}

fn stage_question(stage: &str, host: &InterviewHost) -> &'static str {
    let stage = stage.to_lowercase();
    if stage.contains("evidence") {
        "What concrete evidence supports that, and what evidence might challenge it?"
    } else if stage.contains("contradiction") || stage.contains("assumption") {
        "Which assumption here is least certain, and what would change your mind?"
    } else if stage.contains("alternative") {
        "What is the strongest alternative explanation or approach you have considered?"
    } else if stage.contains("commitment") || stage.contains("implication") {
        "What specific next step follows from this, and how will you know it worked?"
    } else if stage.contains("scene") || stage.contains("example") {
        "Can you take me into one concrete moment when this became clear?"
    } else if stage.contains("tension") || stage.contains("problem") {
        "Where is the real tension or cost, and who feels it most?"
    } else if stage.contains("definition") || stage.contains("fundamental") {
        "If we remove the usual labels, what is the most basic truth or constraint here?"
    } else if host.id.contains("challenger") {
        "What part of that claim would a thoughtful skeptic push back on?"
    } else {
        "What feels most important to unpack next, and can you make it more concrete?"
    }
}

fn short_quote(value: &str) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= 190 {
        compact
    } else {
        format!("{}…", compact.chars().take(187).collect::<String>())
    }
}

fn respond_to_user(
    brain: &Path,
    interview: &InterviewSession,
    user_turn: InterviewTurn,
    user_is_persisted: bool,
    retrieval_limit: usize,
) -> AppResult<InterviewExchange> {
    respond_to_user_inner(
        brain,
        interview,
        user_turn,
        user_is_persisted,
        retrieval_limit,
        Option::<fn(&str, &str) -> AppResult<String>>::None,
    )
}

fn respond_to_user_with_provider<F>(
    brain: &Path,
    interview: &InterviewSession,
    user_turn: InterviewTurn,
    user_is_persisted: bool,
    retrieval_limit: usize,
    generate: F,
) -> AppResult<InterviewExchange>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    respond_to_user_inner(
        brain,
        interview,
        user_turn,
        user_is_persisted,
        retrieval_limit,
        Some(generate),
    )
}

fn respond_to_user_inner<F>(
    brain: &Path,
    interview: &InterviewSession,
    user_turn: InterviewTurn,
    user_is_persisted: bool,
    retrieval_limit: usize,
    generate: Option<F>,
) -> AppResult<InterviewExchange>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    let host = list_hosts(brain)?
        .into_iter()
        .find(|host| host.id == interview.host_id)
        .ok_or_else(|| AppError::MissingInterviewHost(interview.host_id.clone()))?;
    let user_count = list_turns(brain, &interview.id)?
        .iter()
        .filter(|turn| turn.role == "user" && turn.status == "complete")
        .count()
        + usize::from(!user_is_persisted);
    let stage = host
        .stages
        .get(user_count.saturating_sub(1) % host.stages.len().max(1))
        .cloned()
        .unwrap_or_else(|| "exploration".into());
    let citations = conversation::retrieve(
        brain,
        &user_turn.content,
        &conversation::RetrievalPolicy {
            scope: interview.scope.clone(),
            selected_paths: interview.selected_paths.clone(),
            limit: retrieval_limit.clamp(3, 30),
            passages_per_source: 2,
        },
    )?;
    let lead = citations.first().map_or_else(
        || {
            "I didn’t read a matching note for that turn, so I’ll stay with what you just said."
                .to_string()
        },
        |citation| {
            format!(
                "A related note says, “{}” [1]",
                short_quote(&citation.quote)
            )
        },
    );
    let generated_content = if let Some(generate) = generate {
        let sources = conversation::scoped_sources(&citations);
        let system = format!(
            "You are the interview host named {}. Host instructions: {}. Current stage: {}. Respond briefly with useful reflection, then ask exactly one probing question. Cite supplied notes with [n]. Do not claim access to anything outside the supplied scope.",
            host.name, host.instructions, stage
        );
        let prompt = format!(
            "THE USER SAID:\n{}\n\nSCOPED KNOWLEDGE:\n{}",
            user_turn.content, sources
        );
        Some(generate(&system, &prompt)?)
    } else {
        None
    };
    let host_turn = InterviewTurn {
        id: Uuid::new_v4().to_string(),
        interview_id: interview.id.clone(),
        role: "host".into(),
        content: generated_content
            .unwrap_or_else(|| format!("{lead}\n\n{}", stage_question(&stage, &host))),
        created_at: Utc::now().to_rfc3339(),
        audio_path: None,
        audio_mime_type: None,
        citations,
        stage: stage.clone(),
        analysis: format!("Stage: {stage} · read-only retrieval · one question"),
        status: "complete".into(),
    };
    let connection = storage::open_database(brain)?;
    let transaction = connection.unchecked_transaction()?;
    if !user_is_persisted {
        insert_turn(&transaction, &user_turn)?;
    }
    insert_turn(&transaction, &host_turn)?;
    for citation in &host_turn.citations {
        transaction.execute(
            "INSERT INTO knowledge_access_log (id, conversation_id, message_id, passage_id, title, relative_path, quote, accessed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![Uuid::new_v4().to_string(), interview.id, host_turn.id, citation.passage_id, citation.title, citation.relative_path, citation.quote, host_turn.created_at],
        )?;
    }
    transaction.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2 AND kind = 'interview'",
        params![host_turn.created_at, interview.id],
    )?;
    transaction.commit()?;
    let updated = get_interview(brain, &interview.id)?;
    persist_interview_files(brain, &updated)?;
    Ok(InterviewExchange {
        interview: updated,
        user_turn,
        host_turn,
    })
}

pub fn send_turn(brain: &Path, input: &SendInterviewTurnInput) -> AppResult<InterviewExchange> {
    send_turn_inner(
        brain,
        input,
        Option::<fn(&str, &str) -> AppResult<String>>::None,
    )
}

pub fn send_turn_with_provider<F>(
    brain: &Path,
    input: &SendInterviewTurnInput,
    generate: F,
) -> AppResult<InterviewExchange>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    send_turn_inner(brain, input, Some(generate))
}

fn send_turn_inner<F>(
    brain: &Path,
    input: &SendInterviewTurnInput,
    generate: Option<F>,
) -> AppResult<InterviewExchange>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    if input.message.trim().is_empty() {
        return Err(AppError::InvalidInterview(
            "interview turn cannot be empty".into(),
        ));
    }
    let interview = get_interview(brain, &input.interview_id)?;
    if interview.status != "active" {
        return Err(AppError::InvalidInterview(
            "this interview has ended".into(),
        ));
    }
    let user_turn = InterviewTurn {
        id: Uuid::new_v4().to_string(),
        interview_id: interview.id.clone(),
        role: "user".into(),
        content: input.message.trim().to_string(),
        created_at: Utc::now().to_rfc3339(),
        audio_path: None,
        audio_mime_type: None,
        citations: Vec::new(),
        stage: String::new(),
        analysis: String::new(),
        status: "complete".into(),
    };
    if let Some(generate) = generate {
        respond_to_user_with_provider(
            brain,
            &interview,
            user_turn,
            false,
            input.retrieval_limit,
            generate,
        )
    } else {
        respond_to_user(brain, &interview, user_turn, false, input.retrieval_limit)
    }
}

pub fn begin_audio_turn(brain: &Path, interview_id: &str) -> AppResult<InterviewTurn> {
    let interview = get_interview(brain, interview_id)?;
    if interview.status != "active" {
        return Err(AppError::InvalidInterview(
            "this interview has ended".into(),
        ));
    }
    let turn = InterviewTurn {
        id: Uuid::new_v4().to_string(),
        interview_id: interview.id.clone(),
        role: "user".into(),
        content: String::new(),
        created_at: Utc::now().to_rfc3339(),
        audio_path: None,
        audio_mime_type: None,
        citations: Vec::new(),
        stage: String::new(),
        analysis: "Original audio is preserved; transcript confirmation is required.".into(),
        status: "recording".into(),
    };
    let connection = storage::open_database(brain)?;
    insert_turn(&connection, &turn)?;
    persist_interview_files(brain, &interview)?;
    Ok(turn)
}

fn audio_extension(mime_type: &str) -> &'static str {
    if mime_type.contains("mp4") || mime_type.contains("m4a") {
        "m4a"
    } else if mime_type.contains("ogg") {
        "ogg"
    } else if mime_type.contains("wav") {
        "wav"
    } else {
        "webm"
    }
}

pub fn save_turn_audio(
    brain: &Path,
    interview_id: &str,
    turn_id: &str,
    mime_type: &str,
    bytes: &[u8],
) -> AppResult<InterviewTurn> {
    let interview = get_interview(brain, interview_id)?;
    let connection = storage::open_database(brain)?;
    let exists: Option<String> = connection
        .query_row(
            "SELECT id FROM messages WHERE id = ?1 AND conversation_id = ?2 AND role = 'user'",
            params![turn_id, interview_id],
            |row| row.get(0),
        )
        .optional()?;
    if exists.is_none() {
        return Err(AppError::MissingInterviewTurn(turn_id.into()));
    }
    if bytes.len() <= 44 {
        connection.execute(
            "UPDATE messages SET status = 'audio_failed', content = '[Recording contained no usable audio]' WHERE id = ?1",
            [turn_id],
        )?;
        return Err(AppError::InvalidInterview(
            "the recording contained no usable audio; hold the button and try again".into(),
        ));
    }
    let audio_path = Path::new(&interview.folder_path)
        .join("audio")
        .join(format!("{turn_id}.{}", audio_extension(mime_type)));
    fs::write(&audio_path, bytes)?;
    connection.execute(
        "UPDATE messages SET audio_path = ?1, audio_mime_type = ?2, status = 'awaiting_transcript' WHERE id = ?3",
        params![audio_path.to_string_lossy(), mime_type, turn_id],
    )?;
    let turn = list_turns(brain, interview_id)?
        .into_iter()
        .find(|turn| turn.id == turn_id)
        .ok_or_else(|| AppError::MissingInterviewTurn(turn_id.into()))?;
    persist_interview_files(brain, &interview)?;
    Ok(turn)
}

pub fn complete_audio(
    brain: &Path,
    input: &CompleteInterviewAudioInput,
) -> AppResult<InterviewExchange> {
    complete_audio_inner(
        brain,
        input,
        Option::<fn(&str, &str) -> AppResult<String>>::None,
    )
}

pub fn complete_audio_with_provider<F>(
    brain: &Path,
    input: &CompleteInterviewAudioInput,
    generate: F,
) -> AppResult<InterviewExchange>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    complete_audio_inner(brain, input, Some(generate))
}

fn complete_audio_inner<F>(
    brain: &Path,
    input: &CompleteInterviewAudioInput,
    generate: Option<F>,
) -> AppResult<InterviewExchange>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    if input.transcript.trim().is_empty() {
        return Err(AppError::InvalidInterview(
            "confirm or enter a transcript before continuing".into(),
        ));
    }
    let interview = get_interview(brain, &input.interview_id)?;
    let connection = storage::open_database(brain)?;
    let changed = connection.execute(
        "UPDATE messages SET content = ?1, status = 'complete' WHERE id = ?2 AND conversation_id = ?3 AND role = 'user'",
        params![input.transcript.trim(), input.turn_id, input.interview_id],
    )?;
    if changed == 0 {
        return Err(AppError::MissingInterviewTurn(input.turn_id.clone()));
    }
    let user_turn = list_turns(brain, &input.interview_id)?
        .into_iter()
        .find(|turn| turn.id == input.turn_id)
        .ok_or_else(|| AppError::MissingInterviewTurn(input.turn_id.clone()))?;
    if let Some(generate) = generate {
        respond_to_user_with_provider(brain, &interview, user_turn, true, 10, generate)
    } else {
        respond_to_user(brain, &interview, user_turn, true, 10)
    }
}

pub fn process_audio(
    brain: &Path,
    input: &ProcessInterviewAudioInput,
    provider: &str,
) -> AppResult<InterviewExchange> {
    let completed = transcribe_audio_input(brain, input, provider)?;
    complete_audio(brain, &completed)
}

pub fn process_audio_with_provider<F>(
    brain: &Path,
    input: &ProcessInterviewAudioInput,
    transcription_provider: &str,
    generate: F,
) -> AppResult<InterviewExchange>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    let completed = transcribe_audio_input(brain, input, transcription_provider)?;
    complete_audio_with_provider(brain, &completed, generate)
}

fn transcribe_audio_input(
    brain: &Path,
    input: &ProcessInterviewAudioInput,
    provider: &str,
) -> AppResult<CompleteInterviewAudioInput> {
    let turn = list_turns(brain, &input.interview_id)?
        .into_iter()
        .find(|turn| turn.id == input.turn_id && turn.role == "user")
        .ok_or_else(|| AppError::MissingInterviewTurn(input.turn_id.clone()))?;
    if turn.status != "awaiting_transcript" {
        return Err(AppError::InvalidInterview(
            "this voice turn is not awaiting transcription".into(),
        ));
    }
    let audio_path = turn
        .audio_path
        .as_deref()
        .map(Path::new)
        .filter(|path| path.exists())
        .ok_or_else(|| {
            AppError::InvalidInterview("the original voice-turn audio is unavailable".into())
        })?;
    let transcript = match provider {
        "apple-speech" => transcription::transcribe_file(audio_path, "en-US")?,
        "none" => {
            return Err(AppError::UnsupportedProvider(
                "automatic transcription is disabled; enter the transcript manually".into(),
            ))
        }
        "parakeet" => transcription::transcribe_parakeet(audio_path)?,
        other => return Err(AppError::UnsupportedProvider(other.into())),
    };
    Ok(CompleteInterviewAudioInput {
        interview_id: input.interview_id.clone(),
        turn_id: input.turn_id.clone(),
        transcript,
    })
}

pub fn list_access_log(brain: &Path, interview_id: &str) -> AppResult<Vec<InterviewAccessEntry>> {
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, conversation_id, message_id, passage_id, title, relative_path, quote, accessed_at
         FROM knowledge_access_log WHERE conversation_id = ?1 ORDER BY accessed_at DESC, rowid DESC",
    )?;
    let rows = statement.query_map([interview_id], |row| {
        Ok(InterviewAccessEntry {
            id: row.get(0)?,
            interview_id: row.get(1)?,
            turn_id: row.get(2)?,
            passage_id: row.get(3)?,
            title: row.get(4)?,
            relative_path: row.get(5)?,
            quote: row.get(6)?,
            accessed_at: row.get(7)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn end(brain: &Path, interview_id: &str) -> AppResult<InterviewSession> {
    let now = Utc::now().to_rfc3339();
    let connection = storage::open_database(brain)?;
    let changed = connection.execute(
        "UPDATE conversations SET status = 'complete', updated_at = ?1 WHERE id = ?2 AND kind = 'interview'",
        params![now, interview_id],
    )?;
    if changed == 0 {
        return Err(AppError::MissingInterview(interview_id.into()));
    }
    let interview = get_interview(brain, interview_id)?;
    persist_interview_files(brain, &interview)?;
    Ok(interview)
}

pub fn resume(brain: &Path, interview_id: &str) -> AppResult<InterviewSession> {
    let now = Utc::now().to_rfc3339();
    let connection = storage::open_database(brain)?;
    let changed = connection.execute(
        "UPDATE conversations SET status = 'active', updated_at = ?1
         WHERE id = ?2 AND kind = 'interview'",
        params![now, interview_id],
    )?;
    if changed == 0 {
        return Err(AppError::MissingInterview(interview_id.into()));
    }
    let interview = get_interview(brain, interview_id)?;
    persist_interview_files(brain, &interview)?;
    Ok(interview)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn brain() -> tempfile::TempDir {
        let temporary = tempfile::tempdir().expect("temporary brain");
        for directory in ["sessions", "notes", "review", "hosts"] {
            fs::create_dir_all(temporary.path().join(directory)).expect("brain directory");
        }
        temporary
    }

    #[test]
    fn seeds_and_saves_markdown_hosts() {
        let temporary = brain();
        let hosts = list_hosts(temporary.path()).expect("hosts");
        assert!(hosts.len() >= 5);
        assert!(hosts
            .iter()
            .all(|host| temporary.path().join(&host.relative_path).exists()));
        let custom = save_host(
            temporary.path(),
            &SaveInterviewHostInput {
                id: None,
                name: "Gentle skeptic".into(),
                description: "Tests ideas with care".into(),
                traits: vec!["gentle".into()],
                stages: vec!["claim".into(), "evidence".into()],
                instructions: "Ask one question at a time.".into(),
            },
        )
        .expect("custom host");
        assert_eq!(custom.id, "gentle-skeptic");
        assert!(!custom.built_in);
        assert!(save_host(
            temporary.path(),
            &SaveInterviewHostInput {
                id: None,
                name: "Broken\nHost".into(),
                description: String::new(),
                traits: vec![],
                stages: vec![],
                instructions: "Ask a question.".into(),
            },
        )
        .is_err());
    }

    #[test]
    fn persists_interview_turns_citations_access_log_and_audio() {
        let temporary = brain();
        fs::write(
            temporary.path().join("notes/privacy.md"),
            "# Privacy boundary\n\nCloud fallback requires explicit confirmation and local capture saves first.",
        )
        .expect("note");
        search::rebuild_index(temporary.path()).expect("index");
        let started = start(
            temporary.path(),
            &StartInterviewInput {
                host_id: "friendly-challenger".into(),
                scope: "all".into(),
                selected_paths: Vec::new(),
            },
        )
        .expect("start");
        let exchange = send_turn(
            temporary.path(),
            &SendInterviewTurnInput {
                interview_id: started.interview.id.clone(),
                message: "Cloud fallback should always need confirmation.".into(),
                retrieval_limit: 10,
            },
        )
        .expect("turn");
        assert!(!exchange.host_turn.citations.is_empty());
        assert!(exchange.host_turn.content.ends_with('?'));
        assert_eq!(
            list_access_log(temporary.path(), &started.interview.id)
                .expect("log")
                .len(),
            exchange.host_turn.citations.len()
        );

        let pending =
            begin_audio_turn(temporary.path(), &started.interview.id).expect("audio turn");
        let saved = save_turn_audio(
            temporary.path(),
            &started.interview.id,
            &pending.id,
            "audio/wav",
            &[1_u8; 96],
        )
        .expect("audio");
        assert_eq!(saved.status, "awaiting_transcript");
        assert!(Path::new(saved.audio_path.as_deref().expect("audio path")).exists());
        let automatic = process_audio(
            temporary.path(),
            &ProcessInterviewAudioInput {
                interview_id: started.interview.id.clone(),
                turn_id: pending.id.clone(),
            },
            "none",
        );
        assert!(automatic.is_err());
        assert_eq!(
            list_turns(temporary.path(), &started.interview.id)
                .expect("turns")
                .into_iter()
                .find(|turn| turn.id == pending.id)
                .expect("pending turn")
                .status,
            "awaiting_transcript"
        );
        complete_audio(
            temporary.path(),
            &CompleteInterviewAudioInput {
                interview_id: started.interview.id.clone(),
                turn_id: pending.id,
                transcript: "A confirmed transcript.".into(),
            },
        )
        .expect("complete audio");
        let transcript =
            fs::read_to_string(Path::new(&started.interview.folder_path).join("transcript.md"))
                .expect("transcript");
        assert!(transcript.contains("A confirmed transcript."));

        let interrupted =
            begin_audio_turn(temporary.path(), &started.interview.id).expect("interrupted turn");
        assert_eq!(
            recover_interrupted_audio_turns(temporary.path()).expect("recover"),
            1
        );
        assert_eq!(
            list_turns(temporary.path(), &started.interview.id)
                .expect("recovered turns")
                .into_iter()
                .find(|turn| turn.id == interrupted.id)
                .expect("interrupted")
                .status,
            "interrupted"
        );

        let empty = begin_audio_turn(temporary.path(), &started.interview.id).expect("empty turn");
        assert!(save_turn_audio(
            temporary.path(),
            &started.interview.id,
            &empty.id,
            "audio/wav",
            &[0_u8; 44]
        )
        .is_err());
        assert_eq!(
            list_turns(temporary.path(), &started.interview.id)
                .expect("failed turns")
                .into_iter()
                .find(|turn| turn.id == empty.id)
                .expect("failed")
                .status,
            "audio_failed"
        );
    }

    #[test]
    fn failed_host_lookup_does_not_persist_a_partial_typed_turn() {
        let temporary = brain();
        let custom = save_host(
            temporary.path(),
            &SaveInterviewHostInput {
                id: None,
                name: "Temporary host".into(),
                description: "Removed during the session".into(),
                traits: vec!["focused".into()],
                stages: vec!["context".into()],
                instructions: "Ask one question.".into(),
            },
        )
        .expect("custom host");
        let started = start(
            temporary.path(),
            &StartInterviewInput {
                host_id: custom.id,
                scope: "session".into(),
                selected_paths: vec![],
            },
        )
        .expect("start");
        fs::remove_file(temporary.path().join(custom.relative_path))
            .expect("remove host externally");

        assert!(send_turn(
            temporary.path(),
            &SendInterviewTurnInput {
                interview_id: started.interview.id.clone(),
                message: "This must not persist alone.".into(),
                retrieval_limit: 10,
            },
        )
        .is_err());
        let turns = list_turns(temporary.path(), &started.interview.id).expect("turns");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].role, "host");
    }

    #[test]
    fn interview_lifecycle_updates_files_exports_and_uses_recoverable_trash() {
        let temporary = brain();
        let trash = temporary.path().join("test-trash");
        let started = start(
            temporary.path(),
            &StartInterviewInput {
                host_id: "open-ended-explorer".into(),
                scope: "session".into(),
                selected_paths: vec![],
            },
        )
        .expect("start");
        let folder = PathBuf::from(&started.interview.folder_path);
        let renamed = rename_interview(temporary.path(), &started.interview.id, "A lasting interview")
            .expect("rename");
        assert_eq!(renamed.title, "A lasting interview");
        assert!(fs::read_to_string(folder.join("session.md"))
            .expect("session markdown")
            .contains("# A lasting interview"));
        assert!(fs::read_to_string(folder.join("transcript.md"))
            .expect("transcript markdown")
            .contains("# A lasting interview"));

        let export = export_interview(temporary.path(), &started.interview.id).expect("export");
        assert!(fs::read_to_string(export)
            .expect("export markdown")
            .contains("type: interview-export"));

        trash_interview(temporary.path(), &started.interview.id, &trash).expect("trash");
        assert!(!folder.exists());
        assert_eq!(fs::read_dir(&trash).expect("trash entries").count(), 1);
        assert!(list_interviews(temporary.path()).expect("interviews").is_empty());
        assert!(list_turns(temporary.path(), &started.interview.id)
            .expect("turns")
            .is_empty());
    }

    #[test]
    fn completed_interview_can_resume_the_same_conversation() {
        let temporary = brain();
        let started = start(
            temporary.path(),
            &StartInterviewInput {
                host_id: "open-ended-explorer".into(),
                scope: "session".into(),
                selected_paths: vec![],
            },
        )
        .expect("start");

        let completed = end(temporary.path(), &started.interview.id).expect("end");
        assert_eq!(completed.status, "complete");
        assert!(send_turn(
            temporary.path(),
            &SendInterviewTurnInput {
                interview_id: started.interview.id.clone(),
                message: "This should wait until the interview is resumed.".into(),
                retrieval_limit: 10,
            },
        )
        .is_err());

        let resumed = resume(temporary.path(), &started.interview.id).expect("resume");
        assert_eq!(resumed.id, started.interview.id);
        assert_eq!(resumed.status, "active");
        let exchange = send_turn(
            temporary.path(),
            &SendInterviewTurnInput {
                interview_id: resumed.id.clone(),
                message: "Continue from the same thread.".into(),
                retrieval_limit: 10,
            },
        )
        .expect("continued turn");
        assert_eq!(exchange.interview.id, started.interview.id);
        assert_eq!(
            list_turns(temporary.path(), &started.interview.id)
                .expect("turns")
                .len(),
            3
        );
        assert!(fs::read_to_string(
            Path::new(&resumed.folder_path).join("transcript.md")
        )
        .expect("transcript")
        .contains("Continue from the same thread."));
        let results = search::search(
            temporary.path(),
            &crate::domain::SearchQuery {
                query: "Continue from the same thread".into(),
                mode: "lexical".into(),
                scope: "sessions".into(),
                limit: Some(10),
                selected_paths: vec![],
            },
        )
        .expect("search interview transcript");
        assert!(results.iter().any(|result| {
            result.relative_path
                == format!("{}/transcript.md", resumed.relative_folder)
        }));
    }
}
