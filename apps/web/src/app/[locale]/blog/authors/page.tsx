import type { Metadata } from 'next'
import { getBlogAuthors } from '@growth-engine/sdk-server'
import { getDictionary } from '@/i18n'
import { getDb, safeQuery } from '@/lib/db'
import { buildPageMetadata } from '@/lib/seo'
import { AuthorCard } from '@/components/blog/AuthorCard'

export const revalidate = 300

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>
}): Promise<Metadata> {
	const { locale } = await params
	const dict = await getDictionary(locale)
	return buildPageMetadata({
		path: '/blog/authors',
		locale,
		title: dict['authors.heading'],
		description: dict['authors.subtitle'],
	})
}

export default async function AuthorsPage({
	params,
}: {
	params: Promise<{ locale: string }>
}) {
	const { locale } = await params
	const dict = await getDictionary(locale)
	const authors = await safeQuery([], () => getBlogAuthors(getDb()))

	return (
		<main className="container mx-auto px-4 py-12">
			<h1 className="text-4xl font-bold text-center mb-2">
				{dict['authors.heading']}
			</h1>
			<p className="text-center text-base-content/60 mb-10">
				{dict['authors.subtitle']}
			</p>

			{authors.length === 0 ? (
				<div className="text-center py-16 text-base-content/50">
					<p className="text-lg">{dict['authors.empty']}</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{authors.map((author) => (
						<AuthorCard
							key={author.id}
							author={author}
							locale={locale}
							viewPostsLabel={dict['authors.view.posts']}
						/>
					))}
				</div>
			)}
		</main>
	)
}
