import type { Metadata } from 'next'
import { getDictionary } from '@/i18n'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params
	const dict = await getDictionary(locale)
	return buildPageMetadata({
		path: '/legal',
		locale,
		title: dict['page.terms.of.service'],
		description: dict['legal.intro'],
	})
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params
	const dict = await getDictionary(locale)
	const effectiveDate = '2026-08-01'

	return (
		<main className="legal-shell">
			<div className="container mx-auto px-4 max-w-4xl">
				<div className="legal-card">
					<p className="section-kicker">Legal</p>
					<h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">{dict['page.terms.of.service']}</h1>
					<p className="mt-3 text-sm text-base-content/70">Effective date: {effectiveDate}</p>

					<div className="prose burrow-legal mt-6">
						<p>
							These Terms govern your access to and use of Burrowise websites, products, and related services. By
							using the service, you agree to these terms on behalf of yourself or the organization you represent.
						</p>

						<h2>1. Use of the Service</h2>
						<p>
							You may use Burrowise only in compliance with applicable laws and these Terms. You are responsible for
							maintaining the confidentiality of your credentials and for activity occurring under your account.
						</p>

						<h2>2. Account and Workspace Responsibility</h2>
						<p>
							You retain control over your workspace content. You are responsible for obtaining all rights and
							permissions needed to upload, process, or store data in Burrowise.
						</p>

						<h2>3. Acceptable Use</h2>
						<ul>
							<li>Do not attempt to compromise, probe, or disrupt service infrastructure.</li>
							<li>Do not use the service to violate privacy, intellectual property, or regulatory obligations.</li>
							<li>Do not submit harmful code, malware, or intentionally abusive content.</li>
						</ul>

						<h2>4. Intellectual Property</h2>
						<p>
							Burrowise and its software, branding, and documentation are protected by intellectual property law. Except
							as explicitly permitted, no rights are granted to copy, reverse engineer, or redistribute the service.
						</p>

						<h2>5. AI-Assisted Features</h2>
						<p>
							AI outputs may contain errors and require user review. You remain responsible for decisions or actions
							taken based on generated summaries, tags, notes, or recommendations.
						</p>

						<h2>6. Service Availability and Changes</h2>
						<p>
							We may update features, models, integrations, or system behavior over time. We may suspend or limit access
							to preserve security, reliability, or legal compliance.
						</p>

						<h2>7. Warranty Disclaimer</h2>
						<p>
							The service is provided on an "as is" and "as available" basis, without warranties of any kind, express or
							implied, to the fullest extent permitted by law.
						</p>

						<h2>8. Limitation of Liability</h2>
						<p>
							To the maximum extent permitted by law, Burrowise is not liable for indirect, incidental, special,
							consequential, or punitive damages, or for loss of revenue, profits, data, or goodwill.
						</p>

						<h2>9. Contact</h2>
						<p>
							For legal questions about these Terms, use the Contact page and include "Legal Request" in your message so
							we can route it quickly.
						</p>
					</div>
				</div>
			</div>
		</main>
	)
}
