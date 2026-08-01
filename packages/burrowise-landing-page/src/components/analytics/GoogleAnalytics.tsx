'use client'

import Script from 'next/script'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

type EventName = 'cta_click' | 'contact_view' | 'form_submit' | (string & {})

export function trackEvent(name: EventName, params?: Record<string, string>) {
	if (typeof window !== 'undefined' && 'gtag' in window) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		;(window as any).gtag('event', name, params)
	}
}

export function GoogleAnalytics() {
	if (!GA_ID) return null

	return (
		<>
			<Script
				src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
				strategy="afterInteractive"
			/>
			<Script id="ga-init" strategy="afterInteractive">
				{`
					window.dataLayer = window.dataLayer || [];
					function gtag(){dataLayer.push(arguments);}
					gtag('js', new Date());
					gtag('config', '${GA_ID}');
				`}
			</Script>
		</>
	)
}
