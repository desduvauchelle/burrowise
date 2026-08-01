import { ScrollReveal } from './ScrollReveal'
import { InlineProductVisual } from './ProductVisuals'

const useCases = [
	{
		title: 'Founder Brain Dumps',
		description:
			'Capture decision context after calls, standups, or late-night product thinking so it becomes reusable company memory.',
		points: ['Voice-to-notes workflow', 'Source-linked memory', 'Asynchronous enrichment'],
	},
	{
		title: 'Research Interviews',
		description:
			'Run structured, AI-guided interviews to sharpen hypotheses, uncover contradictions, and extract action-oriented insights.',
		points: ['Custom interview hosts', 'Scope-aware retrieval', 'Evidence-backed follow-ups'],
	},
	{
		title: 'Knowledge Operations',
		description:
			'Turn scattered sessions into an indexed Markdown knowledge base your team can search, chat with, and build on safely.',
		points: ['Semantic + lexical search', 'Cited chat answers', 'Review inbox for extracted notes'],
	},
]

export function UseCases() {
	return (
		<section className="section-band">
			<div className="container mx-auto px-4">
				<ScrollReveal y={24} className="max-w-3xl">
					<p className="section-kicker">Use Cases</p>
					<h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
						Built for deep thinkers, not shallow note piles
					</h2>
					<p className="mt-4 text-base-content/75 leading-relaxed">
						Burrowise is a local-first field desk for founders, researchers, operators, and creators who need to
						capture nuance quickly, preserve original intent, and transform conversations into durable knowledge.
					</p>
				</ScrollReveal>

				<ScrollReveal y={28} stagger={0.1} className="mt-10 grid gap-6 lg:grid-cols-3">
					{useCases.map((useCase) => (
						<article key={useCase.title} className="surface-card p-6 md:p-7">
							<h3 className="text-xl font-semibold tracking-tight">{useCase.title}</h3>
							<p className="mt-3 text-sm leading-relaxed text-base-content/75">{useCase.description}</p>
							<ul className="mt-5 space-y-2 text-sm text-base-content/80">
								{useCase.points.map((point) => (
									<li key={point} className="feature-line">{point}</li>
								))}
							</ul>
						</article>
					))}
				</ScrollReveal>

				<ScrollReveal y={24} className="mt-8">
					<InlineProductVisual title="Search + Chat Workspace" variant="search" />
				</ScrollReveal>
			</div>
		</section>
	)
}
