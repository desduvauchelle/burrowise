import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('GET /sitemap/[file] (batches)', () => {
	beforeEach(() => {
		vi.resetModules()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	async function loadRoute(opts: {
		count?: number
		blogEntries?: Array<{ url: string }>
		authorEntries?: Array<{ url: string }>
	} = {}) {
		const buildBlogEntries = vi.fn().mockResolvedValue(opts.blogEntries ?? [])
		const buildAuthorEntries = vi.fn().mockResolvedValue(opts.authorEntries ?? [])
		const buildStaticEntries = vi.fn().mockReturnValue([
			{ url: 'https://example.com' },
			{ url: 'https://example.com/blog' },
			{ url: 'https://example.com/contact' },
		])
		vi.doMock('@/lib/sitemap-shared', () => ({
			buildBlogEntries,
			buildAuthorEntries,
			buildStaticEntries,
			fetchBlogCount: vi.fn().mockResolvedValue(opts.count ?? 0),
			getBlogSitemapCount: (total: number) => Math.max(1, Math.ceil(total / 1000)),
			renderSitemapXml: (entries: Array<{ url: string }>) =>
				`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
					.map((e) => `  <url><loc>${e.url}</loc></url>`)
					.join('\n')}\n</urlset>`,
		}))
		const mod = await import('./route')
		return { ...mod, buildBlogEntries, buildAuthorEntries, buildStaticEntries }
	}

	function makeReq(): Request {
		return new Request('https://example.com/sitemap/0.xml')
	}

	it('returns 404 for non-matching filename', async () => {
		const { GET } = await loadRoute()
		const res = await GET(makeReq(), { params: Promise.resolve({ file: 'bogus' }) })
		expect(res.status).toBe(404)
	})

	it('returns 404 for non-numeric prefix', async () => {
		const { GET } = await loadRoute()
		const res = await GET(makeReq(), { params: Promise.resolve({ file: 'foo.xml' }) })
		expect(res.status).toBe(404)
	})

	it('returns 404 for id out of range', async () => {
		const { GET } = await loadRoute({ count: 0 })
		// blog count 0 → blogSitemapCount 1 → authorsId 2 → id=999 out of range
		const res = await GET(makeReq(), { params: Promise.resolve({ file: '999.xml' }) })
		expect(res.status).toBe(404)
	})

	it('serves static entries for id=0', async () => {
		const { GET, buildStaticEntries, buildBlogEntries, buildAuthorEntries } = await loadRoute({
			count: 0,
		})
		const res = await GET(makeReq(), { params: Promise.resolve({ file: '0.xml' }) })
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toContain('application/xml')
		expect(buildStaticEntries).toHaveBeenCalledTimes(1)
		expect(buildBlogEntries).not.toHaveBeenCalled()
		expect(buildAuthorEntries).not.toHaveBeenCalled()
		const text = await res.text()
		expect(text).toContain('<loc>https://example.com</loc>')
	})

	it('serves blog batch for id=1 with offset 0', async () => {
		const { GET, buildBlogEntries } = await loadRoute({
			count: 2,
			blogEntries: [{ url: 'https://example.com/blog/post-a' }],
		})
		const res = await GET(makeReq(), { params: Promise.resolve({ file: '1.xml' }) })
		expect(res.status).toBe(200)
		expect(buildBlogEntries).toHaveBeenCalledWith(0)
		const text = await res.text()
		expect(text).toContain('<loc>https://example.com/blog/post-a</loc>')
	})

	it('serves blog batch for id=3 with batch index 2', async () => {
		const { GET, buildBlogEntries } = await loadRoute({
			count: 2500,
			blogEntries: [{ url: 'https://example.com/blog/post-c' }],
		})
		const res = await GET(makeReq(), { params: Promise.resolve({ file: '3.xml' }) })
		expect(res.status).toBe(200)
		expect(buildBlogEntries).toHaveBeenCalledWith(2)
	})

	it('serves authors for last id', async () => {
		const { GET, buildAuthorEntries } = await loadRoute({
			count: 0,
			authorEntries: [{ url: 'https://example.com/blog/authors/jane' }],
		})
		// count 0 → blogSitemapCount 1 → authorsId 2
		const res = await GET(makeReq(), { params: Promise.resolve({ file: '2.xml' }) })
		expect(res.status).toBe(200)
		expect(buildAuthorEntries).toHaveBeenCalledTimes(1)
		const text = await res.text()
		expect(text).toContain('<loc>https://example.com/blog/authors/jane</loc>')
	})

	it('sets cache-control header', async () => {
		const { GET } = await loadRoute({ count: 0 })
		const res = await GET(makeReq(), { params: Promise.resolve({ file: '0.xml' }) })
		expect(res.headers.get('cache-control')).toContain('s-maxage=3600')
	})
})
