import Link from 'next/link'
import type { BlogAuthor } from '@growth-engine/sdk-client'
import { localizedPath } from '@/lib/i18n-utils'

interface AuthorBylineProps {
	author: BlogAuthor
	locale: string
}

export function AuthorByline({ author, locale }: AuthorBylineProps) {
	return (
		<Link
			href={localizedPath(`/blog/authors/${author.slug}`, locale)}
			className="inline-flex items-center gap-2 text-sm text-base-content/70 hover:text-primary transition-colors"
			rel="author"
		>
			{author.avatarUrl ? (
				<img
					src={author.avatarUrl}
					alt=""
					className="w-8 h-8 rounded-full object-cover"
				/>
			) : (
				<span className="w-8 h-8 rounded-full bg-base-300 flex items-center justify-center text-xs font-semibold text-base-content/80">
					{author.name.charAt(0).toUpperCase()}
				</span>
			)}
			<span>{author.name}</span>
		</Link>
	)
}
