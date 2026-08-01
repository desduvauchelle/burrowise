const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const SYNC_PROTOCOL_VERSION = 1
export const SYNC_ALGORITHM = 'AES-256-GCM+PBKDF2-SHA256'
export const KEY_DERIVATION_ITERATIONS = 310000

function webCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is required for encrypted sync.')
  return globalThis.crypto
}

export function bytesToBase64(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export function base64ToBytes(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function concatBytes(...values) {
  const length = values.reduce((total, value) => total + value.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const value of values) {
    output.set(value, offset)
    offset += value.length
  }
  return output
}

async function sha256(bytes) {
  return new Uint8Array(await webCrypto().subtle.digest('SHA-256', bytes))
}

export function generateKeySalt() {
  return bytesToBase64(webCrypto().getRandomValues(new Uint8Array(32)))
}

export async function deriveVaultKeys(passphrase, saltBase64) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) {
    throw new Error('The encryption passphrase must contain at least 12 characters.')
  }
  const material = await webCrypto().subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = new Uint8Array(await webCrypto().subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(saltBase64), iterations: KEY_DERIVATION_ITERATIONS },
    material,
    512,
  ))
  const encryptionKey = await webCrypto().subtle.importKey(
    'raw',
    bits.slice(0, 32),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const indexKey = await webCrypto().subtle.importKey(
    'raw',
    bits.slice(32),
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  )
  bits.fill(0)
  return { encryptionKey, indexKey }
}

export async function opaqueIdentifier(indexKey, value) {
  const signature = new Uint8Array(await webCrypto().subtle.sign('HMAC', indexKey, encoder.encode(value)))
  return [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function contentDigest(content) {
  const bytes = typeof content === 'string' ? encoder.encode(content) : new Uint8Array(content)
  const digest = await sha256(bytes)
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function encryptSyncObject({ keys, brainId, path, content, mimeType = 'application/octet-stream', modifiedAt = new Date().toISOString() }) {
  if (!path || path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error('Sync paths must be safe relative paths.')
  }
  const bytes = typeof content === 'string' ? encoder.encode(content) : new Uint8Array(content)
  const objectId = await opaqueIdentifier(keys.indexKey, `path:${path}`)
  const plaintext = encoder.encode(JSON.stringify({
    version: SYNC_PROTOCOL_VERSION,
    path,
    mimeType,
    modifiedAt,
    content: bytesToBase64(bytes),
    contentHash: await contentDigest(bytes),
  }))
  const nonce = webCrypto().getRandomValues(new Uint8Array(12))
  const additionalData = encoder.encode(`second-brain-sync:v${SYNC_PROTOCOL_VERSION}:${brainId}:${objectId}`)
  const ciphertext = new Uint8Array(await webCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData, tagLength: 128 },
    keys.encryptionKey,
    plaintext,
  ))
  plaintext.fill(0)
  return {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    algorithm: SYNC_ALGORITHM,
    brainId,
    objectId,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
    ciphertextHash: await contentDigest(ciphertext),
    deleted: false,
  }
}

export async function decryptSyncObject({ keys, envelope }) {
  if (envelope.protocolVersion !== SYNC_PROTOCOL_VERSION || envelope.algorithm !== SYNC_ALGORITHM) {
    throw new Error('This encrypted object uses an unsupported sync protocol.')
  }
  const additionalData = encoder.encode(`second-brain-sync:v${SYNC_PROTOCOL_VERSION}:${envelope.brainId}:${envelope.objectId}`)
  let plaintext
  try {
    plaintext = new Uint8Array(await webCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.nonce), additionalData, tagLength: 128 },
      keys.encryptionKey,
      base64ToBytes(envelope.ciphertext),
    ))
  } catch {
    throw new Error('The object could not be decrypted. The passphrase may be wrong or the backup was altered.')
  }
  const decoded = JSON.parse(decoder.decode(plaintext))
  plaintext.fill(0)
  if (decoded.version !== SYNC_PROTOCOL_VERSION) throw new Error('Unsupported decrypted object version.')
  const expectedObjectId = await opaqueIdentifier(keys.indexKey, `path:${decoded.path}`)
  if (expectedObjectId !== envelope.objectId) throw new Error('Encrypted object path identity does not match.')
  const content = base64ToBytes(decoded.content)
  if (await contentDigest(content) !== decoded.contentHash) throw new Error('Decrypted content failed its integrity check.')
  return { path: decoded.path, mimeType: decoded.mimeType, modifiedAt: decoded.modifiedAt, content, contentHash: decoded.contentHash }
}

export async function createOpaqueBrainId(indexKey, localBrainId = 'primary') {
  return opaqueIdentifier(indexKey, `brain:${localBrainId}`)
}

export function clearByteArray(bytes) {
  if (bytes instanceof Uint8Array) bytes.fill(0)
}
