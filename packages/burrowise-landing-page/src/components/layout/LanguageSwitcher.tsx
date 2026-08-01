'use client'

import { usePathname, useRouter } from 'next/navigation'
import { supportedLocales as configLocales } from '@/i18n/config'
import { localizedPath } from '@/lib/i18n-utils'

const LOCALE_NAMES: Record<string, string> = {
	en: 'English',
	fr: 'Fran\u00E7ais',
	es: 'Espa\u00F1ol',
	de: 'Deutsch',
	it: 'Italiano',
	pt: 'Portugu\u00EAs',
	nl: 'Nederlands',
	ja: '\u65E5\u672C\u8A9E',
	zh: '\u4E2D\u6587',
	ko: '\uD55C\uAD6D\uC5B4',
	ar: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629',
	ru: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439',
}

export function LanguageSwitcher({ locale }: { locale: string }) {
	const pathname = usePathname()
	const router = useRouter()

	if (configLocales.length <= 1) {
		return null
	}

	function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const newLocale = e.target.value

		// Strip any existing locale prefix to recover the locale-agnostic path…
		const segments = pathname.split('/')
		const firstSegment = segments[1] ?? ''
		const barePath = configLocales.includes(firstSegment)
			? `/${segments.slice(2).join('/')}`
			: pathname

		// …then re-apply the prefix per the default-locale-is-bare rule. The
		// default language gets no prefix; every other language gets `/<locale>`.
		router.push(localizedPath(barePath, newLocale))
	}

	return (
		<select
			className="select select-sm select-bordered"
			value={locale}
			onChange={handleChange}
			aria-label="Select language"
		>
			{configLocales.map((loc) => (
				<option key={loc} value={loc}>
					{LOCALE_NAMES[loc] ?? loc}
				</option>
			))}
		</select>
	)
}
