import type { Metadata } from 'next'
import { defaultLocale } from '@/i18n/config'
import { SITE_URL, buildUrl, buildAlternates } from './sitemap-shared'

export const SITE_NAME = 'Burrowise Landing'

/**
 * Google truncates titles around 60 characters. The brand suffix is only worth
 * those characters when the whole title still fits — past that it pushes the
 * part that actually earns the click out of the SERP, so we drop it instead.
 */
const TITLE_MAX = 60

/**
 * Blog URLs (`/blog`, every article, the author pages) NEVER get the brand
 * suffix — blanket rule, not a per-page opt-out. Blog titles are written to rank
 * on their own keywords, and bolting the company name on the end both eats
 * SERP characters and makes every article look like a duplicate of the last.
 * A branded article title also competes with the brand's own homepage listing.
 *
 * The AI blog prompts (`packages/domain/src/ai.ts`,
 * `agent/completion-tools/blog-writing.ts`) are the other half of this rule:
 * they instruct the model to keep the brand name out of `seoTitle`.
 */
function isBlogPath(path: string): boolean {
	return path === '/blog' || path.startsWith('/blog/')
}

interface PageMetadataInput {
	/** Path WITHOUT locale prefix, e.g. '' (home), '/blog', '/blog/my-post'. */
	path: string
	locale: string
	/**
	 * Human title for this page. Branded as `${title} | ${SITE_NAME}` when the
	 * result fits in `TITLE_MAX` and the page is not under `/blog`. `brand: false`
	 * opts out.
	 */
	title: string
	description?: string | null
	/** Absolute or root-relative OG image (resolved against metadataBase). */
	image?: string | null
	type?: 'website' | 'article'
	/** Set false to use `title` verbatim (e.g. the homepage already is the brand). */
	brand?: boolean
}

/**
 * Build a page's metadata with a SELF-REFERENCING canonical, hreflang
 * alternates, and OpenGraph/Twitter tags — all on the single canonical host.
 *
 * The canonical always points at THIS page's own URL (never a different page,
 * never a stripped/added locale), which is the whole fix for the indexing bug.
 * Use this in every `generateMetadata`.
 */
export function buildPageMetadata({
	path,
	locale,
	title,
	description,
	image,
	type = 'website',
	brand = true,
}: PageMetadataInput): Metadata {
	const canonical = buildUrl(path, locale)
	const languages = buildAlternates(path)
	const brandSuffix = ` | ${SITE_NAME}`
	const useBrand = brand && !isBlogPath(path)
	const fullTitle =
		useBrand && title.length + brandSuffix.length <= TITLE_MAX ? `${title}${brandSuffix}` : title

	const languagesWithDefault = languages
		? { ...languages, 'x-default': buildUrl(path, defaultLocale) }
		: undefined

	return {
		// `absolute` opts out of the root layout's title template so the brand
		// suffix isn't applied twice.
		title: { absolute: fullTitle },
		...(description ? { description } : {}),
		alternates: {
			canonical,
			// Site-wide RSS feed discovery (`<link rel="alternate" type="…rss+xml">`),
			// resolved against `metadataBase`. The feed itself is served `noindex`.
			types: {
				'application/rss+xml': [{ url: '/rss.xml', title: `${SITE_NAME} RSS Feed` }],
			},
			...(languagesWithDefault ? { languages: languagesWithDefault } : {}),
		},
		openGraph: {
			title: fullTitle,
			...(description ? { description } : {}),
			url: canonical,
			siteName: SITE_NAME,
			type,
			...(image ? { images: [{ url: image }] } : {}),
		},
		twitter: {
			card: image ? 'summary_large_image' : 'summary',
			title: fullTitle,
			...(description ? { description } : {}),
			...(image ? { images: [image] } : {}),
		},
	}
}

export { SITE_URL }
