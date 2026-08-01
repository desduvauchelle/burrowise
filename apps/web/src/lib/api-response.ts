import { NextResponse } from 'next/server'

function configuredDesktopOrigins(): string[] {
	const defaults = process.env.NODE_ENV === 'production'
		? 'tauri://localhost,http://tauri.localhost,https://tauri.localhost'
		: 'tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://localhost:4173'
	return [...new Set(`${defaults},${process.env.DESKTOP_APP_ORIGINS || ''}`
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean))]
}

export function isAllowedApiOrigin(origin: string | null, host: string | null): boolean {
	if (!origin) return true
	try {
		const parsed = new URL(origin)
		if (host && parsed.host === host) return true
		return configuredDesktopOrigins().includes(origin)
	} catch {
		return false
	}
}

export function apiHeaders(request: Request): HeadersInit {
	const origin = request.headers.get('origin')
	const headers: Record<string, string> = {
		'Cache-Control': 'no-store',
		Vary: 'Origin',
	}
	if (origin && isAllowedApiOrigin(origin, request.headers.get('host'))) {
		headers['Access-Control-Allow-Origin'] = origin
		headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
		headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
		headers['Access-Control-Allow-Credentials'] = 'true'
	}
	return headers
}

export function apiJson(request: Request, body: unknown, status = 200): NextResponse {
	return NextResponse.json(body, { status, headers: apiHeaders(request) })
}

export function apiError(request: Request, status: number, code: string, message: string): NextResponse {
	return apiJson(request, { error: { code, message } }, status)
}

export function apiOptions(request: Request): NextResponse {
	if (!isAllowedApiOrigin(request.headers.get('origin'), request.headers.get('host'))) {
		return apiError(request, 403, 'origin_not_allowed', 'This origin is not allowed to use the sync API.')
	}
	return new NextResponse(null, { status: 204, headers: apiHeaders(request) })
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string): void {
	response.cookies.set('sb_session', token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/',
		expires: new Date(expiresAt),
	})
}
