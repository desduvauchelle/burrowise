'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Dictionary, DictionaryKey } from '@/i18n'
import { cn } from '@/lib/utils'
import {
	DARK_MEDIA_QUERY,
	DEFAULT_THEME_PREFERENCE,
	THEME_STORAGE_KEY,
	isThemePreference,
	resolveTheme,
	type ThemePreference,
} from '@/lib/theme'

const SunIcon = (
	<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
		<path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
	</svg>
)

const MoonIcon = (
	<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
		<path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
	</svg>
)

const AutoIcon = (
	<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
		<path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
	</svg>
)

const OPTIONS: { value: ThemePreference; labelKey: DictionaryKey; icon: React.ReactNode }[] = [
	{ value: 'light', labelKey: 'theme.light', icon: SunIcon },
	{ value: 'dark', labelKey: 'theme.dark', icon: MoonIcon },
	{ value: 'auto', labelKey: 'theme.auto', icon: AutoIcon },
]

export function ThemeToggle({ dict }: { dict: Dictionary }) {
	// The no-flash script in the root layout has already written `data-theme`
	// before paint. This state only drives which segment looks selected, so it
	// starts at the default on both server and first client render (no hydration
	// mismatch) and corrects itself once localStorage is readable.
	const [preference, setPreference] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE)

	const apply = useCallback((next: ThemePreference) => {
		const prefersDark = window.matchMedia(DARK_MEDIA_QUERY).matches
		document.documentElement.setAttribute('data-theme', resolveTheme(next, prefersDark))
	}, [])

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
			if (isThemePreference(stored)) {
				setPreference(stored)
			}
		} catch (err) {
			// Storage can throw in private mode / with cookies blocked. The site
			// still works (it just falls back to the OS setting), but don't hide it.
			console.warn('[theme] Unable to read the stored theme preference:', err)
		}
	}, [])

	// In auto mode the OS is the source of truth, so keep following it while the
	// visitor is on the page (e.g. macOS flipping to dark at sunset).
	useEffect(() => {
		if (preference !== 'auto') return

		const media = window.matchMedia(DARK_MEDIA_QUERY)
		const onChange = () => apply('auto')
		media.addEventListener('change', onChange)
		return () => media.removeEventListener('change', onChange)
	}, [preference, apply])

	function choose(next: ThemePreference) {
		setPreference(next)
		apply(next)
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, next)
		} catch (err) {
			console.warn('[theme] Unable to persist the theme preference:', err)
		}
	}

	return (
		<div className="flex items-center gap-2">
			<span className="text-sm text-base-content/50">{dict['theme.label']}</span>
			<div className="join" role="group" aria-label={dict['theme.label']}>
				{OPTIONS.map((option) => {
					const selected = preference === option.value
					return (
						<button
							key={option.value}
							type="button"
							onClick={() => choose(option.value)}
							aria-pressed={selected}
							className={cn('btn btn-sm join-item gap-1', selected && 'btn-primary')}
						>
							{option.icon}
							<span>{dict[option.labelKey]}</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}
