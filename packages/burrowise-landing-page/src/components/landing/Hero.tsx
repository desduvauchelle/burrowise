import Link from 'next/link'
import type { Dictionary } from '@/i18n'
import { localizedPath } from '@/lib/i18n-utils'
import { ScrollReveal } from './ScrollReveal'
import { InlineProductVisual } from './ProductVisuals'

export function Hero({ dict, locale }: { dict: Dictionary; locale: string }) {
	return (
		<section className="hero-shell">
			<div className="container mx-auto px-4 py-16 md:py-24">
				<div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
					<div>
						<ScrollReveal y={24} duration={0.7} start="top 95%">
							<p className="section-kicker">Local-First Knowledge Platform</p>
							<h1 className="hero-title text-balance">
								Capture thoughts in seconds. Turn them into durable intelligence.
							</h1>
						</ScrollReveal>

						<ScrollReveal y={20} delay={0.1} start="top 95%">
							<p className="mt-6 max-w-2xl text-base md:text-lg leading-relaxed text-base-content/78">
								Burrowise helps founders and teams record conversations, preserve source truth, and build a searchable,
								citeable memory system across sessions, interviews, and strategic decisions.
							</p>
						</ScrollReveal>

						<ScrollReveal y={20} delay={0.18} start="top 95%">
							<div className="mt-8 flex flex-wrap items-center gap-3">
								<Link href={localizedPath('/contact', locale)} className="btn btn-primary btn-lg">
									Book a setup call
								</Link>
								<Link href={localizedPath('/blog', locale)} className="btn btn-outline btn-lg">
									See product thinking
								</Link>
							</div>
						</ScrollReveal>
					</div>

					<ScrollReveal y={30} delay={0.2} start="top 95%" className="hero-panel">
						<h2 className="text-lg font-semibold tracking-tight">What changes on day one</h2>
						<ul className="mt-4 space-y-3 text-sm text-base-content/80">
							<li className="feature-line">No more lost context between calls, chats, and docs</li>
							<li className="feature-line">Every insight traceable to original transcript and source</li>
							<li className="feature-line">AI support with explicit provider visibility and control</li>
							<li className="feature-line">One workflow from raw voice capture to reusable knowledge</li>
						</ul>
						<div className="mt-6">
							<InlineProductVisual title="Live Capture Console" variant="capture" />
						</div>
					</ScrollReveal>
				</div>
			</div>
		</section>
	)
}
