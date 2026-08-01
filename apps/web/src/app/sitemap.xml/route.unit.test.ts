import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('GET /sitemap.xml (index)', () => {
	beforeEach(() => {
		vi.resetModules()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	async function loadRoute(opts: { count: number }) {
		vi.doMock('@/lib/sitemap-shared', () => ({
			SITE_URL: 'https://example.com',
			fetchBlogCount: vi.fn().mockResolvedValue(opts.count),
			getBlogSitemapCount: (total: number) => Math.max(1, Math.ceil(total / 1000)),
			renderSitemapIndex: (urls: string[]) =>
				`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
					.map((u) => `  <sitemap>\n    <loc>${u}</loc>\n  </sitemap>`)
					.join('\n')}\n</sitemapindex>`,
		}))
		return await import('./route')
	}

	it('returns XML content-type and cache headers', async () => {
		const { GET } = await loadRoute({ count: 0 })
		const res = await GET()
		expect(res.headers.get('content-type')).toContain('application/xml')
		expect(res.headers.get('cache-control')).toContain('s-maxage=3600')
	})

	it('emits sitemapindex root element', async () => {
		const { GET } = await loadRoute({ count: 0 })
		const res = await GET()
		const text = await res.text()
		expect(text).toContain('<?xml')
		expect(text).toContain('<sitemapindex')
		expect(text).toContain('</sitemapindex>')
	})

	it('emits static + one blog batch + authors sitemap for small post counts', async () => {
		const { GET } = await loadRoute({ count: 5 })
		const res = await GET()
		const text = await res.text()
		expect(text).toContain('https://example.com/sitemap/0.xml')
		expect(text).toContain('https://example.com/sitemap/1.xml')
		expect(text).toContain('https://example.com/sitemap/2.xml')
		const matches = text.match(/<sitemap>/g)
		expect(matches).toHaveLength(3)
	})

	it('emits multiple blog batches plus authors when count exceeds batch size', async () => {
		const { GET } = await loadRoute({ count: 2500 })
		const res = await GET()
		const text = await res.text()
		// 1 static + 3 blog batches + 1 authors = 5
		const matches = text.match(/<sitemap>/g)
		expect(matches).toHaveLength(5)
		expect(text).toContain('https://example.com/sitemap/4.xml')
	})

	it('still emits static + 1 blog + authors when fetchBlogCount returns 0', async () => {
		// fetchBlogCount swallows errors and returns 0, so test the 0 path
		const { GET } = await loadRoute({ count: 0 })
		const res = await GET()
		const text = await res.text()
		const matches = text.match(/<sitemap>/g)
		expect(matches).toHaveLength(3)
	})
})
