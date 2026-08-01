import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getNewsletterIssue } from '@growth-engine/sdk-server'
import { NewsletterContent, NewsletterSignup } from '@growth-engine/sdk-client/components'
import { getDictionary } from '@/i18n'
import { getDb, safeQuery } from '@/lib/db'
import { formatDate, localizedPath } from '@/lib/i18n-utils'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 60

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
	const { locale, slug } = await params
	const issue = await safeQuery(null, () => getNewsletterIssue(getDb(), slug))
	if (!issue) return {}
	return buildPageMetadata({
		path: `/newsletter/${slug}`,
		locale,
		title: issue.subject,
		description: issue.previewText,
		type: 'article',
	})
}

export default async function NewsletterIssuePage({
	params,
}: {
	params: Promise<{ locale: string; slug: string }>
}) {
	const { locale, slug } = await params
	const dict = await getDictionary(locale)

	const issue = await safeQuery(null, () => getNewsletterIssue(getDb(), slug))
	if (!issue) notFound()

	const date = issue.sentAt ? formatDate(issue.sentAt, locale) : undefined

	return (
		<main className="container mx-auto px-4 py-12">
			<nav className="mb-8">
				<Link
					href={localizedPath('/newsletter', locale)}
					className="text-sm text-primary hover:underline"
				>
					← {dict['newsletter.back']}
				</Link>
			</nav>

			<article className="max-w-3xl mx-auto">
				<NewsletterContent issue={issue} {...(date ? { date } : {})} />
			</article>

			<div className="max-w-lg mx-auto mt-12">
				<NewsletterSignup
					title={dict['newsletter.signup.title']}
					description={dict['newsletter.signup.description']}
					buttonLabel={dict['newsletter.signup.button']}
					placeholder={dict['newsletter.signup.placeholder']}
					successMessage={dict['newsletter.signup.success']}
				/>
			</div>
		</main>
	)
}
