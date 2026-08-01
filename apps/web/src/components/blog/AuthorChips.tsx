import Link from 'next/link'
import type { BlogAuthor } from '@growth-engine/sdk-client'
import { localizedPath } from '@/lib/i18n-utils'

interface AuthorChipsProps {
	authors: BlogAuthor[]
	locale: string
	label: string
}

export function AuthorChips({ authors, locale, label }: AuthorChipsProps) {
	if (authors.length === 0) return null

	return (
		<nav aria-label={label} className="mb-6">
			<p className="text-xs uppercase tracking-wider text-base-content/50 mb-2">
				{label}
			</p>
			<div className="flex flex-wrap gap-2">
				{authors.map((author) => (
					<Link
						key={author.id}
						href={localizedPath(`/blog/authors/${author.slug}`, locale)}
						className="badge badge-outline badge-lg gap-2 hover:badge-primary transition-colors"
					>
						{author.avatarUrl ? (
							<img
								src={author.avatarUrl}
								alt=""
								className="w-5 h-5 rounded-full object-cover"
							/>
						) : (
							<span className="w-5 h-5 rounded-full bg-base-300 flex items-center justify-center text-[10px] font-semibold">
								{author.name.charAt(0).toUpperCase()}
							</span>
						)}
						<span>{author.name}</span>
					</Link>
				))}
			</div>
		</nav>
	)
}
