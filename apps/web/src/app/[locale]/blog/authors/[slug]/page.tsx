import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBlogAuthor, getAuthorPosts } from '@growth-engine/sdk-server'
import { BlogList } from '@growth-engine/sdk-client/components'
import { getDictionary } from '@/i18n'
import { getDb, safeQuery } from '@/lib/db'
import { localePrefix, localizedPath } from '@/lib/i18n-utils'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 300

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
	const { locale, slug } = await params
	const author = await safeQuery(null, () => getBlogAuthor(getDb(), slug))
	if (!author) return {}
	return buildPageMetadata({
		path: `/blog/authors/${slug}`,
		locale,
		title: author.name,
		description: author.bio,
		...(author.avatarUrl ? { image: author.avatarUrl } : {}),
	})
}

export default async function AuthorDetailPage({
	params,
}: {
	params: Promise<{ locale: string; slug: string }>
}) {
	const { locale, slug } = await params
	const dict = await getDictionary(locale)

	const author = await safeQuery(null, () => getBlogAuthor(getDb(), slug))
	if (!author) notFound()

	const posts = await safeQuery([], () => getAuthorPosts(getDb(), slug, { locale, limit: 0 }))

	return (
		<main className="container mx-auto px-4 py-12">
			<nav className="mb-8">
				<Link
					href={localizedPath('/blog/authors', locale)}
					className="text-sm text-primary hover:underline"
				>
					{dict['authors.back']}
				</Link>
			</nav>

			<header className="max-w-3xl mx-auto text-center mb-12">
				{author.avatarUrl ? (
					<img
						src={author.avatarUrl}
						alt=""
						className="w-32 h-32 rounded-full object-cover mx-auto mb-4"
					/>
				) : (
					<span className="w-32 h-32 rounded-full bg-base-300 flex items-center justify-center text-5xl font-semibold text-base-content/80 mx-auto mb-4">
						{author.name.charAt(0).toUpperCase()}
					</span>
				)}
				<h1 className="text-4xl font-bold mb-3">{author.name}</h1>
				{author.bio && (
					<div className="prose prose-lg mx-auto">
						<p>{author.bio}</p>
					</div>
				)}
				{author.websiteUrl && (
					<a
						href={author.websiteUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="btn btn-ghost btn-sm mt-4"
					>
						{dict['authors.website']} →
					</a>
				)}
			</header>

			<section className="max-w-5xl mx-auto">
				<h2 className="text-2xl font-bold mb-6">
					{dict['authors.posts.heading'].replace('{name}', author.name)}
				</h2>

				{posts.length === 0 ? (
					<div className="text-center py-16 text-base-content/50">
						<p className="text-lg">{dict['authors.posts.empty']}</p>
					</div>
				) : (
					<BlogList
						posts={posts}
						locale={locale}
						localePrefix={localePrefix(locale)}
						translations={{
							noPostsMessage: dict['authors.posts.empty'],
							clearSearchLabel: dict['blog.clear.search'],
							searchPlaceholder: dict['blog.search.placeholder'],
						}}
					/>
				)}
			</section>
		</main>
	)
}
