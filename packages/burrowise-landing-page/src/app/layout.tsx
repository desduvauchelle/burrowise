import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { GrowthEngineProvider } from '@growth-engine/sdk-client'
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics'
import { SITE_URL } from '@/lib/sitemap-shared'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import './globals.css'

// `metadataBase` makes every relative metadata URL (OG images, etc.) resolve to
// the single canonical host, so absolute asset URLs are never host-inconsistent.
// The `title.default` is only used as a fallback — every page sets its own
// unique title via `buildPageMetadata`.
export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: 'Burrowise',
		template: '%s | Burrowise',
	},
	description: 'Burrowise is a local-first knowledge platform for capturing voice, preserving source truth, and turning conversations into durable intelligence.',
}

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const headersList = await headers()
	const locale = headersList.get('x-locale') || 'en'

	// `data-theme` is the SSR fallback (and what no-JS visitors get). The inline
	// script below overwrites it before the first paint with the visitor's stored
	// choice, or with their OS `prefers-color-scheme` when they haven't chosen —
	// hence `suppressHydrationWarning`: the attribute React rendered is expected
	// to differ from the one in the DOM by the time hydration runs.
	return (
		<html lang={locale} data-theme="light" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
			</head>
			<body className="min-h-screen flex flex-col">
				<GoogleAnalytics />
				<GrowthEngineProvider>
					{children}
				</GrowthEngineProvider>
			</body>
		</html>
	)
}
