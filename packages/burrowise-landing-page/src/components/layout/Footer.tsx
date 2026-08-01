import Link from 'next/link'
import type { Dictionary } from '@/i18n'
import { localizedPath } from '@/lib/i18n-utils'
import { ThemeToggle } from './ThemeToggle'

export function Footer({ dict, locale }: { dict: Dictionary; locale: string }) {
	const year = new Date().getFullYear()

	return (
		<footer className="bg-base-200/70 border-t border-base-300">
			<div className="container mx-auto px-4 py-8">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
					<div>
						<h3 className="font-semibold text-lg tracking-tight mb-2">Burrowise</h3>
						<p className="text-base-content/70 text-sm leading-relaxed max-w-sm">
							Local-first intelligence for teams who need to preserve nuance, trace decisions, and move faster with confidence.
						</p>
						<p className="text-base-content/60 text-sm mt-2">
							{dict['footer.powered.by']}
						</p>
					</div>

					<div>
						<h4 className="font-semibold mb-2 tracking-tight">{dict['footer.navigation']}</h4>
						<nav className="flex flex-col gap-1">
							<Link href={localizedPath('/', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['nav.home']}</Link>
							<Link href={localizedPath('/blog', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['nav.blog']}</Link>
							<Link href={localizedPath('/forms', locale)} className="text-sm text-base-content/60 hover:text-primary">Templates</Link>
							<Link href={localizedPath('/contact', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['nav.contact']}</Link>
						</nav>
					</div>

					<div>
						<h4 className="font-semibold mb-2 tracking-tight">{dict['footer.legal']}</h4>
						<nav className="flex flex-col gap-1">
							<Link href={localizedPath('/legal', locale)} className="text-sm text-base-content/60 hover:text-primary">Terms of Service</Link>
							<Link href={localizedPath('/privacy', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['footer.privacy.policy']}</Link>
							<Link href={localizedPath('/cookies', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['footer.cookie.policy']}</Link>
						</nav>
					</div>
				</div>

				<div className="divider" />

				<div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
					<p className="text-sm text-base-content/50">
						{dict['footer.copyright'].replace('{year}', String(year))}
					</p>
					<ThemeToggle dict={dict} />
				</div>
			</div>
		</footer>
	)
}
