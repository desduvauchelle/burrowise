import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleNotch,
  FileText,
  Folder,
  ListChecks,
  PencilSimple,
  Plus,
  Robot,
  ShieldCheck,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import {
  createContentProject,
  getContentProject,
  getSourceDocument,
  listContentProjects,
  listContentSkills,
  listIndexedSources,
  runNextContentStep,
  saveContentStepRevision,
  revealSourceInFinder,
  saveContentSkill,
} from "../services/platform";
import type {
  Citation,
  ContentProject,
  ContentProjectDetail,
  ContentSkill,
  ContentStep,
  ContentStepRun,
  IndexedSource,
  SourceDocument,
} from "../types/domain";
import type { FocusRequest, RetrievalSettings } from "../types/ui";
import { errorMessage } from "../utils/errors";

const scopeOptions = [
  ["all", "Whole brain"],
  ["notes", "Notes"],
  ["sessions", "Sessions"],
  ["sources", "Imported sources"],
  ["selected", "Selected files"],
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

interface SkillCreatorProps {
  skill: ContentSkill | null;
  onClose: () => void;
  onSaved: (skill: ContentSkill) => void;
}

function SkillCreator({ skill, onClose, onSaved }: SkillCreatorProps) {
  const [name, setName] = useState(skill?.name || "");
  const [description, setDescription] = useState(skill?.description || "");
  const [outputType, setOutputType] = useState(skill?.outputType || "custom");
  const [stages, setStages] = useState(skill?.stages?.join(", ") || "research, outline, draft, review");
  const [instructions, setInstructions] = useState(skill?.instructions || "");
  const [status, setStatus] = useState("Skills are ordinary Markdown files in skills/content.");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveContentSkill({
        id: skill?.id,
        name,
        description,
        outputType,
        stages: stages.split(",").map((stage) => stage.trim()).filter(Boolean),
        instructions,
      });
      onSaved(saved);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}>
    <section className="studio-skill-modal" role="dialog" aria-modal="true" aria-labelledby="studio-skill-title">
      <header><div><small>User-authored Markdown workflow</small><h2 id="studio-skill-title">{skill ? "Edit content skill" : "Create a content skill"}</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close skill editor"><X /></button></header>
      <div className="studio-form-grid">
        <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Research essay" /></label>
        <label><span>Output type</span><input value={outputType} onChange={(event) => setOutputType(event.target.value)} placeholder="essay" /></label>
      </div>
      <label><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this workflow helps produce" /></label>
      <label><span>Stages</span><input value={stages} onChange={(event) => setStages(event.target.value)} /><small>Comma-separated. Each stage becomes a resumable Markdown artifact.</small></label>
      <label><span>Instructions</span><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Describe the goals, constraints, voice, checks, and evidence rules for every stage." /></label>
      <p className="studio-modal-status" role="status">{status}</p>
      <footer><button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" onClick={save} disabled={busy || !name.trim() || !description.trim() || !instructions.trim() || !stages.trim()}>{busy ? <CircleNotch className="spin" /> : skill ? <Check /> : <Plus />} {skill ? "Save changes" : "Save skill"}</button></footer>
    </section>
  </div>;
}

interface ProjectCreatorProps {
  skills: ContentSkill[];
  sources: IndexedSource[];
  onCreated: (detail: ContentProjectDetail) => void;
  onSkillCreator: () => void;
  onSkillEditor: (skill: ContentSkill) => void;
}

function ProjectCreator({ skills, sources, onCreated, onSkillCreator, onSkillEditor }: ProjectCreatorProps) {
  const [skillId, setSkillId] = useState(skills[0]?.id || "");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [scope, setScope] = useState("all");
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!skillId && skills[0]) setSkillId(skills[0].id);
  }, [skillId, skills]);

  const selectedSkill = skills.find((skill) => skill.id === skillId);
  const toggleSource = (path: string) => {
    setStatus("");
    setSelectedPaths((current) => current.includes(path) ? current.filter((item) => item !== path) : [...current, path]);
  };
  const readiness = !selectedSkill
    ? "Choose a workflow."
    : !title.trim() || !brief.trim()
      ? "Add a project title and concrete creative brief."
      : scope === "selected" && selectedPaths.length === 0
        ? "Choose at least one source file."
        : `Ready to create a ${selectedSkill.stages.length}-stage ${selectedSkill.name.toLowerCase()} workflow.`;
  const create = async () => {
    setBusy(true);
    setStatus("Creating readable project files and a resumable workflow…");
    try {
      const detail = await createContentProject({ title, brief, skillId, scope, selectedPaths });
      onCreated(detail);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return <section className="studio-main studio-create">
    <header className="studio-page-header"><div><p>Grounded creation workflows</p><h1>Start a content project</h1><span>Plan and create in stages without losing the thread—or your source provenance.</span></div><div className="studio-header-actions">{selectedSkill && !selectedSkill.builtIn ? <button className="secondary-button" onClick={() => onSkillEditor(selectedSkill)}><PencilSimple /> Edit selected skill</button> : null}<button className="secondary-button" onClick={onSkillCreator}><Plus /> New skill</button></div></header>
    <div className="studio-provider-notice"><ShieldCheck /><span><strong>Explicit workflow model</strong><small>A new project snapshots the current Studio preference from Settings. It never changes provider silently while the workflow is in progress.</small></span><span className="provider-chip"><Robot /> Settings · Models</span></div>
    <section className="studio-create-section">
      <div className="studio-section-heading"><span>1</span><div><h2>Choose a skill</h2><p>Skills define stages, instructions, and the final format.</p></div></div>
      <div className="studio-skill-grid">{skills.map((skill) => <button className={skillId === skill.id ? "selected" : ""} key={skill.id} onClick={() => { setSkillId(skill.id); setStatus(""); }}><span><Sparkle /></span><strong>{skill.name}</strong><p>{skill.description}</p><small>{skill.stages.length} stages · {skill.outputType}</small>{skillId === skill.id ? <Check className="skill-check" /> : null}</button>)}</div>
    </section>
    <section className="studio-create-section">
      <div className="studio-section-heading"><span>2</span><div><h2>Write the brief</h2><p>The brief is canonical and remains readable in the project folder.</p></div></div>
      <div className="studio-brief-fields">
        <label><span>Project title</span><input value={title} onChange={(event) => { setTitle(event.target.value); setStatus(""); }} placeholder="Why voice capture must survive AI failure" /></label>
        <label><span>Creative brief</span><textarea value={brief} onChange={(event) => { setBrief(event.target.value); setStatus(""); }} placeholder="Audience, goal, central idea, desired tone, constraints, and what a successful result should accomplish." /></label>
      </div>
    </section>
    <section className="studio-create-section">
      <div className="studio-section-heading"><span>3</span><div><h2>Choose knowledge scope</h2><p>Every passage used by a workflow stage is cited and logged.</p></div></div>
      <div className="studio-scope-row">{scopeOptions.map(([id, label]) => <button className={scope === id ? "active" : ""} key={id} onClick={() => { setScope(id); setStatus(""); }}>{label}</button>)}</div>
      {scope === "selected" ? <div className="studio-source-picker">{sources.length ? sources.map((source) => <label key={source.relativePath}><input type="checkbox" checked={selectedPaths.includes(source.relativePath)} onChange={() => toggleSource(source.relativePath)} /><span><strong>{source.title}</strong><small>{source.relativePath}</small></span></label>) : <p>Rebuild the search index to discover sources.</p>}</div> : null}
    </section>
    <div className="studio-create-footer"><p role="status">{status || readiness}</p><button className="primary-button" onClick={create} disabled={busy || !selectedSkill || !title.trim() || !brief.trim() || (scope === "selected" && selectedPaths.length === 0)}>{busy ? <CircleNotch className="spin" /> : <ArrowRight />} Create {selectedSkill?.stages.length || 0}-stage workflow</button></div>
  </section>;
}

interface StudioSourceView {
  citation: Citation;
  source: SourceDocument;
}

function StudioSourceModal({ view, onClose }: { view: StudioSourceView; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="studio-source-modal" role="dialog" aria-modal="true" aria-label="Studio source"><header><div><small>Grounding source</small><h2>{view.source.title}</h2><p>{view.citation.relativePath}</p></div><button className="icon-button" onClick={onClose} aria-label="Close source"><X /></button></header><blockquote>{view.citation.quote}</blockquote><pre>{view.source.markdown}</pre><footer><button className="secondary-button" onClick={() => revealSourceInFinder(view.citation.relativePath)}><Folder /> Reveal in Finder</button><button className="primary-button" onClick={onClose}>Done</button></footer></section></div>;
}

interface RevisionEditorProps {
  project: ContentProject;
  step: ContentStep;
  onClose: () => void;
  onSaved: (result: ContentStepRun) => void;
}

function RevisionEditor({ project, step, onClose, onSaved }: RevisionEditorProps) {
  const [markdown, setMarkdown] = useState(step.outputMarkdown);
  const [status, setStatus] = useState(`Saving creates v${step.revision + 1}; v${step.revision} remains in outputs/.`);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await saveContentStepRevision({ projectId: project.id, stepId: step.id, markdown }));
    } catch (error) {
      setStatus(errorMessage(error));
      setBusy(false);
    }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="studio-skill-modal studio-revision-modal" role="dialog" aria-modal="true" aria-labelledby="studio-revision-title"><header><div><small>Versioned Markdown artifact</small><h2 id="studio-revision-title">Revise {step.name}</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close revision editor"><X /></button></header><label><span>Markdown</span><textarea autoFocus value={markdown} onChange={(event) => setMarkdown(event.target.value)} /></label><p className="studio-modal-status" role="status">{status}</p><footer><button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" onClick={save} disabled={busy || !markdown.trim()}>{busy ? <CircleNotch className="spin" /> : <Check />} Save v{step.revision + 1}</button></footer></section></div>;
}

interface ProjectDetailProps {
  detail: ContentProjectDetail;
  onRun: () => void;
  onRevise: (step: ContentStep) => void;
  busy: boolean;
  runFailed: boolean;
  status: string;
  selectedStepId: string;
  setSelectedStepId: Dispatch<SetStateAction<string>>;
  onNew: () => void;
  onCitation: (citation: Citation) => void;
}

function ProjectDetail({ detail, onRun, onRevise, busy, runFailed, status, selectedStepId, setSelectedStepId, onNew, onCitation }: ProjectDetailProps) {
  const { project, steps } = detail;
  const nextStep = steps.find((step) => step.status !== "complete");
  const selectedStep = steps.find((step) => step.id === selectedStepId) || [...steps].reverse().find((step) => step.status === "complete") || nextStep;
  const progress = steps.length ? Math.round(project.currentStep / steps.length * 100) : 0;

  return <section className="studio-main studio-project-detail">
    <header className="studio-page-header"><div><p>{project.skillName} · {project.outputType}</p><h1>{project.title}</h1><span>{project.relativeFolder}</span></div><button className="secondary-button" onClick={onNew}><Plus /> New project</button></header>
    <div className="studio-project-summary">
      <div><span className={`studio-status ${project.status}`}>{project.status}</span><strong>{project.currentStep} of {steps.length} stages complete</strong><small>{project.provider} · {project.model} · general knowledge off</small></div>
      <div className="studio-progress"><span style={{ width: `${progress}%` }} /></div>
      <p>{project.brief}</p>
    </div>
    <div className="studio-project-grid">
      <section className="studio-workflow-pane">
        <div className="studio-pane-title"><div><ListChecks /><span><strong>Workflow</strong><small>Each stage is a durable Markdown file.</small></span></div>{project.status === "complete" ? <span className="studio-complete"><Check /> Complete</span> : null}</div>
        <div className="studio-step-list">{steps.map((step) => <button className={`${selectedStep?.id === step.id ? "selected" : ""} ${step.status}`} key={step.id} onClick={() => setSelectedStepId(step.id)}><span className="studio-step-number">{step.status === "complete" ? <Check /> : step.ordinal + 1}</span><span><strong>{step.name}</strong><small>{step.status === "complete" ? `${step.citations.length} sources · revision ${step.revision}` : step.ordinal === project.currentStep ? "Ready to run" : "Waiting"}</small></span><ArrowRight /></button>)}</div>
        <div className="studio-run-box"><p role="status">{status}</p><button className="primary-button" disabled={busy || !nextStep} onClick={onRun}>{busy ? <CircleNotch className="spin" /> : <Sparkle />}{nextStep ? ` ${runFailed ? "Retry" : "Run next"}: ${nextStep.name}` : " Workflow complete"}</button><small>Each click is an approval checkpoint. The stage writes its artifact before project state advances.</small></div>
      </section>
      <section className="studio-output-pane">
        <div className="studio-pane-title"><div><FileText /><span><strong>{selectedStep?.name || "Stage output"}</strong><small>{selectedStep?.outputPath || "Run the first stage to create an artifact."}</small></span></div>{selectedStep?.revision ? <div className="studio-output-actions"><span>v{selectedStep.revision}</span><button className="secondary-button" onClick={() => onRevise(selectedStep)} disabled={busy}><PencilSimple /> Revise artifact</button></div> : null}</div>
        {selectedStep?.outputMarkdown ? <><pre>{selectedStep.outputMarkdown}</pre><div className="studio-citations"><strong>Sources accessed</strong>{selectedStep.citations.length ? selectedStep.citations.map((citation) => <button key={citation.passageId} onClick={() => onCitation(citation)}><span>{citation.number}</span><p><strong>{citation.title}</strong><small>{citation.relativePath}</small></p><ArrowRight /></button>) : <p>No matching source was used for this stage.</p>}</div></> : <div className="studio-output-empty"><BookOpen /><h2>Ready when you are</h2><p>Run stages one at a time. You can close the app, edit the Markdown files yourself, and resume later.</p></div>}
      </section>
    </div>
  </section>;
}

interface ContentStudioPageProps {
  focusRequest: FocusRequest | null;
  retrievalSettings: RetrievalSettings;
}

export function ContentStudioPage({ focusRequest, retrievalSettings }: ContentStudioPageProps) {
  const [skills, setSkills] = useState<ContentSkill[]>([]);
  const [projects, setProjects] = useState<ContentProject[]>([]);
  const [sources, setSources] = useState<IndexedSource[]>([]);
  const [detail, setDetail] = useState<ContentProjectDetail | null>(null);
  const [creating, setCreating] = useState(true);
  const [skillCreator, setSkillCreator] = useState(false);
  const [editingSkill, setEditingSkill] = useState<ContentSkill | null>(null);
  const [revisionStep, setRevisionStep] = useState<ContentStep | null>(null);
  const [selectedStepId, setSelectedStepId] = useState("");
  const [status, setStatus] = useState("Stages run locally and remain resumable.");
  const [busy, setBusy] = useState(false);
  const [runFailed, setRunFailed] = useState(false);
  const [sourceView, setSourceView] = useState<StudioSourceView | null>(null);

  useEffect(() => {
    Promise.all([listContentSkills(), listContentProjects(), listIndexedSources()]).then(async ([skillList, projectList, sourceList]) => {
      setSkills(skillList);
      setProjects(projectList);
      setSources(sourceList);
      const requested = projectList.find((project) => project.id === focusRequest?.recordId);
      const selected = requested || projectList[0];
      if (selected) {
        const first = await getContentProject(selected.id);
        setDetail(first);
        setCreating(false);
        const latest = [...first.steps].reverse().find((step) => step.status === "complete");
        setSelectedStepId(latest?.id || "");
        if (requested) setStatus("Opened the selected project from recent activity.");
      }
    }).catch((error: unknown) => setStatus(errorMessage(error)));
  }, [focusRequest?.token]);

  const openProject = async (project: ContentProject) => {
    setBusy(true);
    try {
      const next = await getContentProject(project.id);
      setDetail(next);
      setCreating(false);
      const latest = [...next.steps].reverse().find((step) => step.status === "complete");
      setSelectedStepId(latest?.id || "");
      setStatus("Project restored from its local workflow state.");
      setRunFailed(false);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const acceptCreated = async (next: ContentProjectDetail) => {
    setDetail(next);
    setProjects(await listContentProjects());
    setCreating(false);
    setSelectedStepId("");
    setStatus("Project created. Run the first stage when the brief and scope look right.");
    setRunFailed(false);
  };

  const run = async () => {
    if (!detail) return;
    setBusy(true);
    const nextName = detail.steps.find((step) => step.status !== "complete")?.name;
    setStatus(`Running ${nextName || "stage"} with local retrieval…`);
    try {
      const result = await runNextContentStep(detail.project.id, retrievalSettings.studioChunkLimit);
      const next = await getContentProject(result.project.id);
      setDetail(next);
      setSelectedStepId(result.step.id);
      setProjects(await listContentProjects());
      const filesUsed = new Set(result.step.citations.map((citation) => citation.relativePath)).size;
      setStatus(`${result.step.name} saved with ${result.step.citations.length} passages across ${filesUsed} source file${filesUsed === 1 ? "" : "s"}.`);
      setRunFailed(false);
    } catch (error) {
      setStatus(errorMessage(error));
      setRunFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const savedSkill = (skill: ContentSkill) => {
    setSkills((current) => [skill, ...current.filter((item) => item.id !== skill.id)]);
    setSkillCreator(false);
    setCreating(true);
    setStatus(`${skill.name} saved as readable Markdown.`);
  };

  const savedRevision = async (result: ContentStepRun) => {
    const next = await getContentProject(result.project.id);
    setDetail(next);
    setProjects(await listContentProjects());
    setSelectedStepId(result.step.id);
    setRevisionStep(null);
    setStatus(`${result.step.name} saved as v${result.step.revision}. The prior artifact remains in outputs/.`);
  };

  const inspectCitation = async (citation: Citation) => {
    try { setSourceView({ citation, source: await getSourceDocument(citation.relativePath) }); }
    catch (error) { setStatus(errorMessage(error)); }
  };

  const activeCount = useMemo(() => projects.filter((project) => project.status !== "complete").length, [projects]);

  return <main className="studio-workspace">
    <aside className="studio-projects-pane">
      <div className="workspace-rail-header"><div><small>Readable local projects</small><h1>Studio</h1></div><button className="icon-button" onClick={() => setCreating(true)} aria-label="New content project"><Plus /></button></div>
      <div className="studio-rail-summary"><span><strong>{activeCount}</strong> active</span><span><strong>{projects.length}</strong> total</span></div>
      <div className="studio-project-list"><p>Projects</p>{projects.map((project) => <button className={!creating && detail?.project.id === project.id ? "selected" : ""} key={project.id} onClick={() => openProject(project)}><span className={`project-icon ${project.status}`}><FileText /></span><span><strong>{project.title}</strong><small>{project.skillName} · {formatDate(project.updatedAt)}</small></span><span className={`status-dot ${project.status}`} /></button>)}{projects.length === 0 ? <div className="studio-rail-empty"><Folder /><p>No projects yet.</p><button onClick={() => setCreating(true)}>Create the first one</button></div> : null}</div>
      <button className="studio-skills-button" onClick={() => { setEditingSkill(null); setSkillCreator(true); }}><Sparkle /> New content skill <ArrowRight /></button>
    </aside>
    {creating || !detail ? <ProjectCreator skills={skills} sources={sources} onCreated={acceptCreated} onSkillCreator={() => { setEditingSkill(null); setSkillCreator(true); }} onSkillEditor={(skill) => { setEditingSkill(skill); setSkillCreator(true); }} /> : <ProjectDetail detail={detail} onRun={run} onRevise={setRevisionStep} busy={busy} runFailed={runFailed} status={status} selectedStepId={selectedStepId} setSelectedStepId={setSelectedStepId} onNew={() => setCreating(true)} onCitation={inspectCitation} />}
    {skillCreator ? <SkillCreator skill={editingSkill} onClose={() => setSkillCreator(false)} onSaved={savedSkill} /> : null}
    {revisionStep && detail ? <RevisionEditor project={detail.project} step={revisionStep} onClose={() => setRevisionStep(null)} onSaved={savedRevision} /> : null}
    {sourceView ? <StudioSourceModal view={sourceView} onClose={() => setSourceView(null)} /> : null}
  </main>;
}
