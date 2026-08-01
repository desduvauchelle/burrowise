import type { Dictionary, DictionaryKey } from './dictionaries/en'

export type { Dictionary, DictionaryKey }

const cache = new Map<string, Dictionary>()

export async function getDictionary(locale: string): Promise<Dictionary> {
	const cached = cache.get(locale)
	if (cached) return cached

	let dict: Dictionary

	try {
		switch (locale) {
			case 'fr': {
				const mod = await import('./dictionaries/fr')
				dict = mod.default
				break
			}
			default: {
				const mod = await import('./dictionaries/en')
				dict = mod.default
				break
			}
		}
	} catch {
		const mod = await import('./dictionaries/en')
		dict = mod.default
	}

	cache.set(locale, dict)
	return dict
}

export function t(
	dict: Dictionary,
	key: DictionaryKey,
	vars?: Record<string, string>,
): string {
	let value: string = dict[key]

	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			value = value.replaceAll(`{${k}}`, v)
		}
	}

	return value
}
