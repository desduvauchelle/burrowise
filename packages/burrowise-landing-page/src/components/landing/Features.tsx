import { ScrollReveal } from './ScrollReveal'

const pillars = [
	{
		title: 'Capture Without Friction',
		description:
			'Press, speak, release. Burrowise captures audio and transcript quickly so momentum is never lost.',
	},
	{
		title: 'Preserve Source Truth',
		description:
			'Canonical Markdown plus original audio keeps your raw thinking intact while enabling structured enrichment.',
	},
	{
		title: 'Operationalize Insight',
		description:
			'Search, chat, and interviews turn archived sessions into active decision support for execution and strategy.',
	},
]

const flow = [
	'Speak or import context',
	'Get transcript and source files',
	'Generate titles, summaries, tags, and notes',
	'Review extracted knowledge',
	'Search, chat, and publish with citations',
]


export function Features() {
	return (
		<section className="section-band">
			<div className="container mx-auto px-4">
				<ScrollReveal y={28} className="max-w-3xl">
					<p className="section-kicker">Product Pillars</p>
					<h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
						A field desk for teams that think in depth
					</h2>
					<p className="mt-4 text-base-content/75 leading-relaxed">
						Burrowise is designed for high-context work: product strategy, research, coaching, and operations where
						nuance matters more than quick summaries.
					</p>
				</ScrollReveal>

				<ScrollReveal y={28} stagger={0.11} className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
					{pillars.map((pillar) => (
						<article key={pillar.title} className="surface-card p-6 md:p-7">
							<h3 className="text-xl font-semibold tracking-tight">{pillar.title}</h3>
							<p className="mt-3 text-sm leading-relaxed text-base-content/75">{pillar.description}</p>
						</article>
					))}
				</ScrollReveal>

				<ScrollReveal y={30} className="mt-10 surface-card p-6 md:p-8">
					<div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)] md:items-center">
						<div>
							<p className="section-kicker">Workflow</p>
							<h3 className="text-2xl font-semibold tracking-tight">From thought to action in one chain</h3>
						</div>
						<ol className="grid gap-3 md:grid-cols-2">
							{flow.map((step, index) => (
								<li key={step} className="flow-step">
									<span>{String(index + 1).padStart(2, '0')}</span>
									<strong>{step}</strong>
								</li>
							))}
						</ol>
					</div>
				</ScrollReveal>
			</div>
		</section>
	)
}
