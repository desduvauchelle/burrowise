import { afterEach, describe, expect, it } from 'vitest'
import { isAllowedApiOrigin } from './api-response'

const originalOrigins = process.env.DESKTOP_APP_ORIGINS

afterEach(() => {
	if (originalOrigins === undefined) delete process.env.DESKTOP_APP_ORIGINS
	else process.env.DESKTOP_APP_ORIGINS = originalOrigins
})

describe('sync API origin policy', () => {
	it('allows server clients, same-host pages, and the development desktop origin', () => {
		expect(isAllowedApiOrigin(null, 'sync.example.com')).toBe(true)
		expect(isAllowedApiOrigin('https://sync.example.com', 'sync.example.com')).toBe(true)
		expect(isAllowedApiOrigin('http://localhost:4173', 'localhost:3000')).toBe(true)
	})

	it('rejects unrelated browser origins', () => {
		expect(isAllowedApiOrigin('https://attacker.example', 'sync.example.com')).toBe(false)
	})

	it('adds configured desktop origins without removing safe defaults', () => {
		process.env.DESKTOP_APP_ORIGINS = 'https://desktop.example'
		expect(isAllowedApiOrigin('https://desktop.example', 'sync.example.com')).toBe(true)
		expect(isAllowedApiOrigin('tauri://localhost', 'sync.example.com')).toBe(true)
	})
})
