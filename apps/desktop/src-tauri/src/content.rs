use crate::domain::{
    Citation, ContentProject, ContentProjectDetail, ContentSkill, ContentStep, ContentStepRun,
    CreateContentProjectInput, ModelSelection, SaveContentSkillInput, SaveContentStepRevisionInput,
    SearchQuery,
};
use crate::error::{AppError, AppResult};
use crate::{search, storage};
use chrono::{DateTime, Local, Utc};
use rusqlite::{params, Row};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[cfg(test)]
const PROVIDER: &str = "local-workflow";
#[cfg(test)]
const MODEL: &str = "structured-v1";

const DEFAULT_SKILLS: &[(&str, &str)] = &[
    (
        "youtube-script.md",
        r#"---
id: youtube-script
name: YouTube script
description: Turn a grounded idea into a clear, paced video script.
output_type: youtube
stages: [angle, source research, hook, outline, draft script, editorial pass, publish checklist]
built_in: true
---
Lead with a specific promise, earn attention quickly, use concrete evidence from the selected brain scope, and finish with one useful next action. Never fabricate a source or personal claim.
"#,
    ),
    (
        "social-campaign.md",
        r#"---
id: social-campaign
name: Social campaign
description: Develop one idea into a coordinated thread, carousel, and short posts.
output_type: social
stages: [message, source research, content map, draft posts, variation pass, publish checklist]
built_in: true
---
Preserve one central idea across formats. Adapt the opening and rhythm to each format without changing the underlying claim. Cite brain material in the working files.
"#,
    ),
    (
        "blog-post.md",
        r#"---
id: blog-post
name: Blog post
description: Build an evidence-led article from a brief and selected knowledge.
output_type: blog
stages: [thesis, source research, outline, first draft, argument review, final edit]
built_in: true
---
Make the thesis explicit, distinguish evidence from interpretation, and prefer specific examples over generic advice. Keep source provenance in every stage.
"#,
    ),
    (
        "short-story.md",
        r#"---
id: short-story
name: Short story
description: Shape a premise into a scene-driven short story workflow.
output_type: short-story
stages: [premise, character desire, conflict, emotional arc, scene outline, draft, revision]
built_in: true
---
Build around desire, resistance, change, and concrete scenes. Treat brain sources as inspiration and constraints, not as facts that must be inserted literally.
"#,
    ),
    (
        "long-form-fiction.md",
        r#"---
id: long-form-fiction
name: Novella or book
description: A resumable long-form workflow for structure, characters, chapters, and continuity.
output_type: long-form
stages: [premise, audience promise, story world, characters, narrative arc, emotional arc, chapter outline, chapter drafts, continuity review, revision plan]
built_in: true
---
Work from global structure toward chapters. Preserve character goals, causality, emotional change, and continuity. Each completed stage must remain readable so a later provider or human can resume it.
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

fn parse_skill(markdown: &str, relative_path: String) -> AppResult<ContentSkill> {
    let mut lines = markdown.lines();
    if lines.next() != Some("---") {
        return Err(AppError::InvalidContent(format!(
            "skill {relative_path} is missing Markdown frontmatter"
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
                AppError::InvalidContent(format!("skill {relative_path} is missing {key}"))
            })
    };
    let stages = metadata
        .get("stages")
        .map(|value| parse_list(value))
        .unwrap_or_default();
    if stages.is_empty() {
        return Err(AppError::InvalidContent(format!(
            "skill {relative_path} needs at least one stage"
        )));
    }
    Ok(ContentSkill {
        id: required("id")?,
        name: required("name")?,
        description: required("description")?,
        output_type: required("output_type")?,
        stages,
        relative_path,
        instructions: body.join("\n").trim().to_string(),
        built_in: metadata
            .get("built_in")
            .is_some_and(|value| value == "true"),
    })
}

fn skill_markdown(input: &SaveContentSkillInput, id: &str) -> String {
    format!(
        "---\nid: {id}\nname: {}\ndescription: {}\noutput_type: {}\nstages: [{}]\nbuilt_in: false\n---\n{}\n",
        input.name.trim(),
        input.description.trim(),
        input.output_type.trim(),
        input.stages.join(", "),
        input.instructions.trim(),
    )
}

pub fn seed_default_skills(brain: &Path) -> AppResult<()> {
    let directory = brain.join("skills/content");
    fs::create_dir_all(&directory)?;
    for (filename, markdown) in DEFAULT_SKILLS {
        let path = directory.join(filename);
        if !path.exists() {
            fs::write(path, markdown)?;
        }
    }
    Ok(())
}

pub fn list_skills(brain: &Path) -> AppResult<Vec<ContentSkill>> {
    seed_default_skills(brain)?;
    let mut skills = Vec::new();
    for entry in fs::read_dir(brain.join("skills/content"))? {
        let entry = entry?;
        let path = entry.path();
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
        let relative = path
            .strip_prefix(brain)
            .map_err(|_| AppError::InvalidContent("content skill escaped the brain".into()))?
            .to_string_lossy()
            .to_string();
        skills.push(parse_skill(&fs::read_to_string(path)?, relative)?);
    }
    skills.sort_by(|left, right| {
        right
            .built_in
            .cmp(&left.built_in)
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(skills)
}

pub fn save_skill(brain: &Path, input: &SaveContentSkillInput) -> AppResult<ContentSkill> {
    let one_line_fields_are_valid = [&input.name, &input.description, &input.output_type]
        .iter()
        .all(|value| !value.contains(['\n', '\r']));
    if input.name.trim().is_empty()
        || input.name.chars().count() > 80
        || input.description.trim().is_empty()
        || input.output_type.trim().is_empty()
        || input.instructions.trim().is_empty()
        || input.stages.is_empty()
        || !one_line_fields_are_valid
        || input
            .stages
            .iter()
            .any(|stage| stage.trim().is_empty() || stage.contains(['\n', '\r']))
    {
        return Err(AppError::InvalidContent(
            "a skill needs a one-line name up to 80 characters, description, output type, instructions, and one-line stages".into(),
        ));
    }
    let id = slugify(input.id.as_deref().unwrap_or(&input.name));
    if id.is_empty() {
        return Err(AppError::InvalidContent("skill id cannot be empty".into()));
    }
    if list_skills(brain)?
        .iter()
        .any(|skill| skill.id == id && skill.built_in)
    {
        return Err(AppError::InvalidContent(
            "built-in skills cannot be overwritten; choose a different name".into(),
        ));
    }
    let relative_path = format!("skills/content/{id}.md");
    fs::write(brain.join(&relative_path), skill_markdown(input, &id))?;
    parse_skill(
        &fs::read_to_string(brain.join(&relative_path))?,
        relative_path,
    )
}

fn project_from_row(row: &Row<'_>) -> rusqlite::Result<ContentProject> {
    let selected_paths_json: String = row.get(7)?;
    Ok(ContentProject {
        id: row.get(0)?,
        title: row.get(1)?,
        brief: row.get(2)?,
        skill_id: row.get(3)?,
        skill_name: row.get(4)?,
        output_type: row.get(5)?,
        scope: row.get(6)?,
        selected_paths: serde_json::from_str(&selected_paths_json).unwrap_or_default(),
        status: row.get(8)?,
        current_step: row.get::<_, i64>(9)? as usize,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        folder_path: row.get(12)?,
        relative_folder: row.get(13)?,
        provider: row.get(14)?,
        model: row.get(15)?,
    })
}

fn step_from_row(row: &Row<'_>) -> rusqlite::Result<ContentStep> {
    let citations_json: String = row.get(10)?;
    Ok(ContentStep {
        id: row.get(0)?,
        project_id: row.get(1)?,
        ordinal: row.get::<_, i64>(2)? as usize,
        name: row.get(3)?,
        status: row.get(4)?,
        revision: row.get::<_, i64>(5)? as usize,
        output_path: row.get(6)?,
        output_markdown: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        citations: serde_json::from_str(&citations_json).unwrap_or_default(),
    })
}

pub fn list_projects(brain: &Path) -> AppResult<Vec<ContentProject>> {
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, title, brief, skill_id, skill_name, output_type, scope, selected_paths_json,
                status, current_step, created_at, updated_at, folder_path, relative_folder, provider, model
         FROM content_projects ORDER BY updated_at DESC",
    )?;
    let rows = statement.query_map([], project_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn list_steps(brain: &Path, project_id: &str) -> AppResult<Vec<ContentStep>> {
    let connection = storage::open_database(brain)?;
    let mut statement = connection.prepare(
        "SELECT id, project_id, ordinal, name, status, revision, output_path, output_markdown,
                created_at, updated_at, citations_json
         FROM content_steps WHERE project_id = ?1 ORDER BY ordinal",
    )?;
    let rows = statement.query_map([project_id], step_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_project(brain: &Path, project_id: &str) -> AppResult<ContentProjectDetail> {
    let project = list_projects(brain)?
        .into_iter()
        .find(|project| project.id == project_id)
        .ok_or_else(|| AppError::MissingContentProject(project_id.into()))?;
    Ok(ContentProjectDetail {
        steps: list_steps(brain, project_id)?,
        project,
    })
}

fn project_markdown(project: &ContentProject) -> String {
    let selected = if project.selected_paths.is_empty() {
        "[]".to_string()
    } else {
        format!("[{}]", project.selected_paths.join(", "))
    };
    format!(
        "---\nid: {}\ntype: content-project\nskill: {}\noutput_type: {}\nscope: {}\nselected_sources: {}\nstatus: {}\nprovider: {}\nmodel: {}\ncreated_at: {}\nupdated_at: {}\n---\n\n# {}\n\n## Brief\n\n{}\n",
        project.id,
        project.skill_id,
        project.output_type,
        project.scope,
        selected,
        project.status,
        project.provider,
        project.model,
        project.created_at,
        project.updated_at,
        project.title,
        project.brief,
    )
}

fn workflow_markdown(detail: &ContentProjectDetail) -> String {
    let mut markdown = format!("# Workflow — {}\n\n", detail.project.title);
    for step in &detail.steps {
        let marker = if step.status == "complete" { "x" } else { " " };
        markdown.push_str(&format!(
            "- [{marker}] {}{}\n",
            step.name,
            step.output_path
                .as_ref()
                .map(|path| format!(" — ({path})"))
                .unwrap_or_default()
        ));
    }
    markdown
}

fn persist_project_files(brain: &Path, detail: &ContentProjectDetail) -> AppResult<()> {
    let folder = brain.join(&detail.project.relative_folder);
    fs::write(folder.join("project.md"), project_markdown(&detail.project))?;
    fs::write(
        folder.join("project.json"),
        serde_json::to_vec_pretty(&detail.project)?,
    )?;
    fs::write(folder.join("workflow.md"), workflow_markdown(detail))?;
    Ok(())
}

#[cfg(test)]
pub fn create_project(
    brain: &Path,
    input: &CreateContentProjectInput,
) -> AppResult<ContentProjectDetail> {
    create_project_with_model(
        brain,
        input,
        &ModelSelection {
            provider_id: PROVIDER.into(),
            model_id: MODEL.into(),
        },
    )
}

pub fn create_project_with_model(
    brain: &Path,
    input: &CreateContentProjectInput,
    selection: &ModelSelection,
) -> AppResult<ContentProjectDetail> {
    if input.title.trim().is_empty() || input.brief.trim().is_empty() {
        return Err(AppError::InvalidContent(
            "a project needs a title and a concrete brief".into(),
        ));
    }
    if !["all", "sessions", "notes", "sources", "selected"].contains(&input.scope.as_str()) {
        return Err(AppError::InvalidContent("invalid knowledge scope".into()));
    }
    if input.scope == "selected" && input.selected_paths.is_empty() {
        return Err(AppError::InvalidContent(
            "selected-source scope needs at least one source".into(),
        ));
    }
    let skill = list_skills(brain)?
        .into_iter()
        .find(|skill| skill.id == input.skill_id)
        .ok_or_else(|| AppError::MissingContentSkill(input.skill_id.clone()))?;
    let id = Uuid::new_v4().to_string();
    let now_utc = Utc::now();
    let local: DateTime<Local> = DateTime::from(now_utc);
    let title_slug = {
        let slug = slugify(&input.title);
        if slug.is_empty() {
            "untitled".to_string()
        } else {
            slug
        }
    };
    let relative_folder = format!(
        "projects/{}-{}-{}",
        local.format("%Y-%m-%d"),
        title_slug,
        &id[..8]
    );
    let folder = brain.join(&relative_folder);
    fs::create_dir_all(folder.join("outputs"))?;
    fs::write(
        folder.join("brief.md"),
        format!("# Brief\n\n{}\n", input.brief.trim()),
    )?;
    let now = now_utc.to_rfc3339();
    let project = ContentProject {
        id: id.clone(),
        title: input.title.trim().into(),
        brief: input.brief.trim().into(),
        skill_id: skill.id.clone(),
        skill_name: skill.name.clone(),
        output_type: skill.output_type.clone(),
        scope: input.scope.clone(),
        selected_paths: input.selected_paths.clone(),
        status: "ready".into(),
        current_step: 0,
        created_at: now.clone(),
        updated_at: now.clone(),
        folder_path: folder.to_string_lossy().to_string(),
        relative_folder,
        provider: selection.provider_id.clone(),
        model: selection.model_id.clone(),
    };
    let connection = storage::open_database(brain)?;
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO content_projects
         (id, title, brief, skill_id, skill_name, output_type, scope, selected_paths_json,
          status, current_step, created_at, updated_at, folder_path, relative_folder, provider, model)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            project.id,
            project.title,
            project.brief,
            project.skill_id,
            project.skill_name,
            project.output_type,
            project.scope,
            serde_json::to_string(&project.selected_paths)?,
            project.status,
            project.current_step as i64,
            project.created_at,
            project.updated_at,
            project.folder_path,
            project.relative_folder,
            project.provider,
            project.model,
        ],
    )?;
    for (ordinal, stage) in skill.stages.iter().enumerate() {
        transaction.execute(
            "INSERT INTO content_steps
             (id, project_id, ordinal, name, status, revision, output_path, output_markdown,
              created_at, updated_at, citations_json)
             VALUES (?1, ?2, ?3, ?4, 'pending', 0, NULL, '', ?5, ?5, '[]')",
            params![
                Uuid::new_v4().to_string(),
                project.id,
                ordinal as i64,
                stage,
                now,
            ],
        )?;
    }
    transaction.commit()?;
    let detail = get_project(brain, &id)?;
    persist_project_files(brain, &detail)?;
    Ok(detail)
}

fn compact_quote(value: &str, limit: usize) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= limit {
        compact
    } else {
        format!(
            "{}…",
            compact
                .chars()
                .take(limit.saturating_sub(1))
                .collect::<String>()
        )
    }
}

fn structure_for(output_type: &str) -> &'static str {
    match output_type {
        "youtube" => "1. Cold open and promise\n2. Why this matters now\n3. Three evidence-led beats\n4. Counterpoint or tension\n5. Synthesis and next action",
        "social" => "1. Core message\n2. Primary thread or carousel\n3. Three standalone variations\n4. Question or call to action",
        "blog" => "1. Thesis-led introduction\n2. Context and stakes\n3. Evidence section\n4. Tension or counterargument\n5. Practical synthesis",
        "short-story" => "1. Opening image\n2. Character desire\n3. Escalating resistance\n4. Irreversible choice\n5. Emotional consequence",
        "long-form" => "1. Promise and premise\n2. Act or part structure\n3. Character and argument arcs\n4. Chapter-level causality\n5. Continuity and revision pass",
        _ => "1. Purpose\n2. Evidence\n3. Structure\n4. Draft\n5. Revision",
    }
}

fn working_output(project: &ContentProject, step_name: &str, citations: &[Citation]) -> String {
    let normalized = step_name.to_lowercase();
    let evidence_line = citations
        .first()
        .map(|citation| compact_quote(&citation.quote, 170))
        .unwrap_or_else(|| {
            "No matching brain passage was found; keep this stage as an explicit author decision."
                .into()
        });
    if normalized.contains("outline")
        || normalized.contains("map")
        || normalized.contains("structure")
        || normalized.contains("arc")
    {
        return format!(
            "## Proposed structure\n\n{}\n\n## Throughline\n\nBuild every section around this brief: {}",
            structure_for(&project.output_type),
            project.brief
        );
    }
    if normalized.contains("character") {
        return "## Character work\n\n- **Desire:** What does the character actively want?\n- **Fear:** What truth are they avoiding?\n- **Contradiction:** Which trait creates pressure?\n- **Change:** What can they do at the end that they could not do at the beginning?\n\nTie each answer to a concrete scene before drafting.".into();
    }
    if normalized.contains("draft") || normalized.contains("script") || normalized.contains("post")
    {
        return match project.output_type.as_str() {
            "youtube" => format!("## Hook\n\n{}\n\n## Script scaffold\n\nStart with the consequence, establish the promise, then develop three beats grounded in the source notes. After each beat, explain what changes for the viewer. End with one specific next action.", evidence_line),
            "social" => format!("## Lead post\n\n{}\n\n## Expansion\n\nTurn the lead into a concise claim, supporting example, useful implication, and direct question. Produce format variations only after the central message is stable.", evidence_line),
            "blog" => format!("## Opening\n\n{}\n\n## Draft direction\n\nState the thesis plainly, establish the stakes, develop the strongest evidence, address the most credible objection, and close with a useful synthesis.", evidence_line),
            "short-story" | "long-form" => format!("## Opening material\n\n{}\n\n## Scene direction\n\nPlace a character in a concrete situation where their desire meets resistance. Let choice and consequence reveal the theme instead of explaining it.", evidence_line),
            _ => format!("## Opening material\n\n{}\n\nDevelop the brief through concrete evidence, tension, and a clear conclusion.", evidence_line),
        };
    }
    if normalized.contains("edit")
        || normalized.contains("review")
        || normalized.contains("revision")
        || normalized.contains("checklist")
    {
        return "## Editorial pass\n\n- [ ] The opening makes a specific promise.\n- [ ] Every major claim is supported or labeled as interpretation.\n- [ ] Repetition has been removed.\n- [ ] Transitions preserve causality.\n- [ ] Voice and audience remain consistent.\n- [ ] Source provenance is retained in the working files.\n- [ ] The final action or emotional consequence is earned.".into();
    }
    format!(
        "## Decisions to make\n\n- What precise promise should this work make?\n- Who is it for, and what do they already believe?\n- What tension keeps the idea from feeling obvious?\n- Which source should anchor the stage?\n\n## Initial direction\n\n{}",
        evidence_line
    )
}

fn stage_markdown(
    project: &ContentProject,
    skill: &ContentSkill,
    step: &ContentStep,
    citations: &[Citation],
    prior_steps: &[ContentStep],
    revision: usize,
    generated: Option<&str>,
) -> String {
    let external = generated.is_some();
    let mut markdown = format!(
        "---\nproject_id: {}\nstage: {}\nrevision: {}\nprovider: {}\nmodel: {}\ngeneral_knowledge_used: {}\ncitations: {}\n---\n\n# {} — {}\n\n> {}\n\n## Project brief\n\n{}\n\n## Skill instructions\n\n{}\n\n",
        project.id,
        step.name,
        revision,
        project.provider,
        project.model,
        external,
        citations.len(),
        project.title,
        step.name,
        if external { "Generated through the explicitly selected provider from the brief, workflow instructions, prior-stage excerpts, and cited passages below." } else { "Offline structured workflow output. It organizes the brief and retrieved evidence; it is not a hidden cloud-model completion." },
        project.brief,
        skill.instructions,
    );
    if !prior_steps.is_empty() {
        markdown.push_str("## Prior stages\n\n");
        for prior in prior_steps {
            if let Some(path) = &prior.output_path {
                markdown.push_str(&format!("- {} — ({})\n", prior.name, path));
            }
        }
        markdown.push('\n');
    }
    if let Some(generated) = generated {
        markdown.push_str(generated);
    } else {
        markdown.push_str(&working_output(project, &step.name, citations));
    }
    markdown.push_str("\n\n## Grounding from your brain\n\n");
    if citations.is_empty() {
        markdown.push_str("_No supporting passage was found in the selected scope. This stage contains only the explicit brief and workflow structure._\n");
    } else {
        for citation in citations {
            markdown.push_str(&format!(
                "### [{}] {}\n\n> {}\n\nSource: ({})\n\n",
                citation.number,
                citation.title,
                compact_quote(&citation.quote, 360),
                citation.relative_path,
            ));
        }
    }
    markdown
}

pub fn run_next_step_with_retrieval(
    brain: &Path,
    project_id: &str,
    retrieval_limit: usize,
) -> AppResult<ContentStepRun> {
    run_next_step_inner(
        brain,
        project_id,
        retrieval_limit,
        Option::<fn(&str, &str) -> AppResult<String>>::None,
    )
}

pub fn run_next_step_with_provider_and_retrieval<F>(
    brain: &Path,
    project_id: &str,
    retrieval_limit: usize,
    generate: F,
) -> AppResult<ContentStepRun>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    run_next_step_inner(brain, project_id, retrieval_limit, Some(generate))
}

fn run_next_step_inner<F>(
    brain: &Path,
    project_id: &str,
    retrieval_limit: usize,
    generate: Option<F>,
) -> AppResult<ContentStepRun>
where
    F: FnOnce(&str, &str) -> AppResult<String>,
{
    let detail = get_project(brain, project_id)?;
    let step = detail
        .steps
        .iter()
        .find(|step| step.status != "complete")
        .cloned()
        .ok_or_else(|| AppError::InvalidContent("this workflow is already complete".into()))?;
    let skill = list_skills(brain)?
        .into_iter()
        .find(|skill| skill.id == detail.project.skill_id)
        .ok_or_else(|| AppError::MissingContentSkill(detail.project.skill_id.clone()))?;
    let results = search::search_diverse(
        brain,
        &SearchQuery {
            query: format!(
                "{} {} {}",
                detail.project.brief, step.name, skill.instructions
            ),
            mode: "hybrid".into(),
            scope: if detail.project.scope == "selected" {
                "selected-any".into()
            } else {
                detail.project.scope.clone()
            },
            limit: Some(retrieval_limit.clamp(6, 50)),
            selected_paths: detail.project.selected_paths.clone(),
        },
        2,
    )?;
    let citations = results
        .into_iter()
        .filter(|result| {
            !result.relative_path.starts_with("projects/")
                && !result.relative_path.starts_with("skills/")
                && !result.relative_path.starts_with("hosts/")
        })
        .take(retrieval_limit.clamp(6, 50))
        .enumerate()
        .map(|(index, result)| Citation {
            passage_id: result.passage_id,
            number: index + 1,
            title: result.title,
            relative_path: result.relative_path,
            quote: result.quote,
        })
        .collect::<Vec<_>>();
    let revision = step.revision + 1;
    let prior_steps = detail
        .steps
        .iter()
        .filter(|candidate| candidate.ordinal < step.ordinal && candidate.status == "complete")
        .cloned()
        .collect::<Vec<_>>();
    let generated = if let Some(generate) = generate {
        let sources = if citations.is_empty() {
            "No supporting passages were found in the selected knowledge scope.".to_string()
        } else {
            citations
                .iter()
                .map(|citation| {
                    format!(
                        "[{}] FILE: {}\nQUOTE: {}",
                        citation.number, citation.relative_path, citation.quote
                    )
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        };
        let prior = if prior_steps.is_empty() {
            "No prior stages are complete.".to_string()
        } else {
            prior_steps
                .iter()
                .map(|prior| {
                    format!(
                        "STAGE: {}\n{}",
                        prior.name,
                        prior.output_markdown.chars().take(2400).collect::<String>()
                    )
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        };
        let system = "You are Burrowise's content-workflow engine. Complete only the requested stage. Follow the user's skill instructions, preserve continuity with prior stages, and cite supplied brain passages with [n]. Never claim a source that was not supplied.";
        let prompt = format!(
            "PROJECT: {}\nOUTPUT TYPE: {}\nCURRENT STAGE: {}\n\nBRIEF:\n{}\n\nSKILL INSTRUCTIONS:\n{}\n\nPRIOR STAGES:\n{}\n\nSCOPED BRAIN SOURCES:\n{}",
            detail.project.title,
            detail.project.output_type,
            step.name,
            detail.project.brief,
            skill.instructions,
            prior,
            sources
        );
        Some(generate(system, &prompt)?)
    } else {
        None
    };
    let markdown = stage_markdown(
        &detail.project,
        &skill,
        &step,
        &citations,
        &prior_steps,
        revision,
        generated.as_deref(),
    );
    let filename = format!(
        "{:02}-{}-v{}.md",
        step.ordinal + 1,
        slugify(&step.name),
        revision
    );
    let output_path = format!("{}/outputs/{filename}", detail.project.relative_folder);
    fs::write(brain.join(&output_path), &markdown)?;
    let now = Utc::now().to_rfc3339();
    let next_step = step.ordinal + 1;
    let project_status = if next_step >= detail.steps.len() {
        "complete"
    } else {
        "active"
    };
    let connection = storage::open_database(brain)?;
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "UPDATE content_steps
         SET status = 'complete', revision = ?1, output_path = ?2, output_markdown = ?3,
             updated_at = ?4, citations_json = ?5
         WHERE id = ?6",
        params![
            revision as i64,
            output_path,
            markdown,
            now,
            serde_json::to_string(&citations)?,
            step.id,
        ],
    )?;
    transaction.execute(
        "UPDATE content_projects SET status = ?1, current_step = ?2, updated_at = ?3 WHERE id = ?4",
        params![project_status, next_step as i64, now, project_id],
    )?;
    for citation in &citations {
        transaction.execute(
            "INSERT INTO content_access_log
             (id, project_id, step_id, passage_id, title, relative_path, quote, accessed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                project_id,
                step.id,
                citation.passage_id,
                citation.title,
                citation.relative_path,
                citation.quote,
                now,
            ],
        )?;
    }
    transaction.commit()?;
    let updated = get_project(brain, project_id)?;
    persist_project_files(brain, &updated)?;
    let completed_step = updated
        .steps
        .iter()
        .find(|candidate| candidate.id == step.id)
        .cloned()
        .ok_or_else(|| AppError::InvalidContent("completed stage could not be reloaded".into()))?;
    Ok(ContentStepRun {
        project: updated.project,
        step: completed_step,
    })
}

pub fn save_step_revision(
    brain: &Path,
    input: &SaveContentStepRevisionInput,
) -> AppResult<ContentStepRun> {
    if input.markdown.trim().is_empty() {
        return Err(AppError::InvalidContent(
            "a stage revision cannot be empty".into(),
        ));
    }
    let detail = get_project(brain, &input.project_id)?;
    let step = detail
        .steps
        .iter()
        .find(|step| step.id == input.step_id)
        .cloned()
        .ok_or_else(|| AppError::InvalidContent("stage does not belong to this project".into()))?;
    if step.status != "complete" {
        return Err(AppError::InvalidContent(
            "run this stage before saving a revision".into(),
        ));
    }
    let revision = step.revision + 1;
    let filename = format!(
        "{:02}-{}-v{}.md",
        step.ordinal + 1,
        slugify(&step.name),
        revision
    );
    let output_path = format!("{}/outputs/{filename}", detail.project.relative_folder);
    let markdown = format!("{}\n", input.markdown.trim_end());

    // Persist the new version before advancing metadata. Previous artifacts are never replaced.
    fs::write(brain.join(&output_path), &markdown)?;
    let now = Utc::now().to_rfc3339();
    let connection = storage::open_database(brain)?;
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "UPDATE content_steps SET revision = ?1, output_path = ?2, output_markdown = ?3,
         updated_at = ?4 WHERE id = ?5 AND project_id = ?6",
        params![
            revision as i64,
            output_path,
            markdown,
            now,
            step.id,
            detail.project.id,
        ],
    )?;
    transaction.execute(
        "UPDATE content_projects SET updated_at = ?1 WHERE id = ?2",
        params![now, detail.project.id],
    )?;
    transaction.commit()?;

    let updated = get_project(brain, &input.project_id)?;
    persist_project_files(brain, &updated)?;
    let revised_step = updated
        .steps
        .iter()
        .find(|candidate| candidate.id == input.step_id)
        .cloned()
        .ok_or_else(|| AppError::InvalidContent("revised stage could not be reloaded".into()))?;
    Ok(ContentStepRun {
        project: updated.project,
        step: revised_step,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_resumable_grounded_content_projects_and_user_skills() {
        let temporary = tempfile::tempdir().expect("temporary brain");
        let brain = temporary.path();
        fs::create_dir_all(brain.join("notes")).expect("notes");
        fs::write(
            brain.join("notes/reliable-capture.md"),
            "# Reliable capture\n\nRaw audio must be stored before transcription so an AI failure never loses the user's thought.",
        )
        .expect("source note");
        search::rebuild_index(brain).expect("index");

        let skills = list_skills(brain).expect("default skills");
        assert_eq!(skills.len(), 5);
        let detail = create_project(
            brain,
            &CreateContentProjectInput {
                title: "Capture reliability video".into(),
                brief: "Explain why reliable voice capture must survive an AI failure.".into(),
                skill_id: "youtube-script".into(),
                scope: "selected".into(),
                selected_paths: vec!["notes/reliable-capture.md".into()],
            },
        )
        .expect("project");
        assert_eq!(detail.project.status, "ready");
        assert_eq!(detail.steps.len(), 7);
        assert!(brain
            .join(&detail.project.relative_folder)
            .join("project.md")
            .exists());

        let run = run_next_step_with_retrieval(brain, &detail.project.id, 12).expect("first stage");
        assert_eq!(run.project.current_step, 1);
        assert_eq!(run.step.status, "complete");
        assert!(!run.step.citations.is_empty());
        assert!(brain
            .join(run.step.output_path.clone().expect("output path"))
            .exists());
        let access_count: i64 = storage::open_database(brain)
            .expect("database")
            .query_row(
                "SELECT COUNT(*) FROM content_access_log WHERE project_id = ?1",
                [&detail.project.id],
                |row| row.get(0),
            )
            .expect("access count");
        assert_eq!(access_count as usize, run.step.citations.len());

        let first_output = run.step.output_path.clone().expect("first output path");
        let revised = save_step_revision(
            brain,
            &SaveContentStepRevisionInput {
                project_id: detail.project.id.clone(),
                step_id: run.step.id.clone(),
                markdown: format!(
                    "{}\n\n## Author revision\n\nKeep the raw audio first.",
                    run.step.output_markdown
                ),
            },
        )
        .expect("revised artifact");
        assert_eq!(revised.step.revision, 2);
        assert!(revised.step.output_markdown.contains("Author revision"));
        assert!(
            brain.join(&first_output).exists(),
            "the previous revision remains readable"
        );
        assert!(brain
            .join(revised.step.output_path.as_deref().expect("revised path"))
            .exists());
        let pending_step = get_project(brain, &detail.project.id)
            .expect("project after revision")
            .steps
            .into_iter()
            .find(|step| step.status == "pending")
            .expect("pending stage");
        assert!(save_step_revision(
            brain,
            &SaveContentStepRevisionInput {
                project_id: detail.project.id.clone(),
                step_id: pending_step.id,
                markdown: "Cannot skip the stage run.".into(),
            },
        )
        .is_err());

        let custom = save_skill(
            brain,
            &SaveContentSkillInput {
                id: None,
                name: "Research memo".into(),
                description: "A compact evidence memo.".into(),
                output_type: "memo".into(),
                stages: vec!["question".into(), "evidence".into(), "synthesis".into()],
                instructions: "Separate evidence from inference.".into(),
            },
        )
        .expect("custom skill");
        assert!(!custom.built_in);
        assert!(brain.join(custom.relative_path).exists());
        assert!(save_skill(
            brain,
            &SaveContentSkillInput {
                id: None,
                name: "Broken\nSkill".into(),
                description: "Invalid frontmatter".into(),
                output_type: "memo".into(),
                stages: vec!["draft".into()],
                instructions: "Do not write this file.".into(),
            },
        )
        .is_err());
    }
}
