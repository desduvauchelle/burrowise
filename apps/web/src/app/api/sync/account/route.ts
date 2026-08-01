import { authenticateRequest, revokeRequestSession, verifyPassword } from '@/lib/auth'
import { apiError, apiJson, apiOptions } from '@/lib/api-response'
import { getServiceDatabase } from '@/lib/service-db'

export const OPTIONS = apiOptions

export async function DELETE(request: Request) {
	const user = await authenticateRequest(request)
	if (!user) return apiError(request, 401, 'not_authenticated', 'Sign in before deleting the account.')
	const body = await request.json().catch(() => null) as { password?: string } | null
	if (!body?.password) return apiError(request, 400, 'password_required', 'Enter the account password to delete all server data.')
	const client = await getServiceDatabase()
	const result = await client.execute({ sql: 'SELECT password_hash, password_salt FROM sync_users WHERE id = ?1', args: [user.id] })
	const row = result.rows[0]
	if (!row || !await verifyPassword(body.password, String(row.password_hash), String(row.password_salt))) {
		return apiError(request, 401, 'invalid_password', 'The account password is incorrect.')
	}
	await revokeRequestSession(request)
	await client.execute({ sql: 'DELETE FROM sync_users WHERE id = ?1', args: [user.id] })
	const response = apiJson(request, { deleted: true })
	response.cookies.set('sb_session', '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 })
	return response
}
