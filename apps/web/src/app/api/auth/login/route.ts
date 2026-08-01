import { createSession, normalizeEmail, verifyPassword } from '@/lib/auth'
import { apiError, apiJson, apiOptions, setSessionCookie } from '@/lib/api-response'
import { allowAuthAttempt } from '@/lib/rate-limit'
import { getServiceDatabase } from '@/lib/service-db'
import { credentialsSchema } from '@/lib/sync-schema'

export const runtime = 'nodejs'
export const OPTIONS = apiOptions

export async function POST(request: Request) {
	if (!allowAuthAttempt(request)) return apiError(request, 429, 'rate_limited', 'Too many sign-in attempts. Try again later.')
	const parsed = credentialsSchema.safeParse(await request.json().catch(() => null))
	if (!parsed.success) return apiError(request, 400, 'invalid_credentials', 'Enter a valid email and password.')
	const client = await getServiceDatabase()
	const result = await client.execute({
		sql: 'SELECT id, email, password_hash, password_salt, key_salt, created_at FROM sync_users WHERE email = ?1',
		args: [normalizeEmail(parsed.data.email)],
	})
	const row = result.rows[0]
	if (!row || !await verifyPassword(parsed.data.password, String(row.password_hash), String(row.password_salt))) {
		return apiError(request, 401, 'invalid_credentials', 'The email or password is incorrect.')
	}
	const session = await createSession(client, String(row.id))
	const response = apiJson(request, {
		account: { id: String(row.id), email: String(row.email), keySalt: String(row.key_salt), createdAt: String(row.created_at) },
		accessToken: session.token,
		expiresAt: session.expiresAt,
	})
	setSessionCookie(response, session.token, session.expiresAt)
	return response
}
