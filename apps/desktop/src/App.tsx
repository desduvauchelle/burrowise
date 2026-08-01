import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, ReactNode, SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AudioCaptureHandle } from "./services/audioCapture";
import {
  createAudioCapture,
  requestMicrophoneAccess,
} from "./services/audioCapture";
import {
  authenticateSync,
  disconnectSync,
  getSyncOverview,
  synchronizeBrain,
  unlockSync,
} from "./services/syncService";
import type { SyncResult } from "./services/syncService";
const ContentStudioPage = lazy(() =>
  import("./components/ContentStudio").then((module) => ({
    default: module.ContentStudioPage,
  })),
);
import { BrandMark } from "./components/BrandMark";
import {
  RecordingButton,
  type RecordingPhase,
} from "./components/RecordingButton";
import {
  chooseBrainFolder,
  chooseImageFiles,
  chooseSourceFiles,
  chooseVideoFiles,
  beginInterviewAudioTurn,
  completeInterviewAudioTurn,
  configureBrainFolder,
  createChatConversation,
  createCaptureSession,
  getSourceDocument,
  getShortcutSettings,
  getBootstrapState,
  getDashboardOverview,
  getAudioRetention,
  getLibraryOverview,
  getImageMemory,
  getParakeetStatus,
  getGenerationProviderCatalog,
  getProviderCostSummary,
  getTagsOverview,
  endInterview,
  exportChatConversation,
  exportInterviewSession,
  failCaptureSession,
  listInterviewAccessLog,
  listInterviewHosts,
  listInterviews,
  listInterviewTurns,
  listTranscriptionProviders,
  listChatConversations,
  listChatMessages,
  listIndexedSources,
  importSourceFiles,
  importImageFiles,
  importVideoFiles,
  installParakeetCli,
  listNotes,
  listReviewItems,
  listenForQuickCapture,
  listenForSharedImports,
  loadCaptureAudio,
  loadImageMemory,
  openMicrophoneSettings,
  openNoteExternal,
  openCaptureTranscript,
  openSpeechSettings,
  processCaptureSession,
  proposeTranscriptCleanup,
  updateCaptureTranscript,
  processImageMemory,
  processInterviewAudioTurn,
  downloadParakeetModel,
  requestSpeechPermission,
  resolveReviewItem,
  revealBrainFolder,
  revealCaptureAudio,
  revealCaptureSession,
  revealImageMemory,
  revealSourceInFinder,
  renameCaptureSession,
  renameChatConversation,
  renameInterviewSession,
  resumeInterviewSession,
  rebuildSearchIndex,
  saveCaptureAudio,
  saveCaptureAudioSnapshot,
  saveInterviewHost,
  saveInterviewTurnAudio,
  saveNote,
  saveGenerationProvider,
  saveProviderMonthlyBudget,
  saveProviderCredential,
  searchBrain,
  sendChatMessage,
  sendInterviewTurn,
  startInterview,
  setTranscriptionProvider,
  setMicrophonePermissionState,
  setPreferredModel,
  setFavoriteModel,
  setDefaultProviderModel,
  setAudioRetention,
  testGenerationProvider,
  transcribeCaptureSnapshot,
  updateQuickCaptureShortcut,
  updateBehaviorPreferences,
  clearProviderCredential,
  deleteGenerationProvider,
  clearSearchIndex,
  trashCaptureSession,
  trashInterviewSession,
  deleteChatConversation,
  queueChatAgentProposal,
  trashNote,
} from "./services/platform";
import type {
  AgentProposal,
  BootstrapState,
  CaptureSession,
  ChatConversation,
  ChatMessage,
  Citation,
  DashboardActivity,
  DashboardOverview,
  GenerationProviderState,
  ImageMemory,
  IndexStats,
  IndexedSource,
  InterviewAccessEntry,
  InterviewHost,
  InterviewSession,
  InterviewTurn,
  LibraryItem,
  LibraryOverview,
  ModelSelection,
  NoteDocument,
  NoteSource,
  ProviderCatalog,
  ParakeetStatus,
  ProviderCostSummary,
  ReviewRecord,
  SearchResult,
  ShortcutSettingsState,
  SourceDocument,
  SyncState,
  TaggedSource,
  TagsOverview,
  TranscriptionProvider,
} from "./types/domain";
import type {
  DensityPreference,
  FocusRequest,
  RetrievalSettings,
  RouteId,
  ThemePreference,
} from "./types/ui";
import { errorMessage } from "./utils/errors";
import {
  Archive,
  ArrowClockwise,
  ArrowRight,
  BookOpen,
  Brain,
  Camera,
  CaretDown,
  ChatCircle,
  Check,
  CheckCircle,
  Checks,
  CircleNotch,
  Clock,
  CloudArrowUp,
  CloudArrowDown,
  Command,
  Code,
  CurrencyDollar,
  Database,
  File,
  FileText,
  Folder,
  Gear,
  HardDrives,
  Hash,
  House,
  Info,
  ImageSquare,
  Keyboard,
  Link,
  ListChecks,
  MagnifyingGlass,
  MarkdownLogo,
  Microphone,
  Moon,
  NotePencil,
  Plus,
  Quotes,
  Robot,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  Star,
  Sun,
  Tag,
  Trash,
  Users,
  Waveform,
  VideoCamera,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";

const routes = [
  { id: "home", label: "Home", icon: House },
  { id: "capture", label: "Capture", icon: Microphone, primary: true },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "review", label: "Review", icon: ListChecks },
  { id: "chat", label: "Chat", icon: ChatCircle },
  { id: "interviews", label: "Interviews", icon: Users },
  { id: "studio", label: "Studio", icon: Sparkle },
  { id: "tags", label: "Tags", icon: Tag },
  { id: "settings", label: "Settings", icon: Gear },
] as const;

const themeOptions = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Command },
] as const;

interface ThemeState {
  preference: ThemePreference;
  setPreference: Dispatch<SetStateAction<ThemePreference>>;
  resolved: "light" | "dark";
  density: DensityPreference;
  setDensity: Dispatch<SetStateAction<DensityPreference>>;
  reduceMotion: boolean;
  setReduceMotion: Dispatch<SetStateAction<boolean>>;
}

interface SessionRailItem extends CaptureSession {
  group: string;
  time: string;
  meta: string;
}

interface InspectorResult {
  sourceType: string;
  quote: string;
  score?: number;
  lexicalScore?: number;
  semanticScore?: number;
  matchType?: string;
  title?: string;
  relativePath?: string;
}

interface SourceView {
  result: InspectorResult;
  source: SourceDocument;
}

interface LibrarySelection {
  item: LibraryItem;
  memory: ImageMemory | null;
  source: SourceDocument | null;
}

interface CitationView {
  citation: Citation;
  source: SourceDocument;
}

interface SyncOverviewState extends SyncState {
  unlocked: boolean;
  brainId?: string;
}

type Navigate = (page: RouteId, options?: { preserveFocus?: boolean }) => void;

interface AppNavProps {
  page: RouteId;
  navigate: Navigate;
  activeBrain: string | null;
  recorder: CaptureRecorderController;
  reviewCount?: number;
}

function getRouteFromHash(): RouteId {
  const hash = window.location.hash.replace("#/", "").split("?")[0];
  if (["search", "library", "notes"].includes(hash)) return "knowledge";
  return routes.find((route) => route.id === hash)?.id || "home";
}

function useTheme(): ThemeState {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem("second-brain-theme");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [density, setDensity] = useState<DensityPreference>(() =>
    localStorage.getItem("second-brain-density") === "spacious" ? "spacious" : "comfortable",
  );
  const [reduceMotion, setReduceMotion] = useState(
    () => localStorage.getItem("second-brain-reduce-motion") === "true",
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    localStorage.setItem("second-brain-theme", preference);
    document.documentElement.dataset.theme = resolved;
  }, [preference, resolved]);

  useEffect(() => {
    localStorage.setItem("second-brain-density", density);
    localStorage.setItem("second-brain-reduce-motion", String(reduceMotion));
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [density, reduceMotion]);

  return {
    preference,
    setPreference,
    resolved,
    density,
    setDensity,
    reduceMotion,
    setReduceMotion,
  };
}

const defaultRetrievalSettings: RetrievalSettings = {
  searchResultLimit: 30,
  chatChunkLimit: 16,
  interviewChunkLimit: 10,
  studioChunkLimit: 18,
  answerMode: "standard",
};

function useRetrievalSettings(): [RetrievalSettings, Dispatch<SetStateAction<RetrievalSettings>>] {
  const [retrievalSettings, setRetrievalSettings] = useState<RetrievalSettings>(() => {
    try {
      return {
        ...defaultRetrievalSettings,
        ...(JSON.parse(
          localStorage.getItem("second-brain-retrieval-settings") || "{}",
        ) as Partial<RetrievalSettings>),
      };
    } catch {
      return defaultRetrievalSettings;
    }
  });
  useEffect(() => {
    localStorage.setItem(
      "second-brain-retrieval-settings",
      JSON.stringify(retrievalSettings),
    );
  }, [retrievalSettings]);
  return [retrievalSettings, setRetrievalSettings];
}

function AppNav({ page, navigate, activeBrain, recorder, reviewCount = 0 }: AppNavProps) {
  return (
    <aside className="app-nav">
      <button
        className="brand"
        onClick={() => navigate("home")}
        aria-label="Burrowise home"
      >
        <span className="brand-mark">
          <BrandMark />
        </span>
        <span>Burrowise</span>
      </button>
      <RecordingButton
        variant="mini"
        phase={recorder.phase}
        elapsedSeconds={recorder.elapsed}
        message={recorder.message}
        onStart={recorder.begin}
        onStop={recorder.stop}
      />
      <nav className="primary-nav" aria-label="Main navigation">
        {routes
          .filter((route) => !("primary" in route && route.primary))
          .map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => navigate(id)}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={20} weight={page === id ? "fill" : "regular"} />
              <span>{label}</span>
              {id === "review" && reviewCount > 0 ? (
                <span className="nav-count">{reviewCount}</span>
              ) : null}
            </button>
          ))}
      </nav>
      <div className="privacy-state">
        <span className="status-dot" />
        <div>
          <strong>Local only</strong>
          <span title={activeBrain || undefined}>
            Vault:{" "}
            {activeBrain?.split("/").filter(Boolean).pop() || "Not configured"}
          </span>
        </div>
      </div>
    </aside>
  );
}

interface SessionRailProps {
  onNewCapture: () => void;
  items: SessionRailItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function SessionRail({ onNewCapture, items, selectedId, onSelect }: SessionRailProps) {
  const [query, setQuery] = useState("");
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter((session) =>
      [
        session.title,
        session.transcript,
        session.summary,
        ...(session.tags || []),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [items, query]);
  const grouped = useMemo(
    () =>
      ["Today", "Yesterday", "Previous 7 Days"]
        .map((group) => ({
          group,
          items: visibleItems.filter((session) => session.group === group),
        }))
        .filter(({ items: groupItems }) => groupItems.length),
    [visibleItems],
  );
  return (
    <aside className="context-rail">
      <div className="rail-toolbar">
        <label className="search-box">
          <MagnifyingGlass size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search captures…"
            aria-label="Search captures"
          />
        </label>
        <button
          className="icon-button"
          onClick={onNewCapture}
          aria-label="Start a new capture"
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="session-groups">
        {grouped.map(({ group, items: groupItems }) => (
          <section className="session-group" key={group}>
            <div className="group-title">
              {group}
              <span>{groupItems.length}</span>
            </div>
            {groupItems.map((session) => (
              <button
                className={`session-row ${session.id === selectedId ? "selected" : ""}`}
                key={session.id}
                onClick={() => onSelect(session.id)}
                aria-pressed={session.id === selectedId}
              >
                <span className="session-time">{session.time}</span>
                <span className="session-copy">
                  <strong>{session.title}</strong>
                  <small>
                    {session.status === "ready"
                      ? `${session.tags?.length || 0} tags · transcript ready`
                    : ["recording_failed", "transcription_failed", "transcription_needs_review", "enrichment_failed"].includes(
                            session.status,
                          )
                        ? "Needs attention"
                        : session.meta}
                  </small>
                </span>
                {["transcribing", "tagging"].includes(session.status) ? (
                  <CircleNotch className="spin" size={15} />
                ) : ["recording_failed", "transcription_failed", "transcription_needs_review", "enrichment_failed"].includes(
                    session.status,
                  ) ? (
                  <Info className="session-error-icon" size={15} />
                ) : session.status === "ready" ? (
                  <Checks className="session-ready-icon" size={15} />
                ) : null}
              </button>
            ))}
          </section>
        ))}
        {visibleItems.length === 0 ? (
          <div className="rail-empty">
            {query.trim() ? <MagnifyingGlass /> : <Waveform />}
            <strong>
              {query.trim() ? "No matching captures" : "No captures yet"}
            </strong>
            <small>
              {query.trim()
                ? "Try a title, transcript word, or tag."
                : "Use the recording control to create the first one."}
            </small>
          </div>
        ) : null}
      </div>
      <div className="rail-count">
        {visibleItems.length} capture{visibleItems.length === 1 ? "" : "s"}
      </div>
    </aside>
  );
}

function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

interface CaptureRecorderController {
  phase: RecordingPhase;
  elapsed: number;
  message: string;
  partialTranscript: string;
  begin: () => Promise<void>;
  stop: () => void;
}

function useCaptureRecorder({
  onSessionSaved,
  transcriptionProvider = "none",
  correctionPreference = "verbatim",
}: {
  onSessionSaved?: (session: CaptureSession) => void;
  transcriptionProvider?: string;
  correctionPreference?: string;
}): CaptureRecorderController {
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState(
    "Hold for a quick thought, or tap once for a longer capture.",
  );
  const [partialTranscript, setPartialTranscript] = useState("");
  const controller = useRef<AudioCaptureHandle | null>(null);
  const releaseRequested = useRef(false);
  const captureStarted = useRef(false);
  const operationActive = useRef(false);
  const stopping = useRef(false);

  useEffect(
    () => () => {
      void controller.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (phase !== "recording") return undefined;
    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  const stop = () => {
    releaseRequested.current = true;
    if (!controller.current || !captureStarted.current || stopping.current) return;
    stopping.current = true;
    setPhase("stopping");
    void controller.current.stop();
  };

  const begin = async () => {
    if (operationActive.current) return;
    operationActive.current = true;
    releaseRequested.current = false;
    captureStarted.current = false;
    stopping.current = false;
    setPhase("preparing");
    setElapsed(0);
    setPartialTranscript("");
    setMessage("Preparing a local capture...");
    let session: CaptureSession | null = null;
    let durableAudio = false;
    try {
      controller.current = await createAudioCapture({
        onSnapshot: async (blob) => {
          if (!session || transcriptionProvider !== "apple-speech") return;
          await saveCaptureAudioSnapshot(session.id, blob);
          const partial = await transcribeCaptureSnapshot(session.id);
          if (partial.trim()) {
            setPartialTranscript(partial.trim());
            setMessage("Listening locally… partial transcript updated.");
          }
        },
        onStopped: async (blob) => {
          if (!session) throw new Error("The capture session was not ready before recording stopped.");
          captureStarted.current = false;
          setPhase("processing");
          setPartialTranscript("");
          setMessage("Saving original audio locally...");
          const saved = await saveCaptureAudio(session.id, blob);
          if ("id" in saved) onSessionSaved?.(saved);
          if (saved.status === "recording_failed") {
            controller.current = null;
            operationActive.current = false;
            stopping.current = false;
            setPhase("error");
            setMessage(
              ("processingError" in saved ? saved.processingError : null) ||
                "The recording was too short. Hold while speaking, or tap once to keep recording until the next tap.",
            );
            return;
          }
          durableAudio = true;
          setMessage("Transcribing on this Mac...");
          const processed = await processCaptureSession(session.id);
          controller.current = null;
          operationActive.current = false;
          stopping.current = false;
          setPhase("idle");
          if (processed.status === "ready") {
            setMessage(
              correctionPreference === "review-after-transcription"
                ? `Transcript saved with ${processed.tags.length} automatic tag${processed.tags.length === 1 ? "" : "s"}. Review the selected transcript wording before accepting it as final.`
                : `Transcript saved verbatim with ${processed.tags.length} automatic tag${processed.tags.length === 1 ? "" : "s"}.`,
            );
          } else if (processed.status === "transcription_failed") {
            setMessage(
              processed.processingError ||
                "Transcription failed. The original audio is safe and can be retried.",
            );
          } else if (processed.status === "enrichment_failed") {
            setMessage(
              processed.processingError ||
                "The transcript is safe, but local enrichment needs to be retried.",
            );
          } else {
            setMessage(
              "Audio saved. Choose a transcription provider when you are ready.",
            );
          }
          onSessionSaved?.(processed);
        },
        onError: (error) => {
          captureStarted.current = false;
          operationActive.current = false;
          stopping.current = false;
          setPhase("error");
          controller.current = null;
          const message = errorMessage(error);
          setMessage(message);
          if (session && !durableAudio) {
            void failCaptureSession(session.id, message)
              .then((failed) => onSessionSaved?.(failed))
              .catch(() => undefined);
          }
        },
      });
      // Permission is resolved by createAudioCapture, but audio collection does
      // not begin until the canonical session files exist.
      session = await createCaptureSession();
      onSessionSaved?.(session);
      await controller.current.start();
      captureStarted.current = true;
      if (releaseRequested.current) {
        stopping.current = true;
        setPhase("stopping");
        await controller.current.stop();
      } else {
        setPhase("recording");
        setMessage("Listening locally. Release after a hold, or tap again to stop.");
      }
    } catch (error) {
      await controller.current?.abort();
      controller.current = null;
      captureStarted.current = false;
      operationActive.current = false;
      stopping.current = false;
      setPhase("error");
      const message = errorMessage(error);
      setMessage(message);
      if (session) {
        try {
          onSessionSaved?.(await failCaptureSession(session.id, message));
        } catch {
          // The original setup error remains the most useful user-facing failure.
        }
      }
    }
  };

  return { phase, elapsed, message, partialTranscript, begin, stop };
}

function RecordBar({
  prominent = false,
  recorder,
}: {
  prominent?: boolean;
  recorder: CaptureRecorderController;
}) {
  return (
    <div className={`record-wrap ${prominent ? "prominent" : ""}`}>
      <RecordingButton
        variant="normal"
        prominent={prominent}
        phase={recorder.phase}
        elapsedSeconds={recorder.elapsed}
        message={recorder.message}
        onStart={recorder.begin}
        onStop={recorder.stop}
      />
      <p className="record-hint" role="status">
        {recorder.message}
      </p>
      {recorder.partialTranscript ? (
        <p className="record-partial" aria-live="polite">
          <span>Live transcript</span>
          {recorder.partialTranscript}
        </p>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatUsdMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: dollars > 0 && dollars < 0.01 ? 6 : 2,
  }).format(dollars);
}

function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: tokens >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(tokens);
}

function relativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

interface HomeDashboardProps {
  navigate: Navigate;
  openActivity: (activity: DashboardActivity) => void;
  startInterviewSetup: () => void;
  overview: DashboardOverview | null;
  dashboardError: string;
  retrievalSettings: RetrievalSettings;
}

function HomeDashboard({
  navigate,
  openActivity,
  startInterviewSetup,
  overview,
  dashboardError,
  retrievalSettings,
}: HomeDashboardProps) {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceDocument | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchStatus("");
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchStatus("Searching locally…");
      try {
        const scope: string = ({
          All: "all",
          Notes: "notes",
          Sessions: "sessions",
          Files: "sources",
        } as Record<string, string>)[filter] || "all";
        const matches = await searchBrain({
          query,
          mode: "hybrid",
          scope,
          selectedPaths: [],
          limit: retrievalSettings.searchResultLimit,
        });
        if (!cancelled) {
          setResults(matches);
          setSearchStatus(
            `${matches.length} result${matches.length === 1 ? "" : "s"}`,
          );
        }
      } catch (error) {
        if (!cancelled) setSearchStatus(errorMessage(error));
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, filter]);
  const inspectResult = async (result: SearchResult) => {
    setSearchStatus("Opening the exact local source…");
    try {
      const source = await getSourceDocument(result.relativePath);
      setSelectedResult(result);
      setSelectedSource(source);
      setSearchStatus(
        `${results.length} result${results.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      setSelectedResult(null);
      setSelectedSource(null);
      setSearchStatus(errorMessage(error));
    }
  };
  const startNewChat = async () => {
    setActionStatus("Starting a new local chat…");
    try {
      await createChatConversation({ title: "Untitled chat", scope: "all" });
      navigate("chat");
    } catch (error) {
      setActionStatus(errorMessage(error));
    }
  };
  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 18
        ? "Good afternoon"
        : "Good evening";
  const stats = overview?.stats;
  const activityIcons: Record<string, typeof FileText> = {
    capture: Waveform,
    note: FileText,
    image: ImageSquare,
    chat: ChatCircle,
    interview: Users,
    project: Sparkle,
  };
  const reviewLabels: Record<string, string> = {
    "atomic-note": "Atomic-note proposals",
    duplicate: "Possible duplicates",
    tag: "Tag suggestions",
    transcription: "Transcription checks",
    contradiction: "Potential contradictions",
    failed: "Failed jobs",
    other: "Other items",
  };
  const reviewEntries = Object.entries(overview?.reviewCounts || {});
  return (
    <main className="feature-page dashboard-page">
      <PageHeader
        eyebrow={now.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        title={greeting}
        action={
          <span className={`local-pill ${dashboardError ? "error" : ""}`}>
            <span className="status-dot" />{" "}
            {dashboardError ? "Dashboard needs attention" : "Local brain ready"}
          </span>
        }
      />
      <div className="dashboard-search">
        <MagnifyingGlass size={22} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search across your brain..."
        />
        <div className="search-filters">
          {["All", "Notes", "Sessions", "Files"].map((item) => (
            <button
              className={filter === item ? "active" : ""}
              key={item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {query.trim() ? (
        <section className="dashboard-search-results">
          <header>
            <span>{searchStatus}</span>
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
              }}
            >
              <X /> Clear
            </button>
          </header>
          {results.map((result) => (
            <button
              key={result.passageId}
              onClick={() => inspectResult(result)}
            >
              <FileText />
              <span>
                <strong>{result.title}</strong>
                <small>{result.quote}</small>
                <em>{result.relativePath}</em>
              </span>
              <ArrowRight />
            </button>
          ))}
          {results.length === 0 && !searchStatus.startsWith("Searching") ? (
            <p>No matching passages in this scope.</p>
          ) : null}
        </section>
      ) : null}
      <section className="quick-actions" aria-label="Quick actions">
        <button onClick={() => navigate("capture")}>
          <span>
            <Microphone />
          </span>
          <strong>Capture a thought</strong>
          <small>Open the full recorder</small>
          <ArrowRight />
        </button>
        <button onClick={startNewChat}>
          <span>
            <ChatCircle />
          </span>
          <strong>Start a chat</strong>
          <small>Ask with citations</small>
          <ArrowRight />
        </button>
        <button onClick={startInterviewSetup}>
          <span>
            <Users />
          </span>
          <strong>Start an interview</strong>
          <small>Choose an AI host</small>
          <ArrowRight />
        </button>
        <button onClick={() => navigate("knowledge")}>
          <span>
            <NotePencil />
          </span>
          <strong>Open knowledge</strong>
          <small>Browse notes and sources</small>
          <ArrowRight />
        </button>
      </section>
      {actionStatus ? (
        <p className="dashboard-action-status" role="status">
          {actionStatus}
        </p>
      ) : null}
      {dashboardError ? (
        <div className="dashboard-error">
          <Info /> {dashboardError}
        </div>
      ) : null}
      <section className="usage-strip">
        <div>
          <strong>{stats ? stats.noteCount.toLocaleString() : "—"}</strong>
          <span>Atomic notes</span>
        </div>
        <div>
          <strong>{stats ? stats.captureCount.toLocaleString() : "—"}</strong>
          <span>Capture sessions</span>
        </div>
        <div>
          <strong>{stats ? formatBytes(stats.retainedAudioBytes) : "—"}</strong>
          <span>Audio retained</span>
        </div>
        <div>
          <strong>{stats ? formatBytes(stats.storageBytes) : "—"}</strong>
          <span>Local storage</span>
        </div>
      </section>
      <div className="dashboard-columns">
        <section className="activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent activity</h2>
              <p>Changes across captures, notes, and chats</p>
            </div>
            <button onClick={() => navigate("knowledge")}>View knowledge</button>
          </div>
          {(overview?.recentActivity || []).map((item) => {
            const Icon = activityIcons[item.kind] || FileText;
            return (
              <button
                className="activity-row"
                key={item.id}
                onClick={() => openActivity(item)}
              >
                <span className="activity-icon">
                  <Icon />
                </span>
                <span>
                  <small>{item.label}</small>
                  <strong>{item.title}</strong>
                </span>
                <time>{relativeTime(item.updatedAt)}</time>
                <ArrowRight />
              </button>
            );
          })}
          {overview && overview.recentActivity.length === 0 ? (
            <div className="dashboard-empty">
              <Clock />
              <strong>No activity yet</strong>
              <span>
                Your first capture, note, chat, or interview will appear here.
              </span>
            </div>
          ) : null}
        </section>
        <aside className="attention-panel">
          <div className="panel-heading">
            <div>
              <h2>Needs attention</h2>
              <p>Nothing is changed without you</p>
            </div>
          </div>
          <div className="attention-count">
            <strong>{stats?.reviewCount ?? "—"}</strong>
            <span>items in Review</span>
          </div>
          {reviewEntries.length ? (
            <ul>
              {reviewEntries.map(([type, count]) => (
                <li key={type}>
                  {count} {reviewLabels[type] || type}
                </li>
              ))}
            </ul>
          ) : (
            <div className="attention-clear">
              <Checks />
              <span>Review is clear.</span>
            </div>
          )}
          <button className="primary-button" onClick={() => navigate("review")}>
            Open Review inbox <ArrowRight />
          </button>
        </aside>
      </div>
      {selectedResult && selectedSource ? (
        <SourceInspector
          result={selectedResult}
          source={selectedSource}
          query={query}
          onClose={() => {
            setSelectedResult(null);
            setSelectedSource(null);
          }}
        />
      ) : null}
    </main>
  );
}

interface CapturePageProps {
  session: CaptureSession | null;
  transcriptionProvider: string;
  recorder: CaptureRecorderController;
  onSessionSaved: (session: CaptureSession) => void;
  onSessionDeleted: (sessionId: string) => void;
}

function CapturePage({
  session,
  transcriptionProvider,
  recorder,
  onSessionSaved,
  onSessionDeleted,
}: CapturePageProps) {
  const [detailsTab, setDetailsTab] = useState("extracted");
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(session?.title || "");
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState(session?.transcript || "");
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [cleaningTranscript, setCleaningTranscript] = useState(false);
  const [cleanupAttribution, setCleanupAttribution] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioStatus, setAudioStatus] = useState("");
  const providerLabel =
    transcriptionProvider === "apple-speech"
      ? "Apple Speech"
      : transcriptionProvider === "parakeet"
        ? "Parakeet"
        : "Record only";
  const hasSession = Boolean(session);
  const visibleTranscript = session?.transcript || "";
  const visibleAtomicNotes = session?.atomicNotes || [];
  const visibleTags = session?.tags || [];
  const statusCopy =
    session?.status === "ready"
      ? [
          "Transcript ready",
          `${visibleTags.length} automatic tags saved locally`,
        ]
      : session?.status === "recording_failed"
        ? [
            "Recording needs attention",
            session.processingError || "No usable audio was captured.",
          ]
        : session?.status === "transcription_failed"
          ? [
              "Transcription needs attention",
              session.processingError ||
                "The original audio is safe and can be retried.",
            ]
          : session?.status === "transcription_needs_review"
            ? [
                "Transcript needs a correction",
                session.processingError ||
                  "Review the preserved wording and save a corrected transcript.",
              ]
          : session?.status === "enrichment_failed"
            ? [
                "Enrichment needs attention",
                session.processingError ||
                  "The transcript is safe and local enrichment can be retried.",
              ]
          : session?.status === "transcribing"
            ? [
                "Transcribing locally",
                "Apple Speech is processing the saved recording",
              ]
            : session?.status === "tagging"
              ? ["Transcript saved", "Creating local title, summary, and tags"]
              : session?.status === "recording" && !session.audioPath
                ? [
                    "Recording was interrupted",
                    "No audio file was saved for this session.",
                  ]
                : [
                    "Audio saved locally",
                    transcriptionProvider === "none"
                      ? "Choose a transcription provider to continue"
                      : "Waiting for transcription",
                  ];
  const retry = async () => {
    if (!session || retrying) return;
    setRetrying(true);
    setActionError("");
    try {
      onSessionSaved(await processCaptureSession(session.id));
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setRetrying(false);
    }
  };
  const runFileAction = async (action: (sessionId: string) => Promise<void>) => {
    if (!session) return;
    setActionError("");
    try {
      await action(session.id);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  useEffect(() => {
    setTitleDraft(session?.title || "");
    setEditingTitle(false);
    setTranscriptDraft(session?.transcript || "");
    setEditingTranscript(false);
    setCleanupAttribution("");
  }, [session?.id, session?.title]);

  useEffect(() => {
    if (!editingTranscript) setTranscriptDraft(session?.transcript || "");
  }, [session?.transcript, editingTranscript]);

  useEffect(() => {
    let cancelled = false;
    let nextUrl = "";
    setAudioUrl("");
    setAudioStatus(
      session?.audioPath ? "Loading saved audio…" : "No audio file saved.",
    );
    if (!session?.audioPath) return undefined;
    loadCaptureAudio(session.id)
      .then((blob) => {
        if (cancelled) return;
        nextUrl = URL.createObjectURL(blob);
        setAudioUrl(nextUrl);
        setAudioStatus("");
      })
      .catch((error) => {
        if (!cancelled) setAudioStatus(errorMessage(error));
      });
    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [session?.id, session?.audioPath]);

  const saveTitle = async () => {
    if (!session || savingTitle || titleDraft.trim() === session.title) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    setActionError("");
    try {
      onSessionSaved(await renameCaptureSession(session.id, titleDraft));
      setEditingTitle(false);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setSavingTitle(false);
    }
  };

  const saveTranscript = async (reorganize: boolean) => {
    if (!session || savingTranscript || !transcriptDraft.trim()) return;
    if (
      reorganize &&
      !window.confirm(
        "Save this transcript and rebuild its local title, summary, tags, and pending atomic-note proposals?\n\nApproved or denied Review decisions and canonical notes are not changed.",
      )
    ) {
      return;
    }
    setSavingTranscript(true);
    setActionError("");
    try {
      const updated = await updateCaptureTranscript(
        session.id,
        transcriptDraft,
        reorganize,
      );
      onSessionSaved(updated);
      setEditingTranscript(false);
      setCleanupAttribution("");
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setSavingTranscript(false);
    }
  };

  const cleanUpTranscript = async () => {
    if (!session || cleaningTranscript) return;
    setCleaningTranscript(true);
    setActionError("");
    try {
      const catalog = await getGenerationProviderCatalog(false);
      const selection = catalog.preferredModels?.transcript;
      if (!selection) {
        throw new Error(
          "Choose a Transcript cleanup model under Settings → Models first.",
        );
      }
      const provider = catalog.providers.find(
        (item) => item.id === selection.providerId,
      );
      if (provider?.locality === "cloud") {
        const confirmed = window.confirm(
          `Send this transcript to ${provider.label} · ${selection.modelId} for cleanup?\n\nOnly this transcript will leave your Mac. The canonical wording will not change until you review and save the returned draft.`,
        );
        if (!confirmed) return;
      }
      const proposal = await proposeTranscriptCleanup(session.id);
      setTranscriptDraft(proposal.proposed);
      setCleanupAttribution(
        `${proposal.providerId} · ${proposal.modelId} · ${proposal.locality}`,
      );
      setEditingTranscript(true);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setCleaningTranscript(false);
    }
  };

  const removeSession = async () => {
    if (!session || deleting) return;
    const proposalCount = visibleAtomicNotes.length;
    const confirmed = window.confirm(
      `Move “${session.title}” to the macOS Trash?\n\nIts transcript, original audio, and ${proposalCount} session-owned atomic-note proposal${proposalCount === 1 ? "" : "s"} will leave this brain. The session folder can be recovered from Trash.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setActionError("");
    try {
      await trashCaptureSession(session.id);
      onSessionDeleted(session.id);
    } catch (error) {
      setActionError(errorMessage(error));
      setDeleting(false);
    }
  };
  return (
    <main className="document-page">
      <div className="document-topbar">
        <span>
          <File size={18} /> {hasSession ? "Capture session" : "New capture"}{" "}
          {session ? (
            <>
              <i>•</i>{" "}
              {new Date(session.createdAt || Date.now()).toLocaleString()}
            </>
          ) : null}
        </span>
        {session ? (
          <div className="capture-top-actions">
            <button
              className="secondary-button compact-action"
              onClick={() => runFileAction(revealCaptureSession)}
            >
              <Folder size={16} /> Reveal folder
            </button>
            <button
              className="danger-button compact-action"
              onClick={removeSession}
              disabled={deleting}
            >
              <Trash size={16} /> {deleting ? "Moving…" : "Move to Trash"}
            </button>
          </div>
        ) : null}
      </div>
      <div className="document-body capture-document">
        <section className="capture-hero">
          <p className="eyebrow">New voice capture</p>
          <h1>What’s on your mind?</h1>
          <p>
            Hold for a quick thought and release, or tap once for a longer
            capture and tap again to stop. Your audio saves locally first.
          </p>
          <RecordBar prominent recorder={recorder} />
          <div className="capture-provider">
            <span className="status-dot" /> On device <i>•</i> {providerLabel}{" "}
            <i>•</i> English
          </div>
        </section>
        {session ? (
          <>
            <div className="capture-latest-heading">
              <div>
                <p>Selected session</p>
                {editingTitle ? (
                  <div className="capture-title-editor">
                    <input
                      autoFocus
                      value={titleDraft}
                      maxLength={120}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveTitle();
                        if (event.key === "Escape") {
                          setTitleDraft(session.title);
                          setEditingTitle(false);
                        }
                      }}
                    />
                    <button
                      className="primary-button"
                      onClick={saveTitle}
                      disabled={savingTitle || !titleDraft.trim()}
                    >
                      {savingTitle ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setTitleDraft(session.title);
                        setEditingTitle(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="capture-title-row">
                    <h2>{session.title}</h2>
                    <button
                      className="icon-button"
                      onClick={() => setEditingTitle(true)}
                      aria-label="Rename capture"
                    >
                      <NotePencil />
                    </button>
                  </div>
                )}
                <small>{session.relativeFolder}</small>
              </div>
            </div>
            <div
              className={`processing-row ${["recording_failed", "transcription_failed", "transcription_needs_review", "enrichment_failed"].includes(session.status) ? "failed" : ""}`}
            >
              <span>
                {["transcribing", "tagging"].includes(session.status) ||
                retrying ? (
                  <CircleNotch className="spin" size={18} />
                ) : ["recording_failed", "transcription_failed", "transcription_needs_review", "enrichment_failed"].includes(
                    session.status,
                  ) ||
                  (session.status === "recording" && !session.audioPath) ? (
                  <Info size={18} />
                ) : (
                  <Checks size={18} />
                )}{" "}
                {retrying
                  ? session.status === "enrichment_failed"
                    ? "Retrying local enrichment"
                    : "Retrying transcription"
                  : statusCopy[0]}
              </span>
              <span>{statusCopy[1]}</span>
              {["transcription_failed", "enrichment_failed", "awaiting_transcription"].includes(
                session.status,
              ) &&
              session.audioPath &&
              transcriptionProvider !== "none" ? (
                <button onClick={retry} disabled={retrying}>
                  {retrying
                    ? "Retrying…"
                    : session.status === "enrichment_failed"
                      ? "Retry enrichment"
                      : "Retry transcription"}
                </button>
              ) : (
                <button onClick={() => setDetailsTab("sources")}>
                  Show files
                </button>
              )}
            </div>
            {actionError ? (
              <div className="capture-action-error" role="alert">
                <Info />{" "}
                <span>
                  <strong>That action failed.</strong>
                  {actionError}
                </span>
              </div>
            ) : null}
            <div className="session-content">
              <section className="transcript-pane">
                <div className="section-heading">
                  <h2>
                    Transcript <span>• Canonical</span>
                  </h2>
                  <div className="transcript-heading-actions">
                    <small>
                      {session.transcriptionProvider
                        ? `${session.transcriptionProvider} · wording preserved`
                        : "Waiting for transcription"}
                    </small>
                    {visibleTranscript && !editingTranscript ? (
                      <>
                        <button
                          className="secondary-button compact-action"
                          onClick={() => {
                            setCleanupAttribution("");
                            setEditingTranscript(true);
                          }}
                        >
                          <NotePencil size={15} /> Edit transcript
                        </button>
                        <button
                          className="secondary-button compact-action"
                          onClick={cleanUpTranscript}
                          disabled={cleaningTranscript}
                        >
                          {cleaningTranscript ? (
                            <CircleNotch className="spin" size={15} />
                          ) : (
                            <Sparkle size={15} />
                          )}{" "}
                          {cleaningTranscript ? "Cleaning…" : "AI clean up"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="transcript-copy">
                  {editingTranscript ? (
                    <div className="transcript-editor">
                      <textarea
                        value={transcriptDraft}
                        onChange={(event) => setTranscriptDraft(event.target.value)}
                        disabled={savingTranscript}
                        aria-label="Canonical transcript"
                      />
                      <p>
                        {cleanupAttribution
                          ? `AI draft from ${cleanupAttribution}. Review every change before saving. `
                          : ""}
                        Saving wording updates the canonical transcript only.
                        Re-organizing also replaces pending derived proposals.
                      </p>
                      <div>
                        <button
                          className="primary-button"
                          onClick={() => saveTranscript(false)}
                          disabled={savingTranscript || !transcriptDraft.trim()}
                        >
                          {savingTranscript ? "Saving…" : "Save wording"}
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => saveTranscript(true)}
                          disabled={savingTranscript || !transcriptDraft.trim()}
                        >
                          Save & re-organize
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setTranscriptDraft(visibleTranscript);
                            setEditingTranscript(false);
                            setCleanupAttribution("");
                          }}
                          disabled={savingTranscript}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : visibleTranscript ? (
                    <article className="transcript-row">
                      <p>{visibleTranscript}</p>
                    </article>
                  ) : (
                    <div className="transcript-placeholder">
                      <Waveform />
                      <div>
                        <strong>
                          {session.status === "transcription_failed"
                            ? "The transcript could not be created."
                            : "No transcript yet."}
                        </strong>
                        <p>
                          {session.status === "transcription_failed"
                            ? "Your original audio remains saved. Retry after resolving the error above."
                            : `The transcript will appear here after ${providerLabel === "Record only" ? "you choose a transcription provider" : `${providerLabel} finishes`}.`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
              <aside className="extraction-pane">
                <div
                  className="detail-tabs"
                  role="tablist"
                  aria-label="Session details"
                >
                  <button
                    role="tab"
                    aria-selected={detailsTab === "extracted"}
                    className={detailsTab === "extracted" ? "active" : ""}
                    onClick={() => setDetailsTab("extracted")}
                  >
                    Organized
                  </button>
                  <button
                    role="tab"
                    aria-selected={detailsTab === "sources"}
                    className={detailsTab === "sources" ? "active" : ""}
                    onClick={() => setDetailsTab("sources")}
                  >
                    Files
                  </button>
                </div>
                {detailsTab === "extracted" ? (
                  <>
                    <h3>Summary</h3>
                    <p className="detail-placeholder">
                      {session.summary ||
                        "A local summary will appear after transcription."}
                    </p>
                    <div className="detail-section">
                      <h3>Tags</h3>
                      {visibleTags.length ? (
                        <div className="tag-cloud">
                          {visibleTags.map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="detail-placeholder">
                          Tags are extracted locally from the transcript and
                          guided by tags already in your brain.
                        </p>
                      )}
                    </div>
                    <div className="detail-section">
                      <h3>Atomic-note proposals</h3>
                      {visibleAtomicNotes.length ? (
                        <ul className="atomic-list">
                          {visibleAtomicNotes.map((note) => (
                            <li key={note.id}>
                              <strong>{note.title}</strong>
                              <small>“{note.quote}”</small>
                              <span>
                                {note.sourceRelativePath} · waiting in Review
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="detail-placeholder">
                          Atomic-note proposals will appear here after
                          transcription, with their exact supporting quote and
                          source file.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="source-detail">
                    <FileText size={24} />
                    <h3>Session files</h3>
                    <dl>
                      <div>
                        <dt>Transcript</dt>
                        <dd>{session.relativeFolder}/transcript.md</dd>
                      </div>
                      <div>
                        <dt>Original audio</dt>
                        <dd>
                          {session.audioPath?.split("/").pop() ||
                            "No audio file saved"}
                        </dd>
                      </div>
                    </dl>
                    {session.audioPath ? (
                      <div className="capture-audio-player">
                        {audioUrl ? (
                          <audio controls preload="metadata" src={audioUrl}>
                            Your runtime cannot play this saved recording.
                          </audio>
                        ) : (
                          <p>{audioStatus}</p>
                        )}
                      </div>
                    ) : null}
                    <div className="source-actions">
                      <button
                        className="secondary-button"
                        onClick={() => runFileAction(openCaptureTranscript)}
                      >
                        <FileText /> Open transcript
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => runFileAction(revealCaptureSession)}
                      >
                        <Folder /> Open folder
                      </button>
                      {session.audioPath ? (
                        <button
                          className="secondary-button"
                          onClick={() => runFileAction(revealCaptureAudio)}
                        >
                          <Waveform /> Show audio in Finder
                        </button>
                      ) : null}
                    </div>
                    <small>
                      All files are ordinary local files that remain readable
                      outside Burrowise.
                    </small>
                  </div>
                )}
              </aside>
            </div>
          </>
        ) : (
          <section className="capture-empty">
            <Waveform size={30} />
            <h2>Your first session will appear here</h2>
            <p>
              Recording works before a transcription model is configured. The
              app creates the session folder first, then saves the original
              audio.
            </p>
          </section>
        )}
      </div>
      <footer className="save-state">
        <Checks size={17} /> Saved locally{" "}
        {session ? (
          <>
            <span>•</span>{" "}
            {new Date(
              session.updatedAt || session.createdAt,
            ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </>
        ) : null}
      </footer>
    </main>
  );
}

function HighlightedQuote({ text, query }: { text: string; query: string }) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 1);
  if (!terms.length) return text;
  const escaped = terms.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(pattern)
    .map((part, index) =>
      terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
        <mark key={`${part}-${index}`}>{part}</mark>
      ) : (
        part
      ),
    );
}

type KnowledgeFilter = "all" | "notes" | "captures" | "files" | "images";

function initialKnowledgeFilter(): KnowledgeFilter {
  const legacyRoute = window.location.hash.replace("#/", "").split("?")[0];
  const queryString = window.location.hash.split("?")[1] || "";
  const requested = new URLSearchParams(queryString).get("type");
  if (requested && ["notes", "captures", "files", "images"].includes(requested))
    return requested as KnowledgeFilter;
  return legacyRoute === "notes" ? "notes" : "all";
}

interface KnowledgeBrowseItem {
  id: string;
  title: string;
  excerpt: string;
  kind: Exclude<KnowledgeFilter, "all">;
  relativePath: string;
  updatedAt: string;
  note?: NoteDocument;
  libraryItem?: LibraryItem;
}

function KnowledgePage({
  focusRequest,
  retrievalSettings,
}: {
  focusRequest: FocusRequest | null;
  retrievalSettings: RetrievalSettings;
}) {
  const [notes, setNotes] = useState<NoteDocument[]>([]);
  const [overview, setOverview] = useState<LibraryOverview | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<KnowledgeFilter>(initialKnowledgeFilter);
  const [mode, setMode] = useState("hybrid");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeResult, setActiveResult] = useState(-1);
  const [status, setStatus] = useState("Loading local knowledge…");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<SearchResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "", tags: "" });
  const [saving, setSaving] = useState(false);
  const [fileAction, setFileAction] = useState("");
  const [confirmingTrash, setConfirmingTrash] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState("");
  const [rebuilding, setRebuilding] = useState(false);
  const [sourceView, setSourceView] = useState<SourceView | null>(null);
  const [librarySelection, setLibrarySelection] =
    useState<LibrarySelection | null>(null);
  const focusedKnowledgeToken = useRef<number | null>(null);

  const selectedNote =
    notes.find((note) => note.relativePath === selectedPath) || null;

  const reload = async (preferredPath?: string | null) => {
    setStatus("Refreshing local knowledge…");
    try {
      const [nextOverview, nextNotes] = await Promise.all([
        getLibraryOverview(),
        listNotes(),
      ]);
      setOverview(nextOverview);
      setNotes(nextNotes);
      const requested = preferredPath ?? selectedPath;
      setSelectedPath(
        requested && nextNotes.some((note) => note.relativePath === requested)
          ? requested
          : nextNotes[0]?.relativePath || null,
      );
      setStatus("");
      return { overview: nextOverview, notes: nextNotes };
    } catch (error) {
      setStatus(errorMessage(error));
      return null;
    }
  };

  useEffect(() => {
    reload(focusRequest?.relativePath);
  }, [focusRequest?.token]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setActiveResult(-1);
      setSelectedMatch(null);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setStatus("Searching local passages…");
      try {
        const scope =
          filter === "notes"
            ? "notes"
            : filter === "captures"
              ? "sessions"
              : filter === "all"
                ? "all"
                : "sources";
        let matches = await searchBrain({
          query,
          mode,
          scope,
          selectedPaths: [],
          limit: retrievalSettings.searchResultLimit,
        });
        if (filter === "images" || filter === "files") {
          const allowed = new Set(
            (overview?.items || [])
              .filter((item) =>
                filter === "images" ? item.kind === "image" : item.kind === "file",
              )
              .map((item) => item.relativePath),
          );
          matches = matches.filter((result) => allowed.has(result.relativePath));
        }
        if (!cancelled) {
          setResults(matches);
          setActiveResult(matches.length ? 0 : -1);
          setStatus(
            `${matches.length} passage${matches.length === 1 ? "" : "s"} found locally`,
          );
        }
      } catch (error) {
        if (!cancelled) setStatus(errorMessage(error));
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, mode, filter, overview, retrievalSettings.searchResultLimit]);

  const browseItems = useMemo<KnowledgeBrowseItem[]>(() => {
    const noteItems = notes.map((note) => ({
      id: `note:${note.relativePath}`,
      title: note.title,
      excerpt: note.excerpt || "Readable Markdown note",
      kind: "notes" as const,
      relativePath: note.relativePath,
      updatedAt: note.updatedAt,
      note,
    }));
    const libraryItems = (overview?.items || []).map((item) => ({
      id: item.id,
      title: item.title,
      excerpt: item.detail,
      kind: (item.kind === "capture"
        ? "captures"
        : item.kind === "image"
          ? "images"
          : "files") as KnowledgeBrowseItem["kind"],
      relativePath: item.relativePath,
      updatedAt: item.updatedAt,
      libraryItem: item,
    }));
    return [...noteItems, ...libraryItems]
      .filter((item) => filter === "all" || item.kind === filter)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [notes, overview, filter]);

  const beginNew = () => {
    setSelectedPath(null);
    setSelectedMatch(null);
    setDraft({ title: "", body: "", tags: "" });
    setEditingPath(null);
    setEditing(true);
    setFilter("notes");
    setStatus("Creating a readable Markdown note.");
  };
  const beginEdit = () => {
    if (!selectedNote) return;
    setDraft({
      title: selectedNote.title,
      body: selectedNote.body,
      tags: selectedNote.tags.join(", "),
    });
    setEditingPath(selectedNote.relativePath);
    setEditing(true);
  };
  const persist = async () => {
    if (saving) return;
    setSaving(true);
    setStatus("Saving Markdown and rebuilding local search…");
    try {
      const saved = await saveNote({
        relativePath: editingPath,
        title: draft.title,
        body: draft.body,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      await reload(saved.relativePath);
      setEditing(false);
      setEditingPath(null);
      setSelectedMatch(null);
      setStatus("Note saved locally and indexed.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!selectedNote || deleting) return;
    setDeleting(true);
    setStatus("Moving note to Trash…");
    try {
      await trashNote(selectedNote.relativePath);
      setEditing(false);
      setEditingPath(null);
      setConfirmingTrash(false);
      setSelectedMatch(null);
      await reload(null);
      setStatus("Note moved to macOS Trash.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };
  const runFileAction = async (kind: "open" | "reveal") => {
    if (!selectedNote || fileAction) return;
    setFileAction(kind);
    try {
      await (kind === "open"
        ? openNoteExternal(selectedNote.relativePath)
        : revealSourceInFinder(selectedNote.relativePath));
      setStatus(kind === "open" ? "Note opened externally." : "Note revealed in Finder.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setFileAction("");
    }
  };
  const openLinkedSource = async (source: NoteSource) => {
    try {
      const document = await getSourceDocument(source.relativePath);
      setSourceView({
        result: {
          sourceType: "source",
          title: document.title,
          relativePath: source.relativePath,
          quote: source.quote,
        },
        source: document,
      });
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const inspectLibrary = async (item: LibraryItem) => {
    setStatus("Opening local source…");
    try {
      if (item.imageId) {
        const memory = await getImageMemory(item.imageId);
        const source =
          memory.status === "ready"
            ? await getSourceDocument(memory.relativeSourcePath)
            : null;
        setLibrarySelection({ item, memory, source });
      } else {
        setLibrarySelection({
          item,
          memory: null,
          source: await getSourceDocument(item.relativePath),
        });
      }
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  useEffect(() => {
    if (
      !focusRequest?.token ||
      focusedKnowledgeToken.current === focusRequest.token ||
      !overview
    ) return;
    if (focusRequest.kind === "image") {
      const item = overview.items.find(
        (candidate) =>
          candidate.imageId === focusRequest.recordId ||
          candidate.relativePath === focusRequest.relativePath ||
          Boolean(
            focusRequest.relativePath &&
              candidate.relativePath.startsWith(`${focusRequest.relativePath}/`),
          ),
      );
      if (item) {
        focusedKnowledgeToken.current = focusRequest.token;
        inspectLibrary(item);
      }
    }
  }, [focusRequest?.token, overview]);
  const inspectSearchResult = async (result: SearchResult) => {
    const note = notes.find((item) => item.relativePath === result.relativePath);
    if (note) {
      setSelectedPath(note.relativePath);
      setSelectedMatch(result);
      setEditing(false);
      return;
    }
    try {
      const source = await getSourceDocument(result.relativePath);
      setSourceView({ result, source });
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const addSources = async () => {
    setImporting("text");
    try {
      const paths = await chooseSourceFiles();
      if (!paths.length) {
        setStatus("Import cancelled. Nothing changed.");
        return;
      }
      await importSourceFiles(paths);
      await reload();
      setFilter("files");
      setStatus(`${paths.length} text source${paths.length === 1 ? "" : "s"} imported and indexed locally.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setImporting("");
    }
  };
  const imageRoute = async (count: number) => {
    const catalog = await getGenerationProviderCatalog(false);
    const selection = catalog.preferredModels?.vision;
    if (!selection) return { selection: null, provider: null, approved: false };
    const provider = catalog.providers.find((item) => item.id === selection.providerId) || null;
    if (!provider) throw new Error("The selected image-review provider is no longer configured.");
    if (!provider.capabilities?.includes("image-understanding"))
      throw new Error(`${provider.label} cannot receive image input. Choose an image-capable provider under Settings → Models → Image sources.`);
    const approved = provider.locality !== "cloud" || window.confirm(
      `Send ${count} image${count === 1 ? "" : "s"} to ${provider.label} · ${selection.modelId} for review?\n\nThe original image content will leave this Mac through that provider. No other brain files are included.`,
    );
    return { selection, provider, approved };
  };
  const addImages = async () => {
    setImporting("images");
    try {
      const paths = await chooseImageFiles();
      if (!paths.length) {
        setStatus("Image import cancelled. Nothing changed.");
        return;
      }
      const route = await imageRoute(paths.length);
      const memories = await importImageFiles(paths);
      setFilter("images");
      await reload();
      if (!route.selection || !route.approved) {
        setStatus(`${memories.length} original image${memories.length === 1 ? "" : "s"} stored locally. AI review was not started.`);
        return;
      }
      let completed = 0;
      for (const memory of memories) {
        const processed = await processImageMemory(memory.id);
        if (processed.status === "ready") completed += 1;
      }
      await reload();
      setStatus(`${completed} of ${memories.length} image source${memories.length === 1 ? "" : "s"} converted to searchable Markdown.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setImporting("");
    }
  };
  const reviewImage = async (memory: ImageMemory) => {
    const route = await imageRoute(1);
    if (!route.selection)
      throw new Error("Choose an image-review model under Settings → Models → Image sources, then retry.");
    if (!route.approved) return null;
    const processed = await processImageMemory(memory.id);
    const refreshed = await reload();
    const item = refreshed?.overview.items.find((candidate) => candidate.imageId === memory.id);
    if (item) {
      const source = processed.status === "ready"
        ? await getSourceDocument(processed.relativeSourcePath)
        : null;
      setLibrarySelection({ item, memory: processed, source });
    }
    return processed;
  };
  const rebuild = async () => {
    if (rebuilding) return;
    setRebuilding(true);
    try {
      const stats = await rebuildSearchIndex();
      setStatus(`${stats.filesIndexed} files and ${stats.passagesIndexed} passages indexed locally.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setRebuilding(false);
    }
  };

  const filters: Array<[KnowledgeFilter, string]> = [
    ["all", "All"],
    ["notes", "Notes"],
    ["captures", "Captures"],
    ["files", "Text"],
    ["images", "Images"],
  ];

  return (
    <main className="knowledge-workspace">
      <aside className="knowledge-rail">
        <div className="workspace-rail-header knowledge-rail-header">
          <div><small>Your local brain</small><h1>Knowledge</h1></div>
          <button className="icon-button" onClick={beginNew} aria-label="New note"><Plus /></button>
        </div>
        <label className="rail-search knowledge-search">
          <MagnifyingGlass />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
              if (event.key === "ArrowDown" && results.length) {
                event.preventDefault();
                setActiveResult((current) => Math.min(results.length - 1, Math.max(0, current + 1)));
              }
              if (event.key === "ArrowUp" && results.length) {
                event.preventDefault();
                setActiveResult((current) => Math.max(0, current - 1));
              }
              if (event.key === "Enter" && results.length) {
                event.preventDefault();
                inspectSearchResult(results[Math.max(0, activeResult)]);
              }
            }}
            autoFocus
            placeholder="Search everything…"
            aria-activedescendant={activeResult >= 0 ? `knowledge-result-${results[activeResult]?.passageId}` : undefined}
          />
          {query ? <button onClick={() => setQuery("")} aria-label="Clear search"><X /></button> : null}
        </label>
        <div className="knowledge-filter-row" aria-label="Knowledge type">
          {filters.map(([id, label]) => (
            <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        {query ? (
          <details className="knowledge-search-options">
            <summary><SlidersHorizontal /> Search options</summary>
            <div className="search-modes">
              {[["hybrid", "Balanced"], ["lexical", "Exact"], ["semantic", "Semantic"], ["related", "Related"]].map(([id, label]) => (
                <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}>{label}</button>
              ))}
            </div>
          </details>
        ) : null}
        <div className="knowledge-list" aria-live="polite">
          {query.trim() ? results.map((result) => (
            <button id={`knowledge-result-${result.passageId}`} key={result.passageId} className={activeResult === results.indexOf(result) ? "keyboard-active" : ""} onMouseEnter={() => setActiveResult(results.indexOf(result))} onClick={() => inspectSearchResult(result)}>
              <span className={`knowledge-kind ${result.sourceType}`}>{result.sourceType}</span>
              <strong>{result.title}</strong>
              <q><HighlightedQuote text={result.quote} query={query} /></q>
              <small>{result.relativePath}</small>
            </button>
          )) : browseItems.map((item) => (
            <button
              key={item.id}
              className={item.note && selectedNote?.relativePath === item.relativePath && !editing ? "selected" : ""}
              onClick={() => {
                if (item.note) {
                  setSelectedPath(item.note.relativePath);
                  setSelectedMatch(null);
                  setEditing(false);
                } else if (item.libraryItem) inspectLibrary(item.libraryItem);
              }}
            >
              <span className={`knowledge-kind ${item.kind}`}>{item.kind === "files" ? "text source" : item.kind.slice(0, -1)}</span>
              <strong>{item.title}</strong>
              <p>{item.excerpt}</p>
              <small>{relativeTime(item.updatedAt)} · {item.relativePath}</small>
            </button>
          ))}
          {!query.trim() && browseItems.length === 0 ? (
            <div className="knowledge-list-empty"><Archive /><strong>Nothing in this view</strong><span>Choose another type or add knowledge.</span></div>
          ) : null}
          {query.trim() && !results.length && !status.startsWith("Searching") ? (
            <div className="knowledge-list-empty"><MagnifyingGlass /><strong>No matching passages</strong><span>Try another type or search mode.</span></div>
          ) : null}
        </div>
      </aside>
      <section className="knowledge-detail">
        <header className="knowledge-toolbar">
          <p role="status">{status || (query ? `${results.length} results` : `${browseItems.length} items`)}</p>
          <div>
            <button className="secondary-button" onClick={addSources} disabled={Boolean(importing) || editing}><FileText /> {importing === "text" ? "Adding…" : "Add text"}</button>
            <button className="secondary-button" onClick={addImages} disabled={Boolean(importing) || editing}><Camera /> {importing === "images" ? "Adding…" : "Add images"}</button>
            <button className="primary-button" onClick={beginNew} disabled={editing}><Plus /> New note</button>
          </div>
        </header>
        {editing ? (
          <div className="knowledge-note-detail">
            <PageHeader eyebrow={editingPath ? "Edit canonical Markdown note" : "New canonical Markdown note"} title={editingPath ? "Edit note" : "Create note"} action={
              <div className="note-edit-actions"><button className="secondary-button" onClick={() => { setEditing(false); setEditingPath(null); if (!selectedPath) setSelectedPath(notes[0]?.relativePath || null); }}>Cancel</button><button className="primary-button" onClick={persist} disabled={saving || !draft.title.trim() || !draft.body.trim()}><Check /> {saving ? "Saving…" : "Save note"}</button></div>
            } />
            <div className="note-editor">
              <label><span>Title</span><input autoFocus maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label><span>Tags <small>comma-separated</small></span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="capture, local-first" /></label>
              <label><span>Markdown body</span><textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Write the idea in your own words…" /></label>
            </div>
          </div>
        ) : selectedNote ? (
          <div className="knowledge-note-detail">
            <PageHeader eyebrow={`Note · ${selectedNote.sources.length} source${selectedNote.sources.length === 1 ? "" : "s"}`} title={selectedNote.title} action={
              <div className="note-edit-actions">
                <button className="secondary-button" onClick={() => runFileAction("open")} disabled={Boolean(fileAction)}><FileText /> Open</button>
                <button className="secondary-button" onClick={() => runFileAction("reveal")} disabled={Boolean(fileAction)}><Folder /> Reveal</button>
                <button className="secondary-button" onClick={beginEdit}><NotePencil /> Edit</button>
                <button className="danger-button" onClick={() => setConfirmingTrash(true)}><Trash /> Trash</button>
              </div>
            } />
            {selectedMatch ? <blockquote className="knowledge-match"><small>Matching passage</small><HighlightedQuote text={selectedMatch.quote} query={query} /></blockquote> : null}
            <div className="markdown-note"><pre>{selectedNote.body}</pre>{selectedNote.sources.length ? <section className="note-sources"><h2>Sources</h2>{selectedNote.sources.map((source) => <button key={`${source.relativePath}-${source.quote}`} onClick={() => openLinkedSource(source)}><Link /><span><strong>{source.relativePath}</strong><q>{source.quote || "Open source"}</q></span><ArrowRight /></button>)}</section> : <div className="note-unlinked"><Info /><span>This note has no linked sources yet.</span></div>}</div>
          </div>
        ) : (
          <div className="knowledge-welcome">
            <BookOpen size={34} />
            <h2>Everything you know, in one place</h2>
            <p>Browse notes and original sources together, or search across every local passage.</p>
            <div><button className="primary-button" onClick={beginNew}><Plus /> New note</button><button className="secondary-button" onClick={addSources}><FileText /> Add text</button></div>
            <button className="knowledge-rebuild" onClick={rebuild} disabled={rebuilding}><Database /> {rebuilding ? "Rebuilding local index…" : "Rebuild search index"}</button>
          </div>
        )}
      </section>
      {sourceView ? <SourceInspector result={sourceView.result} source={sourceView.source} query={query} onClose={() => setSourceView(null)} /> : null}
      {librarySelection ? <LibraryInspector item={librarySelection.item} memory={librarySelection.memory} source={librarySelection.source} onReview={reviewImage} onClose={() => setLibrarySelection(null)} /> : null}
      {confirmingTrash && selectedNote ? <NoteTrashConfirm note={selectedNote} deleting={deleting} onCancel={() => setConfirmingTrash(false)} onConfirm={remove} /> : null}
    </main>
  );
}

function SearchPage({ retrievalSettings }: { retrievalSettings: RetrievalSettings }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [mode, setMode] = useState("hybrid");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState(
    "Enter a phrase to search your local brain.",
  );
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [source, setSource] = useState<SourceDocument | null>(null);
  const [indexStats, setIndexStats] = useState<IndexStats | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setStatus("Enter a phrase to search your local brain.");
      setSelected(null);
      setSource(null);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setStatus("Searching local passages...");
      try {
        const matches = await searchBrain({
          query,
          mode,
          scope,
          selectedPaths: [],
          limit: retrievalSettings.searchResultLimit,
        });
        if (!cancelled) {
          setResults(matches);
          setActiveResult(matches.length ? 0 : -1);
          setStatus(
            `${matches.length} passage${matches.length === 1 ? "" : "s"} found locally`,
          );
        }
      } catch (error) {
        if (!cancelled) setStatus(errorMessage(error));
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, mode, scope]);

  const rebuild = async () => {
    if (rebuilding) return;
    setRebuilding(true);
    setStatus("Rebuilding the local passage index...");
    try {
      const stats = await rebuildSearchIndex();
      setIndexStats(stats);
      if (query.trim()) {
        const matches = await searchBrain({
          query,
          mode,
          scope,
          selectedPaths: [],
          limit: retrievalSettings.searchResultLimit,
        });
        setResults(matches);
        setActiveResult(matches.length ? 0 : -1);
        setStatus(
          `${matches.length} passage${matches.length === 1 ? "" : "s"} found · ${stats.passagesIndexed} passage${stats.passagesIndexed === 1 ? "" : "s"} indexed`,
        );
      } else {
        setStatus(
          `${stats.filesIndexed} file${stats.filesIndexed === 1 ? "" : "s"} and ${stats.passagesIndexed} passage${stats.passagesIndexed === 1 ? "" : "s"} indexed locally.`,
        );
      }
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setRebuilding(false);
    }
  };
  const inspect = async (result: SearchResult) => {
    setStatus("Opening the local source…");
    try {
      setSelected(result);
      setSource(await getSourceDocument(result.relativePath));
      setStatus(
        `${results.length} passage${results.length === 1 ? "" : "s"} found locally`,
      );
    } catch (error) {
      setSelected(null);
      setSource(null);
      setStatus(errorMessage(error));
    }
  };
  const filters = [
    ["all", "All"],
    ["sessions", "Sessions"],
    ["notes", "Notes"],
    ["sources", "Sources"],
  ];
  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActiveResult((current) =>
        Math.min(results.length - 1, Math.max(0, current + 1)),
      );
    }
    if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActiveResult((current) => Math.max(0, current - 1));
    }
    if (event.key === "Enter" && results.length) {
      event.preventDefault();
      const result = results[Math.max(0, activeResult)];
      if (result) inspect(result);
    }
    if (event.key === "Escape") {
      setQuery("");
      setResults([]);
      setActiveResult(-1);
    }
  };
  return (
    <main className="feature-page search-page">
      <PageHeader
        eyebrow="Local passage retrieval"
        title="Search"
        action={
          <button
            className="secondary-button"
            onClick={rebuild}
            disabled={rebuilding}
          >
            <Database /> {rebuilding ? "Rebuilding…" : "Rebuild index"}
          </button>
        }
      />
      <label className="hero-search">
        <MagnifyingGlass size={22} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
          autoFocus
          placeholder="Search the whole brain..."
          aria-activedescendant={
            activeResult >= 0
              ? `search-result-${results[activeResult]?.passageId}`
              : undefined
          }
        />
      </label>
      <div className="search-controls">
        <div className="filter-row">
          {filters.map(([id, label]) => (
            <button
              className={scope === id ? "active" : ""}
              key={id}
              onClick={() => setScope(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="search-modes" aria-label="Search mode">
          {[
            ["hybrid", "Balanced"],
            ["lexical", "Exact words"],
            ["semantic", "Semantic"],
            ["related", "Related terms"],
          ].map(([id, label]) => (
            <button
              className={mode === id ? "active" : ""}
              key={id}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <section className="result-list">
        <div className="result-status">
          <p className="result-count">{status}</p>
          <span>
            <ShieldCheck /> Rebuildable local term index
            {indexStats
              ? ` · ${new Date(indexStats.indexedAt).toLocaleTimeString()}`
              : ""}
          </span>
        </div>
        {results.map((result, index) => (
          <button
            id={`search-result-${result.passageId}`}
            className={`result-row ${activeResult === index ? "keyboard-active" : ""}`}
            key={result.passageId}
            onMouseEnter={() => setActiveResult(index)}
            onClick={() => inspect(result)}
          >
            <FileText size={22} />
            <span>
              <strong>{result.title}</strong>
              <q>
                <HighlightedQuote text={result.quote} query={query} />
              </q>
              <small>
                {result.relativePath} · ranked by{" "}
                {mode === "lexical"
                  ? "exact words"
                  : mode === "related"
                    ? "related terms"
                    : "balanced matching"}
              </small>
            </span>
            <ArrowRight size={18} />
          </button>
        ))}
        {!query.trim() ? (
          <div className="empty-state">
            <MagnifyingGlass size={30} />
            <h2>Search your own words and ideas</h2>
            <p>
              Balanced combines exact matches, Apple’s on-device sentence
              embeddings, and transparent related-term expansion. Semantic
              uses the rebuildable macOS model index only.
            </p>
          </div>
        ) : results.length === 0 && !status.startsWith("Searching") ? (
          <div className="empty-state">
            <MagnifyingGlass size={30} />
            <h2>Nothing in this scope</h2>
            <p>
              Try Balanced search, broaden the scope, or rebuild the index after
              adding files.
            </p>
          </div>
        ) : null}
      </section>
      {selected && source ? (
        <SourceInspector
          result={selected}
          source={source}
          query={query}
          onClose={() => {
            setSelected(null);
            setSource(null);
          }}
        />
      ) : null}
    </main>
  );
}

interface SourceInspectorProps {
  result: InspectorResult;
  source: SourceDocument;
  query: string;
  onClose: () => void;
}

function SourceInspector({ result, source, query, onClose }: SourceInspectorProps) {
  const [actionStatus, setActionStatus] = useState("");
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !revealing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, revealing]);
  const reveal = async () => {
    setRevealing(true);
    setActionStatus("Opening Finder…");
    try {
      await revealSourceInFinder(source.relativePath);
      setActionStatus("Source revealed in Finder.");
    } catch (error) {
      setActionStatus(errorMessage(error));
    } finally {
      setRevealing(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !revealing) onClose();
      }}
    >
      <section
        className="source-inspector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-inspector-title"
      >
        <header>
          <div>
            <small>
              {result.sourceType}
              {result.score != null
                ? ` · ${Math.round(result.score * 100)} relevance`
                : ""}
            </small>
            <h2 id="source-inspector-title">{source.title}</h2>
            <p>{source.relativePath}</p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={revealing}
            aria-label="Close source"
          >
            <X />
          </button>
        </header>
        <div className="source-support">
          <h3>Supporting passage</h3>
          <blockquote>
            <HighlightedQuote text={result.quote} query={query} />
          </blockquote>
          {result.lexicalScore != null && result.semanticScore != null ? (
            <div>
              <span>Exact {Math.round(result.lexicalScore * 100)}</span>
              <span>
                {result.matchType === "related" ? "Related-term" : "Semantic"}{" "}
                {Math.round(result.semanticScore * 100)}
              </span>
            </div>
          ) : null}
        </div>
        <div className="source-markdown">
          <h3>Source document</h3>
          <pre>{source.markdown}</pre>
        </div>
        <footer>
          <span role="status">
            <ShieldCheck /> {actionStatus || "Read from your local brain"}
          </span>
          <button
            className="secondary-button"
            onClick={reveal}
            disabled={revealing}
          >
            <Folder /> {revealing ? "Opening…" : "Reveal in Finder"}
          </button>
          <button
            className="primary-button"
            onClick={onClose}
            disabled={revealing}
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

function LibraryPage() {
  const [type, setType] = useState("All sources");
  const [overview, setOverview] = useState<LibraryOverview | null>(null);
  const [status, setStatus] = useState("Loading local sources…");
  const [importing, setImporting] = useState("");
  const [selected, setSelected] = useState<LibrarySelection | null>(null);
  const reload = async (message = ""): Promise<LibraryOverview | null> => {
    setStatus(message || "Refreshing local sources…");
    try {
      const next = await getLibraryOverview();
      setOverview(next);
      setStatus(message ? "Library refreshed from the brain folder." : "");
      return next;
    } catch (error) {
      setStatus(errorMessage(error));
      return null;
    }
  };
  useEffect(() => {
    let cancelled = false;
    getLibraryOverview()
      .then((next) => {
        if (!cancelled) {
          setOverview(next);
          setStatus("");
        }
      })
      .catch((error) => {
        if (!cancelled) setStatus(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const onSharedImport = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      void reload(message || "A video shared from macOS was added to your memory.");
    };
    window.addEventListener("second-brain:shared-import", onSharedImport);
    return () =>
      window.removeEventListener("second-brain:shared-import", onSharedImport);
  }, []);
  const addSources = async () => {
    setImporting("text");
    setStatus("Choose Markdown or plain-text files to copy into your brain…");
    try {
      const paths = await chooseSourceFiles();
      if (!paths.length) {
        setStatus("Import cancelled. Nothing changed.");
        return;
      }
      const next = await importSourceFiles(paths);
      setOverview(next);
      setStatus(
        `${paths.length} source file${paths.length === 1 ? "" : "s"} imported and indexed locally.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setImporting("");
    }
  };
  const imageRoute = async (count: number): Promise<
    | { catalog: ProviderCatalog; selection: null; provider: null; approved: false }
    | { catalog: ProviderCatalog; selection: ModelSelection; provider: GenerationProviderState; approved: boolean }
  > => {
    const catalog = await getGenerationProviderCatalog(false);
    const selection = catalog.preferredModels?.vision;
    if (!selection)
      return { catalog, selection: null, provider: null, approved: false };
    const provider =
      catalog.providers.find((item) => item.id === selection.providerId) ||
      null;
    if (!provider)
      throw new Error(
        "The selected image-review provider is no longer configured.",
      );
    if (!provider.capabilities?.includes("image-understanding"))
      throw new Error(
        `${provider.label} cannot receive image input. Choose an image-capable provider under Settings → Models → Image sources.`,
      );
    if (provider.locality !== "cloud")
      return { catalog, selection, provider, approved: true };
    const approved = window.confirm(
      `Send ${count} image${count === 1 ? "" : "s"} to ${provider.label} · ${selection.modelId} for review?\n\nThe original image content will leave this Mac through that provider. The local originals stay in your brain folder, and no other brain files are included.`,
    );
    return { catalog, selection, provider, approved };
  };
  const addImages = async () => {
    setImporting("images");
    setStatus("Choose photos, scans, screenshots, or whiteboard images…");
    try {
      const paths = await chooseImageFiles();
      if (!paths.length) {
        setStatus("Image import cancelled. Nothing changed.");
        return;
      }
      const route = await imageRoute(paths.length);
      const memories = await importImageFiles(paths);
      await reload();
      if (!route.selection) {
        setStatus(
          `${memories.length} original image${memories.length === 1 ? "" : "s"} stored locally. Choose an image-review model under Settings → Models to turn them into searchable Markdown.`,
        );
        return;
      }
      if (!route.approved) {
        setStatus(
          `${memories.length} original image${memories.length === 1 ? "" : "s"} stored locally. Remote AI review was not started.`,
        );
        return;
      }
      let completed = 0;
      let failed = 0;
      for (const [index, memory] of memories.entries()) {
        setStatus(
          `Reviewing image ${index + 1} of ${memories.length} with ${route.provider.label} · ${route.selection.modelId}…`,
        );
        const processed = await processImageMemory(memory.id);
        if (processed.status === "ready") completed += 1;
        else failed += 1;
      }
      await reload();
      setStatus(
        `${completed} image${completed === 1 ? "" : "s"} converted to searchable Markdown${failed ? `; ${failed} original${failed === 1 ? "" : "s"} remain safe and need attention` : ""}.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setImporting("");
    }
  };
  const addVideos = async () => {
    setImporting("videos");
    setStatus("Choose videos to preserve and transcribe locally…");
    try {
      const paths = await chooseVideoFiles();
      if (!paths.length) {
        setStatus("Video import cancelled. Nothing changed.");
        return;
      }
      const next = await importVideoFiles(paths);
      setOverview(next);
      setStatus(
        `${paths.length} video${paths.length === 1 ? "" : "s"} preserved locally and sent through the selected transcription pipeline.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setImporting("");
    }
  };
  const inspect = async (item: LibraryItem) => {
    setStatus("Opening local source…");
    try {
      if (item.imageId) {
        const memory = await getImageMemory(item.imageId);
        const source =
          memory.status === "ready"
            ? await getSourceDocument(memory.relativeSourcePath)
            : null;
        setSelected({ item, memory, source });
      } else {
        setSelected({
          item,
          memory: null,
          source: await getSourceDocument(item.relativePath),
        });
      }
      setStatus("");
    } catch (error) {
      setSelected(null);
      setStatus(errorMessage(error));
    }
  };
  const reviewImage = async (memory: ImageMemory): Promise<ImageMemory | null> => {
    const route = await imageRoute(1);
    if (!route.selection)
      throw new Error(
        "Choose an image-review model under Settings → Models → Image sources, then retry.",
      );
    if (!route.approved) {
      setStatus(
        "Remote AI review was not started. The original image remains stored locally.",
      );
      return null;
    }
    setStatus(
      `Reviewing “${memory.title}” with ${route.provider.label} · ${route.selection.modelId}…`,
    );
    const processed = await processImageMemory(memory.id);
    const next = await reload();
    const item =
      next?.items.find((candidate) => candidate.imageId === memory.id) ||
      selected?.item;
    if (!item) throw new Error("The refreshed image source could not be found.");
    const source =
      processed.status === "ready"
        ? await getSourceDocument(processed.relativeSourcePath)
        : null;
    setSelected({ item, memory: processed, source });
    setStatus(
      processed.status === "ready"
        ? "Image review saved as searchable Markdown."
        : processed.processingError ||
            "Image review could not finish. The original remains safe.",
    );
    return processed;
  };
  const openBrain = async () => {
    setStatus("Opening the active brain folder…");
    try {
      await revealBrainFolder();
      setStatus("Brain folder opened in Finder.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const visible = (overview?.items || []).filter(
    (item) =>
      type === "All sources" ||
      (type === "Captures" && item.kind === "capture") ||
      (type === "Images" && item.kind === "image") ||
      (type === "Videos" && item.kind === "video") ||
      (type === "Files" && item.kind === "file") ||
      (type === "Audio" && item.hasAudio),
  );
  const stats = overview?.stats;
  return (
    <main className="feature-page library-page">
      <PageHeader
        eyebrow="Readable local source material"
        title="Library"
        action={
          <div className="library-add-actions">
            <button
              className="secondary-button"
              onClick={addSources}
              disabled={Boolean(importing)}
            >
              <FileText size={17} />{" "}
              {importing === "text" ? "Adding text…" : "Add text"}
            </button>
            <button
              className="secondary-button"
              onClick={addImages}
              disabled={Boolean(importing)}
            >
              <Camera size={18} />{" "}
              {importing === "images" ? "Adding images…" : "Add images"}
            </button>
            <button
              className="primary-button"
              onClick={addVideos}
              disabled={Boolean(importing)}
            >
              <VideoCamera size={18} />{" "}
              {importing === "videos" ? "Adding video…" : "Add video"}
            </button>
          </div>
        }
      />
      <p className="page-intro">
        Bring in written files, photos, or videos. Originals stay in your local
        brain. Videos shared from the macOS Share menu are transcribed with your
        selected transcription provider and become searchable Markdown.
      </p>
      <div className="library-summary">
        <div>
          <Waveform size={22} />
          <strong>{stats ? stats.captureCount : "—"}</strong>
          <span>Voice captures</span>
        </div>
        <div>
          <File size={22} />
          <strong>{stats ? stats.fileCount : "—"}</strong>
          <span>Text sources</span>
        </div>
        <div>
          <ImageSquare size={22} />
          <strong>{stats ? stats.imageCount : "—"}</strong>
          <span>Image sources</span>
        </div>
        <div>
          <VideoCamera size={22} />
          <strong>{stats ? stats.videoCount : "—"}</strong>
          <span>Video sources</span>
        </div>
        <div>
          <HardDrives size={22} />
          <strong>
            {stats
              ? formatBytes(
                  (stats.retainedAudioBytes || 0) +
                    (stats.retainedImageBytes || 0),
                )
              : "—"}
          </strong>
          <span>Original media</span>
        </div>
      </div>
      <div className="filter-row library-filters">
        {["All sources", "Captures", "Images", "Videos", "Files", "Audio"].map((item) => (
          <button
            className={type === item ? "active" : ""}
            key={item}
            onClick={() => setType(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {status ? (
        <p className="library-status" role="status">
          {status}
        </p>
      ) : null}
      <section className="table-section">
        <div className="table-title">
          <h2>Recently updated</h2>
          <div>
            <button onClick={() => reload("Refreshing local sources…")}>
              <ArrowClockwise /> Refresh
            </button>
            <button onClick={openBrain}>
              <Folder /> Open brain folder
            </button>
          </div>
        </div>
        {visible.map((item) => (
          <button
            className="file-row"
            key={item.id}
            onClick={() => inspect(item)}
          >
            <span className="file-icon">
              {item.kind === "capture" ? (
                <Waveform />
              ) : item.kind === "image" ? (
                <ImageSquare />
              ) : item.kind === "video" ? (
                <VideoCamera />
              ) : (
                <File />
              )}
            </span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
              <em>{item.relativePath}</em>
            </span>
            <time>{relativeTime(item.updatedAt)}</time>
            <ArrowRight />
          </button>
        ))}
        {overview && visible.length === 0 ? (
          <div className="empty-state">
            <Archive size={30} />
            <h2>No sources in this filter</h2>
            <p>
              {type === "All sources"
                ? "Record a thought, add written files, or photograph a page of notes."
                : "Choose another filter or add a supported source."}
            </p>
          </div>
        ) : null}
      </section>
      {selected ? (
        <LibraryInspector
          item={selected.item}
          memory={selected.memory}
          source={selected.source}
          onReview={reviewImage}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </main>
  );
}

interface LibraryInspectorProps {
  item: LibraryItem;
  memory: ImageMemory | null;
  source: SourceDocument | null;
  onReview: (memory: ImageMemory) => Promise<ImageMemory | null>;
  onClose: () => void;
}

function LibraryInspector({ item, memory, source, onReview, onClose }: LibraryInspectorProps) {
  const [audioUrl, setAudioUrl] = useState("");
  const [audioStatus, setAudioStatus] = useState(
    item.hasAudio ? "Loading saved audio…" : "",
  );
  const [imageUrl, setImageUrl] = useState("");
  const [imageStatus, setImageStatus] = useState(
    item.hasImage ? "Loading original image…" : "",
  );
  const [actionStatus, setActionStatus] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let nextUrl = "";
    if (!item.sessionId || !item.hasAudio) return undefined;
    loadCaptureAudio(item.sessionId)
      .then((blob) => {
        if (cancelled) return;
        nextUrl = URL.createObjectURL(blob);
        setAudioUrl(nextUrl);
        setAudioStatus("");
      })
      .catch((error) => {
        if (!cancelled) setAudioStatus(errorMessage(error));
      });
    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [item.sessionId, item.hasAudio]);
  useEffect(() => {
    let cancelled = false;
    let nextUrl = "";
    if (!item.imageId) return undefined;
    loadImageMemory(item.imageId)
      .then((blob) => {
        if (cancelled) return;
        nextUrl = URL.createObjectURL(blob);
        setImageUrl(nextUrl);
        setImageStatus("");
      })
      .catch((error) => {
        if (!cancelled) setImageStatus(errorMessage(error));
      });
    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [item.imageId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !revealing && !reviewing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, revealing, reviewing]);
  const reveal = async () => {
    setRevealing(true);
    setActionStatus("Opening Finder…");
    try {
      await (item.sessionId
        ? revealCaptureSession(item.sessionId)
        : item.imageId
          ? revealImageMemory(item.imageId)
          : revealSourceInFinder(item.relativePath));
      setActionStatus("Source revealed in Finder.");
    } catch (error) {
      setActionStatus(errorMessage(error));
    } finally {
      setRevealing(false);
    }
  };
  const review = async () => {
    if (!memory || reviewing) return;
    setReviewing(true);
    setActionStatus("Starting image review…");
    try {
      const processed = await onReview(memory);
      setActionStatus(
        processed?.status === "ready"
          ? "Searchable Markdown saved."
          : processed?.processingError || "Review was not started.",
      );
    } catch (error) {
      setActionStatus(errorMessage(error));
    } finally {
      setReviewing(false);
    }
  };
  const imageReady = memory?.status === "ready";
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !revealing && !reviewing)
          onClose();
      }}
    >
      <section
        className={`source-inspector library-inspector ${item.hasImage ? "image-inspector" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-inspector-title"
      >
        <header>
          <div>
            <small>
              {item.kind === "capture"
                ? "Voice capture"
                : item.kind === "image"
                  ? "Image source"
                  : "Imported source"}
            </small>
            <h2 id="library-inspector-title">{item.title}</h2>
            <p>{item.relativePath}</p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={revealing || reviewing}
            aria-label="Close source"
          >
            <X />
          </button>
        </header>
        {item.hasAudio ? (
          <div className="library-audio">
            <h3>Original audio</h3>
            {audioUrl ? (
              <audio controls preload="metadata" src={audioUrl}>
                This runtime cannot play the saved audio.
              </audio>
            ) : (
              <p>{audioStatus}</p>
            )}
          </div>
        ) : null}
        {item.hasImage ? (
          <div className="library-image">
            <div className="library-image-frame">
              {imageUrl ? (
                <img src={imageUrl} alt={`Original for ${item.title}`} />
              ) : (
                <span>
                  <CircleNotch className="spin" /> {imageStatus}
                </span>
              )}
            </div>
            <div
              className={`image-review-state ${memory?.status === "analysis_failed" ? "failed" : ""}`}
            >
              {reviewing || memory?.status === "analyzing" ? (
                <CircleNotch className="spin" />
              ) : imageReady ? (
                <Checks />
              ) : memory?.status === "analysis_failed" ? (
                <Info />
              ) : (
                <ImageSquare />
              )}
              <span>
                <strong>
                  {reviewing || memory?.status === "analyzing"
                    ? "AI review in progress"
                    : imageReady
                      ? "Searchable source ready"
                      : memory?.status === "analysis_failed"
                        ? "AI review needs attention"
                        : "Original stored locally"}
                </strong>
                <small>
                  {imageReady
                    ? `${memory.providerId} · ${memory.modelId} · ${memory.locality}`
                    : memory?.processingError ||
                      "Choose Review image to transcribe visible notes and structure."}
                </small>
              </span>
            </div>
          </div>
        ) : null}
        <div className="source-markdown">
          <h3>{item.hasImage ? "Extracted Markdown" : "Readable source"}</h3>
          {source ? (
            <pre>{source.markdown}</pre>
          ) : (
            <div className="image-markdown-empty">
              <FileText />
              <strong>No extracted text yet</strong>
              <p>
                The original is already safe. Select Review image when an
                image-capable model is configured.
              </p>
            </div>
          )}
        </div>
        <footer>
          <span role="status">
            <ShieldCheck />{" "}
            {actionStatus ||
              (item.hasImage
                ? "Original retained in your local brain"
                : "Read from your local brain")}
          </span>
          <button
            className="secondary-button"
            onClick={reveal}
            disabled={revealing || reviewing}
          >
            <Folder /> {revealing ? "Opening…" : "Reveal in Finder"}
          </button>
          {item.hasImage && !imageReady ? (
            <button
              className="primary-button"
              onClick={review}
              disabled={reviewing}
            >
              {reviewing ? <CircleNotch className="spin" /> : <Sparkle />}{" "}
              {reviewing ? "Reviewing…" : "Review image"}
            </button>
          ) : (
            <button
              className="primary-button"
              onClick={onClose}
              disabled={revealing}
            >
              Done
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

interface NoteTrashConfirmProps {
  note: NoteDocument;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function NoteTrashConfirm({ note, deleting, onCancel, onConfirm }: NoteTrashConfirmProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleting, onCancel]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !deleting) onCancel();
      }}
    >
      <section
        className="note-trash-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-trash-title"
      >
        <span className="confirm-danger-icon">
          <Trash />
        </span>
        <div>
          <small>Recoverable deletion</small>
          <h2 id="note-trash-title">Move “{note.title}” to Trash?</h2>
          <p>
            The Markdown file can be recovered from macOS Trash. Its source
            captures will not be deleted.
          </p>
        </div>
        <footer>
          <button
            className="secondary-button"
            onClick={onCancel}
            disabled={deleting}
          >
            Keep note
          </button>
          <button
            className="danger-button"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? <CircleNotch className="spin" /> : <Trash />}{" "}
            {deleting ? "Moving…" : "Move to Trash"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function NotesPage({ focusRequest }: { focusRequest: FocusRequest | null }) {
  const [notes, setNotes] = useState<NoteDocument[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All notes");
  const [status, setStatus] = useState("Loading Markdown notes…");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "", tags: "" });
  const [saving, setSaving] = useState(false);
  const [fileAction, setFileAction] = useState("");
  const [confirmingTrash, setConfirmingTrash] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sourceView, setSourceView] = useState<SourceView | null>(null);
  const selected =
    notes.find((note) => note.relativePath === selectedPath) || null;
  const reload = async (preferredPath?: string | null): Promise<void> => {
    try {
      const next = await listNotes();
      setNotes(next);
      setSelectedPath(
        preferredPath &&
          next.some((note) => note.relativePath === preferredPath)
          ? preferredPath
          : next[0]?.relativePath || null,
      );
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  useEffect(() => {
    reload(focusRequest?.relativePath);
  }, [focusRequest?.token]);
  const visible = notes.filter((note) => {
    const matchesQuery =
      `${note.title} ${note.excerpt} ${(note.tags || []).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (filter === "Recent")
      return Date.now() - new Date(note.updatedAt).getTime() <= 7 * 86400000;
    if (filter === "Unlinked") return note.sources.length === 0;
    return true;
  });
  const beginNew = () => {
    setSelectedPath(null);
    setDraft({ title: "", body: "", tags: "" });
    setEditing(true);
    setStatus("Creating a readable Markdown note.");
  };
  const beginEdit = () => {
    if (!selected) return;
    setDraft({
      title: selected.title,
      body: selected.body,
      tags: selected.tags.join(", "),
    });
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    if (!selectedPath) setSelectedPath(notes[0]?.relativePath || null);
    setStatus("");
  };
  const persist = async () => {
    if (saving) return;
    setSaving(true);
    setStatus("Saving Markdown and rebuilding local search…");
    try {
      const saved = await saveNote({
        relativePath: selected?.relativePath || null,
        title: draft.title,
        body: draft.body,
        tags: draft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      await reload(saved.relativePath);
      setEditing(false);
      setStatus("Note saved locally and indexed.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!selected || deleting) return;
    setDeleting(true);
    setStatus("Moving note to Trash…");
    try {
      await trashNote(selected.relativePath);
      setEditing(false);
      setConfirmingTrash(false);
      await reload();
      setStatus("Note moved to macOS Trash.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };
  const openSource = async (source: NoteSource) => {
    try {
      const document = await getSourceDocument(source.relativePath);
      setSourceView({
        result: {
          sourceType: "source",
          title: document.title,
          relativePath: source.relativePath,
          quote: source.quote,
        },
        source: document,
      });
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const runFileAction = async (kind: "open" | "reveal") => {
    if (!selected || fileAction) return;
    setFileAction(kind);
    setStatus(
      kind === "open"
        ? "Opening note in the default Markdown app…"
        : "Opening note location in Finder…",
    );
    try {
      await (kind === "open"
        ? openNoteExternal(selected.relativePath)
        : revealSourceInFinder(selected.relativePath));
      setStatus(
        kind === "open"
          ? "Note opened externally."
          : "Note revealed in Finder.",
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setFileAction("");
    }
  };
  return (
    <main className="notes-workspace">
      <aside className="notes-list-pane">
        <div className="workspace-rail-header">
          <div>
            <small>Refined knowledge</small>
            <h1>Notes</h1>
          </div>
          <button
            className="icon-button"
            onClick={beginNew}
            aria-label="New note"
          >
            <Plus />
          </button>
        </div>
        <label className="rail-search">
          <MagnifyingGlass />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes..."
          />
        </label>
        <div className="note-filters">
          {["All notes", "Recent", "Unlinked"].map((item) => (
            <button
              className={filter === item ? "active" : ""}
              key={item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="note-list">
          {visible.map((note) => (
            <button
              className={
                !editing && selected?.relativePath === note.relativePath
                  ? "selected"
                  : ""
              }
              key={note.relativePath}
              onClick={() => {
                setSelectedPath(note.relativePath);
                setEditing(false);
                setStatus("");
              }}
            >
              <strong>{note.title}</strong>
              <p>{note.excerpt || "Empty note"}</p>
              <small>
                {note.sources.length} source
                {note.sources.length === 1 ? "" : "s"} ·{" "}
                {relativeTime(note.updatedAt)}
              </small>
            </button>
          ))}
          {notes.length === 0 && !editing ? (
            <div className="notes-empty-list">
              <FileText />
              <p>No notes yet.</p>
              <button onClick={beginNew}>Create the first note</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="notes-empty-list">
              <MagnifyingGlass />
              <p>No matching notes.</p>
            </div>
          ) : null}
        </div>
      </aside>
      <section className="note-detail-pane">
        {editing ? (
          <>
            <PageHeader
              eyebrow={
                selected
                  ? "Edit canonical Markdown note"
                  : "New canonical Markdown note"
              }
              title={selected ? "Edit note" : "Create note"}
              action={
                <div className="note-edit-actions">
                  <button className="secondary-button" onClick={cancelEdit}>
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    onClick={persist}
                    disabled={
                      saving || !draft.title.trim() || !draft.body.trim()
                    }
                  >
                    <Check /> {saving ? "Saving…" : "Save note"}
                  </button>
                </div>
              }
            />
            <div className="note-editor">
              <label>
                <span>Title</span>
                <input
                  autoFocus
                  maxLength={120}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </label>
              <label>
                <span>
                  Tags <small>comma-separated</small>
                </span>
                <input
                  value={draft.tags}
                  onChange={(event) =>
                    setDraft({ ...draft, tags: event.target.value })
                  }
                  placeholder="capture, local-first"
                />
              </label>
              <label>
                <span>Markdown body</span>
                <textarea
                  value={draft.body}
                  onChange={(event) =>
                    setDraft({ ...draft, body: event.target.value })
                  }
                  placeholder="Write the idea in your own words…"
                />
              </label>
            </div>
          </>
        ) : selected ? (
          <>
            <PageHeader
              eyebrow={`Atomic note · ${selected.sources.length} source${selected.sources.length === 1 ? "" : "s"}`}
              title={selected.title}
              action={
                <div className="note-edit-actions">
                  <button
                    className="secondary-button"
                    onClick={() => runFileAction("open")}
                    disabled={Boolean(fileAction)}
                  >
                    <FileText />{" "}
                    {fileAction === "open" ? "Opening…" : "Open externally"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => runFileAction("reveal")}
                    disabled={Boolean(fileAction)}
                  >
                    <Folder /> {fileAction === "reveal" ? "Opening…" : "Reveal"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={beginEdit}
                    disabled={Boolean(fileAction)}
                  >
                    <NotePencil size={17} /> Edit
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => setConfirmingTrash(true)}
                    disabled={Boolean(fileAction)}
                  >
                    <Trash /> Trash
                  </button>
                </div>
              }
            />
            <div className="markdown-note">
              <pre>{selected.body}</pre>
              {selected.sources.length ? (
                <section className="note-sources">
                  <h2>Sources</h2>
                  {selected.sources.map((source) => (
                    <button
                      key={`${source.relativePath}-${source.quote}`}
                      onClick={() => openSource(source)}
                    >
                      <Link />
                      <span>
                        <strong>{source.relativePath}</strong>
                        <q>{source.quote || "Open source"}</q>
                      </span>
                      <ArrowRight />
                    </button>
                  ))}
                </section>
              ) : (
                <div className="note-unlinked">
                  <Info />
                  <span>This note has no linked sources yet.</span>
                </div>
              )}
            </div>
            <div className="note-footer">
              {selected.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          </>
        ) : (
          <div className="note-detail-empty">
            <FileText />
            <h2>Select or create a note</h2>
            <p>Notes are ordinary Markdown files in your brain folder.</p>
            <button className="primary-button" onClick={beginNew}>
              <Plus /> New note
            </button>
          </div>
        )}
        {status ? (
          <p className="note-status" role="status">
            {status}
          </p>
        ) : null}
      </section>
      {sourceView ? (
        <SourceInspector
          result={sourceView.result}
          source={sourceView.source}
          query={sourceView.result.quote}
          onClose={() => setSourceView(null)}
        />
      ) : null}
      {confirmingTrash && selected ? (
        <NoteTrashConfirm
          note={selected}
          deleting={deleting}
          onCancel={() => setConfirmingTrash(false)}
          onConfirm={remove}
        />
      ) : null}
    </main>
  );
}

function ReviewPage({ onDataChanged }: { onDataChanged?: () => void }) {
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [selected, setSelected] = useState<ReviewRecord | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [status, setStatus] = useState("");
  const [sourceView, setSourceView] = useState<SourceView | null>(null);
  const reload = async () => {
    setLoading(true);
    try {
      setRecords(await listReviewItems());
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, []);
  const visible =
    filter === "all"
      ? records
      : filter === "new-note"
        ? records.filter(
            (item) =>
              item.itemType === "atomic-note" &&
              (!item.suggestedAction || item.suggestedAction === "create"),
          )
        : ["failed-processing-job", "contradiction", "uncertain-tag", "low-confidence-transcription", "filesystem-conflict", "agent-change"].includes(filter)
          ? records.filter((item) => item.itemType === filter)
          : records.filter((item) => item.suggestedAction === filter);
  const decide = async (decision: "approved" | "denied") => {
    if (!selected || working) return;
    const selectedId = selected.id;
    setWorking(decision);
    const action = selected.suggestedAction || "create";
    setStatus(
      decision === "denied"
        ? "Recording the denial…"
        : action === "append-source"
          ? "Appending the source to the matching note…"
          : action === "merge"
            ? "Merging the claim into the related note…"
            : action === "replace-tag"
              ? "Replacing the tag with the existing spelling…"
              : action === "accept-transcript"
                ? "Recording the transcript decision…"
                : action === "apply-agent-change"
                  ? "Applying the approved body while preserving note metadata…"
                : action === "contradiction"
                  ? "Preserving the conflicting claim separately…"
            : "Creating the canonical note…",
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const result = await resolveReviewItem({ id: selected.id, decision });
      setRecords((items) => items.filter((item) => item.id !== selected.id));
      setSelected(null);
      setStatus(
        result.createdNote
          ? result.record.itemType === "agent-change"
            ? `Approved. Updated ${result.createdNote.relativePath}.`
            : result.record.suggestedAction === "append-source"
            ? `Approved. Added the source to ${result.createdNote.relativePath}.`
            : result.record.suggestedAction === "merge"
              ? `Approved. Merged into ${result.createdNote.relativePath}.`
              : `Approved. Created ${result.createdNote.relativePath}.`
          : decision === "approved"
            ? result.record.itemType === "uncertain-tag"
              ? "Approved. The capture now uses the existing tag spelling."
              : result.record.itemType === "low-confidence-transcription"
                ? "Approved. The preserved transcript was accepted as written."
                : "Approved. The processing job completed and the decision was saved."
            : "Denied. The decision was saved; no note was created.",
      );
      onDataChanged?.();
    } catch (error) {
      const message = errorMessage(error);
      if (
        message.includes("review item was not found") ||
        message.includes("proposal is no longer pending")
      ) {
        setRecords((items) => items.filter((item) => item.id !== selectedId));
        setSelected(null);
        setStatus("The note was deleted, so this review is no longer needed.");
        onDataChanged?.();
      } else {
        setStatus(message);
      }
    } finally {
      setWorking("");
    }
  };
  const inspectSource = async (item: ReviewRecord) => {
    try {
      const source = await getSourceDocument(item.sourceRelativePath);
      setSourceView({
        result: {
          sourceType: "source",
          title: source.title,
          relativePath: item.sourceRelativePath,
          quote: item.quote,
        },
        source,
      });
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const createCount = records.filter(
    (item) =>
      item.itemType === "atomic-note" &&
      (!item.suggestedAction || item.suggestedAction === "create"),
  ).length;
  const appendCount = records.filter(
    (item) => item.suggestedAction === "append-source",
  ).length;
  const mergeCount = records.filter(
    (item) => item.suggestedAction === "merge",
  ).length;
  const failedCount = records.filter(
    (item) => item.itemType === "failed-processing-job",
  ).length;
  const contradictionCount = records.filter((item) => item.itemType === "contradiction").length;
  const uncertainTagCount = records.filter((item) => item.itemType === "uncertain-tag").length;
  const transcriptCount = records.filter((item) => item.itemType === "low-confidence-transcription").length;
  const filesystemCount = records.filter((item) => item.itemType === "filesystem-conflict").length;
  const agentChangeCount = records.filter((item) => item.itemType === "agent-change").length;
  return (
    <main className="feature-page review-page">
      <PageHeader
        eyebrow={`${records.length} item${records.length === 1 ? "" : "s"} ${records.length === 1 ? "needs" : "need"} attention`}
        title="Review inbox"
      />
      <p className="page-intro">
        Nothing here changes your knowledge until you approve it. Open a
        proposal to inspect the exact source quote and the change being
        proposed.
      </p>
      <div className="filter-row">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          All {records.length}
        </button>
        <button
          className={filter === "new-note" ? "active" : ""}
          onClick={() => setFilter("new-note")}
        >
          New notes {createCount}
        </button>
        <button
          className={filter === "append-source" ? "active" : ""}
          onClick={() => setFilter("append-source")}
        >
          Duplicate sources {appendCount}
        </button>
        <button
          className={filter === "merge" ? "active" : ""}
          onClick={() => setFilter("merge")}
        >
          Possible merges {mergeCount}
        </button>
        <button
          className={filter === "failed-processing-job" ? "active" : ""}
          onClick={() => setFilter("failed-processing-job")}
        >
          Failed jobs {failedCount}
        </button>
        <button className={filter === "contradiction" ? "active" : ""} onClick={() => setFilter("contradiction")}>Contradictions {contradictionCount}</button>
        <button className={filter === "uncertain-tag" ? "active" : ""} onClick={() => setFilter("uncertain-tag")}>Tags {uncertainTagCount}</button>
        <button className={filter === "low-confidence-transcription" ? "active" : ""} onClick={() => setFilter("low-confidence-transcription")}>Transcripts {transcriptCount}</button>
        <button className={filter === "filesystem-conflict" ? "active" : ""} onClick={() => setFilter("filesystem-conflict")}>File moves {filesystemCount}</button>
        <button className={filter === "agent-change" ? "active" : ""} onClick={() => setFilter("agent-change")}>Agent changes {agentChangeCount}</button>
      </div>
      {status ? (
        <p className="note-status" role="status">
          {status}
        </p>
      ) : null}
      <section className="review-list">
        {loading ? (
          <div className="empty-state">
            <CircleNotch className="spin" size={30} />
            <h2>Loading review items…</h2>
          </div>
        ) : (
          visible.map((item) => (
            <ReviewItem
              key={item.id}
              item={item}
              onOpen={() => setSelected(item)}
            />
          ))
        )}
        {!loading && records.length === 0 ? (
          <div className="empty-state">
            <Checks size={34} />
            <h2>Review is clear</h2>
            <p>
              New atomic-note proposals will appear after a capture is
              transcribed and organized.
            </p>
          </div>
        ) : !loading && records.length > 0 && visible.length === 0 ? (
          <div className="empty-state">
            <Checks size={34} />
            <h2>No items in this filter</h2>
          </div>
        ) : null}
      </section>
      {selected ? (
        <ReviewModal
          item={selected}
          working={working}
          onClose={() => !working && setSelected(null)}
          onSource={() => inspectSource(selected)}
          onApprove={() => decide("approved")}
          onDeny={() => decide("denied")}
        />
      ) : null}
      {sourceView ? (
        <SourceInspector
          result={sourceView.result}
          source={sourceView.source}
          query={sourceView.result.quote}
          onClose={() => setSourceView(null)}
        />
      ) : null}
    </main>
  );
}

function ReviewItem({ item, onOpen }: { item: ReviewRecord; onOpen: () => void }) {
  const Icon = item.itemType === "atomic-note" ? Sparkle : Info;
  const kind =
    item.suggestedAction === "append-source"
      ? "Duplicate source"
      : item.suggestedAction === "merge"
        ? "Possible merge"
        : item.itemType === "atomic-note"
          ? "New atomic note"
          : item.itemType === "failed-processing-job"
            ? "Failed processing job"
            : item.itemType === "contradiction"
              ? "Possible contradiction"
              : item.itemType === "uncertain-tag"
                ? "Uncertain tag"
                : item.itemType === "low-confidence-transcription"
                  ? "Low-confidence transcript"
                  : item.itemType === "filesystem-conflict"
                    ? "Ambiguous file move"
                    : item.itemType === "agent-change"
                      ? "Agent change"
            : item.itemType;
  return (
    <button className="review-row" onClick={onOpen}>
      <span className="review-icon">
        <Icon size={20} />
      </span>
      <div>
        <small>
          {kind}
        </small>
        <h3>{item.title}</h3>
        <p>{item.detail}</p>
      </div>
      <div className="review-meta">
        <span>
          {item.confidence == null
            ? "Deterministic proposal"
            : `${item.confidence}% confidence`}
        </span>
        <ArrowRight />
      </div>
    </button>
  );
}

interface ReviewModalProps {
  item: ReviewRecord;
  working: string;
  onClose: () => void;
  onSource: () => void;
  onApprove: () => void;
  onDeny: () => void;
}

function ReviewModal({ item, working, onClose, onSource, onApprove, onDeny }: ReviewModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [working, onClose]);
  const Icon = item.itemType === "atomic-note" ? Sparkle : Info;
  const action = item.suggestedAction || "create";
  const kind =
    action === "append-source"
      ? "Duplicate source"
      : action === "merge"
        ? "Possible merge"
        : item.itemType === "atomic-note"
          ? "New atomic note"
          : item.itemType === "failed-processing-job"
            ? "Failed processing job"
            : item.itemType === "contradiction"
              ? "Possible contradiction"
              : item.itemType === "uncertain-tag"
                ? "Uncertain tag"
                : item.itemType === "low-confidence-transcription"
                  ? "Low-confidence transcript"
                  : item.itemType === "filesystem-conflict"
                    ? "Ambiguous file move"
                    : item.itemType === "agent-change"
                      ? "Agent change"
            : item.itemType;
  const approveLabel =
    action === "retry-enrichment"
      ? "Retry enrichment"
      : action === "replace-tag"
        ? "Use existing tag"
          : action === "accept-transcript"
            ? "Accept transcript"
            : action === "acknowledge-move-conflict"
              ? "Acknowledge"
              : action === "apply-agent-change"
                ? "Approve note change"
          : action === "contradiction"
            ? "Preserve separate note"
      : action === "append-source"
      ? "Append source"
      : action === "merge"
        ? "Merge into note"
        : "Approve & create note";
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !working) onClose();
      }}
    >
      <section
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        aria-busy={Boolean(working)}
      >
        <header>
          <span className="review-icon">
            <Icon />
          </span>
          <div>
            <small>
              {kind}
            </small>
            <h2 id="review-modal-title">{item.title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={Boolean(working)}
            aria-label="Close review details"
          >
            <X />
          </button>
        </header>
        <div className="modal-section">
          <h3>Where this came from</h3>
          <button
            className="review-source-button"
            onClick={onSource}
            disabled={Boolean(working)}
          >
            <FileText /> <span>{item.sourceRelativePath}</span>
            <ArrowRight />
          </button>
          <blockquote>“{item.quote}”</blockquote>
        </div>
        <div className="modal-grid">
          <div>
            <h3>Why it is here</h3>
            <p>{item.reason}</p>
          </div>
          <div>
            <h3>Proposed action</h3>
            <p>{item.proposedAction}</p>
          </div>
        </div>
        <div className="confidence-row">
          <Info />
          <span>Extraction method</span>
          <strong>
            {item.confidence == null
              ? "Rule-based"
              : `${item.confidence}% confidence`}
          </strong>
          <small>
            {action === "create"
              ? "No canonical note exists until you approve."
              : `The existing note${item.targetRelativePath ? ` at ${item.targetRelativePath}` : ""} remains unchanged until you approve.`}
          </small>
        </div>
        {working ? (
          <div className="review-working-status" role="status" aria-live="polite">
            <CircleNotch className="spin" />
            <span>
              <strong>{working === "approved" ? "Applying approval…" : "Saving denial…"}</strong>
              <small>Keep this window open while Burrowise updates the review inbox.</small>
            </span>
          </div>
        ) : null}
        <footer>
          <button
            className="danger-button"
            onClick={onDeny}
            disabled={Boolean(working)}
          >
            {working === "denied" ? (
              <CircleNotch className="spin" />
            ) : (
              <Trash />
            )}{" "}
            {working === "denied"
              ? "Denying…"
              : action === "accept-transcript"
                ? "Needs correction"
                : action === "replace-tag"
                  ? "Keep current tag"
                  : "Deny"}
          </button>
          <button
            className="secondary-button"
            onClick={onClose}
            disabled={Boolean(working)}
          >
            {working ? "Please wait…" : "Decide later"}
          </button>
          <button
            className="primary-button"
            onClick={onApprove}
            disabled={Boolean(working)}
          >
            {working === "approved" ? (
              <CircleNotch className="spin" />
            ) : (
              <Check />
            )}{" "}
            {working === "approved" ? "Approving…" : approveLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

/** Shared by every conversation mode; mode-specific behavior is supplied as controls. */
function ConversationComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  controls,
  className = "chat-composer",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled: boolean;
  controls?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${className} conversation-composer`}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        aria-label="Message"
      />
      <div>
        {controls}
        <button
          className="send-button"
          aria-label="Send message"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
        >
          {disabled ? <CircleNotch className="spin" /> : <ArrowRight />}
        </button>
      </div>
    </div>
  );
}

function ConversationCitations({ citations, onOpen }: { citations: Citation[]; onOpen: (citation: Citation) => void }) {
  return (
    <div className="citation-list">
      {citations.map((citation) => (
        <button className="citation" key={citation.passageId} onClick={() => onOpen(citation)}>
          <FileText /> {citation.title} <span>{citation.number}</span>
        </button>
      ))}
    </div>
  );
}

function ChatPage({ focusRequest, retrievalSettings, defaultAgentMode, allowGeneralKnowledgeDefault }: { focusRequest: FocusRequest | null; retrievalSettings: RetrievalSettings; defaultAgentMode: BootstrapState["defaultAgentMode"]; allowGeneralKnowledgeDefault: boolean }) {
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scope, setScope] = useState("all");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<{
    content: string;
    startedAt: number;
    error: string | null;
  } | null>(null);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [chatQuery, setChatQuery] = useState("");
  const [status, setStatus] = useState(
    "Local Retrieval only · general knowledge off",
  );
  const [showDetails, setShowDetails] = useState(false);
  const [sourceOptions, setSourceOptions] = useState<IndexedSource[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [citationView, setCitationView] = useState<CitationView | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalog | null>(null);
  const [showAiSetup, setShowAiSetup] = useState(false);
  const [modelBusy, setModelBusy] = useState("");
  const answerMode = retrievalSettings.answerMode;
  const agentMode = defaultAgentMode;
  const [agentProposal, setAgentProposal] = useState<AgentProposal | null>(null);
  const [expandedCitationMessages, setExpandedCitationMessages] = useState<Set<string>>(
    () => new Set(),
  );
  const [responseDisplay, setResponseDisplay] = useState<"markdown" | "raw">(() =>
    localStorage.getItem("burrowise-chat-response-display") === "raw" ? "raw" : "markdown",
  );
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem("burrowise-chat-response-display", responseDisplay);
  }, [responseDisplay]);

  useEffect(() => {
    Promise.all([
      listChatConversations(),
      listIndexedSources(),
      getGenerationProviderCatalog(false),
    ])
      .then(([conversationList, sources, providers]) => {
        setChats(conversationList);
        setSourceOptions(sources);
        setProviderCatalog(providers);
        const requested = conversationList.find(
          (conversation) => conversation.id === focusRequest?.recordId,
        );
        const selected = requested || conversationList[0];
        if (selected) {
          setActive(selected.id);
          setScope(selected.scope || "all");
          setSelectedPaths(selected.selectedPaths || []);
        }
      })
      .catch((error) => setStatus(errorMessage(error)))
      .finally(() => setLoadingChats(false));
  }, [focusRequest?.token]);
  useEffect(() => {
    if (!active) {
      setMessages([]);
      setExpandedCitationMessages(new Set());
      setAgentProposal(null);
      return;
    }
    setLoadingMessages(true);
    listChatMessages(active)
      .then(setMessages)
      .catch((error) => setStatus(errorMessage(error)))
      .finally(() => setLoadingMessages(false));
  }, [active]);
  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pendingTurn, thinkingSeconds]);
  useEffect(() => {
    if (!pendingTurn || pendingTurn.error) return;
    setThinkingSeconds(Math.floor((Date.now() - pendingTurn.startedAt) / 1000));
    const timer = window.setInterval(() => {
      setThinkingSeconds(Math.floor((Date.now() - pendingTurn.startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pendingTurn]);

  const newChat = async () => {
    try {
      const conversation = await createChatConversation({
        title: "Untitled chat",
        scope: "all",
      });
      setChats((current) => [conversation, ...current]);
      setActive(conversation.id);
      setScope("all");
      setSelectedPaths([]);
      setMessages([]);
      setMessage("");
      setStatus("New local conversation created · general knowledge off");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const selectChat = (chat: ChatConversation) => {
    setActive(chat.id);
    setScope(chat.scope || "all");
    setSelectedPaths(chat.selectedPaths || []);
    setAgentProposal(null);
    setExpandedCitationMessages(new Set());
    setStatus(`${chat.provider} · ${chat.model} · general knowledge off`);
  };
  const send = async (retryContent?: string) => {
    const submittedMessage = (retryContent ?? message).trim();
    if (!submittedMessage || sending) return;
    if (scope === "selected" && selectedPaths.length === 0) {
      setStatus("Choose at least one indexed note for Selected notes scope.");
      setShowDetails(true);
      return;
    }
    const startedAt = Date.now();
    setSending(true);
    setMessage("");
    setThinkingSeconds(0);
    setPendingTurn({ content: submittedMessage, startedAt, error: null });
    setStatus("Searching your brain and building a cited answer...");
    try {
      const turn = await sendChatMessage({
        conversationId: active,
        message: submittedMessage,
        scope,
        selectedPaths,
        allowGeneralKnowledge: allowGeneralKnowledgeDefault,
        retrievalLimit: retrievalSettings.chatChunkLimit,
        answerMode,
        agentMode,
      });
      setActive(turn.conversation.id);
      setChats((current) => [
        turn.conversation,
        ...current.filter((chat) => chat.id !== turn.conversation.id),
      ]);
      setMessages((current) => [
        ...current,
        turn.userMessage,
        turn.assistantMessage,
      ]);
      setPendingTurn(null);
      setAgentProposal(turn.agentProposal);
      const filesUsed = new Set(
        turn.assistantMessage.citations.map(
          (citation) => citation.relativePath,
        ),
      ).size;
      setStatus(
        turn.agentProposal
          ? turn.agentProposal.queuedForReview
            ? "Revision prepared and queued in Review. No canonical file has changed yet."
            : "Revision prepared as a preview. Send it to Review to create an approval decision."
          : `${turn.assistantMessage.citations.length} passages across ${filesUsed} source file${filesUsed === 1 ? "" : "s"} · general knowledge ${turn.assistantMessage.generalKnowledgeUsed ? "used and labeled" : "not used"}`,
      );
    } catch (error) {
      const detail = errorMessage(error);
      setPendingTurn({ content: submittedMessage, startedAt, error: detail });
      setStatus(`Couldn’t send this message. ${detail}`);
    } finally {
      setSending(false);
    }
  };
  const openCitation = async (citation: Citation) => {
    try {
      setCitationView({
        citation,
        source: await getSourceDocument(citation.relativePath),
      });
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const chatSelection = providerCatalog?.preferredModels?.chat || {
    providerId: "local-retrieval",
    modelId: "extractive-v1",
  };
  const chatProvider = providerCatalog?.providers.find(
    (provider) => provider.id === chatSelection.providerId,
  );
  const chatModel = chatProvider?.models.find(
    (model) => model.id === chatSelection.modelId,
  );
  const changeChatModel = async (selection: ModelSelection) => {
    setModelBusy("apply");
    try {
      const next = await setPreferredModel({
        capability: "chat",
        ...selection,
      });
      setProviderCatalog(next);
      setShowAiSetup(false);
      setStatus(
        `Next response will use ${selection.providerId} · ${selection.modelId}. Earlier messages keep their original model snapshot.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setModelBusy("");
    }
  };
  const toggleChatFavorite = async (
    selection: ModelSelection,
    favorite: boolean,
  ) => {
    setModelBusy(`favorite:${selection.providerId}:${selection.modelId}`);
    try {
      setProviderCatalog(
        await setFavoriteModel({ ...selection, favorite }),
      );
      setStatus(
        favorite
          ? `${selection.modelId} added to favorites.`
          : `${selection.modelId} removed from favorites.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setModelBusy("");
    }
  };
  const current = chats.find((chat) => chat.id === active);
  const queueCurrentProposal = async () => {
    if (!agentProposal || !active || agentProposal.queuedForReview) return;
    try {
      await queueChatAgentProposal({ proposal: agentProposal, conversationId: active });
      setAgentProposal({ ...agentProposal, queuedForReview: true });
      setStatus("Proposal queued in Review. The canonical note is still unchanged.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const renameCurrentChat = async () => {
    if (!current) return;
    const title = window.prompt("Rename this conversation", current.title);
    if (title == null || title.trim() === current.title) return;
    try {
      const renamed = await renameChatConversation(current.id, title);
      setChats((items) => items.map((item) => item.id === renamed.id ? renamed : item));
      setStatus("Conversation title saved locally.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const exportCurrentChat = async () => {
    if (!current) return;
    try {
      const path = await exportChatConversation(current.id);
      setStatus(`Markdown export written to ${path}.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const removeCurrentChat = async () => {
    if (!current) return;
    if (!window.confirm(`Delete “${current.title}”?\n\nThis removes the local conversation and its access log. Your source notes and captures are not changed.`)) return;
    try {
      await deleteChatConversation(current.id);
      const remaining = chats.filter((item) => item.id !== current.id);
      setChats(remaining);
      setActive(remaining[0]?.id || null);
      setMessages([]);
      setStatus("Conversation deleted. Source knowledge was not changed.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const visibleChats = chats.filter((chat) =>
    `${chat.title} ${chat.preview}`
      .toLowerCase()
      .includes(chatQuery.toLowerCase()),
  );
  return (
    <main className="chat-workspace">
      <aside className="chat-list-pane">
        <div className="workspace-rail-header">
          <div>
            <small>Persisted locally</small>
            <h1>Chat</h1>
          </div>
          <button
            className="icon-button"
            onClick={newChat}
            aria-label="New chat"
          >
            <Plus />
          </button>
        </div>
        <label className="rail-search">
          <MagnifyingGlass />
          <input
            value={chatQuery}
            onChange={(event) => setChatQuery(event.target.value)}
            placeholder="Search chats..."
          />
        </label>
        <div className="chat-list">
          <p>Recent</p>
          {visibleChats.map((chat) => (
            <button
              className={active === chat.id ? "selected" : ""}
              key={chat.id}
              onClick={() => selectChat(chat)}
            >
              <strong>{chat.title}</strong>
              <span>{chat.preview}</span>
              <small>
                {new Date(chat.updatedAt).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })}
              </small>
            </button>
          ))}
          {loadingChats ? (
            <div className="chat-list-empty">
              <CircleNotch className="spin" />
              <p>Loading conversations…</p>
            </div>
          ) : chats.length === 0 ? (
            <div className="chat-list-empty">
              <p>No conversations yet.</p>
              <button onClick={newChat}>
                <Plus /> New chat
              </button>
            </div>
          ) : visibleChats.length === 0 ? (
            <div className="chat-list-empty">
              <MagnifyingGlass />
              <p>No matching conversations.</p>
            </div>
          ) : null}
        </div>
      </aside>
      <section className="chat-detail-pane">
        <PageHeader
          eyebrow="Cited answers from your knowledge"
          title={current?.title || "New chat"}
          action={
            <div className="interview-header-actions">
              <button className="secondary-button" onClick={renameCurrentChat} disabled={!current} aria-label="Rename conversation">
                <NotePencil /> Rename
              </button>
              <button className="secondary-button" onClick={exportCurrentChat} disabled={!current}>
                <FileText /> Export
              </button>
              <button className="secondary-button" onClick={removeCurrentChat} disabled={!current}>
                <Trash /> Delete
              </button>
              <button
                className={`secondary-button ${showDetails ? "active" : ""}`}
                onClick={() => setShowDetails(!showDetails)}
              >
                <SlidersHorizontal /> Scope & sources
              </button>
            </div>
          }
        />
        <div className="chat-view-options">
          <span>Response view</span>
          <div className="response-display-toggle" role="group" aria-label="Response display">
            <button
              className={responseDisplay === "markdown" ? "active" : ""}
              type="button"
              aria-pressed={responseDisplay === "markdown"}
              onClick={() => setResponseDisplay("markdown")}
            >
              <MarkdownLogo /> Markdown
            </button>
            <button
              className={responseDisplay === "raw" ? "active" : ""}
              type="button"
              aria-pressed={responseDisplay === "raw"}
              onClick={() => setResponseDisplay("raw")}
            >
              <Code /> Source
            </button>
          </div>
        </div>
        {showDetails ? (
          <ChatScopePanel
            scope={scope}
            setScope={setScope}
            sources={sourceOptions}
            selectedPaths={selectedPaths}
            setSelectedPaths={setSelectedPaths}
            agentMode={agentMode}
          />
        ) : null}
        <div className="chat-thread" ref={threadRef}>
          {loadingMessages ? (
            <div className="chat-empty">
              <CircleNotch className="spin" size={30} />
              <p>Loading this conversation…</p>
            </div>
          ) : messages.length === 0 && !pendingTurn ? (
            <div className="chat-empty">
              <Brain size={34} weight="duotone" />
              <h2>Ask something your brain can answer</h2>
              <p>
                The selected provider receives your question and only the
                passages inside this chat's explicit scope.
              </p>
              <div>
                <button
                  onClick={() =>
                    setMessage(
                      "What have I said about making capture reliable?",
                    )
                  }
                >
                  Capture reliability
                </button>
                <button
                  onClick={() => setMessage("What are my privacy boundaries?")}
                >
                  Privacy boundaries
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((item) =>
                item.role === "user" ? (
                <div className="chat-user" key={item.id}>
                  {item.content}
                </div>
              ) : (
                <div className="chat-answer" key={item.id}>
                  <span className="assistant-mark">
                    <Brain weight="duotone" />
                  </span>
                  <div>
                    {responseDisplay === "markdown" ? (
                      <div className="chat-markdown">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ children }) => (
                              <span className="chat-markdown-link">{children}</span>
                            ),
                            img: ({ alt }) => (
                              <span className="chat-markdown-image-placeholder">
                                Image not loaded{alt ? `: ${alt}` : ""}
                              </span>
                            ),
                          }}
                        >
                          {item.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <pre className="chat-raw-response">{item.content}</pre>
                    )}
                    {item.citations.length > 0 ? (
                      <div className={`citation-disclosure ${expandedCitationMessages.has(item.id) ? "expanded" : ""}`}>
                        <button
                          className="citation-summary"
                          type="button"
                          aria-expanded={expandedCitationMessages.has(item.id)}
                          aria-controls={`citations-${item.id}`}
                          onClick={() => {
                            setExpandedCitationMessages((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                          }}
                        >
                          <span>
                            <FileText />
                            <strong>
                              {new Set(item.citations.map((citation) => citation.relativePath)).size} resource{new Set(item.citations.map((citation) => citation.relativePath)).size === 1 ? "" : "s"} used
                            </strong>
                            <small>{item.citations.length} passage{item.citations.length === 1 ? "" : "s"}</small>
                          </span>
                          <CaretDown />
                        </button>
                        {expandedCitationMessages.has(item.id) ? (
                          <div id={`citations-${item.id}`}><ConversationCitations citations={item.citations} onOpen={openCitation} /></div>
                        ) : null}
                      </div>
                    ) : null}
                    <small>
                      Provider: {item.provider} · Model: {item.model} · General
                      knowledge{" "}
                      {item.generalKnowledgeUsed ? "permitted" : "not used"}
                    </small>
                  </div>
                </div>
                ),
              )}
              {pendingTurn ? (
                <>
                  <div className="chat-user chat-user-pending">
                    {pendingTurn.content}
                  </div>
                  <div
                    className={`chat-answer chat-thinking ${pendingTurn.error ? "failed" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    <span className="assistant-mark">
                      {pendingTurn.error ? <WarningCircle /> : <CircleNotch className="spin" />}
                    </span>
                    <div>
                      <strong>
                        {pendingTurn.error
                          ? "Message not sent"
                          : thinkingSeconds < 2
                            ? "Starting…"
                            : "Searching your brain…"}
                      </strong>
                      <p>
                        {pendingTurn.error
                          ? pendingTurn.error
                          : "Finding relevant sources and preparing a cited answer."}
                      </p>
                      <small>
                        {chatProvider?.label || chatSelection.providerId} ·{" "}
                        {chatModel?.label || chatSelection.modelId}
                        {!pendingTurn.error && thinkingSeconds > 0
                          ? ` · ${thinkingSeconds}s`
                          : ""}
                      </small>
                      {pendingTurn.error ? (
                        <div className="chat-retry-actions">
                          <button
                            type="button"
                            onClick={() => void send(pendingTurn.content)}
                          >
                            <ArrowClockwise /> Try again
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMessage(pendingTurn.content);
                              setPendingTurn(null);
                            }}
                          >
                            Edit message
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
        {agentProposal ? (
          <section className="agent-proposal-card" aria-label="Agent change proposal">
            <header>
              <span><Robot /><strong>Proposed change</strong></span>
              <code>{agentProposal.targetRelativePath}</code>
            </header>
            <p>{agentProposal.instruction}</p>
            <div>
              <article><small>Current body</small><pre>{agentProposal.originalBody}</pre></article>
              <article><small>Proposed body</small><pre>{agentProposal.proposedBody}</pre></article>
            </div>
            <footer>
              <span><ShieldCheck /> Canonical Markdown is unchanged.</span>
              {agentProposal.queuedForReview ? (
                <strong><Checks /> Queued in Review</strong>
              ) : (
                <button className="primary-button" onClick={queueCurrentProposal}><ListChecks /> Send to Review</button>
              )}
            </footer>
          </section>
        ) : null}
        <div className="chat-status" role="status">
          <ShieldCheck /> {status}
        </div>
        <ConversationComposer
          value={message}
          onChange={setMessage}
          onSubmit={() => void send()}
          placeholder="Ask your brain..."
          disabled={sending}
          controls={<>
            <select
              aria-label="Knowledge source"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
                if (event.target.value === "selected") setShowDetails(true);
              }}
            >
              <option value="all">Whole brain</option>
              <option value="session">Capture sessions</option>
              <option value="selected">Selected notes</option>
            </select>
            <button
              className="ai-setup-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={showAiSetup}
              onClick={() => setShowAiSetup(true)}
            >
              <span
                className={`ai-locality-dot ${chatProvider?.locality === "cloud" ? "cloud" : "local"}`}
                aria-hidden="true"
              />
              <span>
                <small>Model</small>
                <strong>{chatModel?.label || chatSelection.modelId}</strong>
              </span>
              <em>{chatProvider?.label || chatSelection.providerId}</em>
              <CaretDown />
            </button>
          </>}
        />
      </section>
      {citationView ? (
        <SourceInspector
          result={{
            sourceType: "citation",
            quote: citationView.citation.quote,
          }}
          source={citationView.source}
          query=""
          onClose={() => setCitationView(null)}
        />
      ) : null}
      {showAiSetup && providerCatalog ? (
        <ChatAiSetupModal
          catalog={providerCatalog}
          selection={chatSelection}
          busy={modelBusy}
          onApply={changeChatModel}
          onToggleFavorite={toggleChatFavorite}
          onClose={() => setShowAiSetup(false)}
        />
      ) : null}
    </main>
  );
}

function ChatAiSetupModal({
  catalog,
  selection,
  busy,
  onApply,
  onToggleFavorite,
  onClose,
}: {
  catalog: ProviderCatalog;
  selection: ModelSelection;
  busy: string;
  onApply: (selection: ModelSelection) => Promise<void>;
  onToggleFavorite: (
    selection: ModelSelection,
    favorite: boolean,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(selection);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const providers = catalog.providers.filter(
    (provider) => provider.enabled && provider.models.length > 0,
  );
  const draftProvider = catalog.providers.find(
    (provider) => provider.id === draft.providerId,
  );
  const draftModel = draftProvider?.models.find(
    (model) => model.id === draft.modelId,
  );
  const isFavorite = (model: ModelSelection) =>
    catalog.favoriteModels.some(
      (favorite) =>
        favorite.providerId === model.providerId &&
        favorite.modelId === model.modelId,
    );
  const modelName = (model: ModelSelection) => {
    const provider = catalog.providers.find(
      (item) => item.id === model.providerId,
    );
    return {
      provider,
      label:
        provider?.models.find((item) => item.id === model.modelId)?.label ||
        model.modelId,
    };
  };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <section
        className="ai-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-setup-title"
      >
        <header>
          <span className="ai-setup-mark"><Robot weight="duotone" /></span>
          <div>
            <small>Chat routing</small>
            <h2 id="ai-setup-title">Choose your AI setup</h2>
            <p>The next reply uses this exact provider and model.</p>
          </div>
          <button
            className="icon-button"
            ref={closeRef}
            onClick={onClose}
            disabled={Boolean(busy)}
            aria-label="Close AI setup"
          >
            <X />
          </button>
        </header>

        <div className="ai-current-setup">
          <span
            className={`ai-locality-dot ${draftProvider?.locality === "cloud" ? "cloud" : "local"}`}
            aria-hidden="true"
          />
          <span>
            <small>Selected for the next reply</small>
            <strong>{draftModel?.label || draft.modelId}</strong>
          </span>
          <em>
            {draftProvider?.label || draft.providerId} · {draftProvider?.locality === "cloud" ? "Cloud" : "On device"}
          </em>
        </div>

        <div className="ai-setup-body">
          <section className="ai-favorites-section" aria-labelledby="ai-favorites-title">
            <div className="ai-section-heading">
              <div>
                <h3 id="ai-favorites-title">Favorites</h3>
                <p>Your fastest setups, ready to switch.</p>
              </div>
            </div>
            {catalog.favoriteModels.length ? (
              <div className="ai-favorite-list">
                {catalog.favoriteModels.map((favorite) => {
                  const details = modelName(favorite);
                  const available = details.provider?.enabled;
                  const selected =
                    draft.providerId === favorite.providerId &&
                    draft.modelId === favorite.modelId;
                  return (
                    <div className={`ai-favorite-row ${selected ? "selected" : ""}`} key={`${favorite.providerId}:${favorite.modelId}`}>
                      <button
                        type="button"
                        onClick={() => setDraft(favorite)}
                        disabled={!available || Boolean(busy)}
                      >
                        <Star weight="fill" />
                        <span>
                          <strong>{details.label}</strong>
                          <small>{details.provider?.label || favorite.providerId}</small>
                        </span>
                        {selected ? <Check /> : <ArrowRight />}
                      </button>
                      <button
                        type="button"
                        className="ai-unfavorite"
                        aria-label={`Remove ${details.label} from favorites`}
                        disabled={Boolean(busy)}
                        onClick={() => onToggleFavorite(favorite, false)}
                      >
                        {busy === `favorite:${favorite.providerId}:${favorite.modelId}` ? <CircleNotch className="spin" /> : <X />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ai-favorites-empty">
                <Star />
                <span>
                  <strong>No favorites yet</strong>
                  <small>Star a model below to keep it one click away.</small>
                </span>
              </div>
            )}
          </section>

          <section className="ai-models-section" aria-labelledby="ai-models-title">
            <div className="ai-section-heading">
              <div>
                <h3 id="ai-models-title">All available models</h3>
                <p>Local and approved cloud providers.</p>
              </div>
            </div>
            <div className="ai-provider-list">
              {providers.map((provider) => (
                <div className="ai-provider-group" key={provider.id}>
                  <header>
                    <span className={`ai-locality-dot ${provider.locality === "cloud" ? "cloud" : "local"}`} />
                    <strong>{provider.label}</strong>
                    <small>{provider.locality === "cloud" ? "Cloud" : "On device"}</small>
                  </header>
                  {provider.models.map((model) => {
                    const option = { providerId: provider.id, modelId: model.id };
                    const selected = draft.providerId === provider.id && draft.modelId === model.id;
                    const favorite = isFavorite(option);
                    return (
                      <div className={`ai-model-row ${selected ? "selected" : ""}`} key={model.id}>
                        <button type="button" onClick={() => setDraft(option)} disabled={Boolean(busy)}>
                          <span className="ai-radio" aria-hidden="true" />
                          <span>
                            <strong>{model.label}</strong>
                            <small>{model.id}</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`ai-favorite-toggle ${favorite ? "active" : ""}`}
                          aria-label={`${favorite ? "Remove" : "Add"} ${model.label} ${favorite ? "from" : "to"} favorites`}
                          disabled={Boolean(busy)}
                          onClick={() => onToggleFavorite(option, !favorite)}
                        >
                          {busy === `favorite:${provider.id}:${model.id}` ? (
                            <CircleNotch className="spin" />
                          ) : (
                            <Star weight={favorite ? "fill" : "regular"} />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer>
          <span className={draftProvider?.locality === "cloud" ? "cloud" : "local"}>
            <ShieldCheck />
            {draftProvider?.locality === "cloud"
              ? `Your question and retrieved passages can be sent to ${draftProvider.label}.`
              : "This setup runs on your Mac."}
          </span>
          <div>
            <button className="secondary-button" onClick={onClose} disabled={Boolean(busy)}>
              Cancel
            </button>
            <button className="primary-button" onClick={() => onApply(draft)} disabled={Boolean(busy)}>
              {busy === "apply" ? <CircleNotch className="spin" /> : <Check />}
              Use this setup
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ChatScopePanel({
  scope,
  setScope,
  sources,
  selectedPaths,
  setSelectedPaths,
  agentMode,
}: {
  scope: string;
  setScope: Dispatch<SetStateAction<string>>;
  sources: IndexedSource[];
  selectedPaths: string[];
  setSelectedPaths: Dispatch<SetStateAction<string[]>>;
  agentMode: "read-only" | "read-and-propose" | "read-write";
}) {
  const noteSources = sources.filter((source) => source.sourceType === "note");
  const toggle = (path: string) =>
    setSelectedPaths((current) =>
      agentMode !== "read-only"
        ? current.includes(path) ? [] : [path]
        : current.includes(path)
        ? current.filter((item) => item !== path)
        : [...current, path],
    );
  return (
    <section className="chat-scope-panel">
      <div>
        <small>Knowledge scope</small>
        <div className="segmented">
          {[
            ["all", "Whole brain"],
            ["session", "Sessions"],
            ["selected", "Selected notes"],
          ].map(([id, label]) => (
            <button
              className={scope === id ? "active" : ""}
              key={id}
              onClick={() => setScope(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="scope-policy">
        <ShieldCheck />
        <span>
          <strong>{agentMode === "read-only" ? "Read-only retrieval" : agentMode === "read-and-propose" ? "Proposal only" : "Review-gated write"}</strong>
          <small>
            {agentMode === "read-only"
              ? "The access log records every cited passage. General model knowledge is off."
              : "Exactly one note is available as the edit target. Canonical Markdown changes only after Review approval."}
          </small>
        </span>
      </div>
      {scope === "selected" ? (
        <div className="source-picker">
          <small>Choose notes ({selectedPaths.length} selected)</small>
          {noteSources.length ? (
            noteSources.map((source) => (
              <label key={source.relativePath}>
                <input
                  type="checkbox"
                  checked={selectedPaths.includes(source.relativePath)}
                  onChange={() => toggle(source.relativePath)}
                />
                <span>
                  <strong>{source.title}</strong>
                  <small>{source.relativePath}</small>
                </span>
              </label>
            ))
          ) : (
            <p>Rebuild the search index to discover notes.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function InterviewEndConfirm({ interview, working, onCancel, onConfirm }: { interview: InterviewSession; working: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [working, onCancel]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !working) onCancel();
      }}
    >
      <section
        className="note-trash-confirm interview-end-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interview-end-title"
      >
        <span className="confirm-danger-icon">
          <Archive />
        </span>
        <div>
          <small>Finish this session</small>
          <h2 id="interview-end-title">End “{interview.title}”?</h2>
          <p>
            The transcript, access log, and saved voice audio remain searchable
            in your brain folder. You can continue this same interview later.
          </p>
        </div>
        <footer>
          <button
            className="secondary-button"
            onClick={onCancel}
            disabled={working}
          >
            Keep talking
          </button>
          <button
            className="primary-button"
            onClick={onConfirm}
            disabled={working}
          >
            {working ? <CircleNotch className="spin" /> : <Archive />}{" "}
            {working ? "Finishing…" : "Finish for now"}
          </button>
        </footer>
      </section>
    </div>
  );
}

const selectedNotesLabel = (count: number): string =>
  `${count} selected note${count === 1 ? "" : "s"}`;

function InterviewLibraryPane({
  interviews,
  selectedId,
  query,
  disabled,
  onQueryChange,
  onNew,
  onSelect,
}: {
  interviews: InterviewSession[];
  selectedId: string | null;
  query: string;
  disabled: boolean;
  onQueryChange: (value: string) => void;
  onNew: () => void;
  onSelect: (interview: InterviewSession) => void;
}) {
  const visibleInterviews = interviews.filter((interview) =>
    `${interview.title} ${interview.hostName} ${interview.scope}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <aside className="interview-list-pane">
      <div className="workspace-rail-header">
        <div>
          <small>Searchable source of truth</small>
          <h1>Interviews</h1>
        </div>
        <button
          className="icon-button"
          onClick={onNew}
          disabled={disabled}
          aria-label="Start a new interview"
          title="Start a new interview"
        >
          <Plus />
        </button>
      </div>
      <label className="rail-search">
        <MagnifyingGlass />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search interviews..."
        />
      </label>
      <div className="interview-list">
        <p>Recent</p>
        {visibleInterviews.map((item) => (
          <button
            className={selectedId === item.id ? "selected" : ""}
            key={item.id}
            onClick={() => onSelect(item)}
            disabled={disabled}
          >
            <strong>{item.title}</strong>
            <span>
              {item.hostName} ·{" "}
              {item.scope === "all"
                ? "Whole brain"
                : item.scope === "selected"
                  ? selectedNotesLabel(item.selectedPaths.length)
                  : "This interview"}
            </span>
            <small>
              {new Date(item.updatedAt).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}
            </small>
            <em className={item.status === "active" ? "active" : ""}>
              {item.status === "active" ? "In progress" : "Finished"}
            </em>
          </button>
        ))}
        {interviews.length === 0 ? (
          <div className="chat-list-empty">
            <p>No interviews yet.</p>
            <button onClick={onNew} disabled={disabled}>
              <Plus /> New interview
            </button>
          </div>
        ) : visibleInterviews.length === 0 ? (
          <div className="chat-list-empty">
            <MagnifyingGlass />
            <p>No matching interviews.</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function InterviewsPage({ focusRequest, retrievalSettings }: { focusRequest: FocusRequest | null; retrievalSettings: RetrievalSettings }) {
  const [hosts, setHosts] = useState<InterviewHost[]>([]);
  const [selectedHostId, setSelectedHostId] = useState("");
  const [scope, setScope] = useState("all");
  const [sources, setSources] = useState<IndexedSource[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [history, setHistory] = useState<InterviewSession[]>([]);
  const [interview, setInterview] = useState<InterviewSession | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [accessLog, setAccessLog] = useState<InterviewAccessEntry[]>([]);
  const [showAccess, setShowAccess] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Loading local hosts…");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<{ turn: InterviewTurn; transcript: string } | null>(null);
  const [citationView, setCitationView] = useState<CitationView | null>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [interviewQuery, setInterviewQuery] = useState("");
  const recorder = useRef<AudioCaptureHandle | null>(null);
  const releaseRequested = useRef(false);

  const refreshInterview = async (session: InterviewSession): Promise<void> => {
    try {
      const [nextTurns, nextAccess] = await Promise.all([
        listInterviewTurns(session.id),
        listInterviewAccessLog(session.id),
      ]);
      setInterview(session);
      setTurns(nextTurns);
      setAccessLog(nextAccess);
      setShowAccess(false);
      setMessage("");
      setConfirmingEnd(false);
      const pending = nextTurns.find(
        (turn) => turn.role === "user" && turn.status === "awaiting_transcript",
      );
      setPendingTranscript(
        pending ? { turn: pending, transcript: pending.content || "" } : null,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  useEffect(() => {
    Promise.all([listInterviewHosts(), listIndexedSources(), listInterviews()])
      .then(([nextHosts, nextSources, nextHistory]) => {
        setHosts(nextHosts);
        setSelectedHostId(nextHosts[0]?.id || "");
        setSources(
          nextSources.filter((source) => source.sourceType === "note"),
        );
        setHistory(nextHistory);
        const requested = nextHistory.find(
          (item) => item.id === focusRequest?.recordId,
        );
        const active =
          requested ||
          (focusRequest?.kind === "interview-new"
            ? null
            : nextHistory.find((item) => item.status === "active"));
        if (active) refreshInterview(active);
        setStatus(
          requested
            ? "Opened the selected interview from recent activity."
            : active
              ? "Resumed your active local interview."
              : "Ready. No knowledge is read until you answer.",
        );
      })
      .catch((error) => setStatus(errorMessage(error)));
  }, [focusRequest?.token]);

  const selectedHost = hosts.find((host) => host.id === selectedHostId);
  const startNewInterview = () => {
    if (busy || recording) return;
    setInterview(null);
    setTurns([]);
    setAccessLog([]);
    setPendingTranscript(null);
    setShowAccess(false);
    setMessage("");
    setConfirmingEnd(false);
    setStatus("Choose a host and knowledge scope for a new interview.");
  };
  const togglePath = (path: string) =>
    setSelectedPaths((current) =>
      current.includes(path)
        ? current.filter((item) => item !== path)
        : [...current, path],
    );
  const begin = async () => {
    if (!selectedHost) return;
    setBusy(true);
    try {
      const started = await startInterview({
        hostId: selectedHost.id,
        scope,
        selectedPaths,
      });
      setHistory((current) => [started.interview, ...current]);
      setInterview(started.interview);
      setTurns([started.hostTurn]);
      setAccessLog([]);
      setStatus(
        "Interview started locally. The host has not accessed any notes yet.",
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!message.trim() || !interview || busy) return;
    const content = message;
    setMessage("");
    setBusy(true);
    setStatus("The host is searching only the permitted scope…");
    try {
      const exchange = await sendInterviewTurn({
        interviewId: interview.id,
        message: content,
        retrievalLimit: retrievalSettings.interviewChunkLimit,
      });
      setInterview(exchange.interview);
      setTurns((current) => [...current, exchange.userTurn, exchange.hostTurn]);
      setAccessLog(await listInterviewAccessLog(interview.id));
      const filesUsed = new Set(
        exchange.hostTurn.citations.map((citation) => citation.relativePath),
      ).size;
      setStatus(
        `${exchange.hostTurn.citations.length} passages across ${filesUsed} source file${filesUsed === 1 ? "" : "s"} · ${exchange.hostTurn.analysis}`,
      );
    } catch (error) {
      setMessage(content);
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const stopRecording = () => {
    releaseRequested.current = true;
    recorder.current?.stop();
  };
  const startRecording = async (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!interview || busy || recording || pendingTranscript) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    releaseRequested.current = false;
    setBusy(true);
    setStatus("Opening the microphone for this turn…");
    let pending: InterviewTurn | null = null;
    try {
      const controller = await createAudioCapture({
        onStopped: async (blob) => {
          setRecording(false);
          if (!pending) {
            setBusy(false);
            recorder.current = null;
            return;
          }
          setStatus("Saving original audio locally…");
          try {
            const saved = await saveInterviewTurnAudio(
              interview.id,
              pending.id,
              blob,
            );
            setTurns((current) => [
              ...current.filter((turn) => turn.id !== saved.id),
              saved,
            ]);
            setStatus(
              "Audio saved. Transcribing locally before the host continues…",
            );
            try {
              const exchange = await processInterviewAudioTurn({
                interviewId: interview.id,
                turnId: saved.id,
              });
              setTurns((current) => [
                ...current.filter((turn) => turn.id !== exchange.userTurn.id),
                exchange.userTurn,
                exchange.hostTurn,
              ]);
              setInterview(exchange.interview);
              setPendingTranscript(null);
              setAccessLog(await listInterviewAccessLog(interview.id));
              setStatus(
                `${exchange.hostTurn.citations.length} passages accessed · ${exchange.hostTurn.analysis}`,
              );
            } catch (transcriptionError) {
              setPendingTranscript({ turn: saved, transcript: "" });
              setStatus(
                `Automatic transcription could not finish: ${errorMessage(transcriptionError)}. Your audio is safe; enter the transcript to continue.`,
              );
            }
          } catch (error) {
            setStatus(errorMessage(error));
            await refreshInterview(interview);
          } finally {
            setBusy(false);
            recorder.current = null;
          }
        },
        onError: (error) => {
          setRecording(false);
          setBusy(false);
          recorder.current = null;
          setStatus(errorMessage(error));
        },
      });
      recorder.current = controller;
      const createdTurn = await beginInterviewAudioTurn(interview.id);
      pending = createdTurn;
      setTurns((current) => [...current, createdTurn]);
      await controller.start();
      setRecording(true);
      setBusy(false);
      setStatus("Recording this turn. Release when you are done.");
      if (releaseRequested.current) controller.stop();
    } catch (error) {
      await recorder.current?.abort();
      recorder.current = null;
      setBusy(false);
      setRecording(false);
      setStatus(errorMessage(error));
    }
  };
  const confirmTranscript = async () => {
    if (!interview || !pendingTranscript?.transcript.trim() || busy) return;
    setBusy(true);
    setStatus("Transcript confirmed. The host is preparing one follow-up…");
    try {
      const exchange = await completeInterviewAudioTurn({
        interviewId: interview.id,
        turnId: pendingTranscript.turn.id,
        transcript: pendingTranscript.transcript,
      });
      setTurns((current) => [
        ...current.filter((turn) => turn.id !== exchange.userTurn.id),
        exchange.userTurn,
        exchange.hostTurn,
      ]);
      setInterview(exchange.interview);
      setPendingTranscript(null);
      setAccessLog(await listInterviewAccessLog(interview.id));
      setStatus(
        `${exchange.hostTurn.citations.length} passages accessed · ${exchange.hostTurn.analysis}`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    if (!interview || busy) return;
    setBusy(true);
    try {
      const ended = await endInterview(interview.id);
      setHistory((current) => [
        ended,
        ...current.filter((item) => item.id !== ended.id),
      ]);
      setInterview(ended);
      setConfirmingEnd(false);
      setStatus(
        "Interview finished. Its transcript remains searchable, and you can continue this same thread later.",
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const resumeCurrentInterview = async () => {
    if (!interview || busy || interview.status === "active") return;
    setBusy(true);
    try {
      const resumed = await resumeInterviewSession(interview.id);
      setInterview(resumed);
      setHistory((current) => [
        resumed,
        ...current.filter((item) => item.id !== resumed.id),
      ]);
      setStatus("Interview resumed in the same thread with its full history and knowledge scope.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const inspectCitation = async (citation: Citation) => {
    try {
      setCitationView({
        citation,
        source: await getSourceDocument(citation.relativePath),
      });
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const renameCurrentInterview = async () => {
    if (!interview || busy) return;
    const title = window.prompt("Rename this interview", interview.title);
    if (title == null || title.trim() === interview.title) return;
    setBusy(true);
    try {
      const renamed = await renameInterviewSession(interview.id, title);
      setInterview(renamed);
      setHistory((items) => items.map((item) => item.id === renamed.id ? renamed : item));
      setStatus("Interview title saved to its readable session files.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const exportCurrentInterview = async () => {
    if (!interview || busy) return;
    setBusy(true);
    try {
      const path = await exportInterviewSession(interview.id);
      setStatus(`Markdown export written to ${path}.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const trashCurrentInterview = async () => {
    if (!interview || busy) return;
    if (!window.confirm(`Move “${interview.title}” to the macOS Trash?\n\nIts transcript, session metadata, access log, and saved voice audio leave this brain together. The session folder can be recovered from Trash.`)) return;
    setBusy(true);
    try {
      await trashInterviewSession(interview.id);
      setHistory((items) => items.filter((item) => item.id !== interview.id));
      setInterview(null);
      setTurns([]);
      setAccessLog([]);
      setPendingTranscript(null);
      setStatus("Interview moved to macOS Trash.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const libraryPane = (
    <InterviewLibraryPane
      interviews={history}
      selectedId={interview?.id || null}
      query={interviewQuery}
      disabled={busy || recording}
      onQueryChange={setInterviewQuery}
      onNew={startNewInterview}
      onSelect={(item) => void refreshInterview(item)}
    />
  );

  if (interview && interview.status !== "active")
    return (
      <CompletedInterview
        library={libraryPane}
        interview={interview}
        turns={turns}
        accessLog={accessLog}
        onBack={() => {
          setInterview(null);
          setTurns([]);
          setAccessLog([]);
          setStatus("Choose a host or resume an active interview.");
        }}
        onCitation={inspectCitation}
        citationView={citationView}
        onCloseCitation={() => setCitationView(null)}
        onRename={renameCurrentInterview}
        onExport={exportCurrentInterview}
        onTrash={trashCurrentInterview}
        onResume={resumeCurrentInterview}
        busy={busy}
      />
    );

  if (interview)
    return (
      <main className="interview-workspace">
        {libraryPane}
        <section className="interview-conversation">
          <PageHeader
            eyebrow={`${interview.hostName} · ${interview.scope === "all" ? "Whole brain" : interview.scope === "selected" ? selectedNotesLabel(interview.selectedPaths.length) : "This session"}`}
            title={interview.title}
            action={
              <div className="interview-header-actions">
                <button className="secondary-button" onClick={renameCurrentInterview} disabled={busy}>
                  <NotePencil /> Rename
                </button>
                <button className="secondary-button" onClick={exportCurrentInterview} disabled={busy}>
                  <FileText /> Export
                </button>
                <button className="secondary-button" onClick={trashCurrentInterview} disabled={busy}>
                  <Trash /> Trash
                </button>
                <button
                  className={`secondary-button ${showAccess ? "active" : ""}`}
                  onClick={() => setShowAccess(!showAccess)}
                  disabled={busy}
                >
                  <ShieldCheck /> Access log <span>{accessLog.length}</span>
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setConfirmingEnd(true)}
                  disabled={busy}
                >
                  <Archive /> Finish
                </button>
              </div>
            }
          />
          <div className="interview-policy">
            <ShieldCheck />
            <span>
              <strong>Read-only, visible retrieval</strong>
              <small>
                {interview.provider} · {interview.model} · Every accessed
                passage appears in the log.
              </small>
            </span>
          </div>
          <div className="interview-thread">
            {turns.map((turn) =>
              turn.role === "user" ? (
                <article
                  className={`interview-turn user ${turn.status !== "complete" ? "pending" : ""}`}
                  key={turn.id}
                >
                  <div>
                    <small>
                      You {turn.audioPath ? "· voice turn" : "· typed turn"}
                    </small>
                    <p>
                      {turn.content ||
                        (turn.status === "recording"
                          ? "Recording…"
                          : "Awaiting confirmed transcript…")}
                    </p>
                  </div>
                </article>
              ) : (
                <article className="interview-turn host" key={turn.id}>
                  <span className="host-avatar">
                    <Microphone />
                  </span>
                  <div>
                    <small>
                      {interview.hostName} · {turn.stage}
                    </small>
                    <p>{turn.content}</p>
                    {turn.citations.length ? (
                      <ConversationCitations citations={turn.citations} onOpen={inspectCitation} />
                    ) : null}
                    <em>{turn.analysis}</em>
                  </div>
                </article>
              ),
            )}
          </div>
          {pendingTranscript ? (
            <section className="transcript-confirm">
              <div>
                <Waveform />
                <span>
                  <strong>Confirm this voice turn</strong>
                  <small>
                    Your raw audio is saved. Automatic transcription is not
                    active yet, so enter or paste the transcript without
                    rewriting your wording.
                  </small>
                </span>
              </div>
              <textarea
                autoFocus
                value={pendingTranscript.transcript}
                onChange={(event) =>
                  setPendingTranscript({
                    ...pendingTranscript,
                    transcript: event.target.value,
                  })
                }
                placeholder="Enter the spoken words…"
              />
              <div>
                <button
                  className="primary-button"
                  onClick={confirmTranscript}
                  disabled={busy || !pendingTranscript.transcript.trim()}
                >
                  <Check /> Confirm & continue
                </button>
              </div>
            </section>
          ) : (
            <ConversationComposer
              className="interview-composer"
              value={message}
              onChange={setMessage}
              onSubmit={() => void send()}
              placeholder="Answer the host…"
              disabled={busy}
              controls={<>
                <button
                  className={`voice-turn-button ${recording ? "recording" : ""}`}
                  onPointerDown={startRecording}
                  onPointerUp={stopRecording}
                  onPointerCancel={stopRecording}
                  onPointerLeave={() => recording && stopRecording()}
                  disabled={busy}
                >
                  <Microphone weight="fill" />{" "}
                  {recording ? "Release to finish" : "Hold to answer"}
                </button>
              <span className="model-button">
                <Robot /> {interview.provider} · {interview.model}
              </span>
              </>}
            />
          )}
          <div className="chat-status" role="status">
            <Info /> {status}
          </div>
        </section>
        {showAccess ? (
          <aside className="interview-access-pane">
            <header>
              <div>
                <small>Knowledge access</small>
                <h2>Access log</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowAccess(false)}
              >
                <X />
              </button>
            </header>
            <div className="access-scope">
              <ShieldCheck />
              <span>
                <strong>
                  {interview.scope === "all"
                    ? "Whole brain"
                    : interview.scope === "selected"
                      ? selectedNotesLabel(interview.selectedPaths.length)
                      : "This session"}
                </strong>
                <small>The host cannot read outside this scope.</small>
              </span>
            </div>
            <div className="access-entries">
              {accessLog.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => inspectCitation({ ...entry, number: 1 })}
                >
                  <FileText />
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{entry.relativePath}</small>
                    <blockquote>{entry.quote}</blockquote>
                  </span>
                </button>
              ))}
              {accessLog.length === 0 ? (
                <div className="access-empty">
                  <ShieldCheck />
                  <p>No notes accessed yet.</p>
                  <small>
                    The opening question uses only the host instructions.
                  </small>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
        {citationView ? (
          <div className="modal-backdrop">
            <SourceInspector
              result={{
                sourceType: "citation",
                quote: citationView.citation.quote,
              }}
              source={citationView.source}
              query=""
              onClose={() => setCitationView(null)}
            />
          </div>
        ) : null}
        {confirmingEnd ? (
          <InterviewEndConfirm
            interview={interview}
            working={busy}
            onCancel={() => setConfirmingEnd(false)}
            onConfirm={finish}
          />
        ) : null}
      </main>
    );

  return (
    <main className="interview-workspace interview-library-workspace">
      {libraryPane}
      <section className="interview-setup-pane">
      <PageHeader
        eyebrow="AI-guided conversations"
        title="New interview"
        action={
          <button
            className="primary-button"
            onClick={() => setEditorOpen(true)}
          >
            <Plus /> New host
          </button>
        }
      />
      <p className="page-intro">
        Choose how the host behaves, then separately decide what it may read.
        Hosts are editable Markdown files; interviews and audio stay local.
      </p>
      <div className="interview-section-heading">
        <div>
          <span>1</span>
          <div>
            <h2>Choose a host</h2>
            <p>Personality, pacing, stages, and questioning style</p>
          </div>
        </div>
        <small>
          {hosts.length} Markdown host{hosts.length === 1 ? "" : "s"}
        </small>
      </div>
      <section className="host-grid">
        {hosts.map((host) => (
          <button
            className={`host-row ${selectedHostId === host.id ? "selected" : ""}`}
            key={host.id}
            onClick={() => setSelectedHostId(host.id)}
          >
            <span className="host-avatar">
              <Microphone />
            </span>
            <span>
              <strong>{host.name}</strong>
              <small>{host.description}</small>
              <em>
                {host.traits.join(" · ")} · {host.stages.length} stage
                {host.stages.length === 1 ? "" : "s"}
              </em>
            </span>
            {selectedHostId === host.id ? <Check /> : null}
          </button>
        ))}
      </section>
      <div className="interview-section-heading">
        <div>
          <span>2</span>
          <div>
            <h2>Set knowledge access</h2>
            <p>Read-only scope for this interview—not part of the host</p>
          </div>
        </div>
      </div>
      <section className="interview-setup">
        <div className="scope-picker">
          <label>Knowledge scope</label>
          <div>
            {[
              ["session", "This session"],
              ["selected", "Selected notes"],
              ["all", "Whole brain"],
            ].map(([id, label]) => (
              <button
                className={scope === id ? "active" : ""}
                key={id}
                onClick={() => setScope(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <small>The access log will show every passage the host reads.</small>
          {scope === "selected" ? (
            <div className="interview-source-picker">
              {sources.map((source) => (
                <label key={source.relativePath}>
                  <input
                    type="checkbox"
                    checked={selectedPaths.includes(source.relativePath)}
                    onChange={() => togglePath(source.relativePath)}
                  />
                  <span>
                    <strong>{source.title}</strong>
                    <small>{source.relativePath}</small>
                  </span>
                </label>
              ))}
              {sources.length === 0 ? (
                <p>No indexed notes are available yet.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="host-summary">
          <span className="host-avatar">
            <Microphone />
          </span>
          <div>
            <small>Selected host</small>
            <strong>{selectedHost?.name || "Loading hosts…"}</strong>
            <span>
              {scope === "all"
                ? "Whole brain"
                : scope === "selected"
                  ? selectedNotesLabel(selectedPaths.length)
                  : "New session only"}
            </span>
          </div>
        </div>
        <button
          className="primary-button"
          onClick={begin}
          disabled={
            busy ||
            !selectedHost ||
            (scope === "selected" && selectedPaths.length === 0)
          }
        >
          <Microphone /> {busy ? "Starting…" : "Start interview"}
        </button>
      </section>
      <p className="interview-setup-status" role="status">
        {status}
      </p>
      {editorOpen ? (
        <HostEditor
          onClose={() => setEditorOpen(false)}
          onSaved={(host) => {
            setHosts((current) => [
              host,
              ...current.filter((item) => item.id !== host.id),
            ]);
            setSelectedHostId(host.id);
            setEditorOpen(false);
            setStatus(`${host.name} saved as ${host.relativePath}.`);
          }}
        />
      ) : null}
      </section>
    </main>
  );
}

function CompletedInterview({
  library,
  interview,
  turns,
  accessLog,
  onBack,
  onCitation,
  citationView,
  onCloseCitation,
  onRename,
  onExport,
  onTrash,
  onResume,
  busy,
}: {
  library: ReactNode;
  interview: InterviewSession;
  turns: InterviewTurn[];
  accessLog: InterviewAccessEntry[];
  onBack: () => void;
  onCitation: (citation: Citation) => void;
  citationView: CitationView | null;
  onCloseCitation: () => void;
  onRename: () => void;
  onExport: () => void;
  onTrash: () => void;
  onResume: () => void;
  busy: boolean;
}) {
  return (
    <main className="interview-workspace">
      {library}
      <section className="interview-conversation">
        <PageHeader
          eyebrow={`${interview.hostName} · completed`}
          title={interview.title}
          action={
            <div className="interview-header-actions">
              <button className="secondary-button" onClick={onRename} disabled={busy}><NotePencil /> Rename</button>
              <button className="secondary-button" onClick={onExport} disabled={busy}><FileText /> Export</button>
              <button className="secondary-button" onClick={onTrash} disabled={busy}><Trash /> Trash</button>
              <button className="primary-button" onClick={onResume} disabled={busy}>
                {busy ? <CircleNotch className="spin" /> : <ArrowRight />} Continue interview
              </button>
              <button className="secondary-button" onClick={onBack} disabled={busy}>
                <Plus /> New
              </button>
            </div>
          }
        />
        <div className="interview-complete">
          <Checks />
          <span>
            <strong>This interview is complete</strong>
            <small>
              Its transcript is searchable and remains the source of truth in{" "}
              {interview.relativeFolder}. Continue whenever you want.
            </small>
          </span>
        </div>
        <div className="interview-policy">
          <ShieldCheck />
          <span>
            <strong>
              {accessLog.length} recorded knowledge access
              {accessLog.length === 1 ? "" : "es"}
            </strong>
            <small>
              {interview.provider} · {interview.model} · reopen this same
              conversation to add more turns.
            </small>
          </span>
        </div>
        <div className="interview-thread">
          {turns.map((turn) =>
            turn.role === "user" ? (
              <article className="interview-turn user" key={turn.id}>
                <div>
                  <small>
                    You {turn.audioPath ? "· voice turn" : "· typed turn"}
                  </small>
                  <p>{turn.content || "[No transcript]"}</p>
                </div>
              </article>
            ) : (
              <article className="interview-turn host" key={turn.id}>
                <span className="host-avatar">
                  <Microphone />
                </span>
                <div>
                  <small>
                    {interview.hostName} · {turn.stage}
                  </small>
                  <p>{turn.content}</p>
                  {turn.citations.length ? (
                    <div className="citation-list">
                      {turn.citations.map((citation) => (
                        <button
                          className="citation"
                          key={citation.passageId}
                          onClick={() => onCitation(citation)}
                        >
                          <FileText /> {citation.title}{" "}
                          <span>{citation.number}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ),
          )}
        </div>
      </section>
      {citationView ? (
        <div className="modal-backdrop">
          <SourceInspector
            result={{
              sourceType: "citation",
              quote: citationView.citation.quote,
            }}
            source={citationView.source}
            query=""
            onClose={onCloseCitation}
          />
        </div>
      ) : null}
    </main>
  );
}

function HostEditor({ onClose, onSaved }: { onClose: () => void; onSaved: (host: InterviewHost) => void }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    traits: "curious, thoughtful",
    stages: "context, evidence, reflection",
    instructions:
      "Ask one clear question at a time. Preserve the user’s wording, invite concrete examples, and do not use knowledge outside the selected scope.",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: event.target.value });
  const save = async () => {
    setSaving(true);
    try {
      onSaved(
        await saveInterviewHost({
          name: form.name,
          description: form.description,
          traits: form.traits
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          stages: form.stages
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          instructions: form.instructions,
        }),
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
      setSaving(false);
    }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !saving) onClose();
      }}
    >
      <section
        className="host-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create interview host"
      >
        <header>
          <div>
            <small>Markdown behavior preset</small>
            <h2>Create a host</h2>
            <p>
              The host controls questions and analysis. Knowledge access is
              chosen separately for each interview.
            </p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close host editor"
          >
            <X />
          </button>
        </header>
        <div className="host-editor-fields">
          <label>
            <span>Name</span>
            <input
              autoFocus
              value={form.name}
              onChange={update("name")}
              placeholder="Gentle skeptic"
            />
          </label>
          <label>
            <span>Description</span>
            <input
              value={form.description}
              onChange={update("description")}
              placeholder="How this host should feel"
            />
          </label>
          <div>
            <label>
              <span>
                Traits <small>comma-separated</small>
              </span>
              <input value={form.traits} onChange={update("traits")} />
            </label>
            <label>
              <span>
                Stages <small>comma-separated</small>
              </span>
              <input value={form.stages} onChange={update("stages")} />
            </label>
          </div>
          <label>
            <span>Instructions</span>
            <textarea
              value={form.instructions}
              onChange={update("instructions")}
              rows={7}
            />
          </label>
          <div className="host-file-preview">
            <FileText />
            <span>
              <strong>Saved as readable Markdown</strong>
              <small>
                hosts/
                {form.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "") || "your-host"}
                .md
              </small>
            </span>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <footer>
          <button
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            onClick={save}
            disabled={saving || !form.name.trim() || !form.instructions.trim()}
          >
            <Check /> {saving ? "Saving…" : "Save host"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function TagsPage() {
  const [overview, setOverview] = useState<TagsOverview>({ tags: [], sources: [] });
  const [selectedTag, setSelectedTag] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [sourceView, setSourceView] = useState<SourceView | null>(null);
  const load = async (message = "") => {
    setLoading(true);
    if (message) setStatus(message);
    try {
      const result = await getTagsOverview();
      setOverview(result);
      setSelectedTag((current) =>
        result.tags.some((tag) => tag.name === current)
          ? current
          : result.tags[0]?.name || "",
      );
      setStatus(
        message
          ? `${result.tags.length} tag${result.tags.length === 1 ? "" : "s"} refreshed from local files.`
          : "",
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const visibleTags = overview.tags.filter((tag) =>
    tag.name.includes(query.trim().toLowerCase()),
  );
  const matches = overview.sources.filter(
    (source) =>
      !selectedTag ||
      source.tags.map((tag) => tag.toLowerCase()).includes(selectedTag),
  );
  const inspect = async (source: TaggedSource) => {
    try {
      const document = await getSourceDocument(source.relativePath);
      setSourceView({
        result: {
          sourceType: source.sourceType,
          title: source.title,
          relativePath: source.relativePath,
          quote: "",
        },
        source: document,
      });
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  return (
    <main className="feature-page tags-page">
      <PageHeader
        eyebrow="Derived from real captures and Markdown notes"
        title="Tags"
        action={
          <button
            className="secondary-button"
            onClick={() => load("Refreshing tags from local files…")}
            disabled={loading}
          >
            {loading ? <CircleNotch className="spin" /> : <ArrowClockwise />}{" "}
            Refresh
          </button>
        }
      />
      <label className="tag-search">
        <MagnifyingGlass />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tags…"
        />
      </label>
      {status ? (
        <p className="note-status" role="status">
          {status}
        </p>
      ) : null}
      <div className="tag-browser">
        {visibleTags.map((tag) => (
          <button
            className={selectedTag === tag.name ? "active" : ""}
            onClick={() => setSelectedTag(tag.name)}
            key={tag.name}
          >
            <Hash />
            <span>{tag.name}</span>
            <small>{tag.count}</small>
          </button>
        ))}
        {loading ? (
          <div className="tag-empty">
            <CircleNotch className="spin" /> Loading tags…
          </div>
        ) : overview.tags.length === 0 ? (
          <div className="tag-empty">
            <Tag /> No tags yet. Finish a capture or tag a note.
          </div>
        ) : visibleTags.length === 0 ? (
          <div className="tag-empty">
            <MagnifyingGlass /> No matching tags.
          </div>
        ) : null}
      </div>
      <section className="table-section">
        <div className="table-title">
          <h2>
            {selectedTag ? `Sources tagged #${selectedTag}` : "Tagged sources"}
          </h2>
          <span>
            {matches.length} result{matches.length === 1 ? "" : "s"}
          </span>
        </div>
        {matches.map((source) => (
          <button
            className="file-row"
            key={source.id}
            onClick={() => inspect(source)}
          >
            <span className="file-icon">
              {source.sourceType === "capture" ? <Waveform /> : <FileText />}
            </span>
            <span>
              <strong>{source.title}</strong>
              <small>
                {source.sourceType === "capture"
                  ? "Capture transcript"
                  : `Atomic note · ${source.sourceCount} source${source.sourceCount === 1 ? "" : "s"}`}{" "}
                · {relativeTime(source.updatedAt)}
              </small>
            </span>
            <ArrowRight />
          </button>
        ))}
        {!loading && selectedTag && matches.length === 0 ? (
          <div className="empty-state">
            <Tag />
            <h2>No sources use this tag</h2>
          </div>
        ) : null}
      </section>
      {sourceView ? (
        <SourceInspector
          result={sourceView.result}
          source={sourceView.source}
          query=""
          onClose={() => setSourceView(null)}
        />
      ) : null}
    </main>
  );
}

const settingTabs = [
  { id: "display", label: "Display", icon: Sun },
  { id: "retrieval", label: "Retrieval & research", icon: MagnifyingGlass },
  { id: "location", label: "Brain location", icon: Folder },
  { id: "models", label: "Models", icon: Database },
  { id: "providers", label: "Connections", icon: Link },
  { id: "transcription", label: "Transcription", icon: Waveform },
  { id: "privacy", label: "Privacy & permissions", icon: ShieldCheck },
  { id: "storage", label: "Audio & storage", icon: HardDrives },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "sync", label: "Sync & backup", icon: CloudArrowUp },
];

interface SettingsPageProps extends ThemeState {
  bootstrap: BootstrapState;
  onBootstrap: (state: BootstrapState) => void;
  retrievalSettings: RetrievalSettings;
  setRetrievalSettings: Dispatch<SetStateAction<RetrievalSettings>>;
}

function SettingsPage({
  preference,
  setPreference,
  resolved,
  density,
  setDensity,
  reduceMotion,
  setReduceMotion,
  bootstrap,
  onBootstrap,
  retrievalSettings,
  setRetrievalSettings,
}: SettingsPageProps) {
  const [active, setActive] = useState("display");
  return (
    <main className="settings-workspace">
      <aside className="settings-nav">
        <div>
          <small>Configuration</small>
          <h1>Settings</h1>
        </div>
        <nav aria-label="Settings sections">
          {settingTabs.map(({ id, label, icon: Icon }) => (
            <button
              className={active === id ? "active" : ""}
              key={id}
              onClick={() => setActive(id)}
            >
              <Icon />
              <span>{label}</span>
              <ArrowRight />
            </button>
          ))}
        </nav>
      </aside>
      <section className="settings-detail">
        {active === "display" ? (
          <DisplaySettings
            preference={preference}
            setPreference={setPreference}
            resolved={resolved}
            density={density}
            setDensity={setDensity}
            reduceMotion={reduceMotion}
            setReduceMotion={setReduceMotion}
          />
        ) : null}
        {active === "retrieval" ? (
          <RetrievalSettings
            settings={retrievalSettings}
            onChange={setRetrievalSettings}
          />
        ) : null}
        {active === "location" ? (
          <LocationSettings bootstrap={bootstrap} onBootstrap={onBootstrap} />
        ) : null}
        {active === "models" ? <ModelSettings /> : null}
        {active === "providers" ? <ProviderSettings /> : null}
        {active === "transcription" ? (
          <TranscriptionSettings
            bootstrap={bootstrap}
            onBootstrap={onBootstrap}
          />
        ) : null}
        {active === "privacy" ? (
          <PrivacySettings bootstrap={bootstrap} onBootstrap={onBootstrap} />
        ) : null}
        {active === "storage" ? <StorageSettings /> : null}
        {active === "shortcuts" ? <ShortcutSettings /> : null}
        {active === "sync" ? <SyncSettings /> : null}
      </section>
    </main>
  );
}

function SettingsTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="settings-title">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      <span>{copy}</span>
    </div>
  );
}
function DisplaySettings({
  preference,
  setPreference,
  resolved,
  density,
  setDensity,
  reduceMotion,
  setReduceMotion,
}: ThemeState) {
  return (
    <>
      <SettingsTitle
        eyebrow="Appearance"
        title="Display"
        copy="These preferences are saved on this Mac and applied on every launch."
      />
      <section className="settings-card">
        <h3>Theme</h3>
        <p>Follow macOS automatically or choose a fixed appearance.</p>
        <div className="theme-picker">
          {themeOptions.map(({ id, label, icon: Icon }) => (
            <button
              className={preference === id ? "active" : ""}
              key={id}
              onClick={() => setPreference(id)}
            >
              <Icon />
              <span>{label}</span>
              {preference === id ? <Check weight="bold" /> : null}
            </button>
          ))}
        </div>
        <small>Currently displaying {resolved} mode.</small>
      </section>
      <section className="settings-card">
        <h3>Interface density</h3>
        <div className="segmented">
          {(["compact", "comfortable", "spacious"] as const).map((option) => (
            <button
              className={density === option ? "active" : ""}
              key={option}
              onClick={() => setDensity(option)}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </section>
      <div className="setting-control-row">
        <div>
          <strong>Reduce motion</strong>
          <p>Disable nonessential transitions and smooth scrolling.</p>
        </div>
        <button
          className={`toggle ${reduceMotion ? "on" : ""}`}
          onClick={() => setReduceMotion(!reduceMotion)}
          aria-label={`Reduce motion: ${reduceMotion ? "on" : "off"}`}
        >
          <span />
        </button>
      </div>
    </>
  );
}
function RetrievalSettings({ settings, onChange }: { settings: RetrievalSettings; onChange: Dispatch<SetStateAction<RetrievalSettings>> }) {
  const update = <K extends keyof RetrievalSettings>(field: K, value: RetrievalSettings[K]) =>
    onChange((current) => ({ ...current, [field]: value }));
  const budgetRow = (field: "chatChunkLimit" | "interviewChunkLimit" | "studioChunkLimit", label: string, copy: string, min: number, max: number): ReactNode => (
    <div className="setting-control-row">
      <div>
        <strong>{label}</strong>
        <p>{copy}</p>
      </div>
      <label className="number-setting">
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step="1"
          value={settings[field]}
          onChange={(event) =>
            update(
              field,
              Math.max(min, Math.min(max, Number(event.target.value) || min)),
            )
          }
        />
        <span>chunks</span>
      </label>
    </div>
  );
  return (
    <>
      <SettingsTitle
        eyebrow="Knowledge retrieval"
        title="Retrieval & research"
        copy="Control how broadly grounded features search your brain before ranking, questioning, or drafting."
      />
      <section className="settings-card retrieval-settings-card">
        <div className="setting-control-row">
          <div>
            <strong>Maximum search results</strong>
            <p>Used by Search and the Home knowledge search.</p>
          </div>
          <label className="number-setting">
            <input
              aria-label="Maximum search results"
              type="number"
              min="5"
              max="100"
              step="5"
              value={settings.searchResultLimit}
              onChange={(event) =>
                update(
                  "searchResultLimit",
                  Math.max(5, Math.min(100, Number(event.target.value) || 5)),
                )
              }
            />
            <span>passages</span>
          </label>
        </div>
        {budgetRow(
          "chatChunkLimit",
          "Chat evidence budget",
          "Passages gathered and diversified across source files for each answer.",
          3,
          50,
        )}
        {budgetRow(
          "interviewChunkLimit",
          "Interview evidence budget",
          "Prior knowledge considered before the host asks its next question.",
          3,
          30,
        )}
        {budgetRow(
          "studioChunkLimit",
          "Studio research budget",
          "Passages gathered across the project scope for every workflow stage.",
          6,
          50,
        )}
      </section>
      <section className="settings-card">
        <h3>Default answer depth</h3>
        <p>You can change this per message in the Chat composer.</p>
        <div className="answer-depth-options">
          {[
            [
              "concise",
              "Concise",
              "Prioritize the strongest evidence and answer briefly.",
            ],
            [
              "standard",
              "Standard",
              "Synthesize a useful answer from the retrieved context.",
            ],
            [
              "deep",
              "Deep research",
              "Sweep all retrieved evidence for themes, tensions, gaps, and uncertainty.",
            ],
          ].map(([id, label, copy]) => (
            <button
              className={settings.answerMode === id ? "active" : ""}
              key={id}
              onClick={() => update("answerMode", id)}
            >
              <span>
                <strong>{label}</strong>
                <small>{copy}</small>
              </span>
              {settings.answerMode === id ? <Check /> : null}
            </button>
          ))}
        </div>
      </section>
      <div className="settings-notice">
        <ShieldCheck />
        <span>
          <strong>Broad evidence, strict scope</strong>
          <small>
            Research retrieves a larger candidate pool, removes repeated
            passages, and favors coverage across source files. It never reads
            outside the visible scope, browses the web, or silently enables
            general model knowledge.
          </small>
        </span>
      </div>
    </>
  );
}
function LocationSettings({ bootstrap, onBootstrap }: { bootstrap: BootstrapState; onBootstrap: (state: BootstrapState) => void }) {
  const path = bootstrap.activeBrain;
  const [status, setStatus] = useState(
    "Search notices external Markdown changes and refreshes its rebuildable index automatically.",
  );
  const changeFolder = async () => {
    try {
      const selected = await chooseBrainFolder();
      if (selected) {
        onBootstrap(await configureBrainFolder(selected));
        setStatus(
          "Brain folder changed. Existing registered folders remain available in configuration.",
        );
      }
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  return (
    <>
      <SettingsTitle
        eyebrow="Filesystem"
        title="Brain location"
        copy="Your brain is an ordinary folder that remains readable by other tools."
      />
      <section className="settings-card brain-folder-card">
        <span className="large-setting-icon">
          <Folder />
        </span>
        <div>
          <strong>
            {path?.split("/").filter(Boolean).pop() || "No brain selected"}
          </strong>
          <p title={path || undefined}>{path}</p>
          <small>
            Active folder · Markdown source of truth · database metadata is
            rebuildable
          </small>
        </div>
        <button
          className="secondary-button"
          onClick={() =>
            revealBrainFolder().catch((error) =>
              setStatus(errorMessage(error)),
            )
          }
        >
          Reveal in Finder
        </button>
        <button className="secondary-button" onClick={changeFolder}>
          Change folder
        </button>
      </section>
      <div className="settings-notice">
        <Info />
        <span>
          <strong>External file changes are supported</strong>
          <small>
            The local search index compares file modification time and size
            before queries. Safe automatic link repair after arbitrary renames
            is not implemented yet.
          </small>
        </span>
      </div>
      <p className="sync-status" role="status">
        {status}
      </p>
    </>
  );
}
interface WorkflowModel {
  id: string;
  label: string;
  copy: string;
  requiredCapability?: string;
}

const workflowModels: WorkflowModel[] = [
  {
    id: "general",
    label: "General default",
    copy: "Fallback preference for future model-enabled workflows.",
  },
  {
    id: "chat",
    label: "Chat",
    copy: "Cited answers over the selected knowledge scope.",
  },
  {
    id: "interview",
    label: "Interviews",
    copy: "Host questions and analysis.",
  },
  {
    id: "studio",
    label: "Studio",
    copy: "Long-running content workflow stages.",
  },
  {
    id: "transcript",
    label: "Transcript cleanup",
    copy: "Optional user-triggered cleanup drafts. Canonical wording changes only after review and save.",
    requiredCapability: "text-generation",
  },
  {
    id: "vision",
    label: "Image sources",
    copy: "Transcribe photos, scans, screenshots, and whiteboards into searchable Markdown.",
    requiredCapability: "image-understanding",
  },
];

function providerStatusLabel(status: string): string {
  return (
    ({
      "live-tested": "Live tested",
      "test-failed": "Test failed",
      authenticated: "Authenticated",
      discovered: "Discovered",
      configured: "Configured",
      disabled: "Disabled",
      "not-installed": "Not installed",
      "not-running": "Not running",
      "needs-consent": "Needs consent",
      "needs-credential": "Needs key",
      error: "Error",
    } as Record<string, string>)[status] || status
  );
}

const providerDiagnosticInput = [
  "System: Return a short plain-text diagnostic response. Do not use tools or access files.",
  "User: Reply with exactly: Burrowise provider test passed",
].join("\n\n");

interface ConnectionDiagnosticReceipt {
  outcome: "success" | "failed";
  modelId: string;
  input: string;
  output: string;
  message: string;
  testedAt: string;
}

function diagnosticTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
}

function ModelSettings() {
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ModelSelection>>({});
  const [status, setStatus] = useState("Loading model preferences…");
  const [busy, setBusy] = useState("");
  const load = (refresh = false) =>
    getGenerationProviderCatalog(refresh)
      .then((next) => {
        setCatalog(next);
        setStatus(
          refresh
            ? "Model discovery refreshed. Only live generation tests earn the Live tested label."
            : "Preferences are saved locally; provider credentials remain in macOS Keychain.",
        );
        return next;
      })
      .catch((error) => setStatus(errorMessage(error)));
  useEffect(() => {
    load(false);
  }, []);
  if (!catalog)
    return (
      <>
        <SettingsTitle
          eyebrow="Generation routing"
          title="Models"
          copy="Choose an explicit model for each workflow."
        />
        <div className="settings-notice">
          <CircleNotch className="spin" />
          <span>
            <strong>Loading model catalog</strong>
            <small>{status}</small>
          </span>
        </div>
      </>
    );
  const enabled = catalog.providers.filter(
    (provider) =>
      provider.enabled &&
      !["needs-consent", "needs-credential", "not-installed"].includes(
        provider.status,
      ),
  );
  const providersFor = (workflow: WorkflowModel): GenerationProviderState[] => {
    const capability = workflow.requiredCapability;
    return capability
      ? enabled.filter((provider) => provider.capabilities.includes(capability))
      : enabled;
  };
  const draftFor = (workflow: WorkflowModel): ModelSelection => {
    const options = providersFor(workflow);
    return (
      drafts[workflow.id] ||
      catalog.preferredModels[workflow.id] || {
        providerId: options[0]?.id || "",
        modelId: options[0]?.defaultModelId || options[0]?.models[0]?.id || "",
      }
    );
  };
  const changeProvider = (workflow: WorkflowModel, providerId: string) => {
    const provider = providersFor(workflow).find(
      (item) => item.id === providerId,
    );
    setDrafts((current) => ({
      ...current,
      [workflow.id]: {
        providerId,
        modelId: provider?.defaultModelId || provider?.models[0]?.id || "default",
      },
    }));
  };
  const save = async (workflow: WorkflowModel) => {
    const draft = draftFor(workflow);
    setBusy(workflow.id);
    try {
      setCatalog(
        await setPreferredModel({ capability: workflow.id, ...draft }),
      );
      setStatus(
        `${workflow.label} now uses ${draft.providerId} · ${draft.modelId}. Existing messages keep their original provider snapshot.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy("");
    }
  };
  const favorite = async (selection: ModelSelection, value: boolean) => {
    setBusy(`favorite:${selection.providerId}:${selection.modelId}`);
    try {
      setCatalog(await setFavoriteModel({ ...selection, favorite: value }));
      setStatus(
        value ? "Model added to favorites." : "Model removed from favorites.",
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <SettingsTitle
        eyebrow="Generation routing"
        title="Models"
        copy="Select discovered or manually entered model IDs. A choice is never replaced by a cloud fallback."
      />
      <div className="settings-notice">
        <ShieldCheck />
        <span>
          <strong>Explicit routing</strong>
          <small>
            New work uses these defaults. Every chat response, interview, Studio
            artifact, and image transcription records the provider and model
            actually used.
          </small>
        </span>
        <button className="secondary-button" onClick={() => load(true)}>
          <ArrowClockwise /> Discover
        </button>
      </div>
      <section className="model-workflows">
        {workflowModels.map((workflow) => {
          const options = providersFor(workflow);
          const draft = draftFor(workflow);
          const provider = options.find((item) => item.id === draft.providerId);
          const favoriteSelected = catalog.favoriteModels.some(
            (item) =>
              item.providerId === draft.providerId &&
              item.modelId === draft.modelId,
          );
          return (
            <article className="model-workflow" key={workflow.id}>
              <div>
                <strong>{workflow.label}</strong>
                <p>{workflow.copy}</p>
              </div>
              <label>
                <span>Provider</span>
                <select
                  value={draft.providerId}
                  onChange={(event) =>
                    changeProvider(workflow, event.target.value)
                  }
                  disabled={!options.length}
                >
                  {options.length ? (
                    options.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.label} · {providerStatusLabel(item.status)}
                      </option>
                    ))
                  ) : (
                    <option value="">No image-capable provider enabled</option>
                  )}
                </select>
              </label>
              <label>
                <span>Model ID</span>
                <input
                  list={`models-${workflow.id}`}
                  value={draft.modelId}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [workflow.id]: { ...draft, modelId: event.target.value },
                    }))
                  }
                  placeholder="Enter or choose a model ID"
                  disabled={!options.length}
                />
                <datalist id={`models-${workflow.id}`}>
                  {(provider?.models || []).map((model) => (
                    <option value={model.id} key={model.id}>
                      {model.label}
                    </option>
                  ))}
                </datalist>
              </label>
              <div className="model-actions">
                <button
                  className={`secondary-button ${favoriteSelected ? "active" : ""}`}
                  disabled={!draft.modelId || Boolean(busy)}
                  onClick={() => favorite(draft, !favoriteSelected)}
                >
                  {favoriteSelected ? "★ Favorite" : "☆ Favorite"}
                </button>
                <button
                  className="primary-button"
                  disabled={!draft.providerId || !draft.modelId.trim() || Boolean(busy)}
                  onClick={() => save(workflow)}
                >
                  {busy === workflow.id ? (
                    <CircleNotch className="spin" />
                  ) : (
                    <Check />
                  )}{" "}
                  Save
                </button>
              </div>
            </article>
          );
        })}
      </section>
      {catalog.favoriteModels.length ? (
        <section className="settings-card">
          <h3>Favorite models</h3>
          <div className="favorite-models">
            {catalog.favoriteModels.map((model) => (
              <button
                key={`${model.providerId}:${model.modelId}`}
                onClick={() => favorite(model, false)}
              >
                ★ {model.providerId} · {model.modelId} <X />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <p className="sync-status" role="status">
        {status}
      </p>
    </>
  );
}

function ProviderSettings() {
  interface ConnectionDraft {
    displayName: string;
    enabled: boolean;
    baseUrl: string;
    executablePath: string;
    cloudConfirmed: boolean;
    apiKey: string;
    testModel: string;
  }
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [costs, setCosts] = useState<ProviderCostSummary | null>(null);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("Loading connections…");
  const [editor, setEditor] = useState<{ mode: "add" | "edit"; providerId: string } | null>(null);
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [diagnostics, setDiagnostics] = useState<Record<string, ConnectionDiagnosticReceipt>>({});
  const editorRef = useRef<HTMLElement | null>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const diagnosticRef = useRef<HTMLElement | null>(null);

  const load = async (refresh = false) => {
    try {
      const [nextCatalog, nextCosts] = await Promise.all([
        getGenerationProviderCatalog(refresh),
        getProviderCostSummary().catch(() => null),
      ]);
      setCatalog(nextCatalog);
      setCosts(nextCosts);
      setStatus(refresh ? "Connection discovery refreshed." : "Connections loaded.");
      return nextCatalog;
    } catch (error) {
      setStatus(errorMessage(error));
      return null;
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  const iconFor = (provider: GenerationProviderState) =>
    provider.locality === "cloud" ? <CloudArrowUp /> : provider.transport === "terminal-cli" ? <Command /> : <Robot />;

  const openEditor = (provider: GenerationProviderState, mode: "add" | "edit") => {
    setConfirmingDelete(false);
    setEditorError("");
    setEditor({ mode, providerId: provider.id });
    setDraft({
      displayName: mode === "add" ? provider.templateLabel : provider.label,
      enabled: mode === "add" ? true : provider.enabled,
      baseUrl: provider.baseUrl || "",
      executablePath: provider.executablePath || "",
      cloudConfirmed: provider.cloudConfirmed,
      apiKey: "",
      testModel: provider.defaultModelId || provider.models[0]?.id || "default",
    });
    setStatus(mode === "add" ? `Set up ${provider.templateLabel}.` : `Editing ${provider.label}.`);
  };

  const selectTemplate = (provider: GenerationProviderState) => openEditor(provider, "add");
  const selected = editor && catalog ? catalog.providers.find((provider) => provider.id === editor.providerId) || null : null;
  const diagnostic = selected ? diagnostics[selected.id] : undefined;
  const updateDraft = <K extends keyof ConnectionDraft>(field: K, value: ConnectionDraft[K]) => {
    setEditorError("");
    setDraft((current) => current ? { ...current, [field]: value } : current);
  };

  const draftError = (provider: GenerationProviderState, value: ConnectionDraft): string => {
    if (!value.displayName.trim()) return "Enter a name for this connection.";
    if (provider.locality === "cloud" && value.enabled && !value.cloudConfirmed) {
      return "Confirm the cloud data boundary before enabling this connection.";
    }
    return "";
  };

  const clearDiagnostic = (providerId: string) => {
    setDiagnostics((current) => {
      const next = { ...current };
      delete next[providerId];
      return next;
    });
  };

  const recordDiagnostic = (
    providerId: string,
    receipt: Omit<ConnectionDiagnosticReceipt, "input">,
  ) => {
    setDiagnostics((current) => ({
      ...current,
      [providerId]: { ...receipt, input: providerDiagnosticInput },
    }));
  };

  const persistDraft = async (
    provider: GenerationProviderState,
    value: ConnectionDraft,
    discover: boolean,
  ) => {
    let next = await saveGenerationProvider({
      providerId: provider.id,
      displayName: value.displayName.trim(),
      enabled: value.enabled,
      baseUrl: provider.baseUrl != null ? value.baseUrl.trim() || null : null,
      executablePath:
        provider.transport === "terminal-cli"
          ? value.executablePath.trim() || null
          : null,
      cloudConfirmed: value.cloudConfirmed,
    });
    if (value.apiKey.trim()) {
      next = await saveProviderCredential({
        providerId: provider.id,
        apiKey: value.apiKey.trim(),
      });
    }
    if (discover) next = await getGenerationProviderCatalog(true);
    const updated = next.providers.find((item) => item.id === provider.id) || provider;
    const discoveredModel =
      updated.defaultModelId || updated.models[0]?.id || value.testModel || "default";
    setCatalog(next);
    setEditor((current) =>
      current && current.providerId === provider.id
        ? { ...current, mode: "edit" }
        : current,
    );
    setDraft((current) =>
      current
        ? {
            ...current,
            apiKey: "",
            testModel:
              current.testModel === "default" || !current.testModel.trim()
                ? discoveredModel
                : current.testModel,
          }
        : current,
    );
    return { catalog: next, provider: updated, modelId: discoveredModel };
  };

  const closeEditor = () => {
    setEditor(null);
    setDraft(null);
    setConfirmingDelete(false);
    setEditorError("");
    window.requestAnimationFrame(() => editorTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!editor) return;
    if (document.activeElement instanceof HTMLElement && !editorRef.current?.contains(document.activeElement)) {
      editorTriggerRef.current = document.activeElement;
    }
    window.requestAnimationFrame(() => {
      const target = editorRef.current?.querySelector<HTMLElement>("[data-template-autofocus], [autofocus], button:not([disabled]), input:not([disabled])");
      target?.focus();
    });
  }, [editor?.mode, editor?.providerId]);

  useEffect(() => {
    if (!diagnostic) return;
    window.requestAnimationFrame(() => {
      diagnosticRef.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
  }, [diagnostic?.testedAt]);

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      closeEditor();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(editorRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])") || []).filter((item) => item.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const saveConnection = async () => {
    if (!selected || !draft) return;
    const validationError = draftError(selected, draft);
    if (validationError) return setEditorError(validationError);
    setBusy(`save:${selected.id}`);
    try {
      const { provider } = await persistDraft(selected, draft, true);
      setEditorError("");
      setStatus(
        `${draft.displayName.trim()} saved. Discovered ${provider.models.length} model${provider.models.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      const message = errorMessage(error);
      setEditorError(message);
      setStatus(message);
    } finally {
      setBusy("");
    }
  };

  const testConnection = async (provider: GenerationProviderState, modelId?: string) => {
    const diagnosticModel = modelId?.trim() || provider.defaultModelId || provider.models[0]?.id || "default";
    setBusy(`test:${provider.id}`);
    clearDiagnostic(provider.id);
    setStatus(`Testing ${provider.label} with ${diagnosticModel}.`);
    try {
      const result = await testGenerationProvider({ providerId: provider.id, modelId: diagnosticModel });
      recordDiagnostic(provider.id, {
        outcome: "success",
        modelId: diagnosticModel,
        output: result.outputPreview.trim() || "The provider returned no preview text.",
        message: result.message,
        testedAt: result.testedAt,
      });
      await load(false);
      setStatus(`${provider.label} connected successfully: ${result.outputPreview}`);
    } catch (error) {
      const detail = errorMessage(error);
      recordDiagnostic(provider.id, {
        outcome: "failed",
        modelId: diagnosticModel,
        output: "No provider output was returned.",
        message: detail,
        testedAt: new Date().toISOString(),
      });
      await load(false);
      const message = `${provider.label} test failed. ${detail}`;
      setStatus(message);
    } finally {
      setBusy("");
    }
  };

  const testDraftConnection = async () => {
    if (!selected || !draft) return;
    const validationError = draftError(selected, draft);
    if (validationError) return setEditorError(validationError);
    if (!draft.enabled) return setEditorError("Enable this connection before testing it.");
    setBusy(`test:${selected.id}`);
    clearDiagnostic(selected.id);
    setStatus(`Testing ${draft.displayName.trim()} with a real generation request. A cold local model may take up to two minutes to load.`);
    try {
      const saved = await persistDraft(selected, draft, true);
      const requestedModel = draft.testModel.trim();
      const diagnosticModel =
        requestedModel && requestedModel !== "default"
          ? requestedModel
          : saved.provider.defaultModelId || saved.provider.models[0]?.id || "default";
      const result = await testGenerationProvider({
        providerId: selected.id,
        modelId: diagnosticModel,
      });
      recordDiagnostic(selected.id, {
        outcome: "success",
        modelId: diagnosticModel,
        output: result.outputPreview.trim() || "The provider returned no preview text.",
        message: result.message,
        testedAt: result.testedAt,
      });
      const next = await getGenerationProviderCatalog(false);
      setCatalog(next);
      setDraft((current) => current ? { ...current, testModel: diagnosticModel } : current);
      setEditorError("");
      setStatus(`${draft.displayName.trim()} connected successfully: ${result.outputPreview}`);
    } catch (error) {
      const detail = errorMessage(error);
      const next = await getGenerationProviderCatalog(false).catch(() => null);
      if (next) setCatalog(next);
      recordDiagnostic(selected.id, {
        outcome: "failed",
        modelId: draft.testModel.trim() || selected.defaultModelId || "default",
        output: "No provider output was returned.",
        message: detail,
        testedAt: new Date().toISOString(),
      });
      const message = `${draft.displayName.trim()} test failed. ${detail}`;
      setStatus(message);
      setEditorError("");
    } finally {
      setBusy("");
    }
  };

  const refreshEditorModels = async () => {
    if (!selected || !draft) return;
    const validationError = draftError(selected, draft);
    if (validationError) return setEditorError(validationError);
    setBusy(`models:${selected.id}`);
    try {
      const { provider } = await persistDraft(selected, draft, true);
      setEditorError("");
      setStatus(`Found ${provider.models.length} model${provider.models.length === 1 ? "" : "s"} for ${provider.label}.`);
    } catch (error) {
      const message = errorMessage(error);
      setEditorError(message);
      setStatus(message);
    } finally {
      setBusy("");
    }
  };

  const toggleConnectionFavorite = async (provider: GenerationProviderState, modelId: string) => {
    const favorite = catalog?.favoriteModels.some(
      (item) => item.providerId === provider.id && item.modelId === modelId,
    ) ?? false;
    setBusy(`favorite:${provider.id}:${modelId}`);
    try {
      setCatalog(await setFavoriteModel({ providerId: provider.id, modelId, favorite: !favorite }));
      setStatus(`${modelId} ${favorite ? "removed from" : "added to"} favorites.`);
    } catch (error) {
      setEditorError(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const chooseConnectionDefault = async (provider: GenerationProviderState, modelId: string) => {
    setBusy(`default:${provider.id}:${modelId}`);
    try {
      setCatalog(await setDefaultProviderModel({ providerId: provider.id, modelId }));
      setDraft((current) => current ? { ...current, testModel: modelId } : current);
      setStatus(`${modelId} is now the default model for ${provider.label}.`);
    } catch (error) {
      setEditorError(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const deleteConnection = async (provider: GenerationProviderState) => {
    setBusy(`delete:${provider.id}`);
    try {
      setCatalog(await deleteGenerationProvider(provider.id));
      closeEditor();
      setStatus(`${provider.label} deleted.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const removeCredential = async (provider: GenerationProviderState) => {
    if (!window.confirm(`Remove the saved credential for “${provider.label}”?`)) return;
    setBusy(`credential:${provider.id}`);
    try {
      setCatalog(await clearProviderCredential(provider.id));
      setStatus(`${provider.label} credential removed from Keychain.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  if (!catalog) return (
    <>
      <SettingsTitle eyebrow="Model access" title="Connections" copy="Local runtimes, cloud gateways, and terminal AI subscriptions." />
      <div className="settings-notice"><CircleNotch className="spin" /><span><strong>Loading connections</strong><small>{status}</small></span></div>
    </>
  );

  const userConnections = catalog.providers.filter((provider) => provider.transport !== "builtin" && provider.saved);
  const builtInConnections = catalog.providers.filter((provider) => provider.transport === "builtin");
  const availableTemplates = catalog.providers.filter((provider) => provider.transport !== "builtin" && !provider.saved);
  const healthyCount = userConnections.filter((provider) => ["live-tested", "authenticated", "discovered"].includes(provider.status)).length;
  const templateGroups = [
    { label: "Local runtimes", items: availableTemplates.filter((provider) => provider.locality === "local" && provider.transport !== "terminal-cli") },
    { label: "Cloud APIs & gateways", items: availableTemplates.filter((provider) => provider.locality === "cloud") },
    { label: "Terminal subscriptions", items: availableTemplates.filter((provider) => provider.transport === "terminal-cli") },
  ].filter((group) => group.items.length);

  return (
    <>
      <header className="connections-heading">
        <div>
          <p>Model access</p>
          <h2>Connections</h2>
          <span>Manage every local runtime, cloud gateway, and terminal subscription in one place.</span>
        </div>
        <button className="primary-button" onClick={() => setEditor({ mode: "add", providerId: "" })} disabled={!availableTemplates.length || Boolean(busy)}>
          <Plus /> Add connection
        </button>
      </header>

      <section className="connection-overview" aria-label="Connection overview">
        <span><strong>{userConnections.length}</strong><small>Added</small></span>
        <span><strong>{healthyCount}</strong><small>Ready or discovered</small></span>
        <span><strong>{userConnections.filter((provider) => provider.locality === "cloud").length}</strong><small>Cloud</small></span>
        <button className="secondary-button" onClick={() => load(true)} disabled={Boolean(busy)}>
          {busy === "refresh" ? <CircleNotch className="spin" /> : <ArrowClockwise />} Refresh
        </button>
      </section>

      <section className="connections-section" aria-labelledby="your-connections-heading">
        <div className="connections-section-title">
          <div><h3 id="your-connections-heading">Your connections</h3><p>Connections you added and can edit or delete.</p></div>
        </div>
        {userConnections.length ? (
          <div className="connection-list">
            {userConnections.map((provider) => (
              <article className="connection-row" key={provider.id}>
                <span className={`connection-mark ${provider.locality}`}>{iconFor(provider)}</span>
                <div className="connection-identity">
                  <strong>{provider.label}</strong>
                  <small>{provider.templateLabel} · {provider.locality === "cloud" ? "Cloud" : provider.transport === "terminal-cli" ? "Terminal subscription" : "On this Mac"}</small>
                  <p>{provider.detail}</p>
                </div>
                <span className={`status ${["live-tested", "authenticated", "discovered"].includes(provider.status) ? "connected" : ""}`}>{providerStatusLabel(provider.status)}</span>
                <div className="connection-actions">
                  <button className="secondary-button" onClick={() => testConnection(provider)} disabled={Boolean(busy) || !provider.enabled}>
                    {busy === `test:${provider.id}` ? <CircleNotch className="spin" /> : <ArrowClockwise />} Test
                  </button>
                  <button className="secondary-button" onClick={() => openEditor(provider, "edit")} disabled={Boolean(busy)}><NotePencil /> Edit</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="connections-empty">
            <span><Link /></span>
            <h3>No connections added yet</h3>
            <p>Add Vercel AI Gateway, a local model server, or an existing terminal AI subscription.</p>
            <button className="primary-button" onClick={() => setEditor({ mode: "add", providerId: "" })}><Plus /> Add your first connection</button>
          </div>
        )}
      </section>

      <details className="built-in-connections">
        <summary><span><ShieldCheck /><strong>Built-in local capabilities</strong><small>{builtInConnections.length} always available · cannot be deleted</small></span><CaretDown /></summary>
        <div className="connection-list compact">
          {builtInConnections.map((provider) => (
            <article className="connection-row" key={provider.id}>
              <span className="connection-mark local"><Robot /></span>
              <div className="connection-identity"><strong>{provider.label}</strong><small>Built in · On this Mac</small><p>{provider.detail}</p></div>
              <span className="status connected">Ready</span>
            </article>
          ))}
        </div>
      </details>

      <details className="connection-spend">
        <summary><span><CurrencyDollar /><strong>Cloud spend</strong><small>{costs ? `${formatUsdMicros(costs.totalCostMicros)} this month · ${costs.requestCount} requests` : "Local ledger unavailable"}</small></span><CaretDown /></summary>
        {costs ? <div className="connection-spend-detail"><p>Cloud requests are recorded locally. Local and terminal connections are never included.</p>{costs.byProvider.map((bucket) => <div key={bucket.providerId}><span>{catalog.providers.find((item) => item.id === bucket.providerId)?.label || bucket.providerId}</span><strong>{formatUsdMicros(bucket.costMicros)}</strong></div>)}</div> : null}
      </details>

      <div className="connection-policy"><ShieldCheck /><span><strong>No silent cloud fallback</strong><small>Cloud connections require explicit consent. API keys stay in macOS Keychain and never enter your brain folder.</small></span></div>
      <p className="sync-status" role="status">{status}</p>

      {editor ? (
        <div className="modal-backdrop">
          <section className="connection-editor" role="dialog" aria-modal="true" aria-labelledby="connection-editor-title" ref={editorRef} onKeyDown={handleEditorKeyDown} tabIndex={-1}>
            {!selected || !draft ? (
              <>
                <header><div><small>Add connection</small><h2 id="connection-editor-title">Choose how you connect</h2><p>Add one connection for each provider type. Every saved connection can be edited, tested, disabled, or deleted.</p></div><button className="icon-button" aria-label="Close" onClick={closeEditor}><X /></button></header>
                <div className="connection-template-list">
                  {templateGroups.map((group) => <section className="connection-template-group" key={group.label}><h3>{group.label}</h3><div>{group.items.map((provider) => (
                    <button key={provider.id} onClick={() => selectTemplate(provider)} data-template-autofocus={group === templateGroups[0] && provider === group.items[0] ? "true" : undefined}>
                      <span className={`connection-mark ${provider.locality}`}>{iconFor(provider)}</span><span><strong>{provider.templateLabel}</strong><small>{provider.locality === "cloud" ? "Cloud API or gateway" : provider.transport === "terminal-cli" ? "Existing terminal subscription" : "Local model server"}</small><p>{provider.detail.split(".")[0]}.</p></span><ArrowRight />
                    </button>))}</div></section>)}
                </div>
              </>
            ) : (
              <>
                <header><div><small>{editor.mode === "add" ? "Add connection" : "Edit connection"}</small><h2 id="connection-editor-title">{selected.templateLabel}</h2><p>{selected.detail}</p></div><button className="icon-button" aria-label="Close" onClick={closeEditor} disabled={Boolean(busy)}><X /></button></header>
                <div className="connection-editor-fields">
                  <label><span>Connection name</span><input autoFocus value={draft.displayName} onChange={(event) => updateDraft("displayName", event.target.value)} maxLength={64} /></label>
                  {selected.baseUrl != null ? <label><span>Base URL</span><input value={draft.baseUrl} onChange={(event) => updateDraft("baseUrl", event.target.value)} spellCheck="false" /></label> : null}
                  {selected.transport === "terminal-cli" ? <label><span>Executable path <em>optional</em></span><input value={draft.executablePath} onChange={(event) => updateDraft("executablePath", event.target.value)} placeholder="Auto-detect, or enter an absolute path" spellCheck="false" /></label> : null}
                  {selected.locality === "cloud" ? <label><span>API key {selected.credentialConfigured ? <em>stored · enter to replace</em> : null}</span><input type="password" value={draft.apiKey} onChange={(event) => updateDraft("apiKey", event.target.value)} placeholder={selected.credentialConfigured ? "Leave blank to keep current key" : "Stored in macOS Keychain"} autoComplete="off" /></label> : null}
                  <label><span>Diagnostic model ID</span><input list={`connection-models-${selected.id}`} value={draft.testModel} onChange={(event) => updateDraft("testModel", event.target.value)} /><datalist id={`connection-models-${selected.id}`}>{selected.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</datalist><small>Used only when you press Test. The fixed diagnostic never includes brain content.</small></label>
                  <label className="connection-enabled"><input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft("enabled", event.target.checked)} /><span><strong>Enable this connection</strong><small>Disabled connections remain saved but cannot be selected for new work.</small></span></label>
                  {selected.locality === "cloud" ? <label className="connection-consent"><input type="checkbox" checked={draft.cloudConfirmed} onChange={(event) => updateDraft("cloudConfirmed", event.target.checked)} /><span><strong>I understand what leaves this Mac</strong><small>Only the scoped prompt and source excerpts required for a request are sent through this provider.</small></span></label> : null}
                </div>
                <section className="connection-models" aria-labelledby={`connection-models-title-${selected.id}`}>
                  <header>
                    <span>
                      <strong id={`connection-models-title-${selected.id}`}>Models</strong>
                      <small>
                        {selected.models.length
                          ? `${selected.models.length} discovered for this connection`
                          : selected.saved
                            ? "No models discovered yet"
                            : "Save or test to discover models"}
                      </small>
                    </span>
                    <button className="secondary-button" onClick={refreshEditorModels} disabled={Boolean(busy)}>
                      {busy === `models:${selected.id}` ? <CircleNotch className="spin" /> : <ArrowClockwise />} Refresh models
                    </button>
                  </header>
                  {selected.models.length ? (
                    <div className="connection-model-list">
                      {selected.models.map((model) => {
                        const isDefault = selected.defaultModelId === model.id;
                        const isFavorite = catalog.favoriteModels.some(
                          (item) => item.providerId === selected.id && item.modelId === model.id,
                        );
                        return (
                          <article key={model.id} className={isDefault ? "default" : ""}>
                            <span>
                              <strong>{model.label}</strong>
                              <small>{model.id}</small>
                            </span>
                            <button
                              className={`connection-model-action ${isDefault ? "active" : ""}`}
                              onClick={() => chooseConnectionDefault(selected, model.id)}
                              disabled={Boolean(busy) || isDefault}
                              aria-label={`${isDefault ? "Default model" : "Make default"}: ${model.label}`}
                            >
                              {busy === `default:${selected.id}:${model.id}` ? <CircleNotch className="spin" /> : <Check />} {isDefault ? "Default" : "Make default"}
                            </button>
                            <button
                              className={`connection-model-action ${isFavorite ? "active" : ""}`}
                              onClick={() => toggleConnectionFavorite(selected, model.id)}
                              disabled={Boolean(busy)}
                              aria-label={`${isFavorite ? "Remove from favorites" : "Add to favorites"}: ${model.label}`}
                            >
                              {busy === `favorite:${selected.id}:${model.id}` ? <CircleNotch className="spin" /> : <Star weight={isFavorite ? "fill" : "regular"} />} {isFavorite ? "Favorited" : "Favorite"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="connection-models-empty">
                      <Robot />
                      <span><strong>No models to show</strong><small>Start the provider if needed, then refresh. Terminal connections expose their supported default model.</small></span>
                    </div>
                  )}
                </section>
                {busy === `test:${selected.id}` ? (
                  <p className="connection-editor-progress" role="status" aria-live="polite">
                    <CircleNotch className="spin" />
                    <span><strong>Running a real generation test</strong><small>A cold local model can take up to two minutes to load. The test will stop and report an error if it times out.</small></span>
                  </p>
                ) : null}
                {diagnostic ? (
                  <section
                    className={`connection-diagnostic ${diagnostic.outcome}`}
                    aria-labelledby={`connection-diagnostic-title-${selected.id}`}
                    aria-live="polite"
                    data-testid="connection-diagnostic"
                    ref={diagnosticRef}
                    role={diagnostic.outcome === "failed" ? "alert" : "status"}
                  >
                    <header>
                      <span className="connection-diagnostic-mark" aria-hidden="true">
                        {diagnostic.outcome === "success" ? <CheckCircle weight="fill" /> : <XCircle weight="fill" />}
                      </span>
                      <span>
                        <strong id={`connection-diagnostic-title-${selected.id}`}>
                          {diagnostic.outcome === "success" ? "Connection test passed" : "Connection test failed"}
                        </strong>
                        <small>{diagnostic.modelId} · {diagnosticTime(diagnostic.testedAt)}</small>
                      </span>
                    </header>
                    <div className="connection-diagnostic-transcript">
                      <div>
                        <span>Test input</span>
                        <pre>{diagnostic.input}</pre>
                      </div>
                      <div>
                        <span>{diagnostic.outcome === "success" ? "Provider output" : "Test result"}</span>
                        <pre>{diagnostic.output}</pre>
                      </div>
                    </div>
                    <p>{diagnostic.message}</p>
                  </section>
                ) : null}
                {editorError ? <p className="connection-editor-error" role="alert"><Info /> {editorError}</p> : null}
                {confirmingDelete ? <div className="connection-delete-warning" role="alert"><Trash /><span><strong>Delete “{selected.label}”?</strong><small>The configuration and Keychain credential will be removed. Any model routes using it return to local defaults.</small></span></div> : null}
                <footer>
                  {confirmingDelete ? <><div /><span><button className="secondary-button" onClick={() => setConfirmingDelete(false)} disabled={Boolean(busy)}>Keep connection</button><button className="danger-button" onClick={() => deleteConnection(selected)} disabled={Boolean(busy)}>{busy === `delete:${selected.id}` ? <CircleNotch className="spin" /> : <Trash />} Delete permanently</button></span></> : <><div>{editor.mode === "edit" ? <button className="danger-link" onClick={() => setConfirmingDelete(true)} disabled={Boolean(busy)}><Trash /> Delete connection</button> : null}{selected.credentialConfigured ? <button className="danger-link" onClick={() => removeCredential(selected)} disabled={Boolean(busy)}>Remove key</button> : null}</div>
                  <span><button className="secondary-button" onClick={testDraftConnection} disabled={Boolean(busy) || !draft.enabled || !draft.displayName.trim()}>{busy === `test:${selected.id}` ? <CircleNotch className="spin" /> : <ArrowClockwise />} {busy === `test:${selected.id}` ? "Testing…" : diagnostic ? "Run test again" : editor.mode === "add" ? "Save & test" : "Run connection test"}</button><button className="secondary-button" onClick={closeEditor} disabled={Boolean(busy)}>Close</button><button className="primary-button" onClick={saveConnection} disabled={Boolean(busy) || !draft.displayName.trim()}>{busy === `save:${selected.id}` ? <CircleNotch className="spin" /> : <Check />} {editor.mode === "add" ? "Add & discover" : "Save changes"}</button></span></>}
                </footer>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
function TranscriptionSettings({ bootstrap, onBootstrap }: { bootstrap: BootstrapState; onBootstrap: (state: BootstrapState) => void }) {
  const [providers, setProviders] = useState<TranscriptionProvider[]>([]);
  const [parakeet, setParakeet] = useState<ParakeetStatus | null>(null);
  const [parakeetBusy, setParakeetBusy] = useState("");
  const [status, setStatus] = useState("Loading providers…");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const reloadProviders = async () => {
    const [items, parakeetStatus] = await Promise.all([
      listTranscriptionProviders(),
      getParakeetStatus(),
    ]);
    setProviders(items);
    setParakeet(parakeetStatus);
    return { items, parakeetStatus };
  };
  useEffect(() => {
    reloadProviders()
      .then(({ parakeetStatus }) => {
        if (parakeetStatus.downloadInProgress) {
          setStatus("Parakeet is downloading in the background. You can leave this page.");
          setStatusTone("neutral");
        } else if (parakeetStatus.downloadError) {
          setStatus(`Parakeet download stopped: ${parakeetStatus.downloadError} Retry to resume it.`);
          setStatusTone("error");
        } else {
          setStatus("Provider availability is detected by the native app.");
          setStatusTone("neutral");
        }
      })
      .catch((error) => {
        setStatus(errorMessage(error));
        setStatusTone("error");
      });
  }, []);
  useEffect(() => {
    if (!parakeet?.downloadInProgress) return;
    let cancelled = false;
    const refreshDownload = async () => {
      try {
        const next = await getParakeetStatus();
        if (cancelled) return;
        setParakeet(next);
        if (next.downloadInProgress) {
          setStatus(`Downloading Parakeet in the background… ${formatBytes(next.cachedBytes)} of ${formatBytes(next.modelTotalBytes)} saved locally.`);
          setStatusTone("neutral");
        } else if (next.downloadError) {
          setStatus(`Parakeet download stopped: ${next.downloadError} Retry to resume it.`);
          setStatusTone("error");
          const refreshedProviders = await listTranscriptionProviders();
          if (!cancelled) setProviders(refreshedProviders);
        } else if (next.modelState === "ready") {
          setStatus("Parakeet MLX model downloaded, loaded, and validated locally.");
          setStatusTone("success");
          const refreshedProviders = await listTranscriptionProviders();
          if (!cancelled) setProviders(refreshedProviders);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(errorMessage(error));
          setStatusTone("error");
        }
      }
    };
    const poll = window.setInterval(refreshDownload, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [parakeet?.downloadInProgress]);
  const installParakeet = async () => {
    if (!window.confirm("Install or update the open-source Parakeet MLX CLI?\n\nIf uv is missing, Burrowise first downloads it from Astral’s official installer without changing your shell profile. This step does not download the speech model yet.")) return;
    setParakeetBusy("install");
    setStatus("Installing setup tools and the Parakeet MLX CLI…");
    setStatusTone("neutral");
    try {
      setParakeet(await installParakeetCli());
      await reloadProviders();
      setStatus("Parakeet MLX is installed. Download the local speech model to finish setup.");
      setStatusTone("success");
    } catch (error) {
      setStatus(errorMessage(error));
      setStatusTone("error");
    } finally {
      setParakeetBusy("");
    }
  };
  const downloadParakeet = async () => {
    if (!window.confirm("Download and validate the Parakeet TDT 0.6B v3 model?\n\nThe model is downloaded from Hugging Face into its ordinary cache on this Mac. The operation can be resumed if interrupted.")) return;
    setParakeetBusy("download");
    setStatus("Starting the Parakeet background download…");
    setStatusTone("neutral");
    try {
      const next = await downloadParakeetModel();
      setParakeet(next);
      setStatus("Parakeet is downloading in the background. You can leave this page and return at any time.");
    } catch (error) {
      setStatus(errorMessage(error));
      setStatusTone("error");
    } finally {
      setParakeetBusy("");
    }
  };
  const chooseProvider = async (provider: TranscriptionProvider) => {
    if (!provider.available) {
      setStatus(`${provider.label} is not available on this Mac.`);
      setStatusTone("error");
      return;
    }
    try {
      onBootstrap(await setTranscriptionProvider(provider.id));
      setStatus(
        `${provider.label} is now the default for captures and interview voice turns.`,
      );
      setStatusTone("success");
    } catch (error) {
      setStatus(errorMessage(error));
      setStatusTone("error");
    }
  };
  const chooseCorrectionPreference = async (preference: string) => {
    try {
      onBootstrap(await updateBehaviorPreferences(preference, bootstrap.defaultAgentMode, bootstrap.allowGeneralKnowledgeDefault));
      setStatus(preference === "verbatim" ? "Captures will preserve recognizer output verbatim by default." : "Completed captures will prompt you to review transcript wording; no automatic rewrite is applied.");
      setStatusTone("success");
    } catch (error) {
      setStatus(errorMessage(error));
      setStatusTone("error");
    }
  };
  const modelTotalBytes = parakeet?.modelTotalBytes || 0;
  const modelDownloadedBytes = Math.min(parakeet?.cachedBytes || 0, modelTotalBytes);
  const modelProgress = parakeet?.modelState === "ready"
    ? 100
    : modelTotalBytes > 0
      ? Math.min(100, Math.round((modelDownloadedBytes / modelTotalBytes) * 100))
      : 0;
  const modelProgressLabel = parakeet?.downloadInProgress || parakeetBusy === "download"
    ? "Downloading speech model"
    : parakeet?.modelState === "ready"
      ? "Speech model ready"
      : parakeet?.modelState === "partial"
        ? "Partial download saved"
        : "Speech model download";
  return (
    <>
      <SettingsTitle
        eyebrow="Speech to text"
        title="Transcription"
        copy="Choose how recordings become text. Raw audio always saves first."
      />
      <section className="settings-card">
        <h3>Default provider</h3>
        {providers.map((provider) => {
          const selected = bootstrap.transcriptionProvider === provider.id;
          return (
            <button
              className={`provider-choice ${selected ? "active" : ""}`}
              key={provider.id}
              onClick={() => chooseProvider(provider)}
              aria-pressed={selected}
              aria-label={`${provider.label}. ${selected ? "Selected as default." : provider.available ? "Available." : "Not installed."}`}
            >
              <span className="large-setting-icon">
                {provider.id === "parakeet" ? <Robot /> : <Waveform />}
              </span>
              <div>
                <strong>{provider.label}</strong>
                <p>{provider.detail}</p>
              </div>
              <span className="provider-choice-trailing">
                <span className={`status ${selected ? "selected" : provider.available ? "connected" : ""}`}>
                  {selected ? "Selected" : provider.available ? "Available" : "Not installed"}
                </span>
                <span className={`selection-indicator ${selected ? "selected" : ""}`} aria-hidden="true">
                  {selected ? <Check weight="bold" /> : null}
                </span>
              </span>
            </button>
          );
        })}
      </section>
      <section className="settings-card">
        <h3>Correction preference</h3>
        <button className={`provider-choice ${bootstrap.transcriptionCorrectionPreference === "verbatim" ? "active" : ""}`} onClick={() => chooseCorrectionPreference("verbatim")} aria-pressed={bootstrap.transcriptionCorrectionPreference === "verbatim"}>
          <span className="large-setting-icon"><Quotes /></span>
          <div><strong>Verbatim by default</strong><p>Save recognizer wording as canonical without an automatic rewrite.</p></div>
          <span className="provider-choice-trailing">
            {bootstrap.transcriptionCorrectionPreference === "verbatim" ? <span className="status selected">Selected</span> : null}
            <span className={`selection-indicator ${bootstrap.transcriptionCorrectionPreference === "verbatim" ? "selected" : ""}`} aria-hidden="true">
              {bootstrap.transcriptionCorrectionPreference === "verbatim" ? <Check weight="bold" /> : null}
            </span>
          </span>
        </button>
        <button className={`provider-choice ${bootstrap.transcriptionCorrectionPreference === "review-after-transcription" ? "active" : ""}`} onClick={() => chooseCorrectionPreference("review-after-transcription")} aria-pressed={bootstrap.transcriptionCorrectionPreference === "review-after-transcription"}>
          <span className="large-setting-icon"><NotePencil /></span>
          <div><strong>Prompt me to review</strong><p>After processing, remind me to inspect wording in the transcript editor.</p></div>
          <span className="provider-choice-trailing">
            {bootstrap.transcriptionCorrectionPreference === "review-after-transcription" ? <span className="status selected">Selected</span> : null}
            <span className={`selection-indicator ${bootstrap.transcriptionCorrectionPreference === "review-after-transcription" ? "selected" : ""}`} aria-hidden="true">
              {bootstrap.transcriptionCorrectionPreference === "review-after-transcription" ? <Check weight="bold" /> : null}
            </span>
          </span>
        </button>
      </section>
      <section className="settings-card parakeet-setup-card">
        <h3>Parakeet MLX setup</h3>
        <p>{parakeet?.detail || "Inspecting local Parakeet tools and model cache…"}</p>
        <div className="source-actions">
          <button className="secondary-button" onClick={installParakeet} disabled={Boolean(parakeetBusy) || parakeet?.downloadInProgress}>
            {parakeetBusy === "install" ? <CircleNotch className="spin" /> : <ArrowClockwise />}
            {parakeet?.cliInstalled ? "Update CLI" : "Install CLI"}
          </button>
          <button
            className="secondary-button"
            onClick={downloadParakeet}
            disabled={Boolean(parakeetBusy) || parakeet?.downloadInProgress || !parakeet?.cliInstalled || !parakeet?.ffmpegInstalled}
          >
            {parakeetBusy === "download" || parakeet?.downloadInProgress ? <CircleNotch className="spin" /> : <CloudArrowDown />}
            {parakeet?.downloadInProgress ? "Downloading in background…" : parakeet?.modelState === "ready" ? "Validate model again" : parakeet?.modelState === "partial" ? "Resume model download" : "Download model"}
          </button>
        </div>
        <div className="model-download-meter">
          <div>
            <span>
              <strong>{modelProgressLabel}</strong>
              <small>{formatBytes(modelDownloadedBytes)} of {formatBytes(modelTotalBytes)}</small>
            </span>
            <b>{modelProgress}%</b>
          </div>
          <progress
            aria-label="Parakeet speech model download progress"
            aria-valuetext={`${formatBytes(modelDownloadedBytes)} of ${formatBytes(modelTotalBytes)} downloaded`}
            max={100}
            value={modelProgress}
          />
          <small>{formatBytes(modelTotalBytes)} total package size · Interrupted downloads can be resumed.</small>
        </div>
        <small>
          uv: {parakeet?.uvInstalled ? "installed" : "will install automatically"} · CLI: {parakeet?.cliInstalled ? "installed" : "missing"} · ffmpeg: {parakeet?.ffmpegInstalled ? "installed" : "missing"} · model: {parakeet?.modelState || "checking"} · {formatBytes(parakeet?.cachedBytes || 0)} cached
        </small>
        <p className={`transcription-feedback ${statusTone}`} role={statusTone === "error" ? "alert" : "status"} aria-live="polite">
          {parakeetBusy || parakeet?.downloadInProgress ? <CircleNotch className="spin" /> : statusTone === "success" ? <Check weight="bold" /> : <Info />}
          <span>{status}</span>
        </p>
      </section>
      <div className="settings-notice">
        <ShieldCheck />
        <span>
          <strong>Verbatim by default</strong>
          <small>
            Transcription output is preserved without stylistic rewriting.
            Optional AI cleanup always returns a draft for review and never
            changes the canonical transcript until you save it.
          </small>
        </span>
      </div>
    </>
  );
}
function PrivacySettings({ bootstrap, onBootstrap }: { bootstrap: BootstrapState; onBootstrap: (state: BootstrapState) => void }) {
  const [status, setStatus] = useState(
    "Permission status is read directly from macOS when this page is refreshed.",
  );
  const refresh = async () => {
    setStatus("Refreshing permission status…");
    try {
      onBootstrap(await getBootstrapState());
      setStatus("Permission status refreshed from the operating system.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const openSettings = async (open: () => Promise<void>, label: string) => {
    try {
      await open();
      setStatus(`${label} settings opened.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const saveDefaults = async (agentMode: string, allowGeneralKnowledge: boolean) => {
    try {
      onBootstrap(await updateBehaviorPreferences(bootstrap.transcriptionCorrectionPreference, agentMode, allowGeneralKnowledge));
      setStatus("Privacy and agent defaults saved. New Chat views use these defaults; every canonical edit remains Review-gated.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  return (
    <>
      <SettingsTitle
        eyebrow="Control"
        title="Privacy & permissions"
        copy="Current enforced boundaries—not speculative toggles."
      />
      <section className="provider-table">
        <div className="provider-row">
          <span className="large-setting-icon">
            <Microphone />
          </span>
          <div>
            <strong>Microphone</strong>
            <p>Used only while a recording control visibly shows that it is active.</p>
          </div>
          <span
            className={`status ${bootstrap.microphonePermission === "granted" ? "connected" : ""}`}
          >
            {bootstrap.microphonePermission}
          </span>
          <button
            className="secondary-button"
            onClick={() => openSettings(openMicrophoneSettings, "Microphone")}
          >
            System Settings
          </button>
        </div>
        <div className="provider-row">
          <span className="large-setting-icon">
            <Waveform />
          </span>
          <div>
            <strong>Speech Recognition</strong>
            <p>
              Apple on-device recognition requires its own macOS permission.
            </p>
          </div>
          <span
            className={`status ${bootstrap.speechPermission === "granted" ? "connected" : ""}`}
          >
            {bootstrap.speechPermission}
          </span>
          <button
            className="secondary-button"
            onClick={() =>
              openSettings(openSpeechSettings, "Speech Recognition")
            }
          >
            System Settings
          </button>
        </div>
      </section>
      <section className="settings-card privacy-defaults">
        <h3>Chat defaults</h3>
        <label><span>Default agent mode</span><select value={bootstrap.defaultAgentMode} onChange={(event) => saveDefaults(event.target.value, bootstrap.allowGeneralKnowledgeDefault)}><option value="read-only">Read only</option><option value="read-and-propose">Read &amp; propose</option><option value="read-write">Read-write · Review gated</option></select></label>
        <label className="provider-toggle"><input type="checkbox" checked={bootstrap.allowGeneralKnowledgeDefault} onChange={(event) => saveDefaults(bootstrap.defaultAgentMode, event.target.checked)} /><span>Allow configured generation providers to use clearly labeled general knowledge when brain evidence is missing</span></label>
        <small>Local Retrieval never invents an answer. Cloud/local generation still follows its configured provider boundary and reports whether outside knowledge was permitted.</small>
      </section>
      <button className="secondary-button" onClick={refresh}>
        <ArrowClockwise /> Refresh permission status
      </button>
      <p className="sync-status" role="status">
        {status}
      </p>
      <div className="settings-notice">
        <ShieldCheck />
        <span>
          <strong>Enforced in this build</strong>
          <small>
            There is no silent cloud fallback. Remote image review names the
            provider and model and asks before original image content leaves
            this Mac; Chat and Interviews continue to log every accessed
            passage.
          </small>
        </span>
      </div>
      <section className="settings-card">
        <h3>Agent mode</h3>
        <p>
          Read only cannot propose changes. Read &amp; propose creates an inspectable
          preview, and read-write queues the proposed body in Review. Neither
          mode changes canonical Markdown before explicit approval.
        </p>
      </section>
    </>
  );
}
function StorageSettings() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [status, setStatus] = useState("Calculating real brain-folder usage…");
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [savingRetention, setSavingRetention] = useState(false);
  useEffect(() => {
    Promise.all([getDashboardOverview(), getAudioRetention()])
      .then(([result, retention]) => {
        setOverview(result);
        setRetentionDays(retention.days);
        setStatus(
          "Sizes come from files currently stored in the active brain folder.",
        );
      })
      .catch((error) => setStatus(errorMessage(error)));
  }, []);
  const saveRetention = async (days: number | null) => {
    if (
      days !== null &&
      !window.confirm(
        `Apply ${days === 0 ? "remove after processing" : `${days}-day`} audio retention now?\n\nEligible original audio moves to the macOS Trash. Transcripts and derived notes remain.`,
      )
    ) return;
    setSavingRetention(true);
    try {
      const result = await setAudioRetention(days);
      setRetentionDays(result.days);
      setStatus(
        result.removedFiles
          ? `Retention saved. Moved ${result.removedFiles} audio file${result.removedFiles === 1 ? "" : "s"} (${formatBytes(result.removedBytes)}) to Trash.`
          : "Audio retention saved. No stored recording is currently eligible.",
      );
      setOverview(await getDashboardOverview());
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSavingRetention(false);
    }
  };
  const rebuild = async () => {
    setStatus("Rebuilding the local search index…");
    try {
      const result = await rebuildSearchIndex();
      setStatus(
        `Index rebuilt from ${result.filesIndexed} files into ${result.passagesIndexed} passages.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const clearDerivedIndex = async () => {
    if (!window.confirm("Clear the rebuildable search index?\n\nThis deletes only derived passage/index rows. It does not delete or edit any Markdown, transcripts, audio, imports, Review decisions, or project files.")) return;
    setStatus("Clearing only derived search data…");
    try {
      await clearSearchIndex();
      setStatus("Derived search data cleared. Your source files are unchanged; Search will rebuild from them when needed.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };
  const total = overview?.stats.storageBytes || 0;
  const audio = overview?.stats.retainedAudioBytes || 0;
  return (
    <>
      <SettingsTitle
        eyebrow="Retention"
        title="Audio & storage"
        copy="Real usage for the active brain folder."
      />
      <section className="storage-meter">
        <div>
          <strong>{overview ? formatBytes(total) : "Calculating…"}</strong>
          <span>stored in this brain folder</span>
        </div>
        <ul>
          <li>
            <span>Original capture audio</span>
            <strong>{formatBytes(audio)}</strong>
          </li>
          <li>
            <span>Markdown, imported files, and rebuildable metadata</span>
            <strong>{formatBytes(Math.max(0, total - audio))}</strong>
          </li>
          <li>
            <span>Bundled model files</span>
            <strong>None</strong>
          </li>
        </ul>
      </section>
      <section className="settings-card">
        <h3>Original audio retention</h3>
        <p>
          Eligible audio moves to the macOS Trash; transcripts, metadata, and
          approved knowledge remain. The policy is applied on launch and when
          changed here.
        </p>
        <select
          value={retentionDays == null ? "forever" : String(retentionDays)}
          onChange={(event) =>
            saveRetention(
              event.target.value === "forever"
                ? null
                : Number(event.target.value),
            )
          }
          disabled={savingRetention}
          aria-label="Original audio retention"
        >
          <option value="0">Remove after processing</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">3 months</option>
          <option value="180">6 months</option>
          <option value="365">1 year</option>
          <option value="forever">Forever</option>
        </select>
      </section>
      <div className="source-actions">
        <button className="secondary-button" onClick={rebuild}><Database /> Rebuild derived search index</button>
        <button className="danger-button" onClick={clearDerivedIndex}><Trash /> Clear derived index</button>
      </div>
      <p className="sync-status" role="status">
        {status}
      </p>
    </>
  );
}
function shortcutFromKeyboardEvent(event: React.KeyboardEvent<HTMLInputElement>): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  const modifiers = [
    event.metaKey ? "Command" : "",
    event.ctrlKey ? "Control" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
  ].filter(Boolean);
  if (modifiers.length === 0) return null;
  let key = event.code;
  if (key.startsWith("Key")) key = key.slice(3);
  else if (key.startsWith("Digit")) key = key.slice(5);
  else if (key === " ") key = "Space";
  return [...modifiers, key].join("+");
}

function keyboardEventMatchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const wantsCommandOrControl = parts.includes("commandorcontrol");
  const wantsMeta = parts.includes("command") || wantsCommandOrControl;
  const wantsControl = parts.includes("control") || wantsCommandOrControl;
  if (wantsCommandOrControl) {
    if (!event.metaKey && !event.ctrlKey) return false;
  } else if (event.metaKey !== wantsMeta || event.ctrlKey !== wantsControl) {
    return false;
  }
  if (event.altKey !== parts.includes("alt") || event.shiftKey !== parts.includes("shift")) {
    return false;
  }
  const key = parts.at(-1);
  const eventKey = event.code.startsWith("Key")
    ? event.code.slice(3).toLowerCase()
    : event.code.startsWith("Digit")
      ? event.code.slice(5)
      : event.code.toLowerCase();
  return key === eventKey || (key === "space" && event.code === "Space");
}

function ShortcutSettings() {
  const [settings, setSettings] = useState<ShortcutSettingsState | null>(null);
  const [globalShortcut, setGlobalShortcut] = useState("CommandOrControl+Shift+Space");
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [localShortcut, setLocalShortcut] = useState("Control+Shift+C");
  const [localEnabled, setLocalEnabled] = useState(true);
  const [recording, setRecording] = useState<"local" | "global" | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Loading shortcut settings…");
  useEffect(() => {
    getShortcutSettings()
      .then((next) => {
        setSettings(next);
        setGlobalShortcut(next.shortcut);
        setGlobalEnabled(next.enabled);
        setLocalShortcut(next.localShortcut);
        setLocalEnabled(next.localEnabled);
        setStatus(next.detail);
      })
      .catch((error) => setStatus(errorMessage(error)));
  }, []);
  const save = async () => {
    setBusy(true);
    setStatus(globalEnabled ? "Saving and registering your shortcuts…" : "Saving shortcut settings…");
    try {
      const next = await updateQuickCaptureShortcut(
        globalShortcut,
        globalEnabled,
        localShortcut,
        localEnabled,
      );
      setSettings(next);
      setGlobalShortcut(next.shortcut);
      setGlobalEnabled(next.enabled);
      setLocalShortcut(next.localShortcut);
      setLocalEnabled(next.localEnabled);
      setStatus(next.detail);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SettingsTitle
        eyebrow="Keyboard"
        title="Shortcuts"
        copy="Choose one shortcut for Burrowise and another that works from anywhere."
      />
      <section className="shortcut-list">
        <div>
          <span>
            <strong>Search brain</strong>
            <small>Open Search from anywhere inside Burrowise</small>
          </span>
          <kbd>⌘ K</kbd>
        </div>
        <div>
          <span>
            <strong>In-app capture</strong>
            <small>Open Capture while Burrowise is focused</small>
          </span>
          <span className={`status ${localEnabled ? "connected" : ""}`}>
            {localEnabled ? localShortcut : "Disabled"}
          </span>
        </div>
        <div>
          <span>
            <strong>Global capture</strong>
            <small>Show Burrowise and open Capture from any app</small>
          </span>
          <span className={`status ${settings?.registered ? "connected" : ""}`}>
            {settings?.registered ? globalShortcut : globalEnabled ? "Needs save" : "Disabled"}
          </span>
        </div>
      </section>
      <section className="settings-card shortcut-editor">
        {([
          {
            id: "local" as const,
            title: "In-app capture",
            description: "Available only while Burrowise is the active app.",
            enabled: localEnabled,
            setEnabled: setLocalEnabled,
            shortcut: localShortcut,
            setShortcut: setLocalShortcut,
          },
          {
            id: "global" as const,
            title: "Global capture",
            description: "Brings Burrowise forward when you are using another app.",
            enabled: globalEnabled,
            setEnabled: setGlobalEnabled,
            shortcut: globalShortcut,
            setShortcut: setGlobalShortcut,
          },
        ]).map((item) => (
          <div className="shortcut-binding" key={item.id}>
            <div className="shortcut-binding-heading">
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <label className="provider-toggle">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(event) => item.setEnabled(event.target.checked)}
                />
                <span>{item.enabled ? "Enabled" : "Disabled"}</span>
              </label>
            </div>
            <label>
              <span>Key combination</span>
              <input
                readOnly
                value={recording === item.id ? "Press your shortcut…" : item.shortcut}
                onFocus={() => setRecording(item.id)}
                onBlur={() => setRecording(null)}
                onKeyDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.key === "Escape") {
                    setRecording(null);
                    event.currentTarget.blur();
                    return;
                  }
                  const next = shortcutFromKeyboardEvent(event);
                  if (!next) {
                    setStatus("Add a letter, number, Space, or another key to your modifiers.");
                    return;
                  }
                  item.setShortcut(next);
                  setRecording(null);
                  setStatus(`${item.title} shortcut recorded. Save to apply it.`);
                  event.currentTarget.blur();
                }}
                aria-label={`${item.title} key combination`}
              />
            </label>
          </div>
        ))}
        <button
          className="primary-button"
          onClick={save}
          disabled={busy || !globalShortcut.trim() || !localShortcut.trim()}
        >
          {busy ? <CircleNotch className="spin" /> : <Check />}
          Save shortcuts
        </button>
        <small>Click a key field and press the complete combination. Escape cancels recording.</small>
      </section>
      <p className="sync-status" role="status">{status}</p>
    </>
  );
}
function SyncDisconnectConfirm({ working, onCancel, onConfirm }: { working: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [working, onCancel]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !working) onCancel();
      }}
    >
      <section
        className="note-trash-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-disconnect-title"
      >
        <span className="confirm-danger-icon">
          <CloudArrowUp />
        </span>
        <div>
          <small>Disconnect encrypted sync</small>
          <h2 id="sync-disconnect-title">Disconnect this Mac?</h2>
          <p>
            The access token will be removed from macOS Keychain. Local brain
            files and encrypted objects already stored by the service will not
            be deleted.
          </p>
        </div>
        <footer>
          <button
            className="secondary-button"
            onClick={onCancel}
            disabled={working}
          >
            Keep connected
          </button>
          <button
            className="danger-button"
            onClick={onConfirm}
            disabled={working}
          >
            {working ? <CircleNotch className="spin" /> : <X />}{" "}
            {working ? "Disconnecting…" : "Disconnect"}
          </button>
        </footer>
      </section>
    </div>
  );
}
function SyncSettings() {
  const [syncState, setSyncState] = useState<SyncOverviewState | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [serviceUrl, setServiceUrl] = useState("http://localhost:3000");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Checking encrypted sync state…");
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  useEffect(() => {
    getSyncOverview()
      .then((state) => {
        setSyncState(state);
        if (state.serviceUrl) setServiceUrl(state.serviceUrl);
        if (state.accountEmail) setEmail(state.accountEmail);
        setStatus(
          state.enabled
            ? "Account connected. Unlock with the encryption passphrase for this app session."
            : "Sync is off. This brain remains only on this Mac.",
        );
      })
      .catch((error) => setStatus(errorMessage(error)));
  }, []);
  const connect = async () => {
    setBusy(true);
    setStatus(
      mode === "register"
        ? "Creating the account and deriving encryption keys locally…"
        : "Authenticating, then deriving encryption keys locally…",
    );
    try {
      const state = await authenticateSync({
        mode,
        serviceUrl,
        email,
        password,
        encryptionPassphrase: passphrase,
      });
      setSyncState({ ...state, unlocked: true });
      setPassword("");
      setPassphrase("");
      setStatus(
        "Connected and unlocked. The encryption passphrase was not sent or stored.",
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const unlock = async () => {
    setBusy(true);
    setStatus("Deriving the vault key locally…");
    try {
      setSyncState(await unlockSync(passphrase));
      setPassphrase("");
      setStatus("Unlocked for this app session. Keys remain in memory only.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const syncNow = async () => {
    setBusy(true);
    setLastResult(null);
    try {
      const result = await synchronizeBrain({ onProgress: setStatus });
      setLastResult(result);
      setSyncState((current) => current ? ({
        ...current,
        lastSyncAt: result.lastSyncAt,
      }) : current);
      setStatus(
        `Sync complete: ${result.stats.uploaded} uploaded, ${result.stats.downloaded} restored, ${result.stats.conflicts} conflicts.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      setSyncState({ ...(await disconnectSync()), unlocked: false });
      setLastResult(null);
      setConfirmingDisconnect(false);
      setStatus(
        "Disconnected. The access token was removed from macOS Keychain; local files were untouched.",
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  if (!syncState)
    return (
      <>
        <SettingsTitle
          eyebrow="Optional service"
          title="Sync & backup"
          copy="The desktop app works without an account."
        />
        <div className="sync-empty">
          <CircleNotch className="spin" size={30} />
          <p>{status}</p>
        </div>
      </>
    );
  return (
    <>
      <SettingsTitle
        eyebrow="Optional zero-knowledge service"
        title="Sync & backup"
        copy="Back up and synchronize encrypted objects without giving the service your filenames, content, or decryption key."
      />
      <div className="settings-notice">
        <ShieldCheck />
        <span>
          <strong>Encryption happens on this Mac</strong>
          <small>
            The account password authenticates you. A separate encryption
            passphrase derives keys locally and is never sent or stored. Losing
            it means the service cannot recover the backup.
          </small>
        </span>
      </div>
      {!syncState.enabled ? (
        <section className="settings-card sync-setup-card">
          <div className="segmented">
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >
              Create account
            </button>
          </div>
          <label>
            <span>Sync service</span>
            <input
              value={serviceUrl}
              onChange={(event) => setServiceUrl(event.target.value)}
              placeholder="https://sync.example.com"
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Account password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <small>
              Sent to the service for authentication · 12 characters minimum
            </small>
          </label>
          <label>
            <span>Encryption passphrase</span>
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
            <small className="warning-copy">
              Never sent to the service · 12 characters minimum · no server
              recovery
            </small>
          </label>
          <button
            className="primary-button"
            onClick={connect}
            disabled={
              busy ||
              !email.includes("@") ||
              password.length < 12 ||
              passphrase.length < 12
            }
          >
            {busy ? <CircleNotch className="spin" /> : <CloudArrowUp />}{" "}
            {mode === "register" ? "Create & connect" : "Sign in & connect"}
          </button>
        </section>
      ) : (
        <section className="settings-card sync-connected-card">
          <div className="sync-account">
            <span className="large-setting-icon">
              <CloudArrowUp />
            </span>
            <div>
              <small>Connected account</small>
              <strong>{syncState.accountEmail}</strong>
              <p>{syncState.serviceUrl}</p>
            </div>
            <span className="status connected">
              {syncState.unlocked ? "Unlocked" : "Locked"}
            </span>
          </div>
          {!syncState.unlocked ? (
            <div className="sync-unlock">
              <label>
                <span>Encryption passphrase</span>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="Unlock for this session"
                />
              </label>
              <button
                className="primary-button"
                onClick={unlock}
                disabled={busy || passphrase.length < 12}
              >
                <ShieldCheck /> Unlock locally
              </button>
            </div>
          ) : (
            <>
              <div className="sync-actions">
                <button
                  className="primary-button"
                  onClick={syncNow}
                  disabled={busy}
                >
                  <CloudArrowUp /> {busy ? "Synchronizing…" : "Sync now"}
                </button>
                <span>
                  Last sync:{" "}
                  {syncState.lastSyncAt
                    ? new Date(syncState.lastSyncAt).toLocaleString()
                    : "Never"}
                </span>
              </div>
              {lastResult ? (
                <div className="sync-result">
                  <Checks />
                  <span>
                    <strong>
                      {lastResult.totalLocalFiles} local files checked
                    </strong>
                    <small>
                      {lastResult.stats.uploaded} uploaded ·{" "}
                      {lastResult.stats.downloaded} downloaded ·{" "}
                      {lastResult.stats.unchanged} unchanged ·{" "}
                      {lastResult.stats.conflicts} conflicts ·{" "}
                      {lastResult.stats.skippedLarge} files over 16 MB skipped
                    </small>
                  </span>
                </div>
              ) : null}
            </>
          )}
          <button
            className="danger-link"
            onClick={() => setConfirmingDisconnect(true)}
            disabled={busy}
          >
            Disconnect this Mac
          </button>
        </section>
      )}
      <p className="sync-status" role="status">
        {status}
      </p>
      <section className="sync-boundaries">
        <div>
          <ShieldCheck />
          <span>
            <strong>The service can see</strong>
            <small>
              Your account email, opaque object IDs, ciphertext sizes,
              revisions, device identifiers, and sync times.
            </small>
          </span>
        </div>
        <div>
          <FileText />
          <span>
            <strong>The service cannot see</strong>
            <small>
              Brain filenames, folder hierarchy, Markdown, audio contents, tags,
              notes, chats, or the encryption passphrase.
            </small>
          </span>
        </div>
        <div>
          <Info />
          <span>
            <strong>Conflict policy</strong>
            <small>
              Remote changes replace only a provably unchanged local file.
              Otherwise the remote copy enters review/sync-conflicts and your
              local file remains untouched.
            </small>
          </span>
        </div>
      </section>
      {confirmingDisconnect ? (
        <SyncDisconnectConfirm
          working={busy}
          onCancel={() => setConfirmingDisconnect(false)}
          onConfirm={disconnect}
        />
      ) : null}
    </>
  );
}

interface AppBootstrapState extends BootstrapState {
  error?: string;
}

function Onboarding({ onReady }: { onReady: (state: BootstrapState) => void }) {
  const [status, setStatus] = useState(
    "Choose an ordinary folder. Burrowise will create readable Markdown and keep its rebuildable metadata alongside it.",
  );
  const [busy, setBusy] = useState(false);
  const chooseFolder = async () => {
    setBusy(true);
    try {
      const selected = await chooseBrainFolder();
      if (!selected) {
        setStatus("No folder was selected. Nothing was changed.");
        return;
      }
      setStatus("Preparing your local brain...");
      onReady(await configureBrainFolder(selected));
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <span className="onboarding-mark">
          <Brain weight="duotone" />
        </span>
        <p className="eyebrow">Local-first setup</p>
        <h1>Your thoughts should belong to you.</h1>
        <p className="onboarding-copy">
          Start with a folder on this Mac. Captures remain useful as audio and
          Markdown even when no AI model is installed.
        </p>
        <div className="onboarding-points">
          <div>
            <Folder />
            <span>
              <strong>Human-readable files</strong>
              <small>Open them with Finder, Obsidian, or any editor.</small>
            </span>
          </div>
          <div>
            <ShieldCheck />
            <span>
              <strong>Private by default</strong>
              <small>No account and no silent cloud fallback.</small>
            </span>
          </div>
          <div>
            <Waveform />
            <span>
              <strong>Record before setup is complete</strong>
              <small>Raw audio is always saved before enrichment.</small>
            </span>
          </div>
        </div>
        <button
          className="primary-button onboarding-action"
          onClick={chooseFolder}
          disabled={busy}
        >
          <Folder /> {busy ? "Preparing folder..." : "Choose brain folder"}
        </button>
        <p className="onboarding-status" role="status">
          {status}
        </p>
      </section>
    </main>
  );
}

function LoadingApp() {
  return (
    <main className="loading-app">
      <Brain weight="duotone" />
      <span>Opening your local brain...</span>
    </main>
  );
}

function BootstrapError({ error }: { error: string }) {
  return (
    <main className="fatal-error-state">
      <section>
        <p>Local startup error</p>
        <h1>Burrowise could not read its configuration.</h1>
        <span>
          No brain files were changed. Reload to retry, or copy this diagnostic
          if the problem continues.
        </span>
        <pre>{error}</pre>
        <div>
          <button onClick={() => window.location.reload()}>
            Reload interface
          </button>
          <button onClick={() => navigator.clipboard?.writeText(error)}>
            Copy diagnostic
          </button>
        </div>
      </section>
    </main>
  );
}

function MicrophoneOnboarding({
  bootstrap,
  onReady,
}: {
  bootstrap: BootstrapState;
  onReady: (state: BootstrapState) => void;
}) {
  const initialState = bootstrap.microphonePermission || "not-requested";
  const [permissionState, setPermissionState] = useState(initialState);
  const [message, setMessage] = useState(
    initialState === "denied"
      ? "Microphone access is currently denied. You can retry after enabling it in System Settings."
      : "macOS will show its permission prompt only after you click Grant microphone access.",
  );
  const [busy, setBusy] = useState(false);

  const requestAccess = async () => {
    setBusy(true);
    setPermissionState("requesting");
    setMessage("Waiting for the microphone permission prompt...");
    const result = await requestMicrophoneAccess();
    setPermissionState(result.state);
    setMessage(result.message);
    setBusy(false);
    if (result.state === "granted")
      onReady(await setMicrophonePermissionState("granted"));
    else await setMicrophonePermissionState(result.state);
  };

  const continueWithoutMicrophone = async () =>
    onReady(await setMicrophonePermissionState("skipped"));
  const denied = permissionState === "denied";
  const unsupported = permissionState === "unsupported";

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card permission-card">
        <span className="onboarding-mark">
          <Microphone weight="fill" />
        </span>
        <p className="eyebrow">Microphone permission</p>
        <h1>Record only when you choose.</h1>
        <p className="onboarding-copy">
          Burrowise needs microphone access for voice capture. Hold the control
          for a quick thought, or tap once to record longer and tap again to
          stop. It never listens in the background, and original audio stays in
          your selected brain folder.
        </p>
        <div className="permission-explainer">
          <ShieldCheck />
          <div>
            <strong>You remain in control</strong>
            <ul>
              <li>No ambient or always-on listening</li>
              <li>No cloud upload without a separate confirmation</li>
              <li>You can revoke access in macOS System Settings</li>
            </ul>
          </div>
        </div>
        {denied ? (
          <div className="permission-warning">
            <Info />
            <span>
              <strong>Access denied</strong>
              <small>
                Open System Settings → Privacy &amp; Security → Microphone,
                enable Burrowise, then retry.
              </small>
            </span>
          </div>
        ) : null}
        {unsupported ? (
          <div className="permission-warning">
            <Info />
            <span>
              <strong>Recording unavailable here</strong>
              <small>
                The browser preview does not expose microphone capture. The
                native desktop app remains the supported recording environment.
              </small>
            </span>
          </div>
        ) : null}
        <div className="onboarding-actions">
          <button
            className="primary-button onboarding-action"
            onClick={requestAccess}
            disabled={busy}
          >
            <Microphone />{" "}
            {busy
              ? "Waiting for macOS..."
              : denied
                ? "Retry microphone access"
                : "Grant microphone access"}
          </button>
          {denied ? (
            <button
              className="secondary-button"
              onClick={openMicrophoneSettings}
            >
              Open System Settings
            </button>
          ) : null}
          <button
            className="secondary-button"
            onClick={continueWithoutMicrophone}
          >
            Not now
          </button>
        </div>
        <p className="onboarding-status" role="status">
          {message}
        </p>
      </section>
    </main>
  );
}

function SpeechOnboarding({
  bootstrap,
  onReady,
}: {
  bootstrap: BootstrapState;
  onReady: (state: BootstrapState) => void;
}) {
  const [message, setMessage] = useState(
    bootstrap.speechPermission === "denied"
      ? "Speech Recognition is denied in System Settings. Your recordings remain available as audio."
      : "macOS will show a separate Speech Recognition prompt after you choose Grant access.",
  );
  const [busy, setBusy] = useState(false);
  const requestAccess = async () => {
    setBusy(true);
    setMessage("Waiting for the macOS Speech Recognition prompt...");
    try {
      const next = await requestSpeechPermission();
      onReady(next);
      setMessage(
        next.speechPermission === "granted"
          ? "On-device Apple Speech is ready."
          : "Speech Recognition was not granted. You can use Record only or enable it in System Settings.",
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const recordOnly = async () =>
    onReady(await setTranscriptionProvider("none"));
  const denied = ["denied", "restricted"].includes(bootstrap.speechPermission);
  return (
    <main className="onboarding-shell">
      <section className="onboarding-card permission-card">
        <span className="onboarding-mark">
          <Waveform weight="bold" />
        </span>
        <p className="eyebrow">Speech Recognition permission</p>
        <h1>Turn saved audio into text on this Mac.</h1>
        <p className="onboarding-copy">
          Apple Speech can transcribe each recording after the original WAV file
          is safely written. Burrowise requires on-device recognition and
          refuses to send the audio to Apple when an offline recognizer is
          unavailable.
        </p>
        <div className="permission-explainer">
          <ShieldCheck />
          <div>
            <strong>Local transcription boundary</strong>
            <ul>
              <li>The original audio is written before recognition starts</li>
              <li>
                On-device recognition is required—there is no network fallback
              </li>
              <li>
                The resulting transcript, summary, and tags stay in your brain
                folder
              </li>
            </ul>
          </div>
        </div>
        {denied ? (
          <div className="permission-warning">
            <Info />
            <span>
              <strong>Speech Recognition unavailable</strong>
              <small>
                Enable Burrowise under System Settings → Privacy &amp;
                Security → Speech Recognition, then retry.
              </small>
            </span>
          </div>
        ) : null}
        <div className="onboarding-actions">
          <button
            className="primary-button onboarding-action"
            onClick={requestAccess}
            disabled={busy}
          >
            <Waveform />{" "}
            {busy
              ? "Waiting for macOS..."
              : denied
                ? "Retry Speech Recognition access"
                : "Grant Speech Recognition access"}
          </button>
          {denied ? (
            <button className="secondary-button" onClick={openSpeechSettings}>
              Open System Settings
            </button>
          ) : null}
          <button className="secondary-button" onClick={recordOnly}>
            Use Record only
          </button>
        </div>
        <p className="onboarding-status" role="status">
          {message}
        </p>
      </section>
    </main>
  );
}

function normalizeSession(session: CaptureSession): SessionRailItem {
  const created = new Date(session.createdAt);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const sameDay = (left: Date, right: Date) =>
    left.toDateString() === right.toDateString();
  return {
    ...session,
    group: sameDay(created, today)
      ? "Today"
      : sameDay(created, yesterday)
        ? "Yesterday"
        : "Previous 7 Days",
    time: sameDay(created, today)
      ? created.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : created.toLocaleDateString([], { month: "short", day: "numeric" }),
    meta: `${created.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} · ${session.audioBytes ? `${Math.max(1, Math.round(session.audioBytes / 1024))} KB` : "pending"}`,
  };
}

export function App() {
  const [page, setPage] = useState<RouteId>(getRouteFromHash);
  const [bootstrap, setBootstrap] = useState<AppBootstrapState | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [dashboardOverview, setDashboardOverview] =
    useState<DashboardOverview | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardRefreshToken, setDashboardRefreshToken] = useState(0);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [localCaptureShortcut, setLocalCaptureShortcut] =
    useState<ShortcutSettingsState | null>(null);
  const {
    preference,
    setPreference,
    resolved,
    density,
    setDensity,
    reduceMotion,
    setReduceMotion,
  } = useTheme();
  const [retrievalSettings, setRetrievalSettings] = useRetrievalSettings();
  const onSessionSaved = (saved: CaptureSession) => {
    setSelectedSessionId(saved.id);
    setBootstrap((current) =>
      current
        ? {
            ...current,
            sessions: [
              saved,
              ...current.sessions.filter((session) => session.id !== saved.id),
            ],
          }
        : current,
    );
  };
  const captureRecorder = useCaptureRecorder({
    onSessionSaved,
    transcriptionProvider: bootstrap?.transcriptionProvider || "none",
    correctionPreference:
      bootstrap?.transcriptionCorrectionPreference || "verbatim",
  });
  useEffect(() => {
    getBootstrapState()
      .then(setBootstrap)
      .catch((error) =>
        setBootstrap({
          configured: false,
          error: errorMessage(error),
          brainFolders: [],
          activeBrain: null,
          sessions: [],
          transcriptionProvider: "none",
          microphonePermission: "not-requested",
          speechPermission: "not-requested",
          transcriptionCorrectionPreference: "verbatim",
          defaultAgentMode: "read-only",
          allowGeneralKnowledgeDefault: false,
          runtime: "error",
        }),
      );
  }, []);
  useEffect(() => {
    const onHash = () => setPage(getRouteFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenForQuickCapture(() => {
      setFocusRequest(null);
      window.location.hash = "#/capture";
      setPage("capture");
    })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, []);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenForSharedImports((report) => {
      window.dispatchEvent(
        new CustomEvent("second-brain:shared-import", {
          detail: report.message,
        }),
      );
      setFocusRequest(null);
      window.location.hash = "#/knowledge";
      setPage("knowledge");
      setDashboardRefreshToken((value) => value + 1);
    })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, []);
  useEffect(() => {
    getShortcutSettings().then(setLocalCaptureShortcut).catch(() => undefined);
    const onSettings = (event: Event) => {
      setLocalCaptureShortcut((event as CustomEvent<ShortcutSettingsState>).detail);
    };
    window.addEventListener("second-brain:shortcut-settings", onSettings);
    return () => window.removeEventListener("second-brain:shortcut-settings", onSettings);
  }, []);
  useEffect(() => {
    const onLocalCapture = (event: KeyboardEvent) => {
      if (
        !localCaptureShortcut?.localEnabled ||
        event.repeat ||
        !keyboardEventMatchesShortcut(event, localCaptureShortcut.localShortcut)
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")
      ) {
        return;
      }
      event.preventDefault();
      setFocusRequest(null);
      window.location.hash = "#/capture";
      setPage("capture");
    };
    window.addEventListener("keydown", onLocalCapture);
    return () => window.removeEventListener("keydown", onLocalCapture);
  }, [localCaptureShortcut]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.location.hash = "#/knowledge";
        setPage("knowledge");
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  useEffect(() => {
    if (!bootstrap?.configured) return;
    let cancelled = false;
    getDashboardOverview()
      .then((overview) => {
        if (!cancelled) {
          setDashboardOverview(overview);
          setDashboardError("");
        }
      })
      .catch((error) => {
        if (!cancelled) setDashboardError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [
    bootstrap?.configured,
    bootstrap?.activeBrain,
    bootstrap?.sessions,
    page,
    dashboardRefreshToken,
  ]);
  const navigate: Navigate = (nextPage, { preserveFocus = false } = {}) => {
    if (!preserveFocus) setFocusRequest(null);
    window.location.hash = `#/${nextPage}`;
    setPage(nextPage);
  };
  if (!bootstrap) return <LoadingApp />;
  if (bootstrap.runtime === "error")
    return (
      <BootstrapError error={bootstrap.error || "Unknown startup error"} />
    );
  if (!bootstrap.configured) return <Onboarding onReady={setBootstrap} />;
  if (!["granted", "skipped"].includes(bootstrap.microphonePermission))
    return (
      <MicrophoneOnboarding bootstrap={bootstrap} onReady={setBootstrap} />
    );
  if (
    bootstrap.transcriptionProvider === "apple-speech" &&
    bootstrap.speechPermission !== "granted"
  )
    return <SpeechOnboarding bootstrap={bootstrap} onReady={setBootstrap} />;
  const sessionItems = bootstrap.sessions.map(normalizeSession);
  const latestSession = sessionItems[0] || null;
  const selectedSession =
    sessionItems.find((session) => session.id === selectedSessionId) ||
    latestSession;
  const onSessionDeleted = (sessionId: string) => {
    setSelectedSessionId(null);
    setBootstrap((current) =>
      current
        ? {
            ...current,
            sessions: current.sessions.filter(
              (session) => session.id !== sessionId,
            ),
          }
        : current,
    );
  };
  const openActivity = (activity: DashboardActivity) => {
    const separator = activity.id.indexOf(":");
    const recordId =
      separator >= 0 ? activity.id.slice(separator + 1) : activity.id;
    if (activity.kind === "capture") setSelectedSessionId(recordId);
    setFocusRequest({
      kind: activity.kind,
      recordId,
      relativePath: activity.relativePath || null,
      token: Date.now(),
    });
    const target = ["search", "library", "notes"].includes(activity.target)
      ? "knowledge"
      : routes.some((route) => route.id === activity.target)
        ? (activity.target as RouteId)
        : "home";
    navigate(target, { preserveFocus: true });
  };
  const startInterviewSetup = () => {
    setFocusRequest({
      kind: "interview-new",
      recordId: null,
      relativePath: null,
      token: Date.now(),
    });
    navigate("interviews", { preserveFocus: true });
  };
  const contentByRoute: Record<RouteId, ReactNode> = {
    home: (
      <HomeDashboard
        navigate={navigate}
        openActivity={openActivity}
        startInterviewSetup={startInterviewSetup}
        overview={dashboardOverview}
        dashboardError={dashboardError}
        retrievalSettings={retrievalSettings}
      />
    ),
    capture: (
      <CapturePage
        session={selectedSession}
        transcriptionProvider={bootstrap.transcriptionProvider}
        recorder={captureRecorder}
        onSessionSaved={onSessionSaved}
        onSessionDeleted={onSessionDeleted}
      />
    ),
    knowledge: (
      <KnowledgePage
        focusRequest={focusRequest}
        retrievalSettings={retrievalSettings}
      />
    ),
    search: <KnowledgePage focusRequest={focusRequest} retrievalSettings={retrievalSettings} />,
    library: <KnowledgePage focusRequest={focusRequest} retrievalSettings={retrievalSettings} />,
    notes: <KnowledgePage focusRequest={focusRequest} retrievalSettings={retrievalSettings} />,
    review: (
      <ReviewPage
        onDataChanged={() => setDashboardRefreshToken((value) => value + 1)}
      />
    ),
    chat: (
      <ChatPage
        focusRequest={focusRequest?.kind === "chat" ? focusRequest : null}
        retrievalSettings={retrievalSettings}
        defaultAgentMode={bootstrap.defaultAgentMode}
        allowGeneralKnowledgeDefault={bootstrap.allowGeneralKnowledgeDefault}
      />
    ),
    interviews: (
      <InterviewsPage
        focusRequest={
          focusRequest &&
          ["interview", "interview-new"].includes(focusRequest.kind)
            ? focusRequest
            : null
        }
        retrievalSettings={retrievalSettings}
      />
    ),
    studio: (
      <Suspense
        fallback={
          <main className="feature-page">
            <div className="empty-state">
              <CircleNotch className="spin" size={30} />
              <h2>Loading Studio…</h2>
            </div>
          </main>
        }
      >
        <ContentStudioPage
          focusRequest={focusRequest?.kind === "project" ? focusRequest : null}
          retrievalSettings={retrievalSettings}
        />
      </Suspense>
    ),
    tags: <TagsPage />,
    settings: (
      <SettingsPage
        preference={preference}
        setPreference={setPreference}
        resolved={resolved}
        density={density}
        setDensity={setDensity}
        reduceMotion={reduceMotion}
        setReduceMotion={setReduceMotion}
        bootstrap={bootstrap}
        onBootstrap={setBootstrap}
        retrievalSettings={retrievalSettings}
        setRetrievalSettings={setRetrievalSettings}
      />
    ),
  };
  const content: ReactNode = contentByRoute[page];
  return (
    <div
      className={`app-shell ${page === "capture" ? "capture-shell" : "standard-shell"}`}
    >
      <AppNav
        page={page}
        navigate={navigate}
        activeBrain={bootstrap.activeBrain}
        recorder={captureRecorder}
        reviewCount={dashboardOverview?.stats.reviewCount || 0}
      />
      {page === "capture" ? (
        <SessionRail
          onNewCapture={() => navigate("capture")}
          items={sessionItems}
          selectedId={selectedSession?.id || null}
          onSelect={setSelectedSessionId}
        />
      ) : null}
      {content}
    </div>
  );
}
