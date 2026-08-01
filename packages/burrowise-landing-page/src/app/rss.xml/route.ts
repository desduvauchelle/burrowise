import { getBlogPosts } from '@growth-engine/sdk-server'
import { defaultLocale } from '@/i18n/config'
import { getDb, safeQuery } from '@/lib/db'
import { SITE_NAME } from '@/lib/seo'
import { MAX_FEED_ITEMS, renderRssFeed } from '@/lib/rss-shared'

export const revalidate = 3600

export async function GET() {
	const posts = await safeQuery([], () =>
		getBlogPosts(getDb(), { locale: defaultLocale, limit: MAX_FEED_ITEMS }),
	)

	const xml = renderRssFeed(
		{ title: SITE_NAME, description: `Latest articles from ${SITE_NAME}` },
		posts,
	)

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/rss+xml; charset=utf-8',
			// Feeds are for readers, not search. `noindex` keeps the feed (and the
			// bogus `/rss.xml/...` URLs crawlers derive from it) out of Google's
			// index — the "RSS feed in Google index" Search Console issue.
			'X-Robots-Tag': 'noindex',
			'Cache-Control': 'public, max-age=0, s-maxage=3600, must-revalidate',
		},
	})
}
