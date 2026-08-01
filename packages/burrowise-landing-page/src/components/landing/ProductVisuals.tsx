import { ScrollReveal } from './ScrollReveal'

type VisualVariant = 'capture' | 'workspace' | 'search'

function MockWindow({
	title,
	variant,
}: {
	title: string
	variant: VisualVariant
}) {
	if (variant === 'capture') {
		return (
			<article className="mock-window" aria-label="Burrowise capture screen preview">
				<header className="mock-window__head">
					<div className="mock-window__dots" aria-hidden>
						<span />
						<span />
						<span />
					</div>
					<strong>{title}</strong>
				</header>
				<div className="mock-window__body">
					<div className="mock-nav-col">
						<div className="mock-pill active" />
						<div className="mock-pill" />
						<div className="mock-pill" />
						<div className="mock-pill" />
					</div>
					<div className="mock-main-col">
						<div className="mock-record-panel">
							<div className="mock-record-dot" />
							<div className="mock-line wide" />
							<div className="mock-line" />
						</div>
						<div className="mock-transcript-block">
							<div className="mock-line wide" />
							<div className="mock-line wide" />
							<div className="mock-line" />
						</div>
					</div>
				</div>
			</article>
		)
	}

	if (variant === 'workspace') {
		return (
			<article className="mock-window" aria-label="Burrowise knowledge workspace preview">
				<header className="mock-window__head">
					<div className="mock-window__dots" aria-hidden>
						<span />
						<span />
						<span />
					</div>
					<strong>{title}</strong>
				</header>
				<div className="mock-window__body stack">
					<div className="mock-toolbar">
						<div className="mock-line short" />
						<div className="mock-line short" />
						<div className="mock-line short" />
					</div>
					<div className="mock-grid-2">
						<div className="mock-card">
							<div className="mock-line wide" />
							<div className="mock-line" />
						</div>
						<div className="mock-card">
							<div className="mock-line wide" />
							<div className="mock-line" />
						</div>
						<div className="mock-card">
							<div className="mock-line wide" />
							<div className="mock-line" />
						</div>
						<div className="mock-card">
							<div className="mock-line wide" />
							<div className="mock-line" />
						</div>
					</div>
				</div>
			</article>
		)
	}

	return (
		<article className="mock-window" aria-label="Burrowise search and chat preview">
			<header className="mock-window__head">
				<div className="mock-window__dots" aria-hidden>
					<span />
					<span />
					<span />
				</div>
				<strong>{title}</strong>
			</header>
			<div className="mock-window__body stack">
				<div className="mock-search-bar" />
				<div className="mock-split">
					<div className="mock-results">
						<div className="mock-line wide" />
						<div className="mock-line" />
						<div className="mock-line wide" />
						<div className="mock-line" />
					</div>
					<div className="mock-chat">
						<div className="mock-bubble" />
						<div className="mock-bubble user" />
						<div className="mock-bubble" />
					</div>
				</div>
			</div>
		</article>
	)
}

export function ProductVisualStrip() {
	return (
		<section className="section-band section-band-muted" aria-labelledby="product-visuals-heading">
			<div className="container mx-auto px-4">
				<ScrollReveal y={22} className="max-w-3xl">
					<p className="section-kicker">Platform Walkthrough</p>
					<h2 id="product-visuals-heading" className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
						See the core Burrowise workflows at a glance
					</h2>
				</ScrollReveal>

				<ScrollReveal y={24} stagger={0.1} className="mt-8 grid gap-6 xl:grid-cols-3">
					<MockWindow title="Capture Console" variant="capture" />
					<MockWindow title="Knowledge Workspace" variant="workspace" />
					<MockWindow title="Search + Chat" variant="search" />
				</ScrollReveal>
			</div>
		</section>
	)
}

export function InlineProductVisual({
	title,
	variant,
}: {
	title: string
	variant: VisualVariant
}) {
	return <MockWindow title={title} variant={variant} />
}
