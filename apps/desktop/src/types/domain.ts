export interface ModelSelection {
  providerId: string;
  modelId: string;
}

export interface CaptureSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  folderPath: string;
  relativeFolder: string;
  status: string;
  audioPath: string | null;
  audioMimeType: string | null;
  audioBytes: number | null;
  transcriptPath: string;
  transcript: string;
  summary: string;
  tags: string[];
  processingError: string | null;
  transcriptionProvider: string | null;
  atomicNotes: AtomicNoteProposal[];
}

export interface TranscriptCleanupProposal {
  sessionId: string;
  original: string;
  proposed: string;
  providerId: string;
  modelId: string;
  locality: string;
}

export interface AudioRetentionResult {
  days: number | null;
  removedFiles: number;
  removedBytes: number;
}

export interface AtomicNoteProposal {
  id: string;
  title: string;
  content: string;
  sourceRelativePath: string;
  quote: string;
  reviewRelativePath: string;
  status: string;
  suggestedAction?: string;
  matchedNotePath?: string | null;
  confidence?: number | null;
}

export interface BinaryPayload {
  mimeType: string;
  bytes: number[];
}

export interface BootstrapState {
  configured: boolean;
  brainFolders: string[];
  activeBrain: string | null;
  transcriptionProvider: string;
  microphonePermission: string;
  speechPermission: string;
  transcriptionCorrectionPreference: string;
  defaultAgentMode: "read-only" | "read-and-propose" | "read-write";
  allowGeneralKnowledgeDefault: boolean;
  sessions: CaptureSession[];
  runtime: string;
}

export interface ShortcutSettingsState {
  enabled: boolean;
  shortcut: string;
  registered: boolean;
  localEnabled: boolean;
  localShortcut: string;
  detail: string;
}

export interface DashboardStats {
  noteCount: number;
  captureCount: number;
  retainedAudioBytes: number;
  storageBytes: number;
  reviewCount: number;
}

export interface DashboardActivity {
  id: string;
  kind: string;
  label: string;
  title: string;
  updatedAt: string;
  target: string;
  relativePath: string | null;
}

export interface DashboardOverview {
  stats: DashboardStats;
  recentActivity: DashboardActivity[];
  reviewCounts: Record<string, number>;
}

export interface LibraryStats {
  captureCount: number;
  fileCount: number;
  videoCount: number;
  imageCount: number;
  retainedAudioBytes: number;
  retainedImageBytes: number;
}

export interface ShareImportReport {
  imported: number;
  failed: number;
  message: string;
}

export interface LibraryItem {
  id: string;
  title: string;
  kind: string;
  relativePath: string;
  updatedAt: string;
  detail: string;
  sessionId: string | null;
  hasAudio: boolean;
  audioBytes: number;
  imageId: string | null;
  hasImage: boolean;
  imageBytes: number;
}

export interface LibraryOverview {
  stats: LibraryStats;
  items: LibraryItem[];
}

export interface ImageMemory {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  folderPath: string;
  relativeFolder: string;
  imagePath: string;
  relativeImagePath: string;
  imageMimeType: string;
  imageBytes: number;
  analysisImagePath: string;
  analysisImageMimeType: string;
  sourcePath: string;
  relativeSourcePath: string;
  status: string;
  extractedMarkdown: string;
  processingError: string | null;
  providerId: string | null;
  modelId: string | null;
  locality: string | null;
}

export interface NoteSource {
  relativePath: string;
  quote: string;
}

export interface NoteDocument {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  markdown: string;
  tags: string[];
  sources: NoteSource[];
  createdAt: string;
  updatedAt: string;
  relativePath: string;
}

export interface SaveNoteInput {
  relativePath?: string | null;
  title: string;
  body: string;
  tags: string[];
}

export interface ReviewRecord {
  id: string;
  itemType: string;
  title: string;
  detail: string;
  sourceRelativePath: string;
  quote: string;
  reason: string;
  proposedAction: string;
  proposedContent?: string;
  confidence: number | null;
  status: string;
  sessionId: string | null;
  reviewRelativePath: string;
  suggestedAction?: string;
  targetRelativePath?: string | null;
}

export interface ResolveReviewInput {
  id: string;
  decision: string;
}

export interface ReviewDecision {
  record: ReviewRecord;
  createdNote: NoteDocument | null;
  decisionRelativePath: string;
}

export interface TagSummary {
  name: string;
  count: number;
}

export interface TaggedSource {
  id: string;
  title: string;
  relativePath: string;
  sourceType: string;
  tags: string[];
  updatedAt: string;
  sourceCount: number;
}

export interface TagsOverview {
  tags: TagSummary[];
  sources: TaggedSource[];
}

export interface TranscriptionProvider {
  id: string;
  label: string;
  locality: string;
  installed: boolean;
  available: boolean;
  detail: string;
}

export interface ParakeetStatus {
  uvInstalled: boolean;
  cliInstalled: boolean;
  ffmpegInstalled: boolean;
  modelState: string;
  cachedBytes: number;
  modelTotalBytes: number;
  downloadInProgress: boolean;
  downloadError: string | null;
  executablePath: string | null;
  detail: string;
}

export interface SearchQuery {
  query: string;
  mode: string;
  scope: string;
  limit?: number | null;
  selectedPaths?: string[];
}

export interface SearchResult {
  passageId: string;
  title: string;
  relativePath: string;
  sourceType: string;
  quote: string;
  score: number;
  lexicalScore: number;
  semanticScore: number;
  matchType: string;
}

export interface IndexStats {
  filesIndexed: number;
  passagesIndexed: number;
  indexedAt: string;
}

export interface SourceDocument {
  title: string;
  relativePath: string;
  absolutePath: string;
  markdown: string;
}

export interface IndexedSource {
  title: string;
  relativePath: string;
  sourceType: string;
}

export interface Citation {
  passageId: string;
  number: number;
  title: string;
  relativePath: string;
  quote: string;
}

export type ConversationKind = "chat" | "interview";

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  scope: string;
  selectedPaths: string[];
  provider: string;
  model: string;
  preview: string;
  status: string;
  hostId: string | null;
  hostName: string | null;
  folderPath: string | null;
  relativeFolder: string | null;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
  citations: Citation[];
  provider: string;
  model: string;
  generalKnowledgeUsed: boolean;
  audioPath: string | null;
  audioMimeType: string | null;
  stage: string;
  analysis: string;
  status: string;
}

export interface SubmitConversationTurnInput {
  conversationId?: string | null;
  kind: ConversationKind;
  message: string;
  scope?: string;
  selectedPaths?: string[];
  allowGeneralKnowledge?: boolean;
  retrievalLimit?: number;
  answerMode?: string;
  agentMode?: "read-only" | "read-and-propose" | "read-write";
}

export interface ConversationExchange {
  conversation: Conversation;
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
  agentProposal: AgentProposal | null;
}

export type ChatConversation = Omit<Conversation, "kind" | "status" | "hostId" | "hostName" | "folderPath" | "relativeFolder">;
export type ChatMessage = Omit<ConversationMessage, "audioPath" | "audioMimeType" | "stage" | "analysis" | "status">;

export interface SendChatInput {
  conversationId?: string | null;
  message: string;
  scope: string;
  selectedPaths?: string[];
  allowGeneralKnowledge?: boolean;
  retrievalLimit?: number;
  answerMode?: string;
  agentMode?: "read-only" | "read-and-propose" | "read-write";
}

export interface AgentProposal {
  id: string;
  targetRelativePath: string;
  targetTitle: string;
  instruction: string;
  originalBody: string;
  proposedBody: string;
  queuedForReview: boolean;
}

export interface QueueAgentProposalInput {
  proposal: AgentProposal;
  conversationId: string;
}

export interface ChatTurn {
  conversation: ChatConversation;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  agentProposal: AgentProposal | null;
}

export interface InterviewHost {
  id: string;
  name: string;
  description: string;
  traits: string[];
  stages: string[];
  relativePath: string;
  instructions: string;
  builtIn: boolean;
}

export interface SaveInterviewHostInput {
  id?: string | null;
  name: string;
  description: string;
  traits?: string[];
  stages?: string[];
  instructions: string;
}

export type InterviewSession = Omit<Conversation, "kind" | "preview" | "hostId" | "hostName" | "folderPath" | "relativeFolder"> & {
  hostId: string;
  hostName: string;
  folderPath: string;
  relativeFolder: string;
};

export interface StartInterviewInput {
  hostId: string;
  scope: string;
  selectedPaths?: string[];
}

export type InterviewTurn = Omit<ConversationMessage, "conversationId" | "provider" | "model" | "generalKnowledgeUsed"> & {
  interviewId: string;
};

export interface InterviewStart {
  interview: InterviewSession;
  hostTurn: InterviewTurn;
}

export interface InterviewExchange {
  interview: InterviewSession;
  userTurn: InterviewTurn;
  hostTurn: InterviewTurn;
}

export interface SendInterviewTurnInput {
  interviewId: string;
  message: string;
  retrievalLimit?: number;
}

export interface CompleteInterviewAudioInput {
  interviewId: string;
  turnId: string;
  transcript: string;
}

export interface ProcessInterviewAudioInput {
  interviewId: string;
  turnId: string;
}

export interface InterviewAccessEntry {
  id: string;
  interviewId: string;
  turnId: string;
  passageId: string;
  title: string;
  relativePath: string;
  quote: string;
  accessedAt: string;
}

export interface ContentSkill {
  id: string;
  name: string;
  description: string;
  outputType: string;
  stages: string[];
  relativePath: string;
  instructions: string;
  builtIn: boolean;
}

export interface SaveContentSkillInput {
  id?: string | null;
  name: string;
  description: string;
  outputType: string;
  stages?: string[];
  instructions: string;
}

export interface ContentProject {
  id: string;
  title: string;
  brief: string;
  skillId: string;
  skillName: string;
  outputType: string;
  scope: string;
  selectedPaths: string[];
  status: string;
  currentStep: number;
  createdAt: string;
  updatedAt: string;
  folderPath: string;
  relativeFolder: string;
  provider: string;
  model: string;
}

export interface ContentStep {
  id: string;
  projectId: string;
  ordinal: number;
  name: string;
  status: string;
  revision: number;
  outputPath: string | null;
  outputMarkdown: string;
  createdAt: string;
  updatedAt: string;
  citations: Citation[];
}

export interface CreateContentProjectInput {
  title: string;
  brief: string;
  skillId: string;
  scope: string;
  selectedPaths?: string[];
}

export interface SaveContentStepRevisionInput {
  projectId: string;
  stepId: string;
  markdown: string;
}

export interface ContentProjectDetail {
  project: ContentProject;
  steps: ContentStep[];
}

export interface ContentStepRun {
  project: ContentProject;
  step: ContentStep;
}

export interface GenerationModel {
  id: string;
  label: string;
  providerId: string;
  capabilities: string[];
  contextWindow: number | null;
  pricing: ModelPricing | null;
  source: string;
}

export interface ModelPriceTier {
  costPerToken: string;
  minTokens: number;
  maxTokens: number | null;
}

export interface ModelPricing {
  inputPerToken: string | null;
  outputPerToken: string | null;
  cachedInputPerToken: string | null;
  inputTiers: ModelPriceTier[];
  outputTiers: ModelPriceTier[];
}

export interface GenerationProviderState {
  id: string;
  label: string;
  templateLabel: string;
  saved: boolean;
  transport: string;
  locality: string;
  enabled: boolean;
  configured: boolean;
  credentialConfigured: boolean;
  cloudConfirmed: boolean;
  installed: boolean;
  reachable: boolean;
  authenticated: boolean;
  tested: boolean;
  status: string;
  detail: string;
  baseUrl: string | null;
  executablePath: string | null;
  defaultModelId?: string | null;
  capabilities: string[];
  models: GenerationModel[];
  lastTestedAt: string | null;
  lastTestStatus: string | null;
}

export interface ProviderCatalog {
  providers: GenerationProviderState[];
  preferredModels: Record<string, ModelSelection>;
  favoriteModels: ModelSelection[];
  refreshed: boolean;
}

export interface SaveGenerationProviderInput {
  providerId: string;
  displayName: string;
  enabled: boolean;
  baseUrl: string | null;
  executablePath: string | null;
  cloudConfirmed: boolean;
}

export interface SaveProviderCredentialInput {
  providerId: string;
  apiKey: string;
}

export interface SetPreferredModelInput {
  capability: string;
  providerId: string;
  modelId: string;
}

export interface SetFavoriteModelInput {
  providerId: string;
  modelId: string;
  favorite: boolean;
}

export interface SetDefaultProviderModelInput {
  providerId: string;
  modelId: string;
}

export interface TestGenerationProviderInput {
  providerId: string;
  modelId: string;
}

export interface ProviderDiagnostic {
  providerId: string;
  modelId: string;
  status: string;
  message: string;
  outputPreview: string;
  testedAt: string;
}

export interface ProviderCostBucket {
  providerId: string;
  costMicros: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedRequestCount: number;
  unpricedRequestCount: number;
}

export interface RecentProviderCost {
  id: string;
  occurredAt: string;
  providerId: string;
  modelId: string;
  upstreamProvider: string | null;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number | null;
  costSource: "provider-reported" | "catalog-estimate" | "unpriced";
}

export interface ProviderCostSummary {
  periodStart: string;
  periodEnd: string;
  currency: "USD";
  totalCostMicros: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedRequestCount: number;
  unpricedRequestCount: number;
  lifetimeCostMicros: number;
  lifetimeRequestCount: number;
  monthlyBudgetMicros: number | null;
  byProvider: ProviderCostBucket[];
  recent: RecentProviderCost[];
}

export interface SyncState {
  serviceUrl: string | null;
  accountEmail: string | null;
  keySalt: string | null;
  tokenExpiresAt: string | null;
  enabled: boolean;
  deviceId: string;
  lastSyncAt: string | null;
  hasAccessToken: boolean;
}

export interface SaveSyncCredentialsInput {
  serviceUrl: string;
  email: string;
  keySalt: string;
  accessToken: string;
  expiresAt: string;
}

export interface SyncFileDescriptor {
  relativePath: string;
  size: number;
  modifiedAt: string;
  contentHash: string;
  mimeType: string;
}

export interface WriteSyncedFileInput {
  relativePath: string;
  content: Uint8Array | number[];
  expectedLocalHash: string | null;
}

export interface SyncWriteOutcome {
  relativePath: string;
  disposition: string;
  writtenPath: string;
  contentHash: string;
}

export interface SyncManifestEntry {
  relativePath: string;
  contentHash: string;
  remoteRevision: number;
  ciphertextHash: string;
  conflict: boolean;
  conflictPath: string | null;
}

export interface SyncManifest {
  brainId: string;
  lastSyncAt: string | null;
  objects: Record<string, SyncManifestEntry>;
}
