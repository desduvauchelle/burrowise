import {
  createOpaqueBrainId,
  decryptSyncObject,
  deriveVaultKeys,
  encryptSyncObject,
  generateKeySalt,
} from "@second-brain/sync-protocol";
import type { SyncEnvelope, VaultKeys } from "@second-brain/sync-protocol";
import type { SyncManifestEntry, SyncState } from "../types/domain";
import {
  clearSyncCredentials,
  getSyncAccessToken,
  getSyncState,
  listLocalSyncFiles,
  loadSyncManifest,
  persistSyncManifest,
  readLocalSyncFile,
  storeSyncCredentials,
  writeLocalSyncFile,
} from "./platform";
import { normalizeSyncServiceUrl } from "./syncUrl";

const MAX_OBJECT_BYTES = 16 * 1024 * 1024;
let activeKeys: VaultKeys | null = null;
let activeBrainId = "";

interface RequestOptions extends RequestInit {
  token?: string;
}

interface AuthenticationInput {
  mode: "login" | "register";
  serviceUrl: string;
  email: string;
  password: string;
  encryptionPassphrase: string;
}

interface AuthenticationResponse {
  account: { email: string; keySalt: string };
  accessToken: string;
  expiresAt: string;
}

interface RemoteSyncObject extends SyncEnvelope {
  revision: number;
}

interface RemoteObjectsResponse {
  objects: RemoteSyncObject[];
}

interface UploadResponse {
  object: RemoteSyncObject;
}

export interface SyncProgress {
  onProgress?: (message: string) => void;
}

export interface SyncResult {
  stats: {
    uploaded: number;
    downloaded: number;
    unchanged: number;
    conflicts: number;
    skippedLarge: number;
    remoteDeletionsIgnored: number;
  };
  lastSyncAt: string | null;
  totalLocalFiles: number;
  totalRemoteObjects: number;
}

class SyncServiceError extends Error {
  code?: string;
  currentRevision?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function request<T>(serviceUrl: string, path: string, { token, ...options }: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers,
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorBody = isRecord(body) && isRecord(body.error) ? body.error : {};
    const error = new SyncServiceError(typeof errorBody.message === "string" ? errorBody.message : `Sync service request failed (${response.status}).`);
    if (typeof errorBody.code === "string") error.code = errorBody.code;
    if (isRecord(body) && typeof body.currentRevision === "number") error.currentRevision = body.currentRevision;
    throw error;
  }
  return body as T;
}

async function deriveActiveKeys(passphrase: string, keySalt: string): Promise<string> {
  activeKeys = await deriveVaultKeys(passphrase, keySalt);
  activeBrainId = await createOpaqueBrainId(activeKeys.indexKey);
  return activeBrainId;
}

export async function authenticateSync({ mode, serviceUrl, email, password, encryptionPassphrase }: AuthenticationInput): Promise<SyncState> {
  const validatedServiceUrl = normalizeSyncServiceUrl(serviceUrl);
  const body = mode === "register" ? { email, password, keySalt: generateKeySalt() } : { email, password };
  const result = await request<AuthenticationResponse>(validatedServiceUrl, `/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
  const state = await storeSyncCredentials({ serviceUrl: validatedServiceUrl, email: result.account.email, keySalt: result.account.keySalt, accessToken: result.accessToken, expiresAt: result.expiresAt });
  await deriveActiveKeys(encryptionPassphrase, result.account.keySalt);
  return state;
}

export async function unlockSync(encryptionPassphrase: string): Promise<SyncState & { unlocked: true; brainId: string }> {
  const state = await getSyncState();
  if (!state.keySalt || !state.hasAccessToken) throw new Error("Sign in before unlocking encrypted sync.");
  await deriveActiveKeys(encryptionPassphrase, state.keySalt);
  const manifest = await loadSyncManifest();
  if (manifest.brainId && manifest.brainId !== activeBrainId) {
    activeKeys = null;
    activeBrainId = "";
    throw new Error("That encryption passphrase does not unlock this brain. No files were changed.");
  }
  return { ...state, unlocked: true, brainId: activeBrainId };
}

export async function getSyncOverview(): Promise<SyncState & { unlocked: boolean }> {
  const state = await getSyncState();
  return { ...state, unlocked: Boolean(activeKeys && activeBrainId) };
}

export async function disconnectSync(): Promise<SyncState> {
  const state = await getSyncState();
  if (state.serviceUrl && state.hasAccessToken) {
    const token = await getSyncAccessToken().catch(() => null);
    if (token) await request(state.serviceUrl, "/api/auth/logout", { method: "POST", token }).catch(() => undefined);
  }
  activeKeys = null;
  activeBrainId = "";
  return clearSyncCredentials();
}

function manifestEntry(path: string, contentHash: string, remote: RemoteSyncObject): SyncManifestEntry {
  return { relativePath: path, contentHash, remoteRevision: remote.revision, ciphertextHash: remote.ciphertextHash, conflict: false, conflictPath: null };
}

export async function synchronizeBrain({ onProgress }: SyncProgress = {}): Promise<SyncResult> {
  const state = await getSyncState();
  if (!activeKeys || !activeBrainId) throw new Error("Enter the encryption passphrase to unlock sync for this app session.");
  const keys = activeKeys;
  if (!state.serviceUrl || !state.hasAccessToken) throw new Error("Connect a sync account first.");
  const token = await getSyncAccessToken();
  const manifest = await loadSyncManifest();
  if (manifest.brainId && manifest.brainId !== activeBrainId) throw new Error("This brain was previously synchronized with a different encryption passphrase.");
  manifest.brainId = activeBrainId;
  manifest.objects ||= {};
  const remoteResponse = await request<RemoteObjectsResponse>(state.serviceUrl, `/api/sync/objects?brainId=${activeBrainId}`, { token });
  const remoteObjects = remoteResponse.objects || [];
  const remoteById = new Map(remoteObjects.map((object) => [object.objectId, object]));
  let localFiles = await listLocalSyncFiles();
  let localByPath = new Map(localFiles.map((file) => [file.relativePath, file]));
  const decryptedById = new Map<string, Awaited<ReturnType<typeof decryptSyncObject>>>();
  const conflictedIds = new Set<string>();
  const stats = { uploaded: 0, downloaded: 0, unchanged: 0, conflicts: 0, skippedLarge: 0, remoteDeletionsIgnored: 0 };

  onProgress?.(`Checking ${remoteObjects.length} encrypted remote objects…`);
  for (const remote of remoteObjects) {
    if (remote.deleted) {
      stats.remoteDeletionsIgnored += 1;
      continue;
    }
    const decrypted = await decryptSyncObject({ keys, envelope: remote });
    decryptedById.set(remote.objectId, decrypted);
    const local = localByPath.get(decrypted.path);
    const previous = manifest.objects[remote.objectId];
    if (!local) {
      const outcome = await writeLocalSyncFile({ relativePath: decrypted.path, content: decrypted.content, expectedLocalHash: null });
      if (outcome.disposition === "conflict") stats.conflicts += 1;
      else stats.downloaded += 1;
      manifest.objects[remote.objectId] = manifestEntry(decrypted.path, decrypted.contentHash, remote);
    } else if (local.contentHash === decrypted.contentHash) {
      stats.unchanged += 1;
      manifest.objects[remote.objectId] = manifestEntry(decrypted.path, decrypted.contentHash, remote);
    } else if (previous && local.contentHash === previous.contentHash && remote.revision > previous.remoteRevision) {
      const outcome = await writeLocalSyncFile({ relativePath: decrypted.path, content: decrypted.content, expectedLocalHash: previous.contentHash });
      if (outcome.disposition === "conflict") stats.conflicts += 1;
      else stats.downloaded += 1;
      manifest.objects[remote.objectId] = manifestEntry(decrypted.path, decrypted.contentHash, remote);
    } else if (previous?.conflict && previous.remoteRevision === remote.revision) {
      stats.conflicts += 1;
      conflictedIds.add(remote.objectId);
    } else if (!previous || remote.revision > previous.remoteRevision) {
      const outcome = await writeLocalSyncFile({ relativePath: decrypted.path, content: decrypted.content, expectedLocalHash: null });
      stats.conflicts += 1;
      conflictedIds.add(remote.objectId);
      manifest.objects[remote.objectId] = { ...manifestEntry(decrypted.path, local.contentHash, remote), conflict: true, conflictPath: outcome.writtenPath };
    }
  }

  localFiles = await listLocalSyncFiles();
  localByPath = new Map(localFiles.map((file) => [file.relativePath, file]));
  let completed = 0;
  for (const local of localFiles) {
    completed += 1;
    onProgress?.(`Encrypting ${completed} of ${localFiles.length}: ${local.relativePath}`);
    if (local.size > MAX_OBJECT_BYTES) {
      stats.skippedLarge += 1;
      continue;
    }
    const bytes = await readLocalSyncFile(local.relativePath);
    const envelope = await encryptSyncObject({ keys, brainId: activeBrainId, path: local.relativePath, content: bytes, mimeType: local.mimeType, modifiedAt: local.modifiedAt });
    const remote = remoteById.get(envelope.objectId);
    const decryptedRemote = decryptedById.get(envelope.objectId);
    const previous = manifest.objects[envelope.objectId];
    if (remote && decryptedRemote?.contentHash === local.contentHash) {
      manifest.objects[envelope.objectId] = manifestEntry(local.relativePath, local.contentHash, remote);
      continue;
    }
    if (conflictedIds.has(envelope.objectId) || (previous?.conflict && remote?.revision === previous.remoteRevision)) continue;
    if (remote && (!previous || remote.revision > previous.remoteRevision)) continue;
    const result = await request<UploadResponse>(state.serviceUrl, "/api/sync/objects", { method: "PUT", token, body: JSON.stringify({ ...envelope, deviceId: state.deviceId, baseRevision: remote?.revision ?? null }) });
    remoteById.set(envelope.objectId, result.object);
    manifest.objects[envelope.objectId] = manifestEntry(local.relativePath, local.contentHash, result.object);
    stats.uploaded += 1;
  }
  const saved = await persistSyncManifest(manifest);
  return { stats, lastSyncAt: saved.lastSyncAt, totalLocalFiles: localByPath.size, totalRemoteObjects: remoteObjects.length };
}
