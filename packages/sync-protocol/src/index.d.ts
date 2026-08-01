export const SYNC_PROTOCOL_VERSION: 1
export const SYNC_ALGORITHM: 'AES-256-GCM+PBKDF2-SHA256'
export const KEY_DERIVATION_ITERATIONS: 310000
export interface VaultKeys { encryptionKey: CryptoKey; indexKey: CryptoKey }
export interface SyncEnvelope { protocolVersion: number; algorithm: string; brainId: string; objectId: string; nonce: string; ciphertext: string; ciphertextHash: string; deleted: boolean }
export function generateKeySalt(): string
export function deriveVaultKeys(passphrase: string, saltBase64: string): Promise<VaultKeys>
export function opaqueIdentifier(indexKey: CryptoKey, value: string): Promise<string>
export function contentDigest(content: string | Uint8Array | ArrayBuffer): Promise<string>
export function createOpaqueBrainId(indexKey: CryptoKey, localBrainId?: string): Promise<string>
export function encryptSyncObject(input: { keys: VaultKeys; brainId: string; path: string; content: string | Uint8Array | ArrayBuffer; mimeType?: string; modifiedAt?: string }): Promise<SyncEnvelope>
export function decryptSyncObject(input: { keys: VaultKeys; envelope: SyncEnvelope }): Promise<{ path: string; mimeType: string; modifiedAt: string; content: Uint8Array; contentHash: string }>
export function bytesToBase64(bytes: Uint8Array): string
export function base64ToBytes(value: string): Uint8Array
export function clearByteArray(bytes: Uint8Array): void
