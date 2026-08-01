import Link from 'next/link'
import { localizedPath } from '@/lib/i18n-utils'
import { ScrollReveal } from './ScrollReveal'

const proofItems = [
	{
		title: 'Local-first by architecture',
		detail: 'Keep canonical knowledge in readable Markdown with rebuildable indexes and explicit provider boundaries.',
	},
	{
		title: 'Source-cited answers',
		detail: 'Chat and retrieval workflows expose the exact source material behind generated responses.',
	},
	{
		title: 'Capture succeeds even when enrichment fails',
		detail: 'Your session and audio are retained first, with asynchronous processing status visible and retryable.',
	},
]

export function ProofStrip({ locale }: { locale: string }) {
	return (
		<section className="section-band section-band-muted" aria-labelledby="proof-heading">
			<div className="container mx-auto px-4">
				<ScrollReveal y={20} className="max-w-3xl">
					<p className="section-kicker">Why Teams Switch</p>
					<h2 id="proof-heading" className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
						Trustworthy AI workflows, not black-box automation
					</h2>
				</ScrollReveal>

				<ScrollReveal y={24} stagger={0.1} className="mt-8 grid gap-5 lg:grid-cols-3">
					{proofItems.map((item) => (
						<article key={item.title} className="surface-card p-6">
							<h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
							<p className="mt-3 text-sm leading-relaxed text-base-content/75">{item.detail}</p>
						</article>
					))}
				</ScrollReveal>

				<ScrollReveal y={20} className="mt-8 flex flex-wrap items-center gap-3">
					<Link href={localizedPath('/contact', locale)} className="btn btn-primary btn-md">Schedule an implementation walkthrough</Link>
					<Link href={localizedPath('/forms', locale)} className="btn btn-outline btn-md">Explore templates and forms</Link>
				</ScrollReveal>
			</div>
		</section>
	)
}
