import type { Metadata } from 'next'
import { getDictionary } from '@/i18n'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params
	const dict = await getDictionary(locale)
	return buildPageMetadata({
		path: '/legal',
		locale,
		title: dict['page.terms.of.service'],
		description: dict['legal.intro'],
	})
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params
	const dict = await getDictionary(locale)

	return (
		<main className="container mx-auto px-4 py-12 max-w-3xl">
			<h1 className="text-4xl font-bold mb-8">{dict['page.terms.of.service']}</h1>
			<div className="prose max-w-none">
				<p>{dict['legal.intro']}</p>

				<h2>{dict['legal.section1.title']}</h2>
				<p>{dict['legal.section1.body']}</p>

				<h2>{dict['legal.section2.title']}</h2>
				<p>{dict['legal.section2.body']}</p>

				<h2>{dict['legal.section3.title']}</h2>
				<p>{dict['legal.section3.body']}</p>

				<h2>{dict['legal.section4.title']}</h2>
				<p>{dict['legal.section4.body']}</p>
			</div>
		</main>
	)
}
