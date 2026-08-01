import Link from 'next/link'
import type { Dictionary } from '@/i18n'
import { localizedPath } from '@/lib/i18n-utils'
import { ThemeToggle } from './ThemeToggle'
import { LanguageSwitcher } from './LanguageSwitcher'
import { MobileMenu } from './MobileMenu'

export function Header({ dict, locale }: { dict: Dictionary; locale: string }) {
	const NAV_LINKS = [
		{ href: localizedPath('/', locale), label: dict['nav.home'] },
		{ href: localizedPath('/blog', locale), label: dict['nav.blog'] },
		{ href: localizedPath('/vault', locale), label: dict['nav.vault'] },
	]

	return (
		<header className="navbar bg-base-100 shadow-sm border-b border-base-200 sticky top-0 z-50">
			<div className="container mx-auto px-4 flex items-center justify-between">
				<Link href={localizedPath('/', locale)} className="text-xl font-bold text-primary">
					{'Burrowise'}
				</Link>

				{/* Desktop nav */}
				<nav className="hidden md:flex items-center gap-6">
					{NAV_LINKS.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							className="text-base-content/70 hover:text-primary transition-colors"
						>
							{link.label}
						</Link>
					))}
					<LanguageSwitcher locale={locale} />
					<ThemeToggle />
				</nav>

				{/* Mobile nav — client component handles toggle state */}
				<MobileMenu links={NAV_LINKS} locale={locale} />
			</div>
		</header>
	)
}
