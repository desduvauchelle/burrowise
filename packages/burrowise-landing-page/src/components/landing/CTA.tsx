import type { Dictionary } from '@/i18n'
import { localizedPath } from '@/lib/i18n-utils'
import { ScrollReveal } from './ScrollReveal'
import { TrackedLink } from './TrackedLink'

export function CTA({ dict, locale }: { dict: Dictionary; locale: string }) {
	return (
		<section className="section-band section-cta">
			<ScrollReveal y={30} className="container mx-auto px-4 text-center">
				<p className="section-kicker section-kicker-light">Start Burrowing Deeper</p>
				<h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4 text-balance">{dict['cta.heading']}</h2>
				<p className="text-base md:text-lg opacity-90 mb-8 max-w-2xl mx-auto leading-relaxed">
					{dict['cta.subtitle']}
				</p>
				<TrackedLink
					href={localizedPath('/contact', locale)}
					className="btn btn-soft btn-lg"
					eventName="cta_click"
				>
					{dict['cta.button']}
				</TrackedLink>
				<p className="mt-4 text-sm opacity-85">No noisy migration. Keep your process. Add durable memory.</p>
			</ScrollReveal>
		</section>
	)
}
