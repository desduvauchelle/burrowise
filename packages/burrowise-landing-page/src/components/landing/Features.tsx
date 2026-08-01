import type { Dictionary } from '@/i18n'
import { ScrollReveal } from './ScrollReveal'

export function Features({ dict }: { dict: Dictionary }) {
	const features = [
		{
			title: dict['features.ai.title'],
			description: dict['features.ai.description'],
			icon: '📝',
		},
		{
			title: dict['features.social.title'],
			description: dict['features.social.description'],
			icon: '📱',
		},
		{
			title: dict['features.analytics.title'],
			description: dict['features.analytics.description'],
			icon: '📊',
		},
	]

	return (
		<section className="py-20 bg-base-100">
			<div className="container mx-auto px-4">
				<ScrollReveal y={30}>
					<h2 className="text-3xl font-bold text-center mb-12">
						{dict['features.heading']}
					</h2>
				</ScrollReveal>
				<ScrollReveal y={40} stagger={0.15} className="grid grid-cols-1 md:grid-cols-3 gap-8">
					{features.map((f) => (
						<div key={f.title} className="card bg-base-200 p-8 text-center">
							<div className="text-4xl mb-4">{f.icon}</div>
							<h3 className="text-xl font-semibold mb-2">{f.title}</h3>
							<p className="text-base-content/70">{f.description}</p>
						</div>
					))}
				</ScrollReveal>
			</div>
		</section>
	)
}
