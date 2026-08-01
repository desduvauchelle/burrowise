import type { Dictionary } from '@/i18n'
import { localizedPath } from '@/lib/i18n-utils'
import { ScrollReveal } from './ScrollReveal'
import { TrackedLink } from './TrackedLink'

export function CTA({ dict, locale }: { dict: Dictionary; locale: string }) {
	return (
		<section className="py-20 bg-primary text-primary-content">
			<ScrollReveal y={30} className="container mx-auto px-4 text-center">
				<h2 className="text-3xl font-bold mb-4">{dict['cta.heading']}</h2>
				<p className="text-lg opacity-80 mb-8 max-w-xl mx-auto">
					{dict['cta.subtitle']}
				</p>
				<TrackedLink
					href={localizedPath('/contact', locale)}
					className="btn btn-secondary btn-lg"
					eventName="cta_click"
				>
					{dict['cta.button']}
				</TrackedLink>
			</ScrollReveal>
		</section>
	)
}
