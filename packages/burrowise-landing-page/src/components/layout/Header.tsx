import Link from 'next/link'
import type { Dictionary } from '@/i18n'
import { localizedPath } from '@/lib/i18n-utils'
import { LanguageSwitcher } from './LanguageSwitcher'
import { MobileMenu } from './MobileMenu'

export function Header({ dict, locale }: { dict: Dictionary; locale: string }) {
	const NAV_LINKS = [
		{ href: localizedPath('/', locale), label: dict['nav.home'] },
		{ href: localizedPath('/blog', locale), label: dict['nav.blog'] },
		{ href: localizedPath('/forms', locale), label: 'Templates' },
		{ href: localizedPath('/contact', locale), label: dict['nav.contact'] },
	]

	return (
		<header className="navbar sticky top-0 z-50 border-b border-base-300/60 bg-base-100/92 backdrop-blur-sm">
			<div className="container mx-auto px-4 flex items-center justify-between">
				<Link href={localizedPath('/', locale)} className="flex items-center gap-2">
					<span className="inline-grid size-8 place-items-center rounded-lg bg-primary/16 text-primary font-bold">B</span>
					<span className="text-lg font-semibold tracking-tight">Burrowise</span>
				</Link>

				<nav aria-label="Primary" className="hidden md:flex items-center gap-6">
					{NAV_LINKS.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							className="text-sm text-base-content/72 hover:text-primary transition-colors"
						>
							{link.label}
						</Link>
					))}
					<Link href={localizedPath('/contact', locale)} className="btn btn-primary btn-sm">Book a call</Link>
					<LanguageSwitcher locale={locale} />
				</nav>

				<MobileMenu links={NAV_LINKS} locale={locale} />
			</div>
		</header>
	)
}
