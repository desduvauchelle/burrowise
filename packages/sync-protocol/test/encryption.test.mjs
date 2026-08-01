import test from 'node:test'
import assert from 'node:assert/strict'
import { createOpaqueBrainId, decryptSyncObject, deriveVaultKeys, encryptSyncObject, generateKeySalt } from '../src/index.js'

test('encrypts paths and content into an authenticated opaque envelope', async () => {
  const salt = generateKeySalt()
  const keys = await deriveVaultKeys('a correct horse battery staple', salt)
  const brainId = await createOpaqueBrainId(keys.indexKey)
  const envelope = await encryptSyncObject({ keys, brainId, path: 'notes/private.md', content: '# Private\n\nNo silent cloud fallback.' })
  assert.equal(envelope.ciphertext.includes('private'), false)
  assert.equal(envelope.objectId.includes('private'), false)
  const restored = await decryptSyncObject({ keys, envelope })
  assert.equal(restored.path, 'notes/private.md')
  assert.match(new TextDecoder().decode(restored.content), /No silent cloud fallback/)
})

test('rejects the wrong passphrase and tampered metadata', async () => {
  const salt = generateKeySalt()
  const keys = await deriveVaultKeys('a correct horse battery staple', salt)
  const wrong = await deriveVaultKeys('this is a different passphrase', salt)
  const brainId = await createOpaqueBrainId(keys.indexKey)
  const envelope = await encryptSyncObject({ keys, brainId, path: 'notes/private.md', content: 'secret' })
  await assert.rejects(() => decryptSyncObject({ keys: wrong, envelope }), /could not be decrypted/)
  await assert.rejects(() => decryptSyncObject({ keys, envelope: { ...envelope, brainId: `${brainId}x` } }), /could not be decrypted/)
})
