const attempts = new Map<string, { count: number; resetAt: number }>()

export function allowAuthAttempt(request: Request, limit = 12, windowMs = 15 * 60 * 1000): boolean {
	const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
	const key = forwarded || request.headers.get('x-real-ip') || 'local'
	const now = Date.now()
	const current = attempts.get(key)
	if (!current || current.resetAt <= now) {
		attempts.set(key, { count: 1, resetAt: now + windowMs })
		return true
	}
	if (current.count >= limit) return false
	current.count += 1
	return true
}
