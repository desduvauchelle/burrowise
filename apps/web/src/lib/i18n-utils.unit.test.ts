import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('i18n-utils', () => {
	beforeEach(() => {
		vi.resetModules()
	})

	afterEach(() => {
		vi.doUnmock('@/i18n/config')
	})

	async function load(defaultLocale = 'en') {
		vi.doMock('@/i18n/config', () => ({
			defaultLocale,
			supportedLocales: [defaultLocale, 'fr'],
			isMultiLang: true,
			additionalLocales: ['fr'],
		}))
		return await import('./i18n-utils')
	}

	describe('localePrefix', () => {
		it('returns empty string for the default locale (no segment in URL)', async () => {
			const { localePrefix } = await load('en')
			expect(localePrefix('en')).toBe('')
		})

		it('returns /<locale> for secondary locales', async () => {
			const { localePrefix } = await load('en')
			expect(localePrefix('fr')).toBe('/fr')
			expect(localePrefix('de')).toBe('/de')
		})

		it('honours a non-en default locale', async () => {
			const { localePrefix } = await load('fr')
			expect(localePrefix('fr')).toBe('')
			expect(localePrefix('en')).toBe('/en')
		})
	})

	describe('localizedPath', () => {
		it('keeps the default locale bare', async () => {
			const { localizedPath } = await load('en')
			expect(localizedPath('/', 'en')).toBe('/')
			expect(localizedPath('/blog', 'en')).toBe('/blog')
			expect(localizedPath('/blog/my-post', 'en')).toBe('/blog/my-post')
		})

		it('prefixes secondary locales', async () => {
			const { localizedPath } = await load('en')
			expect(localizedPath('/', 'fr')).toBe('/fr')
			expect(localizedPath('/blog', 'fr')).toBe('/fr/blog')
			expect(localizedPath('/blog/my-post', 'fr')).toBe('/fr/blog/my-post')
		})

		it('treats empty path and "/" the same as the locale root', async () => {
			const { localizedPath } = await load('en')
			expect(localizedPath('', 'en')).toBe('/')
			expect(localizedPath('', 'fr')).toBe('/fr')
		})

		it('normalises a path missing its leading slash', async () => {
			const { localizedPath } = await load('en')
			expect(localizedPath('blog', 'fr')).toBe('/fr/blog')
		})
	})

	describe('defaultLocaleRedirectTarget (middleware 301 logic)', () => {
		it('strips the default-locale prefix from a path', async () => {
			const { defaultLocaleRedirectTarget } = await load('en')
			expect(defaultLocaleRedirectTarget('/en/blog/my-post', 'en')).toBe('/blog/my-post')
		})

		it('maps the bare default-locale root to "/"', async () => {
			const { defaultLocaleRedirectTarget } = await load('en')
			expect(defaultLocaleRedirectTarget('/en', 'en')).toBe('/')
		})

		it('returns null for a bare path (no redirect needed)', async () => {
			const { defaultLocaleRedirectTarget } = await load('en')
			expect(defaultLocaleRedirectTarget('/blog/my-post', 'en')).toBeNull()
		})

		it('returns null for a secondary locale (keeps its prefix)', async () => {
			const { defaultLocaleRedirectTarget } = await load('en')
			expect(defaultLocaleRedirectTarget('/fr/blog', 'en')).toBeNull()
		})

		it('does not match a path that merely starts with the locale letters', async () => {
			const { defaultLocaleRedirectTarget } = await load('en')
			expect(defaultLocaleRedirectTarget('/enterprise', 'en')).toBeNull()
		})

		it('honours a non-en default locale', async () => {
			const { defaultLocaleRedirectTarget } = await load('fr')
			expect(defaultLocaleRedirectTarget('/fr/contact', 'fr')).toBe('/contact')
			expect(defaultLocaleRedirectTarget('/en/contact', 'fr')).toBeNull()
		})
	})
})
