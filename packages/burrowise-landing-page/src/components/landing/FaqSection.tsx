import { ScrollReveal } from './ScrollReveal'

const FAQ_ITEMS = [
	{
		question: 'Can Burrowise run with local models only?',
		answer: 'Yes. Burrowise is designed to support local-first operation with explicit provider control. It does not silently switch local requests to cloud providers.',
	},
	{
		question: 'What happens if enrichment fails during processing?',
		answer: 'Capture remains successful. The original session artifacts are retained and marked with processing state so you can retry enrichment without losing source data.',
	},
	{
		question: 'How do we verify AI responses are grounded in our knowledge base?',
		answer: 'Search and chat flows include citations and source references, making it easy to inspect where insights came from before acting on them.',
	},
	{
		question: 'Is Burrowise only for product teams?',
		answer: 'No. Any high-context team that works with interviews, strategy calls, research sessions, or voice notes can use Burrowise to build durable knowledge.',
	},
]

export function FaqSection() {
	return (
		<section className="section-band" aria-labelledby="faq-heading">
			<div className="container mx-auto px-4 max-w-4xl">
				<ScrollReveal y={20}>
					<p className="section-kicker">FAQ</p>
					<h2 id="faq-heading" className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
						Questions teams ask before they deploy Burrowise
					</h2>
				</ScrollReveal>

				<ScrollReveal y={20} stagger={0.06} className="mt-8 space-y-4">
					{FAQ_ITEMS.map((item) => (
						<details key={item.question} className="surface-card p-5 group">
							<summary className="cursor-pointer list-none pr-6 font-semibold tracking-tight text-base flex items-start justify-between gap-4">
								<span>{item.question}</span>
								<span aria-hidden className="text-primary transition-transform group-open:rotate-45">+</span>
							</summary>
							<p className="mt-3 text-sm leading-relaxed text-base-content/78">{item.answer}</p>
						</details>
					))}
				</ScrollReveal>
			</div>
		</section>
	)
}

export function faqJsonLd() {
	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: FAQ_ITEMS.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: {
				'@type': 'Answer',
				text: item.answer,
			},
		})),
	}
}
