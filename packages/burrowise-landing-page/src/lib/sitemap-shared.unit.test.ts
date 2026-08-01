import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('sitemap-shared', () => {
	const originalEnv = process.env

	beforeEach(() => {
		vi.resetModules()
		process.env = { ...originalEnv }
		process.env.SITE_URL = 'https://example.com'
	})

	afterEach(() => {
		process.env = originalEnv
		vi.unstubAllGlobals()
	})

	async function load(config?: {
		defaultLocale?: string
		supportedLocales?: string[]
		isMultiLang?: boolean
	}) {
		vi.doMock('@/i18n/config', () => ({
			defaultLocale: config?.defaultLocale ?? 'en',
			supportedLocales: config?.supportedLocales ?? ['en'],
			isMultiLang: config?.isMultiLang ?? false,
			additionalLocales: (config?.supportedLocales ?? ['en']).slice(1),
		}))
		return await import('./sitemap-shared')
	}

	// ─── escapeXml ───────────────────────────────────────────────────────

	describe('escapeXml', () => {
		it('escapes all five XML special characters', async () => {
			const { escapeXml } = await load()
			expect(escapeXml('a & b')).toBe('a &amp; b')
			expect(escapeXml('<tag>')).toBe('&lt;tag&gt;')
			expect(escapeXml(`"quote"`)).toBe('&quot;quote&quot;')
			expect(escapeXml(`'apos'`)).toBe('&apos;apos&apos;')
		})

		it('handles URLs with ampersands and query strings', async () => {
			const { escapeXml } = await load()
			expect(escapeXml('https://x.com/p?a=1&b=2')).toBe(
				'https://x.com/p?a=1&amp;b=2',
			)
		})
	})

	// ─── getBlogSitemapCount ─────────────────────────────────────────────

	describe('getBlogSitemapCount', () => {
		it('returns 1 for zero posts', async () => {
			const { getBlogSitemapCount } = await load()
			expect(getBlogSitemapCount(0)).toBe(1)
		})

		it('returns 1 for posts at or under batch size', async () => {
			const { getBlogSitemapCount } = await load()
			expect(getBlogSitemapCount(500)).toBe(1)
			expect(getBlogSitemapCount(1000)).toBe(1)
		})

		it('ceils for counts above batch size', async () => {
			const { getBlogSitemapCount } = await load()
			expect(getBlogSitemapCount(1001)).toBe(2)
			expect(getBlogSitemapCount(2500)).toBe(3)
		})
	})

	// ─── buildStaticEntries ──────────────────────────────────────────────

	describe('buildStaticEntries', () => {
		it('includes all static pages', async () => {
			const { buildStaticEntries } = await load()
			const result = buildStaticEntries()
			const urls = result.map((e) => e.url)
			expect(urls).toContain('https://example.com')
			expect(urls).toContain('https://example.com/blog')
			expect(urls).toContain('https://example.com/blog/authors')
			expect(urls).toContain('https://example.com/contact')
			expect(urls).toContain('https://example.com/privacy')
			expect(urls).toContain('https://example.com/legal')
			expect(urls).toContain('https://example.com/cookies')
		})

		it('homepage gets priority 1.0', async () => {
			const { buildStaticEntries } = await load()
			const result = buildStaticEntries()
			const home = result.find((e) => e.url === 'https://example.com')
			expect(home?.priority).toBe(1.0)
		})

		it('non-home pages get priority 0.7', async () => {
			const { buildStaticEntries } = await load()
			const result = buildStaticEntries()
			const nonHome = result.filter((e) => e.url !== 'https://example.com')
			for (const entry of nonHome) {
				expect(entry.priority).toBe(0.7)
			}
		})

		it('omits alternates in single-lang mode', async () => {
			const { buildStaticEntries } = await load({ isMultiLang: false })
			const result = buildStaticEntries()
			for (const entry of result) {
				expect(entry.alternates).toBeUndefined()
			}
		})

		it('includes hreflang alternates in multi-lang mode', async () => {
			const { buildStaticEntries } = await load({
				defaultLocale: 'en',
				supportedLocales: ['en', 'fr'],
				isMultiLang: true,
			})
			const result = buildStaticEntries()
			const home = result.find((e) => e.url === 'https://example.com')
			expect(home?.alternates?.en).toBe('https://example.com')
			expect(home?.alternates?.fr).toBe('https://example.com/fr')
		})
	})

	// ─── buildBlogEntries ────────────────────────────────────────────────

	describe('buildBlogEntries', () => {
		it('returns one entry per post', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve([
							{ slug: 'hello-world', language: 'en', updatedAt: '2025-01-01', parentPostId: null },
							{ slug: 'second-post', language: 'en', updatedAt: '2025-01-02', parentPostId: null },
						]),
				}),
			)
			const { buildBlogEntries } = await load()
			const result = await buildBlogEntries(0)
			expect(result).toHaveLength(2)
			const urls = result.map((e) => e.url)
			expect(urls).toContain('https://example.com/blog/hello-world')
			expect(urls).toContain('https://example.com/blog/second-post')
		})

		it('sets weekly changeFrequency and 0.8 priority', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve([
							{ slug: 'p', language: 'en', updatedAt: null, parentPostId: null },
						]),
				}),
			)
			const { buildBlogEntries } = await load()
			const result = await buildBlogEntries(0)
			expect(result[0]?.changeFrequency).toBe('weekly')
			expect(result[0]?.priority).toBe(0.8)
		})

		it('returns empty array when fetch fails', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
			const { buildBlogEntries } = await load()
			const result = await buildBlogEntries(0)
			expect(result).toEqual([])
		})

		it('groups translations by parentPostId with hreflang alternates', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockImplementation((url: string) => {
					if (typeof url === 'string' && url.includes('locale=en')) {
						return Promise.resolve({
							ok: true,
							json: () =>
								Promise.resolve([
									{ slug: 'hello-en', language: 'en', updatedAt: null, parentPostId: 'parent-1' },
								]),
						})
					}
					if (typeof url === 'string' && url.includes('locale=fr')) {
						return Promise.resolve({
							ok: true,
							json: () =>
								Promise.resolve([
									{ slug: 'hello-fr', language: 'fr', updatedAt: null, parentPostId: 'parent-1' },
								]),
						})
					}
					return Promise.resolve({ ok: false })
				}),
			)
			const { buildBlogEntries } = await load({
				defaultLocale: 'en',
				supportedLocales: ['en', 'fr'],
				isMultiLang: true,
			})
			const result = await buildBlogEntries(0)
			expect(result.length).toBeGreaterThanOrEqual(1)
			for (const entry of result) {
				expect(entry.alternates?.en).toContain('/blog/hello-en')
				expect(entry.alternates?.fr).toContain('/blog/hello-fr')
			}
		})

		it('deduplicates posts by slug', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve([
							{ slug: 'dup', language: 'en', updatedAt: null, parentPostId: 'p1' },
							{ slug: 'dup', language: 'en', updatedAt: null, parentPostId: 'p1' },
						]),
				}),
			)
			const { buildBlogEntries } = await load()
			const result = await buildBlogEntries(0)
			const matches = result.filter((e) => e.url.includes('dup'))
			expect(matches).toHaveLength(1)
		})

		it('uses correct offset for non-zero batch id', async () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve([]),
			})
			vi.stubGlobal('fetch', fetchSpy)
			const { buildBlogEntries } = await load()
			await buildBlogEntries(2)
			expect(fetchSpy).toHaveBeenCalled()
			const calledUrl = fetchSpy.mock.calls[0]?.[0]
			expect(calledUrl).toContain('offset=2000')
		})
	})

	// ─── buildAuthorEntries ──────────────────────────────────────────────

	describe('buildAuthorEntries', () => {
		it('returns one entry per author', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: true,
					json: () =>
						Promise.resolve([
							{ slug: 'jane-doe', updatedAt: '2026-01-01' },
							{ slug: 'john-smith', updatedAt: null },
						]),
				}),
			)
			const { buildAuthorEntries } = await load()
			const result = await buildAuthorEntries()
			expect(result).toHaveLength(2)
			const urls = result.map((e) => e.url)
			expect(urls).toContain('https://example.com/blog/authors/jane-doe')
			expect(urls).toContain('https://example.com/blog/authors/john-smith')
		})

		it('uses 0.6 priority and monthly changeFrequency', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: true,
					json: () => Promise.resolve([{ slug: 'a', updatedAt: null }]),
				}),
			)
			const { buildAuthorEntries } = await load()
			const result = await buildAuthorEntries()
			expect(result[0]?.priority).toBe(0.6)
			expect(result[0]?.changeFrequency).toBe('monthly')
		})

		it('includes hreflang alternates in multi-lang mode', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: true,
					json: () => Promise.resolve([{ slug: 'jane', updatedAt: null }]),
				}),
			)
			const { buildAuthorEntries } = await load({
				defaultLocale: 'en',
				supportedLocales: ['en', 'fr'],
				isMultiLang: true,
			})
			const result = await buildAuthorEntries()
			expect(result[0]?.alternates?.en).toBe(
				'https://example.com/blog/authors/jane',
			)
			expect(result[0]?.alternates?.fr).toBe(
				'https://example.com/fr/blog/authors/jane',
			)
		})

		it('returns empty array when fetch fails', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
			const { buildAuthorEntries } = await load()
			const result = await buildAuthorEntries()
			expect(result).toEqual([])
		})
	})

	// ─── renderSitemapXml ────────────────────────────────────────────────

	describe('renderSitemapXml', () => {
		it('emits valid urlset with xhtml namespace', async () => {
			const { renderSitemapXml } = await load()
			const xml = renderSitemapXml([{ url: 'https://example.com' }])
			expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
			expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
			expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
			expect(xml).toContain('<loc>https://example.com</loc>')
			expect(xml).toContain('</urlset>')
		})

		it('emits hreflang alternate links', async () => {
			const { renderSitemapXml } = await load()
			const xml = renderSitemapXml([
				{
					url: 'https://example.com/blog/x',
					alternates: {
						en: 'https://example.com/blog/x',
						fr: 'https://example.com/fr/blog/x',
					},
				},
			])
			expect(xml).toContain(
				'<xhtml:link rel="alternate" hreflang="en" href="https://example.com/blog/x" />',
			)
			expect(xml).toContain(
				'<xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/blog/x" />',
			)
		})

		it('escapes ampersands in URLs', async () => {
			const { renderSitemapXml } = await load()
			const xml = renderSitemapXml([{ url: 'https://example.com/p?a=1&b=2' }])
			expect(xml).toContain('<loc>https://example.com/p?a=1&amp;b=2</loc>')
		})

		it('emits lastmod, changefreq, priority when provided', async () => {
			const { renderSitemapXml } = await load()
			const xml = renderSitemapXml([
				{
					url: 'https://example.com/p',
					lastModified: new Date('2025-06-15T10:00:00Z'),
					changeFrequency: 'weekly',
					priority: 0.8,
				},
			])
			expect(xml).toContain('<lastmod>2025-06-15T10:00:00.000Z</lastmod>')
			expect(xml).toContain('<changefreq>weekly</changefreq>')
			expect(xml).toContain('<priority>0.8</priority>')
		})
	})

	// ─── renderSitemapIndex ──────────────────────────────────────────────

	describe('renderSitemapIndex', () => {
		it('emits valid sitemapindex', async () => {
			const { renderSitemapIndex } = await load()
			const xml = renderSitemapIndex([
				'https://example.com/sitemap/0.xml',
				'https://example.com/sitemap/1.xml',
			])
			expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
			expect(xml).toContain(
				'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			)
			expect(xml).toContain('<loc>https://example.com/sitemap/0.xml</loc>')
			expect(xml).toContain('<loc>https://example.com/sitemap/1.xml</loc>')
			expect(xml).toContain('</sitemapindex>')
		})

		it('escapes special chars in URLs', async () => {
			const { renderSitemapIndex } = await load()
			const xml = renderSitemapIndex(['https://example.com/sitemap/0.xml?a=1&b=2'])
			expect(xml).toContain(
				'<loc>https://example.com/sitemap/0.xml?a=1&amp;b=2</loc>',
			)
		})
	})

	// ─── fetchBlogCount ──────────────────────────────────────────────────

	describe('fetchBlogCount', () => {
		it('returns count from API', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: true,
					json: () => Promise.resolve({ count: 42 }),
				}),
			)
			const { fetchBlogCount } = await load()
			expect(await fetchBlogCount()).toBe(42)
		})

		it('returns 0 when fetch fails', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
			const { fetchBlogCount } = await load()
			expect(await fetchBlogCount()).toBe(0)
		})

		it('returns 0 when API returns non-ok response', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
			const { fetchBlogCount } = await load()
			expect(await fetchBlogCount()).toBe(0)
		})
	})
})
