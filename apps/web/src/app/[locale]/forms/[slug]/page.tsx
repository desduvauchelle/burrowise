import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormBySlug } from '@growth-engine/sdk-server'
import { FormRenderer } from '@growth-engine/sdk-client/components'
import { getDb, safeQuery } from '@/lib/db'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 60

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
	const { locale, slug } = await params
	const form = await safeQuery(null, () => getFormBySlug(getDb(), slug))
	if (!form) return {}
	return buildPageMetadata({
		path: `/forms/${slug}`,
		locale,
		title: form.name,
		description: form.description,
	})
}

export default async function DynamicFormPage({
	params,
}: {
	params: Promise<{ locale: string; slug: string }>
}) {
	const { slug } = await params
	const form = await safeQuery(null, () => getFormBySlug(getDb(), slug))

	if (!form) notFound()

	return (
		<main className="container mx-auto px-4 py-12">
			<FormRenderer form={form} />
		</main>
	)
}
