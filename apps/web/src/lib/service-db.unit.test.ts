import { randomUUID } from 'node:crypto'
import type { Client } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createServiceDatabase } from './service-db'

let client: Client | null = null

afterEach(() => {
	client?.close()
	client = null
})

describe('encrypted sync storage', () => {
	it('cascades every server-side session and ciphertext when an account is deleted', async () => {
		client = await createServiceDatabase('file::memory:')
		const userId = randomUUID()
		await client.execute({
			sql: 'INSERT INTO sync_users (id, email, password_hash, password_salt, key_salt, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
			args: [userId, 'delete@example.com', 'password-verifier', 'password-salt', 'encryption-salt', new Date().toISOString()],
		})
		await client.execute({
			sql: 'INSERT INTO sync_sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)',
			args: ['opaque-session-hash', userId, new Date().toISOString(), new Date(Date.now() + 60_000).toISOString()],
		})
		await client.execute({
			sql: `INSERT INTO sync_objects
				(user_id, brain_id, object_id, protocol_version, algorithm, nonce, ciphertext, ciphertext_hash, deleted, revision, device_id, updated_at)
				VALUES (?1, ?2, ?3, 1, 'AES-GCM', ?4, ?5, ?6, 0, 1, ?7, ?8)`,
			args: [userId, 'a'.repeat(64), 'b'.repeat(64), 'opaque-nonce', 'opaque-ciphertext', 'opaque-hash', 'test-device', new Date().toISOString()],
		})

		await client.execute({ sql: 'DELETE FROM sync_users WHERE id = ?1', args: [userId] })

		const sessions = await client.execute({ sql: 'SELECT COUNT(*) AS count FROM sync_sessions WHERE user_id = ?1', args: [userId] })
		const objects = await client.execute({ sql: 'SELECT COUNT(*) AS count FROM sync_objects WHERE user_id = ?1', args: [userId] })
		expect(Number(sessions.rows[0]?.count)).toBe(0)
		expect(Number(objects.rows[0]?.count)).toBe(0)
	})
})
