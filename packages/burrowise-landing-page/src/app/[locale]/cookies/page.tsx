import type { Metadata } from 'next'
import { getDictionary } from '@/i18n'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params
	const dict = await getDictionary(locale)
	return buildPageMetadata({
		path: '/cookies',
		locale,
		title: dict['page.cookie.policy'],
		description: dict['cookies.intro'],
	})
}

export default async function CookiesPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params
	const dict = await getDictionary(locale)
	const effectiveDate = '2026-08-01'

	return (
		<main className="legal-shell">
			<div className="container mx-auto px-4 max-w-4xl">
				<div className="legal-card">
					<p className="section-kicker">Legal</p>
					<h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">{dict['page.cookie.policy']}</h1>
					<p className="mt-3 text-sm text-base-content/70">Effective date: {effectiveDate}</p>

					<div className="prose burrow-legal mt-6">
						<p>
							This Cookie Policy explains how Burrowise uses cookies and similar storage technologies when you visit our
							website. It should be read alongside our Privacy Policy.
						</p>

						<h2>1. What Cookies Are</h2>
						<p>
							Cookies are small text files placed on your browser or device. They help remember settings, improve
							performance, and provide analytics about how visitors use pages.
						</p>

						<h2>2. Categories We Use</h2>
						<ul>
							<li>
								<strong>Essential cookies:</strong> Needed for core site behavior such as language or theme preference and
								basic session continuity.
							</li>
							<li>
								<strong>Analytics cookies:</strong> Used to understand engagement patterns so we can improve navigation,
								content quality, and performance.
							</li>
						</ul>

						<h2>3. Third-Party Services</h2>
						<p>
							Some tools we use (for example analytics or embedded functionality) may set their own cookies according to
							their policies. We evaluate these vendors for security and compliance before adoption.
						</p>

						<h2>4. How to Manage Cookies</h2>
						<p>
							Most browsers allow cookie controls in settings, including blocking or deleting cookies. Disabling some
							cookies can impact website functionality and user experience.
						</p>

						<h2>5. Policy Updates</h2>
						<p>
							We may update this policy from time to time to reflect legal or product changes. Significant updates will be
							published with a revised effective date.
						</p>
					</div>
				</div>
			</div>
		</main>
	)
}
