import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Client } from '@libsql/client'
import { getServiceDatabase } from './service-db'

const scrypt = promisify(scryptCallback)
const SESSION_DAYS = 30

export interface AuthenticatedUser {
	id: string
	email: string
	keySalt: string
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase()
}

export async function hashPassword(password: string, salt = randomBytes(32).toString('base64url')): Promise<{ hash: string; salt: string }> {
	const derived = await scrypt(password, salt, 64) as Buffer
	return { hash: derived.toString('base64url'), salt }
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
	const derived = await scrypt(password, salt, 64) as Buffer
	const expected = Buffer.from(hash, 'base64url')
	return expected.length === derived.length && timingSafeEqual(expected, derived)
}

function tokenHash(token: string): string {
	return createHash('sha256').update(token).digest('hex')
}

export async function createSession(client: Client, userId: string): Promise<{ token: string; expiresAt: string }> {
	const token = randomBytes(32).toString('base64url')
	const now = new Date()
	const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000)
	await client.execute({
		sql: 'INSERT INTO sync_sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)',
		args: [tokenHash(token), userId, now.toISOString(), expires.toISOString()],
	})
	return { token, expiresAt: expires.toISOString() }
}

function requestToken(request: Request): string | null {
	const authorization = request.headers.get('authorization')
	if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim()
	const cookie = request.headers.get('cookie') || ''
	const match = cookie.match(/(?:^|;\s*)sb_session=([^;]+)/)
	return match ? decodeURIComponent(match[1]) : null
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedUser | null> {
	const token = requestToken(request)
	if (!token) return null
	const client = await getServiceDatabase()
	const now = new Date().toISOString()
	const result = await client.execute({
		sql: `SELECT u.id, u.email, u.key_salt
			FROM sync_sessions s JOIN sync_users u ON u.id = s.user_id
			WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
		args: [tokenHash(token), now],
	})
	const row = result.rows[0]
	if (!row) return null
	return { id: String(row.id), email: String(row.email), keySalt: String(row.key_salt) }
}

export async function revokeRequestSession(request: Request): Promise<void> {
	const token = requestToken(request)
	if (!token) return
	const client = await getServiceDatabase()
	await client.execute({ sql: 'DELETE FROM sync_sessions WHERE token_hash = ?1', args: [tokenHash(token)] })
}
