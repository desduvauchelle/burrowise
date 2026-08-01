import Link from 'next/link'
import type { Dictionary } from '@/i18n'
import { localizedPath } from '@/lib/i18n-utils'
import { ScrollReveal } from './ScrollReveal'

export function Hero({ dict, locale }: { dict: Dictionary; locale: string }) {
	return (
		<section className="hero min-h-[60vh] bg-base-200">
			<div className="hero-content text-center">
				<div className="max-w-2xl">
					<ScrollReveal y={30} duration={0.7} start="top 95%">
						<h1 className="text-5xl font-bold">
							{dict['hero.title']}
						</h1>
					</ScrollReveal>
					<ScrollReveal y={20} delay={0.15} start="top 95%">
						<p className="py-6 text-lg text-base-content/70">
							{dict['hero.subtitle']}
						</p>
					</ScrollReveal>
					<ScrollReveal y={20} delay={0.3} start="top 95%">
						<div className="flex gap-4 justify-center">
							<Link href={localizedPath('/blog', locale)} className="btn btn-primary">
								{dict['hero.cta.blog']}
							</Link>
							<Link href={localizedPath('/contact', locale)} className="btn btn-outline">
								{dict['hero.cta.contact']}
							</Link>
						</div>
					</ScrollReveal>
				</div>
			</div>
		</section>
	)
}
