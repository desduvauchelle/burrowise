'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/components/analytics/GoogleAnalytics'

export function ContactAnalytics() {
	useEffect(() => {
		trackEvent('contact_view')
	}, [])

	return null
}
