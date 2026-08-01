import type { Metadata } from 'next'
import Link from 'next/link'
import { getNewsletterIssues } from '@growth-engine/sdk-server'
import { NewsletterSignup } from '@growth-engine/sdk-client/components'
import { getDictionary } from '@/i18n'
import { getDb, safeQuery } from '@/lib/db'
import { formatDate, localizedPath } from '@/lib/i18n-utils'
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
		path: '/newsletter',
		locale,
		title: dict['newsletter.heading'],
		description: dict['newsletter.subtitle'],
	})
}

export default async function NewsletterPage({
	params,
}: {
	params: Promise<{ locale: string }>
}) {
	const { locale } = await params
	const dict = await getDictionary(locale)

	const issues = await safeQuery([], () => getNewsletterIssues(getDb(), { limit: 0 }))

	return (
		<main className="container mx-auto px-4 py-12">
			<h1 className="text-4xl font-bold text-center mb-2">{dict['newsletter.heading']}</h1>
			<p className="text-center text-base-content/60 mb-10">{dict['newsletter.subtitle']}</p>

			<div className="max-w-lg mx-auto mb-12">
				<NewsletterSignup
					title={dict['newsletter.signup.title']}
					description={dict['newsletter.signup.description']}
					buttonLabel={dict['newsletter.signup.button']}
					placeholder={dict['newsletter.signup.placeholder']}
					successMessage={dict['newsletter.signup.success']}
				/>
			</div>

			{issues.length === 0 ? (
				<p className="text-center py-16 text-base-content/50">{dict['newsletter.empty']}</p>
			) : (
				<ul className="max-w-2xl mx-auto divide-y divide-base-300">
					{issues.map((issue) => (
						<li key={issue.id} className="py-6">
							<Link
								href={localizedPath(`/newsletter/${issue.slug}`, locale)}
								className="group block"
							>
								{issue.sentAt && (
									<time className="text-sm text-base-content/50">
										{formatDate(issue.sentAt, locale)}
									</time>
								)}
								<h2 className="text-2xl font-semibold mt-1 group-hover:text-primary">
									{issue.subject}
								</h2>
								{issue.previewText && (
									<p className="mt-2 text-base-content/70">{issue.previewText}</p>
								)}
							</Link>
						</li>
					))}
				</ul>
			)}
		</main>
	)
}
