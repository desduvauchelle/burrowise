import { randomUUID } from 'node:crypto'
import { createSession, hashPassword, normalizeEmail } from '@/lib/auth'
import { apiError, apiJson, apiOptions, setSessionCookie } from '@/lib/api-response'
import { allowAuthAttempt } from '@/lib/rate-limit'
import { getServiceDatabase } from '@/lib/service-db'
import { registrationSchema } from '@/lib/sync-schema'

export const runtime = 'nodejs'
export const OPTIONS = apiOptions

export async function POST(request: Request) {
	if (!allowAuthAttempt(request)) return apiError(request, 429, 'rate_limited', 'Too many account attempts. Try again later.')
	const parsed = registrationSchema.safeParse(await request.json().catch(() => null))
	if (!parsed.success) return apiError(request, 400, 'invalid_registration', 'Use a valid email, a 12+ character password, and a client-generated encryption salt.')
	const client = await getServiceDatabase()
	const email = normalizeEmail(parsed.data.email)
	const existing = await client.execute({ sql: 'SELECT id FROM sync_users WHERE email = ?1', args: [email] })
	if (existing.rows.length) return apiError(request, 409, 'account_exists', 'An account already exists for this email.')
	const userId = randomUUID()
	const password = await hashPassword(parsed.data.password)
	const createdAt = new Date().toISOString()
	await client.execute({
		sql: 'INSERT INTO sync_users (id, email, password_hash, password_salt, key_salt, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
		args: [userId, email, password.hash, password.salt, parsed.data.keySalt, createdAt],
	})
	const session = await createSession(client, userId)
	const response = apiJson(request, { account: { id: userId, email, keySalt: parsed.data.keySalt, createdAt }, accessToken: session.token, expiresAt: session.expiresAt }, 201)
	setSessionCookie(response, session.token, session.expiresAt)
	return response
}
