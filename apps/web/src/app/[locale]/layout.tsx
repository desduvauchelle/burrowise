import { notFound } from 'next/navigation'
import { getBusinessConfig } from '@growth-engine/sdk-server'
import { BusinessJsonLd } from '@growth-engine/sdk-client/components'
import { getDictionary } from '@/i18n'
import { isSupportedLocale, supportedLocales } from '@/i18n/config'
import { getDb, safeQuery } from '@/lib/db'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export function generateStaticParams() {
	return supportedLocales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
	children,
	params,
}: {
	children: React.ReactNode
	params: Promise<{ locale: string }>
}) {
	const { locale } = await params

	// The `[locale]` segment matches ANY first path segment, so requests like
	// `/rss.xml/legal` or `/index.iml/...` (bot probes / stale links from a prior
	// site) would otherwise render a real page at HTTP 200 with a self-referencing
	// canonical to the bogus URL — Google flags these as "Duplicate without
	// user-selected canonical" and they pollute the index. Reject any segment that
	// is not a configured locale with a 404. DO NOT remove this guard.
	if (!isSupportedLocale(locale)) {
		notFound()
	}

	const dict = await getDictionary(locale)
	const business = await safeQuery(null, () => getBusinessConfig(getDb()))

	return (
		<>
			{/* Site-wide Organization / LocalBusiness structured data */}
			{business && <BusinessJsonLd config={business} />}
			<Header dict={dict} locale={locale} />
			<main className="flex-1">{children}</main>
			<Footer dict={dict} locale={locale} />
		</>
	)
}
