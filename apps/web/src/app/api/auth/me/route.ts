import { authenticateRequest } from '@/lib/auth'
import { apiError, apiJson, apiOptions } from '@/lib/api-response'

export const OPTIONS = apiOptions

export async function GET(request: Request) {
	const user = await authenticateRequest(request)
	return user ? apiJson(request, { account: user }) : apiError(request, 401, 'not_authenticated', 'Sign in to continue.')
}
