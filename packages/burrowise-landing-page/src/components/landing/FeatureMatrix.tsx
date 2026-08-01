import { ScrollReveal } from './ScrollReveal'

const featureRows = [
	{
		area: 'Capture',
		items: ['Push-to-talk recording', 'Near-instant transcript display', 'Original audio preservation'],
	},
	{
		area: 'Knowledge Enrichment',
		items: ['Automated summaries and tags', 'Atomic note extraction', 'Review inbox for merge/accept decisions'],
	},
	{
		area: 'Search + Chat',
		items: ['Lexical and semantic retrieval', 'Source citations in every answer', 'Explicit provider and model visibility'],
	},
	{
		area: 'Interview Mode',
		items: ['AI host presets', 'One-question-at-a-time pacing', 'Configurable knowledge scope'],
	},
	{
		area: 'Platform + Control',
		items: ['Local-first architecture', 'No silent local-to-cloud fallback', 'Rebuildable AI-derived indexes'],
	},
]

export function FeatureMatrix() {
	return (
		<section className="section-band section-band-muted">
			<div className="container mx-auto px-4">
				<ScrollReveal y={26} className="max-w-3xl">
					<p className="section-kicker">Capabilities</p>
					<h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Everything in one coherent operating surface</h2>
					<p className="mt-4 text-base-content/75 leading-relaxed">
						Burrowise combines capture, enrichment, retrieval, and publishing workflows without forcing your team
						into fragmented tools or opaque AI behavior.
					</p>
				</ScrollReveal>

				<ScrollReveal y={24} stagger={0.08} className="mt-10 space-y-4">
					{featureRows.map((row) => (
						<article key={row.area} className="surface-card p-6 md:p-7">
							<div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
								<h3 className="text-lg font-semibold tracking-tight text-forest">{row.area}</h3>
								<ul className="grid gap-3 md:grid-cols-3 text-sm text-base-content/80">
									{row.items.map((item) => (
										<li key={item} className="feature-line">{item}</li>
									))}
								</ul>
							</div>
						</article>
					))}
				</ScrollReveal>
			</div>
		</section>
	)
}
