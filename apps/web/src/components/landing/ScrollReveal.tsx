'use client'

import type { ReactNode } from 'react'
import { useScrollReveal } from '@/hooks/useGsap'
import type { ScrollRevealOptions } from '@/hooks/useGsap'

export function ScrollReveal({
	children,
	className,
	...options
}: ScrollRevealOptions & {
	children: ReactNode
	className?: string
}) {
	const ref = useScrollReveal<HTMLDivElement>(options)

	return (
		<div ref={ref} className={className}>
			{children}
		</div>
	)
}
