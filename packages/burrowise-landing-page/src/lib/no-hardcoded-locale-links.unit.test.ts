import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression gate for the SEO indexing bug.
 *
 * Hand-writing a locale-prefixed href like `/${locale}/blog` re-introduces a
 * URL segment on the DEFAULT language, which splits the canonical signal
 * (internal links say `/en/...` while the canonical + sitemap say `/...`) and
 * leaves pages stuck in "Discovered – currently not indexed".
 *
 * Every link MUST go through `localizedPath(path, locale)` (see i18n-utils),
 * which keeps the default language bare. This test fails if any page or
 * component reintroduces the antipattern.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..')

// Only middleware/builders legitimately compose `/${locale}` segments. Links
// (everything under app/ and components/) must not.
const SCAN_DIRS = [join(SRC, 'app'), join(SRC, 'components')]
const ANTIPATTERN = '/${locale}'

function walk(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			out.push(...walk(full))
		} else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) {
			out.push(full)
		}
	}
	return out
}

describe('no hand-written locale-prefixed links', () => {
	it('no page or component contains the `/${locale}` href antipattern', () => {
		const offenders: string[] = []
		for (const dir of SCAN_DIRS) {
			for (const file of walk(dir)) {
				if (readFileSync(file, 'utf8').includes(ANTIPATTERN)) {
					offenders.push(file.slice(SRC.length + 1))
				}
			}
		}
		expect(
			offenders,
			`Use localizedPath(path, locale) instead of \`/\${locale}/...\` in: ${offenders.join(', ')}`,
		).toEqual([])
	})
})
