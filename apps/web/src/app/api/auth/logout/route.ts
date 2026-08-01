import { revokeRequestSession } from '@/lib/auth'
import { apiJson, apiOptions } from '@/lib/api-response'

export const OPTIONS = apiOptions

export async function POST(request: Request) {
	await revokeRequestSession(request)
	const response = apiJson(request, { ok: true })
	response.cookies.set('sb_session', '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 })
	return response
}
