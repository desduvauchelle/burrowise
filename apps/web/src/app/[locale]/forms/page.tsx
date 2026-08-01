import type { Metadata } from 'next'
import { getActiveForms } from '@growth-engine/sdk-server'
import { FormCard } from '@growth-engine/sdk-client/components'
import { getDictionary } from '@/i18n'
import { getDb, safeQuery } from '@/lib/db'
import { localePrefix } from '@/lib/i18n-utils'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 60

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>
}): Promise<Metadata> {
	const { locale } = await params
	const dict = await getDictionary(locale)
	return buildPageMetadata({
		path: '/forms',
		locale,
		title: dict['forms.heading'],
		description: dict['forms.subtitle'],
	})
}

export default async function FormsPage({
	params,
}: {
	params: Promise<{ locale: string }>
}) {
	const { locale } = await params
	const dict = await getDictionary(locale)
	const activeForms = await safeQuery([], () => getActiveForms(getDb()))

	return (
		<main className="container mx-auto px-4 py-12">
			<h1 className="text-4xl font-bold text-center mb-2">{dict['forms.heading']}</h1>
			<p className="text-center text-base-content/60 mb-10">
				{dict['forms.subtitle']}
			</p>

			{activeForms.length === 0 && (
				<p className="text-center text-base-content/60 py-16">
					{dict['forms.empty']}
				</p>
			)}

			{activeForms.length > 0 && (
				<div className="mx-auto max-w-2xl grid gap-4">
					{activeForms.map((form) => (
						<FormCard
							key={form.id}
							slug={form.slug}
							name={form.name}
							description={form.description}
							locale={locale}
							localePrefix={localePrefix(locale)}
						/>
					))}
				</div>
			)}
		</main>
	)
}
