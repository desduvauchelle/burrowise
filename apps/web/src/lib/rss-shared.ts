import { defaultLocale } from '@/i18n/config'
import { SITE_URL, buildUrl, escapeXml } from '@/lib/sitemap-shared'

// The minimal post shape the feed needs. The SDK's `BlogPost` structurally
// satisfies it, so the route passes `getBlogPosts()` results straight in —
// without importing the shared types package (forbidden in template source;
// see no-types-package-import.unit.test.ts).
export interface FeedPost {
	slug: string
	title: string
	content: string
	seoDesc: string | null
	publishedAt: Date | string | number | null
	createdAt: Date | string | number
}

export interface RssChannel {
	title: string
	description: string
}

/** Newest N posts only — feeds are a recent-items window, not the full archive. */
export const MAX_FEED_ITEMS = 50
const EXCERPT_LENGTH = 280

/** Strip tags + collapse whitespace so blog HTML becomes a plain-text excerpt. */
export function stripHtml(html: string): string {
	return html
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

/** RFC-822/1123 date string for RSS `<pubDate>`/`<lastBuildDate>`; undefined if unparseable. */
function toRfc822(value: Date | string | number | null | undefined): string | undefined {
	if (value === null || value === undefined) return undefined
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return undefined
	return date.toUTCString()
}

function excerpt(post: FeedPost): string {
	if (post.seoDesc && post.seoDesc.trim()) return post.seoDesc.trim()
	const text = stripHtml(post.content)
	return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text
}

/**
 * Render an RSS 2.0 feed for the blog. Item `link`/`guid` use the same
 * `buildUrl('/blog/<slug>', defaultLocale)` as the sitemap and the page's
 * `<link rel="canonical">`, so the feed never points at a URL form that splits
 * the canonical signal. The route serves this with `X-Robots-Tag: noindex` —
 * feeds are for readers, not the search index (the "RSS feed in Google index"
 * Search Console issue this fixes).
 */
export function renderRssFeed(channel: RssChannel, posts: FeedPost[]): string {
	const selfUrl = `${SITE_URL}/rss.xml`
	const items = posts.slice(0, MAX_FEED_ITEMS)
	const lastBuild = toRfc822(items[0]?.publishedAt ?? items[0]?.createdAt)

	const lines: string[] = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
		'  <channel>',
		`    <title>${escapeXml(channel.title)}</title>`,
		`    <link>${escapeXml(SITE_URL)}</link>`,
		`    <description>${escapeXml(channel.description)}</description>`,
		`    <language>${escapeXml(defaultLocale)}</language>`,
		`    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />`,
	]
	if (lastBuild) lines.push(`    <lastBuildDate>${lastBuild}</lastBuildDate>`)

	for (const post of items) {
		const link = buildUrl(`/blog/${post.slug}`, defaultLocale)
		const pubDate = toRfc822(post.publishedAt ?? post.createdAt)
		lines.push('    <item>')
		lines.push(`      <title>${escapeXml(post.title)}</title>`)
		lines.push(`      <link>${escapeXml(link)}</link>`)
		lines.push(`      <guid isPermaLink="true">${escapeXml(link)}</guid>`)
		lines.push(`      <description>${escapeXml(excerpt(post))}</description>`)
		if (pubDate) lines.push(`      <pubDate>${pubDate}</pubDate>`)
		lines.push('    </item>')
	}

	lines.push('  </channel>')
	lines.push('</rss>')
	return lines.join('\n')
}
