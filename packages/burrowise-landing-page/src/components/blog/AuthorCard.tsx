import Link from 'next/link'
import type { BlogAuthor } from '@growth-engine/sdk-client'
import { localizedPath } from '@/lib/i18n-utils'

interface AuthorCardProps {
	author: BlogAuthor
	locale: string
	viewPostsLabel: string
}

export function AuthorCard({ author, locale, viewPostsLabel }: AuthorCardProps) {
	return (
		<Link
			href={localizedPath(`/blog/authors/${author.slug}`, locale)}
			className="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-shadow group"
		>
			<div className="card-body items-center text-center">
				{author.avatarUrl ? (
					<img
						src={author.avatarUrl}
						alt=""
						className="w-24 h-24 rounded-full object-cover mb-2"
					/>
				) : (
					<span className="w-24 h-24 rounded-full bg-base-300 flex items-center justify-center text-3xl font-semibold text-base-content/80 mb-2">
						{author.name.charAt(0).toUpperCase()}
					</span>
				)}
				<h2 className="card-title text-lg group-hover:text-primary transition-colors">
					{author.name}
				</h2>
				{author.bio && (
					<p className="text-sm text-base-content/70 line-clamp-3">
						{author.bio}
					</p>
				)}
				<span className="text-xs text-primary mt-2 group-hover:underline">
					{viewPostsLabel} →
				</span>
			</div>
		</Link>
	)
}
