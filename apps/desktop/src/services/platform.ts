import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  BinaryPayload,
  AudioRetentionResult,
  AgentProposal,
  BootstrapState,
  CaptureSession,
  ChatConversation,
  ChatMessage,
  ChatTurn,
  Citation,
  CompleteInterviewAudioInput,
  Conversation,
  ConversationExchange,
  ConversationMessage,
  ContentProject,
  ContentProjectDetail,
  ContentSkill,
  ContentStep,
  ContentStepRun,
  CreateContentProjectInput,
  DashboardOverview,
  ImageMemory,
  IndexStats,
  IndexedSource,
  InterviewAccessEntry,
  InterviewExchange,
  InterviewHost,
  InterviewSession,
  InterviewStart,
  InterviewTurn,
  LibraryOverview,
  NoteDocument,
  ParakeetStatus,
  ProviderCatalog,
  ProviderCostSummary,
  ProviderDiagnostic,
  QueueAgentProposalInput,
  ProcessInterviewAudioInput,
  ResolveReviewInput,
  ReviewDecision,
  ReviewRecord,
  SaveContentSkillInput,
  SaveContentStepRevisionInput,
  SaveGenerationProviderInput,
  SaveInterviewHostInput,
  SaveNoteInput,
  SaveProviderCredentialInput,
  SaveSyncCredentialsInput,
  SearchQuery,
  SearchResult,
  ShareImportReport,
  ShortcutSettingsState,
  SendChatInput,
  SendInterviewTurnInput,
  SetFavoriteModelInput,
  SetDefaultProviderModelInput,
  SetPreferredModelInput,
  SourceDocument,
  StartInterviewInput,
  SyncFileDescriptor,
  SyncManifest,
  SyncState,
  SyncWriteOutcome,
  SubmitConversationTurnInput,
  TagsOverview,
  TestGenerationProviderInput,
  TranscriptCleanupProposal,
  TranscriptionProvider,
  WriteSyncedFileInput,
} from "../types/domain";

interface BrowserSource {
  id: string;
  title: string;
  originalName: string;
  extension: string;
  bytes: number;
  markdown: string;
  updatedAt: string;
  relativePath: string;
}

interface BrowserReviewDecision {
  id: string;
  decision: string;
  decidedAt: string;
}

interface BrowserPassage {
  passageId: string;
  title: string;
  relativePath: string;
  sourceType: string;
  quote: string;
}

interface BrowserChatState {
  conversations: ChatConversation[];
  messages: Record<string, ChatMessage[]>;
}

interface BrowserInterviewState {
  hosts: InterviewHost[];
  interviews: InterviewSession[];
  turns: Record<string, InterviewTurn[]>;
  access: Record<string, InterviewAccessEntry[]>;
}

interface BrowserConversationState {
  conversations: Conversation[];
  messages: Record<string, ConversationMessage[]>;
  access: Record<string, InterviewAccessEntry[]>;
  hosts: InterviewHost[];
}

interface BrowserContentState {
  skills: ContentSkill[];
  projects: ContentProject[];
  steps: Record<string, ContentStep[]>;
}

interface BrowserSyncStoredState extends SyncState {
  accessToken: string | null;
}

interface BrowserAudioSaveResult {
  status: string;
  audioBytes: number;
  audioMimeType: string;
}

type SelectedSource = string | File;

function parseStored<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

const browserBrainKey = "second-brain-browser-bootstrap";
const browserNoteKey = "second-brain-browser-notes";
const browserSourceKey = "second-brain-browser-sources";
const browserImageKey = "second-brain-browser-images";
const browserReviewKey = "second-brain-browser-review";
const browserReviewDecisionKey = "second-brain-browser-review-decisions";
const browserChatKey = "second-brain-browser-chats";
const browserInterviewKey = "second-brain-browser-interviews";
const browserConversationKey = "second-brain-browser-conversations-v2";
const browserContentKey = "second-brain-browser-content";
const browserSyncKey = "second-brain-browser-sync";
const browserSyncManifestKey = "second-brain-browser-sync-manifest";
const browserShortcutKey = "second-brain-browser-shortcut";
const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function reportFrontendReady(): Promise<void> {
  if (isTauri()) await invoke<void>("frontend_ready");
}

export async function listenForQuickCapture(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  return listen("second-brain://quick-capture", handler);
}

export async function listenForSharedImports(
  handler: (report: ShareImportReport) => void,
): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  let stopped = false;
  let checking = false;
  const check = async () => {
    if (stopped || checking) return;
    checking = true;
    try {
      const report = await invoke<ShareImportReport>("import_shared_items");
      if (!stopped && (report.imported > 0 || report.failed > 0)) handler(report);
    } finally {
      checking = false;
    }
  };
  const onFocus = () => void check();
  window.addEventListener("focus", onFocus);
  const interval = window.setInterval(check, 10_000);
  void check();
  return () => {
    stopped = true;
    window.removeEventListener("focus", onFocus);
    window.clearInterval(interval);
  };
}

export async function getShortcutSettings(): Promise<ShortcutSettingsState> {
  if (isTauri()) return invoke<ShortcutSettingsState>("get_shortcut_settings");
  const stored = parseStored<Partial<ShortcutSettingsState>>(localStorage.getItem(browserShortcutKey), {});
  return {
    enabled: false,
    shortcut: "CommandOrControl+Shift+Space",
    registered: false,
    localEnabled: true,
    localShortcut: "Control+Shift+C",
    detail: "Global shortcuts are available in the native desktop app.",
    ...stored,
  };
}

export async function updateQuickCaptureShortcut(
  shortcut: string,
  enabled: boolean,
  localShortcut: string,
  localEnabled: boolean,
): Promise<ShortcutSettingsState> {
  if (isTauri()) {
    const state = await invoke<ShortcutSettingsState>("update_quick_capture_shortcut", {
      shortcut,
      enabled,
      localShortcut,
      localEnabled,
    });
    window.dispatchEvent(new CustomEvent("second-brain:shortcut-settings", { detail: state }));
    return state;
  }
  const state = {
    enabled,
    shortcut,
    registered: false,
    localEnabled,
    localShortcut,
    detail: "Saved for preview. Global registration requires the native desktop app.",
  };
  localStorage.setItem(browserShortcutKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("second-brain:shortcut-settings", { detail: state }));
  return state;
}

const browserBootstrap: BootstrapState = {
  configured: true,
  brainFolders: [],
  activeBrain: "Browser preview · no local brain connected",
  transcriptionProvider: "none",
  microphonePermission: "skipped",
  speechPermission: "not-requested",
  transcriptionCorrectionPreference: "verbatim",
  defaultAgentMode: "read-only",
  allowGeneralKnowledgeDefault: false,
  sessions: [],
  runtime: "browser",
};

function browserState(): BootstrapState {
  const saved = localStorage.getItem(browserBrainKey);
  if (!saved) return browserBootstrap;
  const parsed = parseStored(saved, browserBootstrap);
  return parsed.activeBrain === "~/SecondBrain" ? browserBootstrap : parsed;
}

function saveBrowserState(next: BootstrapState): BootstrapState {
  localStorage.setItem(browserBrainKey, JSON.stringify(next));
  return next;
}

function browserNotes(): NoteDocument[] {
  return parseStored(localStorage.getItem(browserNoteKey), []);
}

function saveBrowserNotes(notes: NoteDocument[]): NoteDocument[] {
  localStorage.setItem(browserNoteKey, JSON.stringify(notes));
  return notes;
}

function browserNoteSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "note";
}

function normalizedBrowserTags(tags: string[] | null | undefined): string[] {
  return [...new Set((tags || []).map((tag) => tag.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-")).filter(Boolean))].sort().slice(0, 20);
}

function browserNoteMarkdown(note: NoteDocument): string {
  const sources = (note.sources || []).length ? `\n\n## Sources\n\n${note.sources.map((source) => `- Source: \`${source.relativePath}\`\n  > ${(source.quote || "").replace(/\s+/g, " ").trim()}`).join("\n")}` : "";
  return `---\nid: ${note.id}\ntype: atomic-note\ncreated_at: ${note.createdAt}\nupdated_at: ${note.updatedAt}\ntags: [${note.tags.join(", ")}]\n---\n\n# ${note.title}\n\n${note.body}${sources}\n`;
}

function browserReviewRecords(): ReviewRecord[] {
  return parseStored(localStorage.getItem(browserReviewKey), []);
}

function saveBrowserReviewRecords(records: ReviewRecord[]): ReviewRecord[] {
  localStorage.setItem(browserReviewKey, JSON.stringify(records));
  return records;
}

function browserReviewDecisions(): BrowserReviewDecision[] {
  return parseStored(localStorage.getItem(browserReviewDecisionKey), []);
}

function ensureBrowserReviewAcceptanceRecords(): ReviewRecord[] {
  const records = browserReviewRecords();
  if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has("review-fixture")) return records;
  const importedSource = browserSources()[0];
  const noteSource = browserNotes()[0];
  const source: BrowserSource | NoteDocument | undefined = importedSource || noteSource;
  if (!source) return records;
  const decided = new Set(browserReviewDecisions().map((item) => item.id));
  const body = noteSource?.body || "";
  const quote = body.split(/\n\s*\n/)[0]?.trim() || source.markdown.split(/\n\s*\n/).find((block) => !block.trim().startsWith("#"))?.trim() || "The exact supporting words remain visible.";
  const fixtures = [
    { id: `acceptance-approve-${source.id}`, itemType: "atomic-note", title: "Imported ideas remain traceable", detail: "Acceptance proposal created from a local source", sourceRelativePath: source.relativePath, quote, reason: "This is a self-contained claim with a precise local source.", proposedAction: "Create a sourced Markdown note: Imported ideas remain traceable", proposedContent: quote, confidence: null, status: "pending", sessionId: null, reviewRelativePath: `review/pending/acceptance-approve-${source.id}.md` },
    { id: `acceptance-deny-${source.id}`, itemType: "atomic-note", title: "Review decisions remain explicit", detail: "Acceptance proposal created from a local source", sourceRelativePath: source.relativePath, quote, reason: "This second proposal verifies that denial changes no canonical content.", proposedAction: "Create a sourced Markdown note: Review decisions remain explicit", proposedContent: quote, confidence: null, status: "pending", sessionId: null, reviewRelativePath: `review/pending/acceptance-deny-${source.id}.md` },
  ];
  const known = new Set(records.map((item) => item.id));
  const additions = fixtures.filter((item) => !known.has(item.id) && !decided.has(item.id));
  return additions.length ? saveBrowserReviewRecords([...records, ...additions]) : records;
}

function browserSources(): BrowserSource[] {
  return parseStored(localStorage.getItem(browserSourceKey), []);
}

function saveBrowserSources(sources: BrowserSource[]): BrowserSource[] {
  localStorage.setItem(browserSourceKey, JSON.stringify(sources));
  return sources;
}

function browserImages(): ImageMemory[] {
  return parseStored(localStorage.getItem(browserImageKey), []);
}

function saveBrowserImages(images: ImageMemory[]): ImageMemory[] {
  localStorage.setItem(browserImageKey, JSON.stringify(images));
  return images;
}

function browserSourceTitle(text: string, filename: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("# "))?.slice(2).trim() || filename.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]+/g, " ");
}

export async function getBootstrapState(): Promise<BootstrapState> {
  return isTauri() ? invoke<BootstrapState>("get_bootstrap_state") : browserState();
}

export async function updateBehaviorPreferences(
  transcriptionCorrectionPreference: string,
  defaultAgentMode: string,
  allowGeneralKnowledgeDefault: boolean,
): Promise<BootstrapState> {
  if (isTauri()) return invoke<BootstrapState>("update_behavior_preferences", { transcriptionCorrectionPreference, defaultAgentMode, allowGeneralKnowledgeDefault });
  return saveBrowserState({ ...browserState(), transcriptionCorrectionPreference, defaultAgentMode: defaultAgentMode as BootstrapState["defaultAgentMode"], allowGeneralKnowledgeDefault });
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  if (isTauri()) return invoke<DashboardOverview>("get_dashboard_overview");
  const bootstrap = browserState();
  const captures = bootstrap.sessions || [];
  const notes = browserNotes();
  const conversations = browserChats().conversations;
  const interviews = browserInterviews().interviews;
  const projects = browserContentState().projects;
  const images = browserImages();
  const reviewRecords = browserReviewRecords();
  const recentActivity: DashboardOverview["recentActivity"] = [
    ...captures.map((session) => ({ id: `capture:${session.id}`, kind: "capture", label: session.status === "ready" ? "Capture organized" : "Capture saved", title: session.title, updatedAt: session.updatedAt, target: "capture", relativePath: session.relativeFolder })),
    ...notes.map((note) => ({ id: `note:${note.relativePath}`, kind: "note", label: "Note updated", title: note.title, updatedAt: note.updatedAt, target: "knowledge", relativePath: note.relativePath })),
    ...images.map((memory) => ({ id: `image:${memory.id}`, kind: "image", label: memory.status === "ready" ? "Image source reviewed" : "Image source saved", title: memory.title, updatedAt: memory.updatedAt, target: "knowledge", relativePath: memory.relativeFolder })),
    ...conversations.map((conversation) => ({ id: `chat:${conversation.id}`, kind: "chat", label: "Chat continued", title: conversation.title, updatedAt: conversation.updatedAt, target: "chat", relativePath: null })),
    ...interviews.map((interview) => ({ id: `interview:${interview.id}`, kind: "interview", label: interview.status === "active" ? "Interview in progress" : "Interview completed", title: interview.title, updatedAt: interview.updatedAt, target: "interviews", relativePath: interview.relativeFolder })),
    ...projects.map((project) => ({ id: `project:${project.id}`, kind: "project", label: "Studio project updated", title: project.title, updatedAt: project.updatedAt, target: "studio", relativePath: project.relativeFolder })),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8);
  const retainedAudioBytes = captures.reduce((total, session) => total + (session.audioBytes || 0), 0);
  const retainedImageBytes = images.reduce((total, memory) => total + (memory.imageBytes || 0), 0);
  const reviewCounts: Record<string, number> = {};
  for (const record of reviewRecords) {
    reviewCounts[record.itemType] = (reviewCounts[record.itemType] || 0) + 1;
  }
  return {
    stats: { noteCount: notes.length, captureCount: captures.length, retainedAudioBytes, storageBytes: retainedAudioBytes + retainedImageBytes + notes.reduce((total, note) => total + (note.markdown || browserNoteMarkdown(note)).length, 0), reviewCount: reviewRecords.length },
    recentActivity,
    reviewCounts,
  };
}

export async function getAudioRetention(): Promise<AudioRetentionResult> {
  if (isTauri()) return invoke<AudioRetentionResult>("get_audio_retention");
  return parseStored(localStorage.getItem("second-brain-audio-retention"), {
    days: null,
    removedFiles: 0,
    removedBytes: 0,
  });
}

export async function setAudioRetention(
  days: number | null,
): Promise<AudioRetentionResult> {
  if (isTauri()) return invoke<AudioRetentionResult>("set_audio_retention", { days });
  const result = { days, removedFiles: 0, removedBytes: 0 };
  localStorage.setItem("second-brain-audio-retention", JSON.stringify(result));
  return result;
}

export async function getLibraryOverview(): Promise<LibraryOverview> {
  if (isTauri()) return invoke<LibraryOverview>("get_library_overview");
  const captures = browserState().sessions || [];
  const sources = browserSources();
  const images = browserImages();
  const items: LibraryOverview["items"] = [
    ...captures.map((session) => ({ id: `capture:${session.id}`, title: session.title, kind: "capture", relativePath: `${session.relativeFolder}/transcript.md`, updatedAt: session.updatedAt, detail: session.status === "ready" ? "Capture · transcript and original audio" : `Capture · ${session.status.replaceAll("_", " ")}`, sessionId: session.id, hasAudio: Boolean(session.audioPath), audioBytes: session.audioBytes || 0, imageId: null, hasImage: false, imageBytes: 0 })),
    ...sources.map((source) => ({ id: `source:${source.relativePath}`, title: source.title, kind: "file", relativePath: source.relativePath, updatedAt: source.updatedAt, detail: `Imported ${source.extension.toUpperCase()} · ${source.bytes} bytes`, sessionId: null, hasAudio: false, audioBytes: 0, imageId: null, hasImage: false, imageBytes: 0 })),
    ...images.map((memory) => ({ id: `image:${memory.id}`, title: memory.title, kind: "image", relativePath: memory.status === "ready" ? memory.relativeSourcePath : memory.relativeImagePath, updatedAt: memory.updatedAt, detail: memory.status === "ready" ? "Image source · searchable Markdown" : memory.status === "analysis_failed" ? "Image source · original safe · AI review needs attention" : "Image source · stored in browser preview · desktop AI review required", sessionId: null, hasAudio: false, audioBytes: 0, imageId: memory.id, hasImage: true, imageBytes: memory.imageBytes })),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { stats: { captureCount: captures.length, fileCount: sources.length, videoCount: 0, imageCount: images.length, retainedAudioBytes: captures.reduce((total, session) => total + (session.audioBytes || 0), 0), retainedImageBytes: images.reduce((total, memory) => total + (memory.imageBytes || 0), 0) }, items };
}

export async function importSourceFiles(paths: SelectedSource[]): Promise<LibraryOverview> {
  if (isTauri()) return invoke<LibraryOverview>("import_source_files", { paths: paths.filter((path): path is string => typeof path === "string") });
  const files = paths.filter((path): path is File => path instanceof File);
  const prepared = await Promise.all(files.map(async (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["md", "markdown", "txt"].includes(extension)) throw new Error("Only Markdown and plain-text files are supported in this build.");
    if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than the 25 MB text-file limit.`);
    const markdown = await file.text();
    const id = crypto.randomUUID();
    return { id, title: browserSourceTitle(markdown, file.name), originalName: file.name, extension, bytes: file.size, markdown, updatedAt: new Date().toISOString(), relativePath: "" };
  }));
  const existing = browserSources();
  const occupied = new Set(existing.map((source) => source.relativePath));
  for (const source of prepared) {
    const stem = source.originalName.replace(/\.[^.]+$/, "") || "source";
    let filename = `${stem}.${source.extension}`;
    let suffix = 2;
    while (occupied.has(`sources/${filename}`)) filename = `${stem}-${suffix++}.${source.extension}`;
    source.relativePath = `sources/${filename}`;
    occupied.add(source.relativePath);
  }
  saveBrowserSources([...prepared, ...existing]);
  return getLibraryOverview();
}

export async function importVideoFiles(paths: SelectedSource[]): Promise<LibraryOverview> {
  if (!isTauri()) {
    throw new Error("Local video transcription is available in the installed macOS app.");
  }
  return invoke<LibraryOverview>("import_video_files", {
    paths: paths.filter((path): path is string => typeof path === "string"),
  });
}

export async function listNotes(): Promise<NoteDocument[]> {
  if (isTauri()) return invoke<NoteDocument[]>("list_notes");
  return [...browserNotes()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveNote(input: SaveNoteInput): Promise<NoteDocument> {
  if (isTauri()) return invoke<NoteDocument>("save_note", { input });
  const title = input.title?.trim();
  const body = input.body?.trim();
  if (!title || title.length > 120 || /[\r\n]/.test(title)) throw new Error("Use a one-line title between 1 and 120 characters.");
  if (!body) throw new Error("Note body cannot be empty.");
  const notes = browserNotes();
  const existing = input.relativePath ? notes.find((note) => note.relativePath === input.relativePath) : null;
  if (input.relativePath && !existing) throw new Error("The selected browser-preview note could not be found.");
  const now = new Date().toISOString();
  const id = existing?.id || crypto.randomUUID();
  const note: NoteDocument = {
    id,
    title,
    body,
    excerpt: body.replace(/^#+\s+/gm, "").replace(/\s+/g, " ").slice(0, 180),
    tags: normalizedBrowserTags(input.tags),
    sources: existing?.sources || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    relativePath: existing?.relativePath || `notes/${browserNoteSlug(title)}-${id.slice(0, 8)}.md`,
    markdown: "",
  };
  note.markdown = browserNoteMarkdown(note);
  saveBrowserNotes([note, ...notes.filter((item) => item.relativePath !== note.relativePath)]);
  return note;
}

export async function trashNote(relativePath: string): Promise<void> {
  if (isTauri()) return invoke<void>("trash_note", { relativePath });
  const notes = browserNotes();
  if (!notes.some((note) => note.relativePath === relativePath)) throw new Error("The selected browser-preview note could not be found.");
  saveBrowserNotes(notes.filter((note) => note.relativePath !== relativePath));
  saveBrowserReviewRecords(
    browserReviewRecords().filter((record) => record.targetRelativePath !== relativePath),
  );
}

export async function openNoteExternal(relativePath: string): Promise<void> {
  if (isTauri()) return invoke<void>("open_note_external", { relativePath });
  throw new Error("Opening a note externally is available in the installed desktop app.");
}

export async function listReviewItems(): Promise<ReviewRecord[]> {
  if (isTauri()) return invoke<ReviewRecord[]>("list_review_items");
  const notePaths = new Set(browserNotes().map((note) => note.relativePath));
  return ensureBrowserReviewAcceptanceRecords().filter((record) => {
    const requiresTarget = ["append-source", "merge", "apply-agent-change"].includes(
      record.suggestedAction || "",
    );
    return !requiresTarget || Boolean(record.targetRelativePath && notePaths.has(record.targetRelativePath));
  });
}

export async function resolveReviewItem(input: ResolveReviewInput): Promise<ReviewDecision> {
  if (isTauri()) return invoke<ReviewDecision>("resolve_review_item", { input });
  if (!["approved", "denied"].includes(input.decision)) throw new Error("Decision must be approved or denied.");
  const records = browserReviewRecords();
  const record = records.find((item) => item.id === input.id);
  if (!record) throw new Error("This proposal is no longer pending.");
  let createdNote: NoteDocument | null = null;
  if (input.decision === "approved") {
    const notes = browserNotes();
    const existing = record.targetRelativePath
      ? notes.find((note) => note.relativePath === record.targetRelativePath)
      : null;
    const source = { relativePath: record.sourceRelativePath, quote: record.quote };
    if (record.itemType === "agent-change") {
      if (!existing) throw new Error("The proposed target note no longer exists.");
      const body = (record.proposedContent || "").trim();
      if (!body) throw new Error("The agent proposal has no revised body.");
      createdNote = { ...existing, body, excerpt: body.replace(/\s+/g, " ").slice(0, 180), updatedAt: new Date().toISOString() };
      createdNote.markdown = browserNoteMarkdown(createdNote);
      saveBrowserNotes([createdNote, ...notes.filter((item) => item.relativePath !== createdNote?.relativePath)]);
    } else if (record.suggestedAction === "append-source" || record.suggestedAction === "merge") {
      if (!existing) throw new Error("The proposed target note no longer exists.");
      const proposed = (record.proposedContent || record.quote).trim();
      const body = record.suggestedAction === "merge" && proposed && !existing.body.toLowerCase().includes(proposed.toLowerCase())
        ? `${existing.body.trim()}\n\n## Merged claim\n\n${proposed}`
        : existing.body;
      createdNote = {
        ...existing,
        body,
        excerpt: body.replace(/\s+/g, " ").slice(0, 180),
        updatedAt: new Date().toISOString(),
        sources: existing.sources.some((item) => item.relativePath === source.relativePath && item.quote === source.quote)
          ? existing.sources
          : [...existing.sources, source],
      };
      createdNote.markdown = browserNoteMarkdown(createdNote);
      saveBrowserNotes([createdNote, ...notes.filter((item) => item.relativePath !== createdNote?.relativePath)]);
    } else {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      createdNote = {
        id,
        title: record.title,
        body: record.proposedContent || record.quote,
        excerpt: (record.proposedContent || record.quote).replace(/\s+/g, " ").slice(0, 180),
        tags: [],
        sources: [source],
        createdAt: now,
        updatedAt: now,
        relativePath: `notes/${browserNoteSlug(record.title)}-${id.slice(0, 8)}.md`,
        markdown: "",
      };
      createdNote.markdown = browserNoteMarkdown(createdNote);
      saveBrowserNotes([createdNote, ...notes]);
    }
  }
  saveBrowserReviewRecords(records.filter((item) => item.id !== record.id));
  const decision = { id: record.id, decision: input.decision, decidedAt: new Date().toISOString() };
  localStorage.setItem(browserReviewDecisionKey, JSON.stringify([...browserReviewDecisions(), decision]));
  return { record, createdNote, decisionRelativePath: `review/decisions/${input.decision}/${record.id}.md` };
}

export async function updateCaptureTranscript(
  sessionId: string,
  transcript: string,
  reorganize: boolean,
): Promise<CaptureSession> {
  if (isTauri()) {
    return invoke<CaptureSession>("update_capture_transcript", {
      sessionId,
      transcript,
      reorganize,
    });
  }
  const wording = transcript.trim();
  if (!wording) throw new Error("Transcript cannot be empty.");
  const state = browserState();
  const existing = state.sessions.find((session) => session.id === sessionId);
  if (!existing) throw new Error("The selected capture could not be found.");
  const updated: CaptureSession = {
    ...existing,
    transcript: wording,
    status: "ready",
    updatedAt: new Date().toISOString(),
    processingError: null,
    ...(reorganize ? { summary: wording.slice(0, 360), atomicNotes: [] } : {}),
  };
  saveBrowserState({
    ...state,
    sessions: state.sessions.map((session) =>
      session.id === sessionId ? updated : session,
    ),
  });
  return updated;
}

export async function proposeTranscriptCleanup(
  sessionId: string,
): Promise<TranscriptCleanupProposal> {
  if (isTauri()) {
    return invoke<TranscriptCleanupProposal>("propose_transcript_cleanup", {
      sessionId,
    });
  }
  throw new Error(
    "AI transcript cleanup requires a configured provider in the installed desktop app.",
  );
}

export async function getTagsOverview(): Promise<TagsOverview> {
  if (isTauri()) return invoke<TagsOverview>("get_tags_overview");
  const notes = browserNotes().map((note) => ({
    id: `note:${note.id}`,
    title: note.title,
    relativePath: note.relativePath,
    sourceType: "note",
    tags: normalizedBrowserTags(note.tags),
    updatedAt: note.updatedAt,
    sourceCount: (note.sources || []).length,
  }));
  const captures = (browserState().sessions || []).filter((session) => session.tags?.length).map((session) => ({
    id: `capture:${session.id}`,
    title: session.title,
    relativePath: `${session.relativeFolder}/transcript.md`,
    sourceType: "capture",
    tags: normalizedBrowserTags(session.tags),
    updatedAt: session.updatedAt,
    sourceCount: 1,
  }));
  const sources = [...notes, ...captures].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title));
  const counts = new Map<string, number>();
  for (const source of sources) for (const tag of source.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  const tags = [...counts].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  return { tags, sources };
}

export async function chooseBrainFolder(): Promise<string | null> {
  if (!isTauri()) throw new Error("Folder selection is available in the installed desktop app.");
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({ directory: true, multiple: false, title: "Choose your Burrowise folder" });
}

export async function chooseSourceFiles(): Promise<SelectedSource[]> {
  if (!isTauri()) {
    return new Promise<File[]>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = ".md,.markdown,.txt,text/markdown,text/plain";
      input.hidden = true;
      input.addEventListener("change", () => { const files = [...(input.files || [])]; input.remove(); resolve(files); }, { once: true });
      input.addEventListener("cancel", () => { input.remove(); resolve([]); }, { once: true });
      document.body.append(input);
      input.click();
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: true,
    title: "Import Markdown or text sources",
    filters: [{ name: "Readable text", extensions: ["md", "markdown", "txt"] }],
  });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function chooseImageFiles(): Promise<SelectedSource[]> {
  if (!isTauri()) {
    return new Promise<File[]>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "image/jpeg,image/png,image/webp,image/gif,image/heic,.heic,.heif";
      input.hidden = true;
      input.addEventListener("change", () => { const files = [...(input.files || [])]; input.remove(); resolve(files); }, { once: true });
      input.addEventListener("cancel", () => { input.remove(); resolve([]); }, { once: true });
      document.body.append(input);
      input.click();
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: true,
    title: "Add photos or image sources",
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"] }],
  });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function chooseVideoFiles(): Promise<SelectedSource[]> {
  if (!isTauri()) {
    throw new Error("Local video transcription is available in the installed macOS app.");
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: true,
    title: "Add videos to your memory",
    filters: [{ name: "Videos", extensions: ["mp4", "mov", "m4v"] }],
  });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function configureBrainFolder(path: string): Promise<BootstrapState> {
  if (isTauri()) return invoke<BootstrapState>("configure_brain_folder", { path });
  const current = browserState();
  return saveBrowserState({ ...current, configured: true, activeBrain: path, brainFolders: [...new Set([...current.brainFolders, path])] });
}

export async function createCaptureSession(): Promise<CaptureSession> {
  if (isTauri()) return invoke<CaptureSession>("create_capture_session");
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "Untitled voice capture",
    createdAt: now,
    updatedAt: now,
    folderPath: "/browser-preview/sessions/untitled",
    relativeFolder: "sessions/browser-preview",
    status: "recording",
    audioPath: null,
    audioMimeType: null,
    audioBytes: null,
    transcriptPath: "/browser-preview/sessions/untitled/transcript.md",
    transcript: "",
    summary: "",
    tags: [],
    processingError: null,
    transcriptionProvider: null,
    atomicNotes: [],
  };
}

export async function failCaptureSession(sessionId: string, message: string): Promise<CaptureSession> {
  if (isTauri()) return invoke<CaptureSession>("fail_capture_session", { sessionId, message });
  const state = browserState();
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("The capture session could not be found.");
  const failed = { ...session, status: "recording_failed", processingError: message, updatedAt: new Date().toISOString() };
  saveBrowserState({ ...state, sessions: state.sessions.map((item) => item.id === sessionId ? failed : item) });
  return failed;
}

function openCaptureDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("second-brain-captures", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("audio")) request.result.createObjectStore("audio");
      if (!request.result.objectStoreNames.contains("images")) request.result.createObjectStore("images");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readBrowserAudio(sessionId: string): Promise<Blob> {
  const database = await openCaptureDatabase();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction("audio", "readonly").objectStore("audio").get(sessionId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  if (!blob) throw new Error("The saved audio could not be found.");
  return blob;
}

async function saveBrowserAudio(sessionId: string, bytes: Uint8Array, mimeType: string): Promise<BrowserAudioSaveResult> {
  const database = await openCaptureDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("audio", "readwrite");
    transaction.objectStore("audio").put(new Blob([bytes], { type: mimeType }), sessionId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return { status: "awaiting_transcription", audioBytes: bytes.byteLength, audioMimeType: mimeType };
}

async function saveBrowserImage(imageId: string, blob: Blob): Promise<void> {
  const database = await openCaptureDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("images", "readwrite");
    transaction.objectStore("images").put(blob, imageId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function readBrowserImage(imageId: string): Promise<Blob> {
  const database = await openCaptureDatabase();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction("images", "readonly").objectStore("images").get(imageId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  if (!blob) throw new Error("The stored image could not be found.");
  return blob;
}

export async function importImageFiles(paths: SelectedSource[]): Promise<ImageMemory[]> {
  if (isTauri()) return invoke<ImageMemory[]>("import_image_files", { paths: paths.filter((path): path is string => typeof path === "string") });
  const files = paths.filter((path): path is File => path instanceof File);
  const supported = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);
  const prepared: ImageMemory[] = [];
  for (const file of files) {
    if (!supported.has(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) throw new Error(`${file.name} is not a supported image.`);
    if (!file.size || file.size > 25 * 1024 * 1024) throw new Error(`${file.name} must be between 1 byte and 25 MB.`);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const slug = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "image";
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const relativeFolder = `sources/images/${slug}-${id.slice(0, 8)}`;
    const memory = {
      id,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
      createdAt: now,
      updatedAt: now,
      folderPath: `/browser-preview/${relativeFolder}`,
      relativeFolder,
      imagePath: `/browser-preview/${relativeFolder}/original.${extension}`,
      relativeImagePath: `${relativeFolder}/original.${extension}`,
      imageMimeType: file.type || "image/jpeg",
      imageBytes: file.size,
      analysisImagePath: `/browser-preview/${relativeFolder}/original.${extension}`,
      analysisImageMimeType: file.type || "image/jpeg",
      sourcePath: `/browser-preview/${relativeFolder}/source.md`,
      relativeSourcePath: `${relativeFolder}/source.md`,
      status: "needs_model",
      extractedMarkdown: "",
      processingError: "AI image review runs in the installed desktop app with an explicitly selected image model.",
      providerId: null,
      modelId: null,
      locality: null,
    };
    await saveBrowserImage(id, file);
    prepared.push(memory);
  }
  saveBrowserImages([...prepared, ...browserImages()]);
  return prepared;
}

export async function getImageMemory(imageId: string): Promise<ImageMemory> {
  if (isTauri()) return invoke<ImageMemory>("get_image_memory", { imageId });
  const memory = browserImages().find((item) => item.id === imageId);
  if (!memory) throw new Error("The image source could not be found.");
  return memory;
}

export async function processImageMemory(imageId: string): Promise<ImageMemory> {
  if (isTauri()) return invoke<ImageMemory>("process_image_memory", { imageId });
  return getImageMemory(imageId);
}

export async function loadImageMemory(imageId: string): Promise<Blob> {
  if (!isTauri()) return readBrowserImage(imageId);
  const payload = await invoke<BinaryPayload>("read_image_memory", { imageId });
  return new Blob([new Uint8Array(payload.bytes)], { type: payload.mimeType || "image/jpeg" });
}

export async function revealImageMemory(imageId: string): Promise<void> {
  if (isTauri()) return invoke<void>("reveal_image_memory", { imageId });
  throw new Error("Opening an image source in Finder is available in the installed desktop app.");
}

export async function saveCaptureAudio(sessionId: string, blob: Blob): Promise<CaptureSession | BrowserAudioSaveResult> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (isTauri()) {
    return invoke<CaptureSession>("save_capture_audio", bytes, {
      headers: {
        "x-session-id": sessionId,
        "x-audio-mime-type": blob.type || "application/octet-stream",
      },
    });
  }
  return saveBrowserAudio(sessionId, bytes, blob.type || "audio/webm");
}

export async function saveCaptureAudioSnapshot(sessionId: string, blob: Blob): Promise<void> {
  if (!isTauri()) return;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke<CaptureSession>("save_capture_audio_snapshot", bytes, {
    headers: {
      "x-session-id": sessionId,
      "x-audio-mime-type": blob.type || "application/octet-stream",
    },
  });
}

export async function transcribeCaptureSnapshot(sessionId: string): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("transcribe_capture_snapshot", { sessionId });
}

export async function processCaptureSession(sessionId: string): Promise<CaptureSession> {
  if (isTauri()) return invoke<CaptureSession>("process_capture_session", { sessionId });
  return {
    id: sessionId,
    title: "Browser preview recording",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    folderPath: "/browser-preview/sessions/untitled",
    relativeFolder: "sessions/browser-preview",
    status: "awaiting_transcription",
    audioPath: `/browser-preview/audio/${sessionId}`,
    audioMimeType: "audio/wav",
    audioBytes: null,
    transcriptPath: "/browser-preview/sessions/untitled/transcript.md",
    transcript: "",
    summary: "",
    tags: [],
    processingError: "Transcription runs only in the installed macOS app.",
    transcriptionProvider: "browser-preview",
    atomicNotes: [],
  };
}

export async function revealCaptureSession(sessionId: string): Promise<void> {
  if (isTauri()) return invoke<void>("reveal_capture_session", { sessionId });
}

export async function openCaptureTranscript(sessionId: string): Promise<void> {
  if (isTauri()) return invoke<void>("open_capture_transcript", { sessionId });
}

export async function revealCaptureAudio(sessionId: string): Promise<void> {
  if (isTauri()) return invoke<void>("reveal_capture_audio", { sessionId });
}

export async function loadCaptureAudio(sessionId: string): Promise<Blob> {
  if (!isTauri()) return readBrowserAudio(sessionId);
  const payload = await invoke<BinaryPayload>("read_capture_audio", { sessionId });
  return new Blob([new Uint8Array(payload.bytes)], { type: payload.mimeType || "audio/wav" });
}

export async function renameCaptureSession(sessionId: string, title: string): Promise<CaptureSession> {
  if (isTauri()) return invoke<CaptureSession>("rename_capture_session", { sessionId, title });
  throw new Error("Renaming capture sessions is available in the installed desktop app.");
}

export async function trashCaptureSession(sessionId: string): Promise<void> {
  if (isTauri()) return invoke<void>("trash_capture_session", { sessionId });
  throw new Error("Moving capture sessions to Trash is available in the installed desktop app.");
}

export async function requestSpeechPermission(): Promise<BootstrapState> {
  if (isTauri()) return invoke<BootstrapState>("request_speech_permission");
  return saveBrowserState({ ...browserState(), speechPermission: "granted" });
}

export async function setTranscriptionProvider(providerId: string): Promise<BootstrapState> {
  if (isTauri()) return invoke<BootstrapState>("set_transcription_provider", { providerId });
  if (providerId !== "none") throw new Error("Local transcription providers are available in the installed desktop app.");
  return saveBrowserState({ ...browserState(), transcriptionProvider: providerId });
}

export async function setMicrophonePermissionState(permissionState: string): Promise<BootstrapState> {
  if (isTauri()) return invoke<BootstrapState>("set_microphone_permission_state", { permissionState });
  return saveBrowserState({ ...browserState(), microphonePermission: permissionState });
}

export async function listTranscriptionProviders(): Promise<TranscriptionProvider[]> {
  if (isTauri()) return invoke<TranscriptionProvider[]>("list_transcription_providers");
  return [
    { id: "none", label: "Record only", locality: "local", installed: true, available: true, detail: "Save raw audio without transcribing it." },
    { id: "apple-speech", label: "Apple Speech", locality: "local", installed: false, available: false, detail: "Detected only by the installed macOS app." },
    { id: "parakeet", label: "Parakeet Multilingual", locality: "local", installed: false, available: false, detail: "Local model download." },
  ];
}

export async function getParakeetStatus(): Promise<ParakeetStatus> {
  if (isTauri()) return invoke<ParakeetStatus>("get_parakeet_status");
  return {
    uvInstalled: false,
    cliInstalled: false,
    ffmpegInstalled: false,
    modelState: "not-downloaded",
    cachedBytes: 0,
    modelTotalBytes: 2_509_044_141,
    downloadInProgress: false,
    downloadError: null,
    executablePath: null,
    detail: "Parakeet setup is available in the installed desktop app.",
  };
}

export async function installParakeetCli(): Promise<ParakeetStatus> {
  if (isTauri()) return invoke<ParakeetStatus>("install_parakeet_cli");
  throw new Error("Parakeet installation is available in the installed desktop app.");
}

export async function downloadParakeetModel(): Promise<ParakeetStatus> {
  if (isTauri()) return invoke<ParakeetStatus>("download_parakeet_model");
  throw new Error("Parakeet model download is available in the installed desktop app.");
}

export async function revealBrainFolder(): Promise<void> {
  if (isTauri()) return invoke<void>("reveal_brain_folder");
  throw new Error("Opening the brain folder is available in the installed desktop app.");
}

export async function openMicrophoneSettings(): Promise<void> {
  if (isTauri()) return invoke<void>("open_microphone_settings");
  throw new Error("Microphone System Settings can be opened from the installed desktop app.");
}

export async function openSpeechSettings(): Promise<void> {
  if (isTauri()) return invoke<void>("open_speech_settings");
  throw new Error("Speech Recognition System Settings can be opened from the installed desktop app.");
}

function browserPassages(): BrowserPassage[] {
  const notePassages = browserNotes().flatMap((note) => note.body.split(/\n\s*\n/).map((quote, ordinal) => ({ passageId: `note:${note.id}:${ordinal}`, title: note.title, relativePath: note.relativePath, sourceType: "note", quote: quote.trim() })).filter((passage) => passage.quote.length >= 12));
  const sessionPassages = (browserState().sessions || []).flatMap((session) => session.transcript?.trim() ? [{ passageId: `session:${session.id}:0`, title: session.title, relativePath: `${session.relativeFolder}/transcript.md`, sourceType: "session", quote: session.transcript.trim() }] : []);
  const sourcePassages = browserSources().flatMap((source) => source.markdown.split(/\n\s*\n/).map((quote, ordinal) => ({ passageId: `source:${source.id}:${ordinal}`, title: source.title, relativePath: source.relativePath, sourceType: "source", quote: quote.trim() })).filter((passage) => passage.quote.length >= 12 && !passage.quote.startsWith("#")));
  return [...notePassages, ...sessionPassages, ...sourcePassages];
}

export async function rebuildSearchIndex(): Promise<IndexStats> {
  if (isTauri()) return invoke<IndexStats>("rebuild_search_index");
  const passages = browserPassages();
  return { filesIndexed: new Set(passages.map((passage) => passage.relativePath)).size, passagesIndexed: passages.length, indexedAt: new Date().toISOString() };
}

export async function clearSearchIndex(): Promise<IndexStats> {
  if (isTauri()) return invoke<IndexStats>("clear_search_index");
  localStorage.removeItem("second-brain-browser-search-index");
  return { filesIndexed: 0, passagesIndexed: 0, indexedAt: new Date().toISOString() };
}

export async function searchBrain(query: SearchQuery): Promise<SearchResult[]> {
  if (isTauri()) return invoke<SearchResult[]>("search_brain", { query });
  const terms = query.query.toLowerCase().split(/\W+/).filter((term) => term.length > 1);
  const conceptGroups = [
    ["privacy", "private", "confidential", "security", "cloud", "permission", "consent", "local"],
    ["capture", "record", "recording", "audio", "voice", "microphone"],
    ["reliable", "durable", "failure", "save", "saved", "recover"],
    ["ownership", "portable", "markdown", "file", "readable"],
    ["search", "find", "retrieve", "index", "passage"],
  ];
  return browserPassages()
    .filter((passage) => query.scope === "all" || query.scope === `${passage.sourceType}s` || query.scope === passage.sourceType || (query.scope === "selected" && passage.sourceType === "note" && (query.selectedPaths || []).includes(passage.relativePath)))
    .map((passage) => {
      const haystack = `${passage.title} ${passage.quote}`.toLowerCase();
      const lexicalScore = terms.filter((term) => haystack.includes(term)).length / Math.max(terms.length, 1);
      const expandedTerms = [...new Set(terms.flatMap((term) => conceptGroups.find((group) => group.includes(term)) || [term]))];
      const semanticScore = expandedTerms.filter((term) => haystack.includes(term)).length / Math.max(expandedTerms.length, 1);
      return { ...passage, lexicalScore, semanticScore, score: query.mode === "lexical" ? lexicalScore : ["semantic", "related"].includes(query.mode) ? semanticScore : lexicalScore * 0.68 + semanticScore * 0.32, matchType: query.mode };
    })
    .filter((passage) => passage.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, query.limit || 20);
}

function diversifyResults(results: SearchResult[], limit: number, maxPerSource = 2): SearchResult[] {
  const selected: SearchResult[] = [];
  const deferred: SearchResult[] = [];
  const sourceCounts = new Map<string, number>();
  const seenQuotes = new Set<string>();
  for (const result of results) {
    const normalized = result.quote.replace(/\s+/g, " ").trim().toLowerCase();
    if (seenQuotes.has(normalized)) continue;
    seenQuotes.add(normalized);
    const count = sourceCounts.get(result.relativePath) || 0;
    if (count < maxPerSource) {
      selected.push(result);
      sourceCounts.set(result.relativePath, count + 1);
    } else deferred.push(result);
    if (selected.length >= limit) return selected.slice(0, limit);
  }
  return [...selected, ...deferred].slice(0, limit);
}

export async function listIndexedSources(): Promise<IndexedSource[]> {
  if (isTauri()) return invoke<IndexedSource[]>("list_indexed_sources");
  return [...new Map(browserPassages().map(({ title, relativePath, sourceType }) => [relativePath, { title, relativePath, sourceType }])).values()];
}

export async function getSourceDocument(relativePath: string): Promise<SourceDocument> {
  if (isTauri()) return invoke<SourceDocument>("get_source_document", { relativePath });
  const note = browserNotes().find((item) => item.relativePath === relativePath);
  if (note) return { title: note.title, relativePath, absolutePath: `/browser-preview/${relativePath}`, markdown: note.markdown || browserNoteMarkdown(note) };
  const imported = browserSources().find((item) => item.relativePath === relativePath);
  if (imported) return { title: imported.title, relativePath, absolutePath: `/browser-preview/${relativePath}`, markdown: imported.markdown };
  const passage = browserPassages().find((item) => item.relativePath === relativePath);
  if (!passage) throw new Error("This source is not available in the browser preview.");
  return { title: passage.title, relativePath, absolutePath: `/browser-preview/${relativePath}`, markdown: `# ${passage.title}\n\n${passage.quote}` };
}

export async function revealSourceInFinder(relativePath: string): Promise<void> {
  if (isTauri()) return invoke<void>("reveal_source_in_finder", { relativePath });
  throw new Error("Finder reveal is available in the installed desktop app.");
}

function browserConversationState(): BrowserConversationState {
  const stored = localStorage.getItem(browserConversationKey);
  if (stored) return parseStored(stored, { conversations: [], messages: {}, access: {}, hosts: defaultInterviewHosts });

  const chats = parseStored<BrowserChatState>(localStorage.getItem(browserChatKey), { conversations: [], messages: {} });
  const interviews = parseStored<BrowserInterviewState>(localStorage.getItem(browserInterviewKey), { hosts: defaultInterviewHosts, interviews: [], turns: {}, access: {} });
  const conversations: Conversation[] = [
    ...chats.conversations.map((item) => ({ ...item, kind: "chat" as const, status: "active", hostId: null, hostName: null, folderPath: null, relativeFolder: null })),
    ...interviews.interviews.map((item) => ({ ...item, kind: "interview" as const, preview: "", hostId: item.hostId, hostName: item.hostName, folderPath: item.folderPath, relativeFolder: item.relativeFolder })),
  ];
  const messages: Record<string, ConversationMessage[]> = {};
  for (const [id, items] of Object.entries(chats.messages)) {
    messages[id] = items.map((item) => ({ ...item, audioPath: null, audioMimeType: null, stage: "", analysis: "", status: "complete" }));
  }
  for (const [id, items] of Object.entries(interviews.turns)) {
    const conversation = interviews.interviews.find((item) => item.id === id);
    messages[id] = items.map((item) => ({ ...item, conversationId: item.interviewId, provider: item.role === "user" ? "user" : conversation?.provider || "local-interviewer", model: item.role === "user" ? "human" : conversation?.model || "guided-v1", generalKnowledgeUsed: false }));
  }
  const migrated = { conversations, messages, access: interviews.access, hosts: interviews.hosts.length ? interviews.hosts : defaultInterviewHosts };
  localStorage.setItem(browserConversationKey, JSON.stringify(migrated));
  localStorage.removeItem(browserChatKey);
  localStorage.removeItem(browserInterviewKey);
  return migrated;
}

function saveBrowserConversationState(state: BrowserConversationState): BrowserConversationState {
  localStorage.setItem(browserConversationKey, JSON.stringify(state));
  return state;
}

function browserChats(): BrowserChatState {
  const state = browserConversationState();
  return {
    conversations: state.conversations.filter((item) => item.kind === "chat"),
    messages: Object.fromEntries(Object.entries(state.messages).filter(([id]) => state.conversations.some((item) => item.id === id && item.kind === "chat"))),
  };
}

function saveBrowserChats(state: BrowserChatState): BrowserChatState {
  const current = browserConversationState();
  const chatIds = new Set(state.conversations.map((item) => item.id));
  saveBrowserConversationState({
    ...current,
    conversations: [
      ...state.conversations.map((item) => ({ ...item, kind: "chat" as const, status: "active", hostId: null, hostName: null, folderPath: null, relativeFolder: null })),
      ...current.conversations.filter((item) => item.kind !== "chat"),
    ],
    messages: {
      ...Object.fromEntries(Object.entries(current.messages).filter(([id]) => !current.conversations.some((item) => item.id === id && item.kind === "chat"))),
      ...Object.fromEntries(Object.entries(state.messages).filter(([id]) => chatIds.has(id)).map(([id, items]) => [id, items.map((item) => ({ ...item, audioPath: null, audioMimeType: null, stage: "", analysis: "", status: "complete" }))])),
    },
  });
  return state;
}

export async function createChatConversation({ title = "Untitled chat", scope = "all" }: { title?: string; scope?: string } = {}): Promise<ChatConversation> {
  if (isTauri()) return invoke<ChatConversation>("create_chat_conversation", { title, scope });
  const now = new Date().toISOString();
  const conversation = { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now, scope, selectedPaths: [], provider: "local-retrieval", model: "extractive-v1", preview: "Start a new cited conversation" };
  const state = browserChats();
  saveBrowserChats({ ...state, conversations: [conversation, ...state.conversations], messages: { ...state.messages, [conversation.id]: [] } });
  return conversation;
}

export async function listChatConversations(): Promise<ChatConversation[]> {
  if (isTauri()) return (await listConversations("chat")).map(({ kind: _kind, status: _status, hostId: _hostId, hostName: _hostName, folderPath: _folderPath, relativeFolder: _relativeFolder, ...conversation }) => conversation);
  return browserChats().conversations;
}

export async function listChatMessages(conversationId: string): Promise<ChatMessage[]> {
  if (isTauri()) return (await listConversationMessages(conversationId)).map(({ audioPath: _audioPath, audioMimeType: _audioMimeType, stage: _stage, analysis: _analysis, status: _status, ...message }) => message);
  return browserChats().messages[conversationId] || [];
}

export async function listConversations(kind?: "chat" | "interview"): Promise<Conversation[]> {
  if (isTauri()) return invoke<Conversation[]>("list_conversations", { kind: kind || null });
  return browserConversationState().conversations.filter((item) => !kind || item.kind === kind);
}

export async function listConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  if (isTauri()) return invoke<ConversationMessage[]>("list_conversation_messages", { conversationId });
  return browserConversationState().messages[conversationId] || [];
}

export async function renameChatConversation(conversationId: string, title: string): Promise<ChatConversation> {
  if (isTauri()) return invoke<ChatConversation>("rename_chat_conversation", { conversationId, title });
  const state = browserChats();
  let renamed: ChatConversation | undefined;
  const conversations = state.conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    renamed = { ...conversation, title: title.trim(), updatedAt: new Date().toISOString() };
    return renamed;
  });
  if (!renamed) throw new Error("The conversation could not be found.");
  saveBrowserChats({ ...state, conversations });
  return renamed;
}

export async function exportChatConversation(conversationId: string): Promise<string> {
  if (isTauri()) return invoke<string>("export_chat_conversation", { conversationId });
  return `/browser-preview/exports/chat-${conversationId.slice(0, 8)}.md`;
}

export async function deleteChatConversation(conversationId: string): Promise<void> {
  if (isTauri()) return invoke<void>("delete_chat_conversation", { conversationId });
  const state = browserChats();
  const messages = { ...state.messages };
  delete messages[conversationId];
  saveBrowserChats({ conversations: state.conversations.filter((item) => item.id !== conversationId), messages });
}

export async function queueChatAgentProposal(input: QueueAgentProposalInput): Promise<void> {
  if (isTauri()) return invoke<void>("queue_chat_agent_proposal", { input });
  const proposal = input.proposal;
  const record: ReviewRecord = {
    id: proposal.id,
    itemType: "agent-change",
    title: `Agent change: ${proposal.targetTitle}`,
    detail: "Chat prepared a confirmation-gated revision.",
    sourceRelativePath: proposal.targetRelativePath,
    quote: proposal.instruction,
    reason: "Canonical Markdown never changes directly from Chat.",
    proposedAction: `Replace the body of ${proposal.targetRelativePath}`,
    proposedContent: proposal.proposedBody,
    confidence: null,
    status: "pending",
    sessionId: null,
    reviewRelativePath: `review/agent-change-${proposal.id.slice(0, 8)}.md`,
    suggestedAction: "apply-agent-change",
    targetRelativePath: proposal.targetRelativePath,
  };
  const records = browserReviewRecords();
  if (records.some((item) => item.id === record.id)) throw new Error("This agent proposal is already queued.");
  saveBrowserReviewRecords([record, ...records]);
}

export async function sendChatMessage(input: SendChatInput): Promise<ChatTurn> {
  if (isTauri()) {
    const exchange = await submitConversationTurn({ ...input, kind: "chat" });
    const { kind: _kind, status: _status, hostId: _hostId, hostName: _hostName, folderPath: _folderPath, relativeFolder: _relativeFolder, ...conversation } = exchange.conversation;
    const { audioPath: _userAudioPath, audioMimeType: _userAudioMimeType, stage: _userStage, analysis: _userAnalysis, status: _userStatus, ...userMessage } = exchange.userMessage;
    const { audioPath: _assistantAudioPath, audioMimeType: _assistantAudioMimeType, stage: _assistantStage, analysis: _assistantAnalysis, status: _assistantStatus, ...assistantMessage } = exchange.assistantMessage;
    return { conversation, userMessage, assistantMessage, agentProposal: exchange.agentProposal };
  }
  const state = browserChats();
  let conversation = state.conversations.find((item) => item.id === input.conversationId);
  if (!conversation) conversation = await createChatConversation({ title: input.message.split(/\s+/).slice(0, 7).join(" "), scope: input.scope });
  const refreshed = browserChats();
  const now = new Date().toISOString();
  const userMessage: ChatMessage = { id: crypto.randomUUID(), conversationId: conversation.id, role: "user", content: input.message, createdAt: now, citations: [], provider: "user", model: "human", generalKnowledgeUsed: false };
  const agentMode = input.agentMode || "read-only";
  let agentProposal: AgentProposal | null = null;
  if (agentMode !== "read-only") {
    if (input.scope !== "selected" || input.selectedPaths?.length !== 1) throw new Error("Change modes require Selected notes scope with exactly one target note.");
    const note = browserNotes().find((item) => item.relativePath === input.selectedPaths?.[0]);
    if (!note) throw new Error("The selected target note could not be found.");
    const instruction = input.message.trim();
    let proposedBody = "";
    if (instruction.toLowerCase().startsWith("append:")) proposedBody = `${note.body.trim()}\n\n${instruction.slice(7).trim()}`;
    else if (instruction.toLowerCase().startsWith("replace:")) {
      const [from, to] = instruction.slice(8).split("=>", 2).map((part) => part.trim());
      if (!from || to == null || !note.body.includes(from)) throw new Error("Use `Replace: exact old text => new text`; the old text must exist in the selected note.");
      proposedBody = note.body.replace(from, to);
    } else throw new Error("Browser preview supports `Append: text` or `Replace: exact old text => new text` for local proposals.");
    agentProposal = { id: crypto.randomUUID(), targetRelativePath: note.relativePath, targetTitle: note.title, instruction, originalBody: note.body, proposedBody, queuedForReview: agentMode === "read-write" };
    if (agentProposal.queuedForReview) await queueChatAgentProposal({ proposal: agentProposal, conversationId: conversation.id });
  }
  const retrievalLimit = Math.max(3, Math.min(50, input.retrievalLimit || 12));
  const candidates = await searchBrain({ query: input.message, mode: "hybrid", scope: input.scope, selectedPaths: input.selectedPaths || [], limit: Math.min(100, retrievalLimit * 4) });
  const results = diversifyResults(candidates, retrievalLimit, input.answerMode === "deep" ? 2 : 4);
  const citations = results.map((result, index) => ({ passageId: result.passageId, number: index + 1, title: result.title, relativePath: result.relativePath, quote: result.quote }));
  const shown = input.answerMode === "deep" ? citations.length : input.answerMode === "concise" ? 3 : 6;
  const heading = input.answerMode === "deep" ? "I completed a deeper evidence sweep of your brain:" : "I found these relevant points in your brain:";
  const content = agentProposal
    ? agentProposal.queuedForReview
      ? "I prepared the requested revision and queued it in Review. The canonical note is unchanged until you approve it there."
      : "I prepared the requested revision without changing the note. Inspect it below, then explicitly send it to Review if you want an approval decision."
    : citations.length ? `${heading}\n\n${citations.slice(0, shown).map((citation) => `- ${citation.quote} [${citation.number}]`).join("\n")}\n\nThis answer is extractive: it stays close to your source wording and does not add general model knowledge.` : "I couldn’t find supporting material in the selected brain scope. General model knowledge was not used.";
  const assistantMessage: ChatMessage = { id: crypto.randomUUID(), conversationId: conversation.id, role: "assistant", content, createdAt: new Date().toISOString(), citations, provider: "local-retrieval", model: "extractive-v1", generalKnowledgeUsed: false };
  conversation = { ...conversation, title: conversation.title === "Untitled chat" ? input.message.split(/\s+/).slice(0, 7).join(" ") : conversation.title, updatedAt: assistantMessage.createdAt, scope: input.scope, selectedPaths: input.selectedPaths || [], preview: input.message.slice(0, 100) };
  saveBrowserChats({ conversations: [conversation, ...refreshed.conversations.filter((item) => item.id !== conversation.id)], messages: { ...refreshed.messages, [conversation.id]: [...(refreshed.messages[conversation.id] || []), userMessage, assistantMessage] } });
  return { conversation, userMessage, assistantMessage, agentProposal };
}

let browserProviderCatalog: ProviderCatalog = {
  providers: [
    { id: "local-retrieval", label: "Local Retrieval", templateLabel: "Local Retrieval", saved: true, transport: "builtin", locality: "local", enabled: true, configured: true, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: true, authenticated: true, tested: true, status: "live-tested", detail: "Built-in deterministic cited extraction is ready offline.", baseUrl: null, executablePath: null, defaultModelId: "extractive-v1", capabilities: ["text-generation", "citations"], models: [{ id: "extractive-v1", label: "extractive-v1", providerId: "local-retrieval", capabilities: ["text-generation", "citations"], contextWindow: null, pricing: null, source: "builtin" }], lastTestedAt: null, lastTestStatus: null },
    { id: "local-interviewer", label: "Local Interviewer", templateLabel: "Local Interviewer", saved: true, transport: "builtin", locality: "local", enabled: true, configured: true, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: true, authenticated: true, tested: true, status: "live-tested", detail: "Built-in guided interview host is ready offline.", baseUrl: null, executablePath: null, capabilities: ["text-generation", "citations"], models: [{ id: "guided-v1", label: "guided-v1", providerId: "local-interviewer", capabilities: ["text-generation", "citations"], contextWindow: null, pricing: null, source: "builtin" }], lastTestedAt: null, lastTestStatus: null },
    { id: "local-workflow", label: "Local Workflow", templateLabel: "Local Workflow", saved: true, transport: "builtin", locality: "local", enabled: true, configured: true, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: true, authenticated: true, tested: true, status: "live-tested", detail: "Built-in structured workflow is ready offline.", baseUrl: null, executablePath: null, capabilities: ["structured-scaffolding", "citations"], models: [{ id: "structured-v1", label: "structured-v1", providerId: "local-workflow", capabilities: ["structured-scaffolding", "citations"], contextWindow: null, pricing: null, source: "builtin" }], lastTestedAt: null, lastTestStatus: null },
    { id: "ollama", label: "Ollama", templateLabel: "Ollama", saved: false, transport: "openai-compatible", locality: "local", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Connect an Ollama server and its installed local models.", baseUrl: "http://127.0.0.1:11434", executablePath: null, capabilities: ["text-generation", "image-understanding"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "lmstudio", label: "LM Studio", templateLabel: "LM Studio", saved: false, transport: "openai-compatible", locality: "local", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: false, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Connect a local LM Studio server.", baseUrl: "http://127.0.0.1:1234/v1", executablePath: null, capabilities: ["text-generation", "image-understanding"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "llamacpp", label: "llama.cpp", templateLabel: "llama.cpp", saved: false, transport: "openai-compatible", locality: "local", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: false, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Connect a local llama.cpp HTTP server.", baseUrl: "http://127.0.0.1:8080/v1", executablePath: null, capabilities: ["text-generation", "image-understanding"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "vercel", label: "Vercel AI Gateway", templateLabel: "Vercel AI Gateway", saved: false, transport: "openai-compatible", locality: "cloud", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Connect Vercel AI Gateway with your own API key.", baseUrl: "https://ai-gateway.vercel.sh/v1", executablePath: null, capabilities: ["text-generation", "image-understanding"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "openrouter", label: "OpenRouter", templateLabel: "OpenRouter", saved: false, transport: "openai-compatible", locality: "cloud", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Connect the OpenRouter multi-provider gateway.", baseUrl: "https://openrouter.ai/api/v1", executablePath: null, capabilities: ["text-generation", "image-understanding"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "openai", label: "OpenAI API", templateLabel: "OpenAI API", saved: false, transport: "openai-responses", locality: "cloud", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Connect the direct OpenAI Responses API.", baseUrl: "https://api.openai.com/v1", executablePath: null, capabilities: ["text-generation", "image-understanding"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "anthropic", label: "Anthropic API", templateLabel: "Anthropic API", saved: false, transport: "anthropic-messages", locality: "cloud", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Connect the direct Anthropic Messages API.", baseUrl: "https://api.anthropic.com/v1", executablePath: null, capabilities: ["text-generation", "image-understanding"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "gemini", label: "Gemini API", templateLabel: "Gemini API", saved: false, transport: "openai-compatible", locality: "cloud", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Connect the direct Gemini API.", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", executablePath: null, capabilities: ["text-generation", "image-understanding"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "codex-cli", label: "Codex CLI", templateLabel: "Codex CLI", saved: false, transport: "terminal-cli", locality: "local", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: true, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Use the existing Codex CLI subscription login for text and image input.", baseUrl: null, executablePath: null, capabilities: ["text-generation", "image-understanding"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "claude-cli", label: "Claude Code CLI", templateLabel: "Claude Code CLI", saved: false, transport: "terminal-cli", locality: "local", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: false, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Use the existing Claude Code subscription login.", baseUrl: null, executablePath: null, capabilities: ["text-generation"], models: [], lastTestedAt: null, lastTestStatus: null },
    { id: "gemini-cli", label: "Gemini CLI", templateLabel: "Gemini CLI", saved: false, transport: "terminal-cli", locality: "local", enabled: false, configured: false, credentialConfigured: false, cloudConfirmed: false, installed: false, reachable: false, authenticated: false, tested: false, status: "disabled", detail: "Use the existing Gemini CLI subscription login.", baseUrl: null, executablePath: null, capabilities: ["text-generation"], models: [], lastTestedAt: null, lastTestStatus: null },
  ],
  preferredModels: { chat: { providerId: "local-retrieval", modelId: "extractive-v1" }, interview: { providerId: "local-interviewer", modelId: "guided-v1" }, studio: { providerId: "local-workflow", modelId: "structured-v1" } },
  favoriteModels: [],
  refreshed: false,
};

export async function getGenerationProviderCatalog(refresh = false): Promise<ProviderCatalog> {
  if (isTauri()) return invoke<ProviderCatalog>("get_generation_provider_catalog", { refresh });
  if (refresh) {
    const ollama = browserProviderCatalog.providers.find(
      (provider) => provider.id === "ollama" && provider.saved && provider.enabled,
    );
    if (ollama?.baseUrl) {
      try {
        const response = await fetch(`${ollama.baseUrl.replace(/\/$/, "")}/api/tags`, {
          signal: AbortSignal.timeout(4_000),
        });
        if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
        const value = await response.json() as { models?: Array<{ model?: string; name?: string; details?: { parameter_size?: string } }> };
        const models = (value.models || []).flatMap((item) => {
          const id = item.model || item.name;
          if (!id) return [];
          const size = item.details?.parameter_size?.trim();
          return [{
            id,
            label: size ? `${id} · ${size}` : id,
            providerId: "ollama",
            capabilities: ["text-generation"],
            contextWindow: null,
            pricing: null,
            source: "discovered",
          }];
        });
        browserProviderCatalog = {
          ...browserProviderCatalog,
          providers: browserProviderCatalog.providers.map((provider) =>
            provider.id === "ollama"
              ? {
                  ...provider,
                  models,
                  defaultModelId: provider.defaultModelId || models[0]?.id || null,
                  reachable: true,
                  authenticated: true,
                  status: "authenticated",
                  detail: `Ollama model discovery returned ${models.length} model${models.length === 1 ? "" : "s"}.`,
                }
              : provider,
          ),
          refreshed: true,
        };
      } catch (error) {
        browserProviderCatalog = {
          ...browserProviderCatalog,
          providers: browserProviderCatalog.providers.map((provider) =>
            provider.id === "ollama"
              ? { ...provider, reachable: false, authenticated: false, status: "not-running", detail: error instanceof Error ? error.message : String(error) }
              : provider,
          ),
          refreshed: true,
        };
      }
    }
    browserProviderCatalog = {
      ...browserProviderCatalog,
      providers: browserProviderCatalog.providers.map((provider) =>
        provider.saved && provider.enabled && provider.transport === "terminal-cli"
          ? {
              ...provider,
              models: provider.models.length ? provider.models : [{ id: "default", label: "CLI default", providerId: provider.id, capabilities: ["text-generation"], contextWindow: null, pricing: null, source: "terminal" }],
              defaultModelId: provider.defaultModelId || "default",
              installed: true,
              status: "discovered",
            }
          : provider,
      ),
      refreshed: true,
    };
  }
  return browserProviderCatalog;
}

export async function saveGenerationProvider(input: SaveGenerationProviderInput): Promise<ProviderCatalog> {
  if (isTauri()) return invoke<ProviderCatalog>("save_generation_provider", { input });
  browserProviderCatalog = {
    ...browserProviderCatalog,
    providers: browserProviderCatalog.providers.map((provider) =>
      provider.id === input.providerId
        ? { ...provider, label: input.displayName.trim(), saved: true, configured: true, enabled: input.enabled, baseUrl: input.baseUrl, executablePath: provider.transport === "terminal-cli" ? input.executablePath : null, cloudConfirmed: input.cloudConfirmed, status: input.enabled ? (provider.locality === "cloud" ? "needs-credential" : "configured") : "disabled" }
        : provider,
    ),
  };
  return browserProviderCatalog;
}

export async function deleteGenerationProvider(providerId: string): Promise<ProviderCatalog> {
  if (isTauri()) return invoke<ProviderCatalog>("delete_generation_provider", { providerId });
  browserProviderCatalog = {
    ...browserProviderCatalog,
    providers: browserProviderCatalog.providers.map((provider) =>
      provider.id === providerId
        ? { ...provider, label: provider.templateLabel, saved: false, configured: false, enabled: false, credentialConfigured: false, cloudConfirmed: false, status: "disabled", lastTestedAt: null, lastTestStatus: null }
        : provider,
    ),
    preferredModels: Object.fromEntries(Object.entries(browserProviderCatalog.preferredModels).filter(([, selection]) => selection.providerId !== providerId)),
    favoriteModels: browserProviderCatalog.favoriteModels.filter((selection) => selection.providerId !== providerId),
  };
  return browserProviderCatalog;
}

export async function saveProviderCredential(input: SaveProviderCredentialInput): Promise<ProviderCatalog> {
  if (isTauri()) return invoke<ProviderCatalog>("save_provider_credential", { input });
  if (input.apiKey.trim().length < 8) throw new Error("Enter a plausible API key.");
  browserProviderCatalog = {
    ...browserProviderCatalog,
    providers: browserProviderCatalog.providers.map((provider) =>
      provider.id === input.providerId
        ? { ...provider, credentialConfigured: true, configured: true, status: provider.enabled ? "configured" : "disabled" }
        : provider,
    ),
  };
  return browserProviderCatalog;
}

export async function clearProviderCredential(providerId: string): Promise<ProviderCatalog> {
  if (isTauri()) return invoke<ProviderCatalog>("clear_provider_credential", { providerId });
  browserProviderCatalog = {
    ...browserProviderCatalog,
    providers: browserProviderCatalog.providers.map((provider) =>
      provider.id === providerId
        ? { ...provider, credentialConfigured: false, status: provider.locality === "cloud" && provider.enabled ? "needs-credential" : provider.status }
        : provider,
    ),
  };
  return browserProviderCatalog;
}

export async function setPreferredModel(input: SetPreferredModelInput): Promise<ProviderCatalog> {
  if (isTauri()) return invoke<ProviderCatalog>("set_preferred_model", { input });
  browserProviderCatalog = {
    ...browserProviderCatalog,
    preferredModels: {
      ...browserProviderCatalog.preferredModels,
      [input.capability]: {
        providerId: input.providerId,
        modelId: input.modelId,
      },
    },
  };
  return browserProviderCatalog;
}

export async function setFavoriteModel(input: SetFavoriteModelInput): Promise<ProviderCatalog> {
  if (isTauri()) return invoke<ProviderCatalog>("set_favorite_model", { input });
  const selection = { providerId: input.providerId, modelId: input.modelId };
  browserProviderCatalog = {
    ...browserProviderCatalog,
    favoriteModels: input.favorite
      ? [
          selection,
          ...browserProviderCatalog.favoriteModels.filter(
            (favorite) =>
              favorite.providerId !== input.providerId ||
              favorite.modelId !== input.modelId,
          ),
        ]
      : browserProviderCatalog.favoriteModels.filter(
          (favorite) =>
            favorite.providerId !== input.providerId ||
            favorite.modelId !== input.modelId,
        ),
  };
  return browserProviderCatalog;
}

export async function setDefaultProviderModel(input: SetDefaultProviderModelInput): Promise<ProviderCatalog> {
  if (isTauri()) return invoke<ProviderCatalog>("set_default_provider_model", { input });
  browserProviderCatalog = {
    ...browserProviderCatalog,
    providers: browserProviderCatalog.providers.map((provider) =>
      provider.id === input.providerId
        ? { ...provider, defaultModelId: input.modelId }
        : provider,
    ),
  };
  return browserProviderCatalog;
}

export async function testGenerationProvider(input: TestGenerationProviderInput): Promise<ProviderDiagnostic> {
  if (isTauri()) return invoke<ProviderDiagnostic>("test_generation_provider", { input });
  const provider = browserProviderCatalog.providers.find((item) => item.id === input.providerId);
  if (!provider?.saved || !provider.enabled) throw new Error("Enable and save the connection before testing it.");
  if (provider.locality === "cloud" && !provider.credentialConfigured) throw new Error("Add an API key before testing this cloud connection.");
  const testedAt = new Date().toISOString();
  let outputPreview = "Burrowise provider test passed";
  if (provider.id === "ollama" && provider.baseUrl) {
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: input.modelId,
        messages: [
          { role: "system", content: "Return a short plain-text diagnostic response. Do not use tools or access files." },
          { role: "user", content: "Reply with exactly: Burrowise provider test passed" },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const value = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } | string };
    if (!response.ok) {
      const detail = typeof value.error === "string" ? value.error : value.error?.message;
      throw new Error(`Ollama returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    outputPreview = value.choices?.[0]?.message?.content?.trim() || outputPreview;
  }
  browserProviderCatalog = {
    ...browserProviderCatalog,
    providers: browserProviderCatalog.providers.map((item) => item.id === input.providerId ? { ...item, tested: true, reachable: true, authenticated: true, status: "live-tested", lastTestedAt: testedAt, lastTestStatus: "success" } : item),
  };
  return { providerId: input.providerId, modelId: input.modelId, status: "success", message: "A real text-generation request completed.", outputPreview, testedAt };
}

function emptyProviderCostSummary(monthlyBudgetMicros: number | null): ProviderCostSummary {
  const now = new Date();
  return {
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    periodEnd: now.toISOString(),
    currency: "USD",
    totalCostMicros: 0,
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedRequestCount: 0,
    unpricedRequestCount: 0,
    lifetimeCostMicros: 0,
    lifetimeRequestCount: 0,
    monthlyBudgetMicros,
    byProvider: [],
    recent: [],
  };
}

export async function getProviderCostSummary(): Promise<ProviderCostSummary> {
  if (isTauri()) return invoke<ProviderCostSummary>("get_provider_cost_summary");
  const stored = localStorage.getItem("second-brain-provider-monthly-budget-micros");
  return emptyProviderCostSummary(stored ? Number(stored) : null);
}

export async function saveProviderMonthlyBudget(
  monthlyBudgetMicros: number | null,
): Promise<ProviderCostSummary> {
  if (isTauri()) {
    return invoke<ProviderCostSummary>("save_provider_monthly_budget", {
      monthlyBudgetMicros,
    });
  }
  if (monthlyBudgetMicros == null) {
    localStorage.removeItem("second-brain-provider-monthly-budget-micros");
  } else {
    localStorage.setItem(
      "second-brain-provider-monthly-budget-micros",
      String(monthlyBudgetMicros),
    );
  }
  return emptyProviderCostSummary(monthlyBudgetMicros);
}

const defaultInterviewHosts: InterviewHost[] = [
  { id: "open-ended-explorer", name: "Open-ended explorer", description: "Curious, informal, and willing to follow useful tangents.", traits: ["warm", "curious"], stages: ["context", "example", "meaning", "next thread"], relativePath: "hosts/open-ended-explorer.md", instructions: "Ask one clear question at a time. Follow the user's energy and prefer discovery over forcing a conclusion.", builtIn: true },
  { id: "friendly-challenger", name: "Friendly challenger", description: "Direct follow-ups, contradictions, and supportive accountability.", traits: ["direct", "probing"], stages: ["claim", "evidence", "contradiction", "commitment"], relativePath: "hosts/friendly-challenger.md", instructions: "Ask one clear question at a time. Test assumptions without becoming combative.", builtIn: true },
  { id: "first-principles-thinker", name: "First-principles thinker", description: "Patient, philosophical, and technically deep.", traits: ["calm", "analytical"], stages: ["definition", "assumptions", "fundamentals", "implications"], relativePath: "hosts/first-principles-thinker.md", instructions: "Ask one clear question at a time. Rebuild the idea from its most basic constraints.", builtIn: true },
  { id: "product-excavator", name: "Product excavator", description: "Moves from a real problem through evidence, alternatives, and commitment.", traits: ["structured", "practical"], stages: ["context", "problem", "evidence", "alternatives", "commitment"], relativePath: "hosts/product-excavator.md", instructions: "Ask one clear question at a time. Seek concrete user behavior and finish with a falsifiable next step.", builtIn: true },
  { id: "story-miner", name: "Story miner", description: "Draws out scenes, sensory details, tension, and emotional change.", traits: ["empathetic", "vivid"], stages: ["scene", "desire", "tension", "turning point", "meaning"], relativePath: "hosts/story-miner.md", instructions: "Ask one clear question at a time. Invite scenes rather than summaries.", builtIn: true },
];

function browserInterviews(): BrowserInterviewState {
  const state = browserConversationState();
  const interviews = state.conversations
    .filter((item) => item.kind === "interview")
    .map((item): InterviewSession => ({
      id: item.id,
      title: item.title,
      hostId: item.hostId || "",
      hostName: item.hostName || "",
      scope: item.scope,
      selectedPaths: item.selectedPaths,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      status: item.status,
      folderPath: item.folderPath || "",
      relativeFolder: item.relativeFolder || "",
      provider: item.provider,
      model: item.model,
    }));
  const interviewIds = new Set(interviews.map((item) => item.id));
  const turns = Object.fromEntries(
    Object.entries(state.messages)
      .filter(([id]) => interviewIds.has(id))
      .map(([id, items]) => [id, items.map((item): InterviewTurn => ({
        id: item.id,
        interviewId: item.conversationId,
        role: item.role,
        content: item.content,
        createdAt: item.createdAt,
        citations: item.citations,
        audioPath: item.audioPath,
        audioMimeType: item.audioMimeType,
        stage: item.stage,
        analysis: item.analysis,
        status: item.status,
      }))]),
  );
  return { hosts: state.hosts, interviews, turns, access: state.access };
}

function saveBrowserInterviews(state: BrowserInterviewState): BrowserInterviewState {
  const current = browserConversationState();
  const interviewIds = new Set(state.interviews.map((item) => item.id));
  saveBrowserConversationState({
    ...current,
    hosts: state.hosts,
    access: state.access,
    conversations: [
      ...current.conversations.filter((item) => item.kind !== "interview"),
      ...state.interviews.map((item): Conversation => ({ ...item, kind: "interview", preview: "", hostId: item.hostId, hostName: item.hostName, folderPath: item.folderPath, relativeFolder: item.relativeFolder })),
    ],
    messages: {
      ...Object.fromEntries(Object.entries(current.messages).filter(([id]) => !current.conversations.some((item) => item.id === id && item.kind === "interview"))),
      ...Object.fromEntries(Object.entries(state.turns).filter(([id]) => interviewIds.has(id)).map(([id, items]) => {
        const interview = state.interviews.find((item) => item.id === id);
        return [id, items.map((item): ConversationMessage => ({
          ...item,
          conversationId: item.interviewId,
          provider: item.role === "user" ? "user" : interview?.provider || "local-interviewer",
          model: item.role === "user" ? "human" : interview?.model || "guided-v1",
          generalKnowledgeUsed: false,
        }))];
      })),
    },
  });
  return state;
}

function hostQuestion(stage: string, host: InterviewHost): string {
  const normalized = stage.toLowerCase();
  if (normalized.includes("evidence")) return "What concrete evidence supports that, and what evidence might challenge it?";
  if (normalized.includes("contradiction") || normalized.includes("assumption")) return "Which assumption here is least certain, and what would change your mind?";
  if (normalized.includes("alternative")) return "What is the strongest alternative explanation or approach you have considered?";
  if (normalized.includes("commitment") || normalized.includes("implication")) return "What specific next step follows from this, and how will you know it worked?";
  if (normalized.includes("scene") || normalized.includes("example")) return "Can you take me into one concrete moment when this became clear?";
  if (normalized.includes("tension") || normalized.includes("problem")) return "Where is the real tension or cost, and who feels it most?";
  if (normalized.includes("definition") || normalized.includes("fundamental")) return "If we remove the usual labels, what is the most basic truth or constraint here?";
  if (host.id.includes("challenger")) return "What part of that claim would a thoughtful skeptic push back on?";
  return "What feels most important to unpack next, and can you make it more concrete?";
}

export async function listInterviewHosts(): Promise<InterviewHost[]> {
  if (isTauri()) return invoke<InterviewHost[]>("list_interview_hosts");
  return browserInterviews().hosts;
}

export async function saveInterviewHost(input: SaveInterviewHostInput): Promise<InterviewHost> {
  if (isTauri()) return invoke<InterviewHost>("save_interview_host", { input });
  const state = browserInterviews();
  const id = (input.id || input.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!input.name.trim() || !input.instructions.trim()) throw new Error("A host needs a name and instructions.");
  const host: InterviewHost = { ...input, id, traits: input.traits || [], stages: input.stages || [], relativePath: `hosts/${id}.md`, builtIn: false };
  saveBrowserInterviews({ ...state, hosts: [host, ...state.hosts.filter((item) => item.id !== id)] });
  return host;
}

export async function startInterview(input: StartInterviewInput): Promise<InterviewStart> {
  if (isTauri()) return invoke<InterviewStart>("start_interview", { input });
  if (input.scope === "selected" && !input.selectedPaths?.length) throw new Error("Select at least one note for this knowledge scope.");
  const state = browserInterviews();
  const host = state.hosts.find((item) => item.id === input.hostId);
  if (!host) throw new Error("The selected host could not be found.");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const interview: InterviewSession = { id, title: `Interview with ${host.name}`, hostId: host.id, hostName: host.name, scope: input.scope, selectedPaths: input.selectedPaths || [], createdAt: now, updatedAt: now, status: "active", folderPath: `/browser-preview/sessions/interview-${id.slice(0, 8)}`, relativeFolder: `sessions/interview-${id.slice(0, 8)}`, provider: "local-interviewer", model: "guided-v1" };
  const stage = host.stages[0] || "context";
  const hostTurn: InterviewTurn = { id: crypto.randomUUID(), interviewId: id, role: "host", content: `I’m your ${stage} host. We’ll take this one question at a time, and I’ll only read the knowledge scope you selected. What idea would you like to explore, and why does it matter to you now?`, createdAt: now, audioPath: null, audioMimeType: null, citations: [], stage, analysis: "Opening question · no knowledge accessed", status: "complete" };
  saveBrowserInterviews({ ...state, interviews: [interview, ...state.interviews], turns: { ...state.turns, [id]: [hostTurn] }, access: { ...state.access, [id]: [] } });
  return { interview, hostTurn };
}

export async function listInterviews(): Promise<InterviewSession[]> {
  if (isTauri()) return (await listConversations("interview")).map((item) => ({
    id: item.id, title: item.title, hostId: item.hostId || "", hostName: item.hostName || "",
    scope: item.scope, selectedPaths: item.selectedPaths, createdAt: item.createdAt,
    updatedAt: item.updatedAt, status: item.status, folderPath: item.folderPath || "",
    relativeFolder: item.relativeFolder || "", provider: item.provider, model: item.model,
  }));
  return browserInterviews().interviews;
}

export async function listInterviewTurns(interviewId: string): Promise<InterviewTurn[]> {
  if (isTauri()) return (await listConversationMessages(interviewId)).map((item) => ({
    id: item.id, interviewId: item.conversationId, role: item.role, content: item.content,
    createdAt: item.createdAt, audioPath: item.audioPath, audioMimeType: item.audioMimeType,
    citations: item.citations, stage: item.stage, analysis: item.analysis, status: item.status,
  }));
  return browserInterviews().turns[interviewId] || [];
}

export async function renameInterviewSession(interviewId: string, title: string): Promise<InterviewSession> {
  if (isTauri()) return invoke<InterviewSession>("rename_interview_session", { interviewId, title });
  const state = browserInterviews();
  let renamed: InterviewSession | undefined;
  const interviews = state.interviews.map((item) => {
    if (item.id !== interviewId) return item;
    renamed = { ...item, title: title.trim(), updatedAt: new Date().toISOString() };
    return renamed;
  });
  if (!renamed) throw new Error("The interview could not be found.");
  saveBrowserInterviews({ ...state, interviews });
  return renamed;
}

export async function exportInterviewSession(interviewId: string): Promise<string> {
  if (isTauri()) return invoke<string>("export_interview_session", { interviewId });
  return `/browser-preview/exports/interview-${interviewId.slice(0, 8)}.md`;
}

export async function trashInterviewSession(interviewId: string): Promise<void> {
  if (isTauri()) return invoke<void>("trash_interview_session", { interviewId });
  const state = browserInterviews();
  const turns = { ...state.turns };
  const access = { ...state.access };
  delete turns[interviewId];
  delete access[interviewId];
  saveBrowserInterviews({ ...state, interviews: state.interviews.filter((item) => item.id !== interviewId), turns, access });
}

export async function resumeInterviewSession(interviewId: string): Promise<InterviewSession> {
  if (isTauri()) return invoke<InterviewSession>("resume_interview_session", { interviewId });
  const state = browserInterviews();
  let resumed: InterviewSession | undefined;
  const interviews = state.interviews.map((interview) => {
    if (interview.id !== interviewId) return interview;
    resumed = { ...interview, status: "active", updatedAt: new Date().toISOString() };
    return resumed;
  });
  if (!resumed) throw new Error("The interview could not be found.");
  saveBrowserInterviews({ ...state, interviews });
  return resumed;
}

async function browserRespondToInterview(interview: InterviewSession, userTurn: InterviewTurn, userIsPersisted = false, retrievalLimit = 10): Promise<InterviewExchange> {
  const state = browserInterviews();
  const host = state.hosts.find((item) => item.id === interview.hostId);
  if (!host) throw new Error("The selected host could not be found. Restore or recreate the host before continuing.");
  const currentTurns = state.turns[interview.id] || [];
  const userCount = currentTurns.filter((turn) => turn.role === "user" && turn.status === "complete").length + (userIsPersisted ? 0 : 1);
  const stage = host.stages[Math.max(0, userCount - 1) % Math.max(1, host.stages.length)] || "exploration";
  const candidates = interview.scope === "session" ? [] : await searchBrain({ query: userTurn.content, mode: "hybrid", scope: interview.scope, selectedPaths: interview.selectedPaths, limit: Math.min(100, retrievalLimit * 4) });
  const results = diversifyResults(candidates, retrievalLimit, 2);
  const citations = results.map((result, index) => ({ passageId: result.passageId, number: index + 1, title: result.title, relativePath: result.relativePath, quote: result.quote }));
  const lead = citations.length ? `A related note says, “${citations[0].quote.slice(0, 190)}${citations[0].quote.length > 190 ? "…" : ""}” [1]` : "I didn’t read a matching note for that turn, so I’ll stay with what you just said.";
  const now = new Date().toISOString();
  const hostTurn: InterviewTurn = { id: crypto.randomUUID(), interviewId: interview.id, role: "host", content: `${lead}\n\n${hostQuestion(stage, host)}`, createdAt: now, audioPath: null, audioMimeType: null, citations, stage, analysis: `Stage: ${stage} · read-only retrieval · one question`, status: "complete" };
  const updated: InterviewSession = { ...interview, updatedAt: now };
  const access: InterviewAccessEntry[] = citations.map((citation) => ({ id: crypto.randomUUID(), interviewId: interview.id, turnId: hostTurn.id, passageId: citation.passageId, title: citation.title, relativePath: citation.relativePath, quote: citation.quote, accessedAt: now }));
  const nextTurns = userIsPersisted ? [...currentTurns, hostTurn] : [...currentTurns, userTurn, hostTurn];
  saveBrowserInterviews({ ...state, interviews: [updated, ...state.interviews.filter((item) => item.id !== updated.id)], turns: { ...state.turns, [interview.id]: nextTurns }, access: { ...state.access, [interview.id]: [...access, ...(state.access[interview.id] || [])] } });
  return { interview: updated, userTurn, hostTurn };
}

export async function sendInterviewTurn(input: SendInterviewTurnInput): Promise<InterviewExchange> {
  if (isTauri()) {
    const exchange = await submitConversationTurn({ conversationId: input.interviewId, kind: "interview", message: input.message, retrievalLimit: input.retrievalLimit });
    const conversation = exchange.conversation;
    const toTurn = (item: ConversationMessage): InterviewTurn => ({ id: item.id, interviewId: item.conversationId, role: item.role, content: item.content, createdAt: item.createdAt, audioPath: item.audioPath, audioMimeType: item.audioMimeType, citations: item.citations, stage: item.stage, analysis: item.analysis, status: item.status });
    return {
      interview: { id: conversation.id, title: conversation.title, hostId: conversation.hostId || "", hostName: conversation.hostName || "", scope: conversation.scope, selectedPaths: conversation.selectedPaths, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt, status: conversation.status, folderPath: conversation.folderPath || "", relativeFolder: conversation.relativeFolder || "", provider: conversation.provider, model: conversation.model },
      userTurn: toTurn(exchange.userMessage),
      hostTurn: toTurn(exchange.assistantMessage),
    };
  }
  const state = browserInterviews();
  const interview = state.interviews.find((item) => item.id === input.interviewId);
  if (!interview || interview.status !== "active") throw new Error("This interview is not active.");
  const content = input.message.trim();
  if (!content) throw new Error("Interview answers cannot be empty.");
  const userTurn: InterviewTurn = { id: crypto.randomUUID(), interviewId: interview.id, role: "user", content, createdAt: new Date().toISOString(), audioPath: null, audioMimeType: null, citations: [], stage: "", analysis: "", status: "complete" };
  return browserRespondToInterview(interview, userTurn, false, Math.max(3, Math.min(30, input.retrievalLimit || 10)));
}

export async function submitConversationTurn(input: SubmitConversationTurnInput): Promise<ConversationExchange> {
  if (isTauri()) return invoke<ConversationExchange>("submit_conversation_turn", { input });
  if (input.kind === "interview") {
    if (!input.conversationId) throw new Error("Start an interview with a host before submitting a turn.");
    const exchange = await sendInterviewTurn({ interviewId: input.conversationId, message: input.message, retrievalLimit: input.retrievalLimit });
    const state = browserConversationState();
    const conversation = state.conversations.find((item) => item.id === exchange.interview.id)!;
    const messages = state.messages[conversation.id] || [];
    return { conversation, userMessage: messages.find((item) => item.id === exchange.userTurn.id)!, assistantMessage: messages.find((item) => item.id === exchange.hostTurn.id)!, agentProposal: null };
  }
  const turn = await sendChatMessage({ ...input, scope: input.scope || "all" });
  const state = browserConversationState();
  return { conversation: state.conversations.find((item) => item.id === turn.conversation.id)!, userMessage: state.messages[turn.conversation.id].find((item) => item.id === turn.userMessage.id)!, assistantMessage: state.messages[turn.conversation.id].find((item) => item.id === turn.assistantMessage.id)!, agentProposal: turn.agentProposal };
}

export async function beginInterviewAudioTurn(interviewId: string): Promise<InterviewTurn> {
  if (isTauri()) return invoke<InterviewTurn>("begin_interview_audio_turn", { interviewId });
  const state = browserInterviews();
  const turn: InterviewTurn = { id: crypto.randomUUID(), interviewId, role: "user", content: "", createdAt: new Date().toISOString(), audioPath: null, audioMimeType: null, citations: [], stage: "", analysis: "Original audio is preserved; transcript confirmation is required.", status: "recording" };
  saveBrowserInterviews({ ...state, turns: { ...state.turns, [interviewId]: [...(state.turns[interviewId] || []), turn] } });
  return turn;
}

export async function saveInterviewTurnAudio(interviewId: string, turnId: string, blob: Blob): Promise<InterviewTurn> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (isTauri()) return invoke<InterviewTurn>("save_interview_turn_audio", bytes, { headers: { "x-interview-id": interviewId, "x-turn-id": turnId, "content-type": blob.type || "audio/webm" } });
  await saveBrowserAudio(`interview-${turnId}`, bytes, blob.type || "audio/webm");
  const state = browserInterviews();
  let saved: InterviewTurn | undefined;
  const turns = (state.turns[interviewId] || []).map((turn) => {
    if (turn.id !== turnId) return turn;
    saved = { ...turn, audioPath: `/browser-preview/audio/${turnId}`, audioMimeType: blob.type || "audio/webm", status: "awaiting_transcript" };
    return saved;
  });
  saveBrowserInterviews({ ...state, turns: { ...state.turns, [interviewId]: turns } });
  if (!saved) throw new Error("The recorded interview turn could not be found.");
  return saved;
}

export async function completeInterviewAudioTurn(input: CompleteInterviewAudioInput): Promise<InterviewExchange> {
  if (isTauri()) return invoke<InterviewExchange>("complete_interview_audio_turn", { input });
  const state = browserInterviews();
  const interview = state.interviews.find((item) => item.id === input.interviewId);
  let userTurn: InterviewTurn | undefined;
  const turns = (state.turns[input.interviewId] || []).map((turn) => {
    if (turn.id !== input.turnId) return turn;
    userTurn = { ...turn, content: input.transcript.trim(), status: "complete" };
    return userTurn;
  });
  if (!interview || !userTurn) throw new Error("The recorded turn could not be found.");
  saveBrowserInterviews({ ...state, turns: { ...state.turns, [input.interviewId]: turns } });
  return browserRespondToInterview(interview, userTurn, true);
}

export async function processInterviewAudioTurn(input: ProcessInterviewAudioInput): Promise<InterviewExchange> {
  if (isTauri()) return invoke<InterviewExchange>("process_interview_audio_turn", { input });
  throw new Error("Automatic voice-turn transcription is available in the installed desktop app.");
}

export async function listInterviewAccessLog(interviewId: string): Promise<InterviewAccessEntry[]> {
  if (isTauri()) return invoke<InterviewAccessEntry[]>("list_interview_access_log", { interviewId });
  return browserInterviews().access[interviewId] || [];
}

export async function endInterview(interviewId: string): Promise<InterviewSession> {
  if (isTauri()) return invoke<InterviewSession>("end_interview", { interviewId });
  const state = browserInterviews();
  let ended: InterviewSession | undefined;
  const interviews = state.interviews.map((interview) => {
    if (interview.id !== interviewId) return interview;
    ended = { ...interview, status: "complete", updatedAt: new Date().toISOString() };
    return ended;
  });
  saveBrowserInterviews({ ...state, interviews });
  if (!ended) throw new Error("The interview could not be found.");
  return ended;
}

const defaultContentSkills: ContentSkill[] = [
  { id: "youtube-script", name: "YouTube script", description: "Turn a grounded idea into a clear, paced video script.", outputType: "youtube", stages: ["angle", "source research", "hook", "outline", "draft script", "editorial pass", "publish checklist"], relativePath: "skills/content/youtube-script.md", instructions: "Lead with a specific promise, use concrete evidence from the selected brain scope, and never fabricate a source or personal claim.", builtIn: true },
  { id: "social-campaign", name: "Social campaign", description: "Develop one idea into a coordinated thread, carousel, and short posts.", outputType: "social", stages: ["message", "source research", "content map", "draft posts", "variation pass", "publish checklist"], relativePath: "skills/content/social-campaign.md", instructions: "Preserve one central idea across formats without changing the underlying claim.", builtIn: true },
  { id: "blog-post", name: "Blog post", description: "Build an evidence-led article from a brief and selected knowledge.", outputType: "blog", stages: ["thesis", "source research", "outline", "first draft", "argument review", "final edit"], relativePath: "skills/content/blog-post.md", instructions: "Make the thesis explicit and distinguish evidence from interpretation.", builtIn: true },
  { id: "short-story", name: "Short story", description: "Shape a premise into a scene-driven short story workflow.", outputType: "short-story", stages: ["premise", "character desire", "conflict", "emotional arc", "scene outline", "draft", "revision"], relativePath: "skills/content/short-story.md", instructions: "Build around desire, resistance, change, and concrete scenes.", builtIn: true },
  { id: "long-form-fiction", name: "Novella or book", description: "A resumable long-form workflow for structure, characters, chapters, and continuity.", outputType: "long-form", stages: ["premise", "audience promise", "story world", "characters", "narrative arc", "emotional arc", "chapter outline", "chapter drafts", "continuity review", "revision plan"], relativePath: "skills/content/long-form-fiction.md", instructions: "Work from global structure toward chapters while preserving character goals, causality, emotional change, and continuity.", builtIn: true },
];

function browserContentState(): BrowserContentState {
  return parseStored(localStorage.getItem(browserContentKey), { skills: defaultContentSkills, projects: [], steps: {} });
}

function saveBrowserContent(state: BrowserContentState): BrowserContentState {
  localStorage.setItem(browserContentKey, JSON.stringify(state));
  return state;
}

function contentSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

export async function listContentSkills(): Promise<ContentSkill[]> {
  if (isTauri()) return invoke<ContentSkill[]>("list_content_skills");
  return browserContentState().skills;
}

export async function saveContentSkill(input: SaveContentSkillInput): Promise<ContentSkill> {
  if (isTauri()) return invoke<ContentSkill>("save_content_skill", { input });
  const stages = input.stages || [];
  if (!input.name?.trim() || !input.description?.trim() || !input.outputType?.trim() || !input.instructions?.trim() || !stages.length) throw new Error("A skill needs a name, description, output type, instructions, and stages.");
  if (input.name.length > 80 || [input.name, input.description, input.outputType, ...stages].some((value) => /[\r\n]/.test(value))) throw new Error("Skill metadata must use one-line fields and a name up to 80 characters.");
  const state = browserContentState();
  const id = contentSlug(input.id || input.name);
  if (state.skills.some((skill) => skill.id === id && skill.builtIn)) throw new Error("Built-in skills cannot be overwritten.");
  const skill: ContentSkill = { ...input, id, stages, relativePath: `skills/content/${id}.md`, builtIn: false };
  saveBrowserContent({ ...state, skills: [skill, ...state.skills.filter((item) => item.id !== id)] });
  return skill;
}

export async function listContentProjects(): Promise<ContentProject[]> {
  if (isTauri()) return invoke<ContentProject[]>("list_content_projects");
  return [...browserContentState().projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createContentProject(input: CreateContentProjectInput): Promise<ContentProjectDetail> {
  if (isTauri()) return invoke<ContentProjectDetail>("create_content_project", { input });
  if (!input.title?.trim() || !input.brief?.trim()) throw new Error("A project needs a title and a concrete brief.");
  if (input.scope === "selected" && !input.selectedPaths?.length) throw new Error("Choose at least one source for selected-source scope.");
  const state = browserContentState();
  const skill = state.skills.find((item) => item.id === input.skillId);
  if (!skill) throw new Error("The selected content skill could not be found.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const relativeFolder = `projects/${now.slice(0, 10)}-${contentSlug(input.title)}-${id.slice(0, 8)}`;
  const project: ContentProject = { id, title: input.title.trim(), brief: input.brief.trim(), skillId: skill.id, skillName: skill.name, outputType: skill.outputType, scope: input.scope, selectedPaths: input.selectedPaths || [], status: "ready", currentStep: 0, createdAt: now, updatedAt: now, folderPath: `/browser-preview/${relativeFolder}`, relativeFolder, provider: "local-workflow", model: "structured-v1" };
  const steps: ContentStep[] = skill.stages.map((name, ordinal) => ({ id: crypto.randomUUID(), projectId: id, ordinal, name, status: "pending", revision: 0, outputPath: null, outputMarkdown: "", createdAt: now, updatedAt: now, citations: [] }));
  saveBrowserContent({ ...state, projects: [project, ...state.projects], steps: { ...state.steps, [id]: steps } });
  return { project, steps };
}

export async function getContentProject(projectId: string): Promise<ContentProjectDetail> {
  if (isTauri()) return invoke<ContentProjectDetail>("get_content_project", { projectId });
  const state = browserContentState();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Content project was not found.");
  return { project, steps: state.steps[projectId] || [] };
}

function browserStageOutput(project: ContentProject, skill: ContentSkill, step: ContentStep, citations: Citation[], revision: number): string {
  const sourceText = citations.length ? citations.map((citation) => `### [${citation.number}] ${citation.title}\n\n> ${citation.quote}\n\nSource: ${citation.relativePath}`).join("\n\n") : "_No supporting passage was found in the selected scope._";
  const stage = step.name.toLowerCase();
  const structure = project.outputType === "youtube" ? "1. Cold open and promise\n2. Context and stakes\n3. Three evidence-led beats\n4. Counterpoint\n5. Next action" : project.outputType === "long-form" ? "1. Promise and premise\n2. Act or part structure\n3. Character and argument arcs\n4. Chapter causality\n5. Continuity pass" : "1. Purpose\n2. Evidence\n3. Structure\n4. Draft\n5. Revision";
  const working = stage.includes("outline") || stage.includes("arc") || stage.includes("map") ? `## Proposed structure\n\n${structure}` : stage.includes("draft") || stage.includes("script") || stage.includes("post") ? `## Working draft scaffold\n\n${citations[0]?.quote || project.brief}\n\nDevelop this through concrete evidence, tension, and a clear consequence or next action.` : stage.includes("review") || stage.includes("edit") || stage.includes("revision") || stage.includes("checklist") ? "## Editorial pass\n\n- [ ] The opening makes a specific promise.\n- [ ] Claims are supported or labeled as interpretation.\n- [ ] Voice remains consistent.\n- [ ] Repetition is removed.\n- [ ] The ending is earned." : `## Decisions\n\n- What precise promise should this work make?\n- Who is it for?\n- What tension keeps it from feeling obvious?\n\n## Initial direction\n\n${citations[0]?.quote || project.brief}`;
  return `---\nproject_id: ${project.id}\nstage: ${step.name}\nrevision: ${revision}\nprovider: local-workflow\nmodel: structured-v1\ngeneral_knowledge_used: false\ncitations: ${citations.length}\n---\n\n# ${project.title} — ${step.name}\n\n> Offline structured workflow output; not a hidden cloud-model completion.\n\n## Project brief\n\n${project.brief}\n\n## Skill instructions\n\n${skill.instructions}\n\n${working}\n\n## Grounding from your brain\n\n${sourceText}\n`;
}

export async function runNextContentStep(projectId: string, retrievalLimit = 18): Promise<ContentStepRun> {
  if (isTauri()) return invoke<ContentStepRun>("run_next_content_step", { projectId, retrievalLimit });
  const state = browserContentState();
  const project = state.projects.find((item) => item.id === projectId);
  const skill = state.skills.find((item) => item.id === project?.skillId);
  const steps = state.steps[projectId] || [];
  const step = steps.find((item) => item.status !== "complete");
  if (!project || !skill) throw new Error("Content project could not be loaded.");
  if (!step) throw new Error("This workflow is already complete.");
  const candidates = await searchBrain({ query: `${project.brief} ${step.name} ${skill.instructions}`, mode: "hybrid", scope: project.scope === "selected" ? "all" : project.scope, selectedPaths: project.selectedPaths, limit: project.scope === "selected" ? 100 : Math.min(100, retrievalLimit * 4) });
  const results = diversifyResults(candidates.filter((result) => (!project.selectedPaths.length || project.scope !== "selected" || project.selectedPaths.includes(result.relativePath)) && !result.relativePath.startsWith("projects/") && !result.relativePath.startsWith("skills/")), retrievalLimit, 2);
  const citations = results.map((result, index) => ({ passageId: result.passageId, number: index + 1, title: result.title, relativePath: result.relativePath, quote: result.quote }));
  const revision = step.revision + 1;
  const outputPath = `${project.relativeFolder}/outputs/${String(step.ordinal + 1).padStart(2, "0")}-${contentSlug(step.name)}-v${revision}.md`;
  const completed: ContentStep = { ...step, status: "complete", revision, outputPath, outputMarkdown: browserStageOutput(project, skill, step, citations, revision), updatedAt: new Date().toISOString(), citations };
  const nextSteps = steps.map((item) => item.id === step.id ? completed : item);
  const nextIndex = step.ordinal + 1;
  const updated: ContentProject = { ...project, status: nextIndex >= steps.length ? "complete" : "active", currentStep: nextIndex, updatedAt: completed.updatedAt };
  saveBrowserContent({ ...state, projects: [updated, ...state.projects.filter((item) => item.id !== projectId)], steps: { ...state.steps, [projectId]: nextSteps } });
  return { project: updated, step: completed };
}

export async function saveContentStepRevision(input: SaveContentStepRevisionInput): Promise<ContentStepRun> {
  if (isTauri()) return invoke<ContentStepRun>("save_content_step_revision", { input });
  const markdown = input.markdown?.trimEnd();
  if (!markdown?.trim()) throw new Error("A stage revision cannot be empty.");
  const state = browserContentState();
  const project = state.projects.find((item) => item.id === input.projectId);
  const steps = state.steps[input.projectId] || [];
  const step = steps.find((item) => item.id === input.stepId);
  if (!project || !step) throw new Error("The project stage could not be found.");
  if (step.status !== "complete") throw new Error("Run this stage before saving a revision.");
  const revision = step.revision + 1;
  const outputPath = `${project.relativeFolder}/outputs/${String(step.ordinal + 1).padStart(2, "0")}-${contentSlug(step.name)}-v${revision}.md`;
  const now = new Date().toISOString();
  const revised: ContentStep = { ...step, revision, outputPath, outputMarkdown: `${markdown}\n`, updatedAt: now };
  const updated: ContentProject = { ...project, updatedAt: now };
  saveBrowserContent({ ...state, projects: [updated, ...state.projects.filter((item) => item.id !== project.id)], steps: { ...state.steps, [project.id]: steps.map((item) => item.id === step.id ? revised : item) } });
  return { project: updated, step: revised };
}

function browserSyncState(): BrowserSyncStoredState {
  const saved = localStorage.getItem(browserSyncKey);
  const initial: BrowserSyncStoredState = { serviceUrl: "http://localhost:3000", accountEmail: null, keySalt: null, tokenExpiresAt: null, enabled: false, deviceId: `browser-${crypto.randomUUID()}`, lastSyncAt: null, hasAccessToken: false, accessToken: null };
  if (saved) return parseStored(saved, initial);
  localStorage.setItem(browserSyncKey, JSON.stringify(initial));
  return initial;
}

export async function getSyncState(): Promise<SyncState> {
  if (isTauri()) return invoke<SyncState>("get_sync_state");
  const { accessToken: _secret, ...state } = browserSyncState();
  return state;
}

export async function storeSyncCredentials(input: SaveSyncCredentialsInput): Promise<SyncState> {
  if (isTauri()) return invoke<SyncState>("save_sync_credentials", { input });
  const next: BrowserSyncStoredState = { serviceUrl: input.serviceUrl.replace(/\/$/, ""), accountEmail: input.email, keySalt: input.keySalt, tokenExpiresAt: input.expiresAt, enabled: true, deviceId: browserSyncState().deviceId, lastSyncAt: browserSyncState().lastSyncAt, hasAccessToken: true, accessToken: input.accessToken };
  localStorage.setItem(browserSyncKey, JSON.stringify(next));
  const { accessToken: _secret, ...state } = next;
  return state;
}

export async function getSyncAccessToken(): Promise<string> {
  if (isTauri()) return invoke<string>("get_sync_access_token");
  const token = browserSyncState().accessToken;
  if (!token) throw new Error("Sync credential is unavailable.");
  return token;
}

export async function clearSyncCredentials(): Promise<SyncState> {
  if (isTauri()) return invoke<SyncState>("clear_sync_credentials");
  const next = { ...browserSyncState(), accountEmail: null, keySalt: null, tokenExpiresAt: null, enabled: false, hasAccessToken: false, accessToken: null };
  localStorage.setItem(browserSyncKey, JSON.stringify(next));
  const { accessToken: _secret, ...state } = next;
  return state;
}

async function browserSyncFiles(): Promise<SyncFileDescriptor[]> {
  const documents = new Map<string, string>();
  for (const passage of browserPassages()) {
    const current = documents.get(passage.relativePath);
    documents.set(passage.relativePath, current ? `${current}\n\n${passage.quote}` : `# ${passage.title}\n\n${passage.quote}`);
  }
  return Promise.all([...documents].map(async ([relativePath, markdown]) => {
    const bytes = new TextEncoder().encode(markdown);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const contentHash = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return { relativePath, size: bytes.length, modifiedAt: new Date().toISOString(), contentHash, mimeType: "text/markdown" };
  }));
}

export async function listLocalSyncFiles(): Promise<SyncFileDescriptor[]> {
  if (isTauri()) return invoke<SyncFileDescriptor[]>("list_sync_files");
  return browserSyncFiles();
}

export async function readLocalSyncFile(relativePath: string): Promise<Uint8Array> {
  if (isTauri()) return new Uint8Array(await invoke<number[]>("read_sync_file", { relativePath }));
  const passages = browserPassages().filter((item) => item.relativePath === relativePath);
  return new TextEncoder().encode(passages.length ? `# ${passages[0].title}\n\n${passages.map((passage) => passage.quote).join("\n\n")}` : "");
}

export async function writeLocalSyncFile(input: WriteSyncedFileInput): Promise<SyncWriteOutcome> {
  if (isTauri()) return invoke<SyncWriteOutcome>("write_synced_file", { input: { ...input, content: Array.from(input.content) } });
  return { relativePath: input.relativePath, disposition: "created", writtenPath: `/browser-preview/${input.relativePath}`, contentHash: "browser-preview" };
}

export async function loadSyncManifest(): Promise<SyncManifest> {
  if (isTauri()) return invoke<SyncManifest>("load_sync_manifest");
  return parseStored(localStorage.getItem(browserSyncManifestKey), { brainId: "", lastSyncAt: null, objects: {} });
}

export async function persistSyncManifest(manifest: SyncManifest): Promise<SyncManifest> {
  if (isTauri()) return invoke<SyncManifest>("save_sync_manifest", { manifest });
  const next = { ...manifest, lastSyncAt: new Date().toISOString() };
  localStorage.setItem(browserSyncManifestKey, JSON.stringify(next));
  const state = { ...browserSyncState(), lastSyncAt: next.lastSyncAt };
  localStorage.setItem(browserSyncKey, JSON.stringify(state));
  return next;
}

export { isTauri };
