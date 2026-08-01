import { describe, it, expect } from 'vitest'
import { THEME_INIT_SCRIPT, isThemePreference, resolveTheme } from './theme'

// The inline script in the root layout <head> is a string, so it can't share
// code with `resolveTheme`. Run it against fake `window`/`document` objects to
// prove the pre-paint theme matches what the React toggle would resolve to —
// otherwise a dark-preference visitor gets a white flash on first paint.
function runInitScript({
	stored,
	prefersDark,
	storageThrows = false,
}: {
	stored: string | null
	prefersDark: boolean
	storageThrows?: boolean
}): string | null {
	let attribute: string | null = null

	const fakeWindow = {
		localStorage: {
			getItem: () => {
				if (storageThrows) throw new Error('storage disabled')
				return stored
			},
		},
		matchMedia: (query: string) => ({ matches: query.includes('dark') && prefersDark }),
	}

	const fakeDocument = {
		documentElement: {
			setAttribute: (name: string, value: string) => {
				if (name === 'data-theme') attribute = value
			},
		},
	}

	new Function('window', 'document', THEME_INIT_SCRIPT)(fakeWindow, fakeDocument)
	return attribute
}

describe('resolveTheme', () => {
	it('honours an explicit choice over the OS setting', () => {
		expect(resolveTheme('light', true)).toBe('light')
		expect(resolveTheme('dark', false)).toBe('dark')
	})

	it('follows prefers-color-scheme in auto mode', () => {
		expect(resolveTheme('auto', true)).toBe('dark')
		expect(resolveTheme('auto', false)).toBe('light')
	})
})

describe('isThemePreference', () => {
	it('accepts the three supported preferences', () => {
		expect(isThemePreference('light')).toBe(true)
		expect(isThemePreference('dark')).toBe(true)
		expect(isThemePreference('auto')).toBe(true)
	})

	it('rejects anything else, including legacy/garbage values', () => {
		expect(isThemePreference(null)).toBe(false)
		expect(isThemePreference('system')).toBe(false)
		expect(isThemePreference('')).toBe(false)
	})
})

describe('THEME_INIT_SCRIPT', () => {
	it('applies the stored choice even when the OS disagrees', () => {
		expect(runInitScript({ stored: 'dark', prefersDark: false })).toBe('dark')
		expect(runInitScript({ stored: 'light', prefersDark: true })).toBe('light')
	})

	it('falls back to the OS setting when the visitor has not chosen', () => {
		expect(runInitScript({ stored: null, prefersDark: true })).toBe('dark')
		expect(runInitScript({ stored: null, prefersDark: false })).toBe('light')
	})

	it('treats a stored "auto" as follow-the-OS', () => {
		expect(runInitScript({ stored: 'auto', prefersDark: true })).toBe('dark')
		expect(runInitScript({ stored: 'auto', prefersDark: false })).toBe('light')
	})

	it('matches resolveTheme for every preference/OS combination', () => {
		for (const stored of ['light', 'dark', 'auto'] as const) {
			for (const prefersDark of [true, false]) {
				expect(runInitScript({ stored, prefersDark })).toBe(resolveTheme(stored, prefersDark))
			}
		}
	})

	it('leaves the SSR fallback in place when storage is unavailable', () => {
		expect(() => runInitScript({ stored: null, prefersDark: true, storageThrows: true })).not.toThrow()
		expect(runInitScript({ stored: null, prefersDark: true, storageThrows: true })).toBeNull()
	})
})
