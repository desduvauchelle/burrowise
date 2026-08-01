import type { Metadata } from 'next'
import Link from 'next/link'
import { getBlogPosts } from '@growth-engine/sdk-server'
import { BlogCard } from '@growth-engine/sdk-client/components'
import { getDictionary } from '@/i18n'
import { getDb, safeQuery } from '@/lib/db'
import { localePrefix, localizedPath } from '@/lib/i18n-utils'
import { buildPageMetadata } from '@/lib/seo'
import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { UseCases } from '@/components/landing/UseCases'
import { FeatureMatrix } from '@/components/landing/FeatureMatrix'
import { ProofStrip } from '@/components/landing/ProofStrip'
import { FaqSection, faqJsonLd } from '@/components/landing/FaqSection'
import { CTA } from '@/components/landing/CTA'

export const revalidate = 60

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>
}): Promise<Metadata> {
	const { locale } = await params
	const dict = await getDictionary(locale)
	// Homepage canonical is the (locale-aware) site root; title is the brand itself.
	return buildPageMetadata({
		path: '',
		locale,
		title: 'Local-First Voice Capture and Knowledge Intelligence',
		description: 'Burrowise helps teams capture spoken insight, preserve source truth, and transform sessions into searchable, cited organizational knowledge.',
		brand: false,
	})
}

export default async function HomePage({
	params,
}: {
	params: Promise<{ locale: string }>
}) {
	const { locale } = await params
	const dict = await getDictionary(locale)
	const posts = await safeQuery([], () => getBlogPosts(getDb(), { locale, limit: 3 }))

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
			/>
			<Hero dict={dict} locale={locale} />
			<Features />
			<UseCases />
			<FeatureMatrix />
			<ProofStrip locale={locale} />

			<section className="section-band">
				<div className="container mx-auto px-4">
					<div className="section-heading-row">
						<div>
							<p className="section-kicker">Fresh Thinking</p>
							<h2 className="text-3xl md:text-4xl font-semibold tracking-tight">{dict['home.latest.blog']}</h2>
						</div>
						<Link href={localizedPath('/blog', locale)} className="btn btn-outline btn-sm">
							{dict['home.view.all']} →
						</Link>
					</div>

					{posts.length === 0 ? (
						<p className="text-center text-base-content/70 py-12">
							{dict['home.no.posts']}
						</p>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							{posts.map((post) => (
								<BlogCard
									key={post.id}
									slug={post.slug}
									title={post.title}
									content={post.content}
									heroImageUrl={post.heroImageUrl}
									seoDesc={post.seoDesc}
									createdAt={post.createdAt}
									locale={locale}
									localePrefix={localePrefix(locale)}
								/>
							))}
						</div>
					)}
				</div>
			</section>

			<FaqSection />
			<CTA dict={dict} locale={locale} />
		</>
	)
}
