import Link from 'next/link'
import type { Dictionary } from '@/i18n'
import { localizedPath } from '@/lib/i18n-utils'

export function Footer({ dict, locale }: { dict: Dictionary; locale: string }) {
	const year = new Date().getFullYear()

	return (
		<footer className="bg-base-200 border-t border-base-300">
			<div className="container mx-auto px-4 py-8">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
					<div>
						<h3 className="font-bold text-lg mb-2">{'Burrowise'}</h3>
						<p className="text-base-content/60 text-sm">
							{dict['footer.powered.by']}
						</p>
					</div>

					<div>
						<h4 className="font-semibold mb-2">{dict['footer.navigation']}</h4>
						<nav className="flex flex-col gap-1">
							<Link href={localizedPath('/', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['nav.home']}</Link>
							<Link href={localizedPath('/blog', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['nav.blog']}</Link>
							<Link href={localizedPath('/contact', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['nav.contact']}</Link>
						</nav>
					</div>

					<div>
						<h4 className="font-semibold mb-2">{dict['footer.legal']}</h4>
						<nav className="flex flex-col gap-1">
							<Link href={localizedPath('/legal', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['footer.legal.notice']}</Link>
							<Link href={localizedPath('/privacy', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['footer.privacy.policy']}</Link>
							<Link href={localizedPath('/cookies', locale)} className="text-sm text-base-content/60 hover:text-primary">{dict['footer.cookie.policy']}</Link>
						</nav>
					</div>
				</div>

				<div className="divider" />

				<p className="text-center text-sm text-base-content/50">
					{dict['footer.copyright'].replace('{year}', String(year))}
				</p>
			</div>
		</footer>
	)
}
