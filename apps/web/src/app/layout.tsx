import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { GrowthEngineProvider } from '@growth-engine/sdk-client'
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics'
import { SITE_URL } from '@/lib/sitemap-shared'
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
	description: 'A private, local-first place to capture ideas, search your knowledge, and think deeper with AI.',
}

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const headersList = await headers()
	const locale = headersList.get('x-locale') || 'en'

	return (
		<html lang={locale} data-theme="light">
			<body className="min-h-screen flex flex-col">
				<GoogleAnalytics />
				<GrowthEngineProvider>
					{children}
				</GrowthEngineProvider>
			</body>
		</html>
	)
}
