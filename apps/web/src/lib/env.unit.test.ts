import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('checkEnv', () => {
	const originalEnv = process.env

	beforeEach(() => {
		vi.resetModules()
		process.env = { ...originalEnv }
		vi.spyOn(console, 'log').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(() => {
		process.env = originalEnv
		vi.restoreAllMocks()
	})

	async function loadCheckEnv() {
		const mod = await import('./env')
		return mod.checkEnv
	}

	it('warns when Brain API vars are missing', async () => {
		delete process.env.BRAIN_API_URL
		delete process.env.BRAIN_API_KEY
		delete process.env.TURSO_DATABASE_URL
		delete process.env.TURSO_AUTH_TOKEN

		const checkEnv = await loadCheckEnv()
		checkEnv()

		const warnings = vi.mocked(console.warn).mock.calls.map((c) => c[0])
		expect(warnings.some((w: string) => w.includes('BRAIN_API_URL'))).toBe(true)
		expect(warnings.some((w: string) => w.includes('BRAIN_API_KEY'))).toBe(true)
		expect(warnings.some((w: string) => w.includes('Forms and CRM'))).toBe(true)
	})

	it('warns when Turso vars are missing', async () => {
		process.env.BRAIN_API_URL = 'http://localhost:3000'
		process.env.BRAIN_API_KEY = 'brain_test_abc'
		delete process.env.TURSO_DATABASE_URL
		delete process.env.TURSO_AUTH_TOKEN

		const checkEnv = await loadCheckEnv()
		checkEnv()

		const warnings = vi.mocked(console.warn).mock.calls.map((c) => c[0])
		expect(warnings.some((w: string) => w.includes('TURSO_DATABASE_URL'))).toBe(true)
		expect(warnings.some((w: string) => w.includes('Blog system'))).toBe(true)
	})

	it('treats empty/whitespace values as missing', async () => {
		process.env.BRAIN_API_URL = '   '
		process.env.BRAIN_API_KEY = ''
		delete process.env.TURSO_DATABASE_URL
		delete process.env.TURSO_AUTH_TOKEN

		const checkEnv = await loadCheckEnv()
		checkEnv()

		const warnings = vi.mocked(console.warn).mock.calls.map((c) => c[0])
		expect(warnings.some((w: string) => w.includes('BRAIN_API_URL'))).toBe(true)
		expect(warnings.some((w: string) => w.includes('BRAIN_API_KEY'))).toBe(true)
	})

	it('shows no warnings when all required vars are set', async () => {
		process.env.BRAIN_API_URL = 'http://localhost:3000'
		process.env.BRAIN_API_KEY = 'brain_test_abc'
		process.env.TURSO_DATABASE_URL = 'libsql://test.turso.io'
		process.env.TURSO_AUTH_TOKEN = 'token123'

		const checkEnv = await loadCheckEnv()
		checkEnv()

		expect(console.warn).not.toHaveBeenCalled()
		const logs = vi.mocked(console.log).mock.calls.map((c) => c[0])
		expect(logs.some((l: string) => l.includes('All required environment variables are set'))).toBe(true)
	})

	it('defaults to English single-language mode', async () => {
		delete process.env.DEFAULT_LANGUAGE
		delete process.env.ADDITIONAL_LANGUAGES

		const checkEnv = await loadCheckEnv()
		checkEnv()

		const logs = vi.mocked(console.log).mock.calls.map((c) => c[0])
		expect(logs.some((l: string) => l.includes('Single-language mode (DEFAULT_LANGUAGE=en)'))).toBe(true)
	})

	it('reports multi-language config when ADDITIONAL_LANGUAGES is set', async () => {
		process.env.DEFAULT_LANGUAGE = 'en'
		process.env.ADDITIONAL_LANGUAGES = 'fr,es'

		const checkEnv = await loadCheckEnv()
		checkEnv()

		const logs = vi.mocked(console.log).mock.calls.map((c) => c[0])
		expect(logs.some((l: string) => l.includes('ADDITIONAL_LANGUAGES=fr,es'))).toBe(true)
	})

	it('warns only for the specific missing var, not the whole group', async () => {
		process.env.BRAIN_API_URL = 'http://localhost:3000'
		delete process.env.BRAIN_API_KEY
		process.env.TURSO_DATABASE_URL = 'libsql://test.turso.io'
		process.env.TURSO_AUTH_TOKEN = 'token123'

		const checkEnv = await loadCheckEnv()
		checkEnv()

		const warnings = vi.mocked(console.warn).mock.calls.map((c) => c[0])
		expect(warnings).toHaveLength(1)
		expect(warnings[0]).toContain('BRAIN_API_KEY')
		expect(warnings[0]).not.toContain('BRAIN_API_URL')
	})

	it('shows variable names for optional groups', async () => {
		process.env.BRAIN_API_URL = 'http://localhost:3000'
		process.env.BRAIN_API_KEY = 'brain_test_abc'
		process.env.TURSO_DATABASE_URL = 'libsql://test.turso.io'
		process.env.TURSO_AUTH_TOKEN = 'token123'
		delete process.env.SITE_URL
		delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

		const checkEnv = await loadCheckEnv()
		checkEnv()

		const logs = vi.mocked(console.log).mock.calls.map((c) => c[0])
		expect(logs.some((l: string) => l.includes('SITE_URL not configured'))).toBe(true)
		expect(
			logs.some((l: string) => l.includes('NEXT_PUBLIC_GA_MEASUREMENT_ID not configured')),
		).toBe(true)
	})

	it('only runs once even if called multiple times', async () => {
		const checkEnv = await loadCheckEnv()
		checkEnv()
		checkEnv()

		const logs = vi.mocked(console.log).mock.calls.filter((c) =>
			(c[0] as string).includes('Environment Check'),
		)
		expect(logs).toHaveLength(1)
	})
})
