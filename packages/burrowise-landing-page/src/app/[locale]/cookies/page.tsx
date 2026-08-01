import type { Metadata } from 'next'
import { getDictionary } from '@/i18n'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params
	const dict = await getDictionary(locale)
	return buildPageMetadata({
		path: '/cookies',
		locale,
		title: dict['page.cookie.policy'],
		description: dict['cookies.intro'],
	})
}

export default async function CookiesPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params
	const dict = await getDictionary(locale)

	return (
		<main className="container mx-auto px-4 py-12 max-w-3xl">
			<h1 className="text-4xl font-bold mb-8">{dict['page.cookie.policy']}</h1>
			<div className="prose max-w-none">
				<p>{dict['cookies.intro']}</p>

				<h2>{dict['cookies.section1.title']}</h2>
				<p>{dict['cookies.section1.body']}</p>

				<h2>{dict['cookies.section2.title']}</h2>
				<ul>
					<li>
						<strong>{dict['cookies.section2.essential.label']}</strong>{' '}
						{dict['cookies.section2.essential.body']}
					</li>
					<li>
						<strong>{dict['cookies.section2.analytics.label']}</strong>{' '}
						{dict['cookies.section2.analytics.body']}
					</li>
				</ul>

				<h2>{dict['cookies.section3.title']}</h2>
				<p>{dict['cookies.section3.body']}</p>

				<h2>{dict['cookies.section4.title']}</h2>
				<p>{dict['cookies.section4.body']}</p>
			</div>
		</main>
	)
}
