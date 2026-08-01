import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression gate for the missing-module build failure.
 *
 * A scaffolded client app only installs `@growth-engine/sdk-client` and
 * `@growth-engine/sdk-server` (see package.json.template). It never installs
 * `@growth-engine/types` — that package is a monorepo-internal workspace dep,
 * and the published SDK mirrors delete it from their dependencies because the
 * types are bundled into the SDK's own d.ts (release-sdk.yml).
 *
 * So importing from `@growth-engine/types` in template source compiles inside
 * the monorepo but breaks every real client build with:
 *   "Cannot find module '@growth-engine/types' or its corresponding type
 *    declarations."
 *
 * Shared types (BlogAuthor, BlogPost, SocialPost, …) are re-exported from
 * `@growth-engine/sdk-client` — import them from there instead.
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..')

const ANTIPATTERN = '@growth-engine/types'

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

describe('no @growth-engine/types import', () => {
	it('no template source imports from @growth-engine/types', () => {
		const offenders: string[] = []
		for (const file of walk(SRC)) {
			if (readFileSync(file, 'utf8').includes(ANTIPATTERN)) {
				offenders.push(file.slice(SRC.length + 1))
			}
		}
		expect(
			offenders,
			`Import shared types from '@growth-engine/sdk-client', not '@growth-engine/types', in: ${offenders.join(', ')}`,
		).toEqual([])
	})
})
