'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'

interface NavLink {
	href: string
	label: string
}

export function MobileMenu({
	links,
	locale,
}: {
	links: NavLink[]
	locale: string
}) {
	const [menuOpen, setMenuOpen] = useState(false)

	return (
		<>
			<button
				className="md:hidden btn btn-ghost btn-square"
				onClick={() => setMenuOpen(!menuOpen)}
				aria-label="Toggle menu"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					className="w-6 h-6 stroke-current"
				>
					{menuOpen ? (
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
					) : (
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
					)}
				</svg>
			</button>

			{menuOpen && (
				<div className="md:hidden border-t border-base-200 bg-base-100 absolute top-full left-0 right-0 shadow-lg">
					<nav className="container mx-auto px-4 py-4 flex flex-col gap-3">
						{links.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className="text-base-content/70 hover:text-primary transition-colors py-1"
								onClick={() => setMenuOpen(false)}
							>
								{link.label}
							</Link>
						))}
						<LanguageSwitcher locale={locale} />
						<ThemeToggle />
					</nav>
				</div>
			)}
		</>
	)
}
