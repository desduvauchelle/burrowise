import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FeedPost } from './rss-shared'

// Render the feed against a deterministic SITE_URL / buildUrl (the real ones are
// covered in sitemap-shared.unit.test.ts), so assertions can check exact output.
async function loadRenderer(defaultLocale = 'en') {
	vi.resetModules()
	vi.doMock('@/i18n/config', () => ({ defaultLocale }))
	vi.doMock('@/lib/sitemap-shared', () => ({
		SITE_URL: 'https://example.com',
		buildUrl: (path: string, locale?: string) =>
			!locale || locale === defaultLocale
				? `https://example.com${path}`
				: `https://example.com/${locale}${path}`,
		escapeXml: (value: string) =>
			value
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&apos;'),
	}))
	return import('./rss-shared')
}

function post(overrides: Partial<FeedPost> = {}): FeedPost {
	return {
		slug: 'hello-world',
		title: 'Hello World',
		content: '<p>Hello <strong>there</strong>.</p>',
		seoDesc: 'A friendly greeting',
		publishedAt: new Date('2026-06-10T12:00:00Z'),
		createdAt: new Date('2026-06-09T12:00:00Z'),
		...overrides,
	}
}

describe('renderRssFeed', () => {
	beforeEach(() => {
		vi.resetModules()
	})

	it('emits a well-formed RSS 2.0 channel with an atom:self link', async () => {
		const { renderRssFeed } = await loadRenderer()
		const xml = renderRssFeed({ title: 'Acme', description: 'Acme blog' }, [post()])
		expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
		expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
		expect(xml).toContain('<title>Acme</title>')
		expect(xml).toContain('<link>https://example.com</link>')
		expect(xml).toContain('<language>en</language>')
		expect(xml).toContain(
			'<atom:link href="https://example.com/rss.xml" rel="self" type="application/rss+xml" />',
		)
		expect(xml).toContain('</channel>')
		expect(xml).toContain('</rss>')
	})

	it('links items at the canonical blog URL (same form as sitemap/canonical)', async () => {
		const { renderRssFeed } = await loadRenderer()
		const xml = renderRssFeed({ title: 'Acme', description: 'd' }, [post({ slug: 'my-post' })])
		expect(xml).toContain('<link>https://example.com/blog/my-post</link>')
		expect(xml).toContain('<guid isPermaLink="true">https://example.com/blog/my-post</guid>')
	})

	it('formats pubDate as RFC-822 and prefers publishedAt over createdAt', async () => {
		const { renderRssFeed } = await loadRenderer()
		const xml = renderRssFeed({ title: 'Acme', description: 'd' }, [post()])
		expect(xml).toContain('<pubDate>Wed, 10 Jun 2026 12:00:00 GMT</pubDate>')
	})

	it('falls back to createdAt when publishedAt is null', async () => {
		const { renderRssFeed } = await loadRenderer()
		const xml = renderRssFeed({ title: 'Acme', description: 'd' }, [
			post({ publishedAt: null, createdAt: new Date('2026-01-02T00:00:00Z') }),
		])
		expect(xml).toContain('<pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>')
	})

	it('uses seoDesc for the description when present', async () => {
		const { renderRssFeed } = await loadRenderer()
		const xml = renderRssFeed({ title: 'Acme', description: 'd' }, [
			post({ seoDesc: 'Custom summary' }),
		])
		expect(xml).toContain('<description>Custom summary</description>')
	})

	it('derives a stripped, truncated excerpt when seoDesc is missing', async () => {
		const { renderRssFeed } = await loadRenderer()
		const long = `<p>${'word '.repeat(100)}</p>`
		const xml = renderRssFeed({ title: 'Acme', description: 'channel-desc' }, [
			post({ seoDesc: null, content: long }),
		])
		// descriptions[0] is the channel's; descriptions[1] is the item's excerpt.
		const descriptions = [...xml.matchAll(/<description>([^<]*)<\/description>/g)]
		expect(descriptions).toHaveLength(2)
		const desc = descriptions[1]![1]!
		expect(desc).not.toContain('<p>')
		expect(desc.endsWith('…')).toBe(true)
		expect(desc.length).toBeLessThanOrEqual(281) // 280 chars + ellipsis
	})

	it('escapes XML-special characters in title and description', async () => {
		const { renderRssFeed } = await loadRenderer()
		const xml = renderRssFeed({ title: 'Acme', description: 'd' }, [
			post({ title: 'Tips & "Tricks" <b>', seoDesc: 'a < b & c' }),
		])
		expect(xml).toContain('<title>Tips &amp; &quot;Tricks&quot; &lt;b&gt;</title>')
		expect(xml).toContain('<description>a &lt; b &amp; c</description>')
	})

	it('caps the feed at MAX_FEED_ITEMS newest posts', async () => {
		const { renderRssFeed, MAX_FEED_ITEMS } = await loadRenderer()
		const many = Array.from({ length: MAX_FEED_ITEMS + 10 }, (_, i) =>
			post({ slug: `post-${i}`, title: `Post ${i}` }),
		)
		const xml = renderRssFeed({ title: 'Acme', description: 'd' }, many)
		const items = xml.match(/<item>/g) ?? []
		expect(items).toHaveLength(MAX_FEED_ITEMS)
	})

	it('renders an empty (item-less) but valid feed when there are no posts', async () => {
		const { renderRssFeed } = await loadRenderer()
		const xml = renderRssFeed({ title: 'Acme', description: 'Acme blog' }, [])
		expect(xml).toContain('<channel>')
		expect(xml).not.toContain('<item>')
		expect(xml).toContain('</rss>')
	})
})
