import type { Metadata } from 'next'
import { defaultLocale } from '@/i18n/config'
import { SITE_URL, buildUrl, buildAlternates } from './sitemap-shared'

export const SITE_NAME = 'Burrowise'

interface PageMetadataInput {
	/** Path WITHOUT locale prefix, e.g. '' (home), '/blog', '/blog/my-post'. */
	path: string
	locale: string
	/** Human title for this page. Branded as `${title} | ${SITE_NAME}` unless `brand: false`. */
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
	const fullTitle = brand ? `${title} | ${SITE_NAME}` : title

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
