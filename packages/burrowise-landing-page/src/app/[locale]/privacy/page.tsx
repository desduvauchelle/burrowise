import type { Metadata } from 'next'
import { getDictionary } from '@/i18n'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params
	const dict = await getDictionary(locale)
	return buildPageMetadata({
		path: '/privacy',
		locale,
		title: dict['page.privacy.policy'],
		description: dict['privacy.intro'],
	})
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params
	const dict = await getDictionary(locale)
	const effectiveDate = '2026-08-01'

	return (
		<main className="legal-shell">
			<div className="container mx-auto px-4 max-w-4xl">
				<div className="legal-card">
					<p className="section-kicker">Legal</p>
					<h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">{dict['page.privacy.policy']}</h1>
					<p className="mt-3 text-sm text-base-content/70">Effective date: {effectiveDate}</p>

					<div className="prose burrow-legal mt-6">
						<p>
							This Privacy Policy explains what data Burrowise processes, why it is processed, and the controls you have
							over your information when using our website and services.
						</p>

						<h2>1. Data We Collect</h2>
						<ul>
							<li>Account and contact details you submit directly.</li>
							<li>Workspace content you choose to upload or capture.</li>
							<li>Usage telemetry and diagnostics needed for reliability and security.</li>
						</ul>

						<h2>2. How We Use Data</h2>
						<p>
							We use data to provide service functionality, operate and secure infrastructure, improve product quality,
							respond to support requests, and comply with legal obligations.
						</p>

						<h2>3. AI and Processing Providers</h2>
						<p>
							Depending on your configuration, Burrowise may process content with local or remote AI providers.
							Provider selection and model context are surfaced in-product so you can make informed choices.
						</p>

						<h2>4. Data Sharing</h2>
						<p>
							We do not sell personal information. We may share data with subprocessors that help us operate hosting,
							analytics, authentication, and support services under contractual confidentiality obligations.
						</p>

						<h2>5. Retention</h2>
						<p>
							We retain data only as long as needed for the purposes described in this policy, unless longer retention is
							required by law or legitimate business obligations.
						</p>

						<h2>6. Your Rights</h2>
						<p>
							Depending on your jurisdiction, you may request access, correction, export, or deletion of personal data.
							Use the Contact page and include enough context for us to verify and process your request.
						</p>

						<h2>7. Security</h2>
						<p>
							We use technical and organizational safeguards designed to protect data from unauthorized access, loss, or
							misuse. No system can guarantee absolute security.
						</p>

						<h2>8. Policy Updates</h2>
						<p>
							We may update this policy as the product evolves. Material updates will be reflected by a revised effective
							date and, where appropriate, direct notice.
						</p>
					</div>
				</div>
			</div>
		</main>
	)
}
