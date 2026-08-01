'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { trackEvent } from '@/components/analytics/GoogleAnalytics'

export function TrackedLink({
	href,
	className,
	eventName,
	children,
}: {
	href: string
	className?: string
	eventName: string
	children: ReactNode
}) {
	return (
		<Link
			href={href}
			className={className}
			onClick={() => trackEvent(eventName)}
		>
			{children}
		</Link>
	)
}
