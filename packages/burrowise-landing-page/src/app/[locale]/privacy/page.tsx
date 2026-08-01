import type { Metadata } from 'next'
import { getDictionary } from '@/i18n'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params
	const dict = await getDictionary(locale)
	return buildPageMetadata({
		path: '/privacy',
		locale,
		title: dict['page.privacy.policy'],
		description: dict['privacy.intro'],
	})
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params
	const dict = await getDictionary(locale)

	return (
		<main className="container mx-auto px-4 py-12 max-w-3xl">
			<h1 className="text-4xl font-bold mb-8">{dict['page.privacy.policy']}</h1>
			<div className="prose max-w-none">
				<p>{dict['privacy.intro']}</p>

				<h2>{dict['privacy.section1.title']}</h2>
				<p>{dict['privacy.section1.body']}</p>

				<h2>{dict['privacy.section2.title']}</h2>
				<p>{dict['privacy.section2.body']}</p>

				<h2>{dict['privacy.section3.title']}</h2>
				<p>{dict['privacy.section3.body']}</p>

				<h2>{dict['privacy.section4.title']}</h2>
				<p>{dict['privacy.section4.body']}</p>
			</div>
		</main>
	)
}
