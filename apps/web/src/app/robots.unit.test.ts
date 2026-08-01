import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('robots', () => {
	const originalEnv = process.env

	beforeEach(() => {
		vi.resetModules()
		process.env = { ...originalEnv }
	})

	afterEach(() => {
		process.env = originalEnv
	})

	async function loadRobots() {
		const mod = await import('./robots')
		return mod.default
	}

	it('returns rules allowing all crawlers on /', async () => {
		const robots = await loadRobots()
		const result = robots()
		const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules
		expect(rules?.userAgent).toBe('*')
		expect(rules?.allow).toBe('/')
	})

	it('disallows /api/ path', async () => {
		const robots = await loadRobots()
		const result = robots()
		const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules
		expect(rules?.disallow).toContain('/api/')
	})

	it('includes sitemap URL pointing to /sitemap.xml', async () => {
		process.env.SITE_URL = 'https://example.com'
		delete process.env.VERCEL_PROJECT_PRODUCTION_URL
		const robots = await loadRobots()
		const result = robots()
		expect(result.sitemap).toBe('https://example.com/sitemap.xml')
	})

	it('uses VERCEL_PROJECT_PRODUCTION_URL when SITE_URL is absent', async () => {
		delete process.env.SITE_URL
		process.env.VERCEL_PROJECT_PRODUCTION_URL = 'my-app.vercel.app'
		const robots = await loadRobots()
		const result = robots()
		expect(result.sitemap).toBe('https://my-app.vercel.app/sitemap.xml')
	})

	it('defaults to http://localhost:3000 when no URL env vars set', async () => {
		delete process.env.SITE_URL
		delete process.env.VERCEL_PROJECT_PRODUCTION_URL
		const robots = await loadRobots()
		const result = robots()
		expect(result.sitemap).toBe('http://localhost:3000/sitemap.xml')
	})

	it('prefers SITE_URL over VERCEL_PROJECT_PRODUCTION_URL', async () => {
		process.env.SITE_URL = 'https://custom-domain.com'
		process.env.VERCEL_PROJECT_PRODUCTION_URL = 'my-app.vercel.app'
		const robots = await loadRobots()
		const result = robots()
		expect(result.sitemap).toBe('https://custom-domain.com/sitemap.xml')
	})
})
