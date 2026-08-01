import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// `isSupportedLocale` is the gate that stops the `[locale]` segment from
// matching bogus first path segments (`/rss.xml/legal`, `/index.iml/...`) and
// serving a real page at 200 with a self-referencing canonical to the garbage
// URL — the "Duplicate without user-selected canonical" indexing bug.
describe('i18n/config — isSupportedLocale (duplicate-canonical guard)', () => {
	const originalEnv = { ...process.env }

	beforeEach(() => {
		vi.resetModules()
	})

	afterEach(() => {
		process.env = { ...originalEnv }
	})

	async function load(defaultLanguage?: string, additionalLanguages?: string) {
		vi.resetModules()
		if (defaultLanguage === undefined) delete process.env.DEFAULT_LANGUAGE
		else process.env.DEFAULT_LANGUAGE = defaultLanguage
		if (additionalLanguages === undefined) delete process.env.ADDITIONAL_LANGUAGES
		else process.env.ADDITIONAL_LANGUAGES = additionalLanguages
		return import('./config')
	}

	it('accepts the default locale', async () => {
		const { isSupportedLocale } = await load()
		expect(isSupportedLocale('en')).toBe(true)
	})

	it('rejects bogus dotted segments from bot probes / stale links', async () => {
		const { isSupportedLocale } = await load()
		expect(isSupportedLocale('rss.xml')).toBe(false)
		expect(isSupportedLocale('index.iml')).toBe(false)
		expect(isSupportedLocale('sitemap.xml')).toBe(false)
	})

	it('rejects any non-locale first segment', async () => {
		const { isSupportedLocale } = await load()
		expect(isSupportedLocale('blog')).toBe(false)
		expect(isSupportedLocale('anything')).toBe(false)
		expect(isSupportedLocale('')).toBe(false)
	})

	it('accepts only configured secondary locales in multi-lang mode', async () => {
		const { isSupportedLocale } = await load('en', 'fr,de')
		expect(isSupportedLocale('fr')).toBe(true)
		expect(isSupportedLocale('de')).toBe(true)
		expect(isSupportedLocale('es')).toBe(false)
	})

	it('honours a non-en default locale', async () => {
		const { isSupportedLocale } = await load('fr')
		expect(isSupportedLocale('fr')).toBe(true)
		expect(isSupportedLocale('en')).toBe(false)
	})
})
