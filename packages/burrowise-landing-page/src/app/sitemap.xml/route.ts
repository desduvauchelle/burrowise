import {
	SITE_URL,
	fetchBlogCount,
	getBlogSitemapCount,
	renderSitemapIndex,
} from '@/lib/sitemap-shared'

export const revalidate = 3600

export async function GET() {
	const total = await fetchBlogCount()
	const blogSitemapCount = getBlogSitemapCount(total)

	// id 0 = static pages, 1..blogSitemapCount = blog batches, blogSitemapCount+1 = authors
	const urls: string[] = []
	urls.push(`${SITE_URL}/sitemap/0.xml`)
	for (let i = 1; i <= blogSitemapCount; i++) {
		urls.push(`${SITE_URL}/sitemap/${i}.xml`)
	}
	urls.push(`${SITE_URL}/sitemap/${blogSitemapCount + 1}.xml`)

	const xml = renderSitemapIndex(urls)
	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=0, s-maxage=3600, must-revalidate',
		},
	})
}
