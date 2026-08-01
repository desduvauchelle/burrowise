/**
 * Environment variable checker.
 * All vars are technically optional — the app runs without them —
 * but this module logs exactly which features are degraded so devs
 * aren't left guessing why something silently does nothing.
 */

interface EnvGroup {
	label: string
	vars: { name: string; value: string | undefined }[]
	impact: string
}

function isSet(value: string | undefined): boolean {
	return value !== undefined && value.trim().length > 0
}

let hasRun = false

export function checkEnv(): void {
	if (hasRun) return
	hasRun = true
	const groups: EnvGroup[] = [
		{
			label: 'Brain API',
			vars: [
				{ name: 'BRAIN_API_URL', value: process.env.BRAIN_API_URL },
				{ name: 'BRAIN_API_KEY', value: process.env.BRAIN_API_KEY },
			],
			impact: 'Forms and CRM integration will NOT be connected',
		},
		{
			label: 'Turso Database',
			vars: [
				{ name: 'TURSO_DATABASE_URL', value: process.env.TURSO_DATABASE_URL },
				{ name: 'TURSO_AUTH_TOKEN', value: process.env.TURSO_AUTH_TOKEN },
			],
			impact: 'Blog system will NOT work',
		},
	]

	const optionalGroups: EnvGroup[] = [
		{
			label: 'Site URL',
			vars: [{ name: 'SITE_URL', value: process.env.SITE_URL }],
			impact: 'sitemap.xml and robots.txt will use relative URLs',
		},
		{
			label: 'Google Analytics',
			vars: [
				{
					name: 'NEXT_PUBLIC_GA_MEASUREMENT_ID',
					value: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
				},
			],
			impact: 'Analytics tracking disabled',
		},
	]

	const defaultLanguage = process.env.DEFAULT_LANGUAGE?.trim() || 'en'
	const additionalLanguages = process.env.ADDITIONAL_LANGUAGES?.trim() || ''

	const warnings: string[] = []
	const info: string[] = []

	// Check critical groups — warn per missing var
	for (const group of groups) {
		const missing = group.vars.filter((v) => !isSet(v.value))
		if (missing.length > 0) {
			const names = missing.map((v) => v.name).join(', ')
			warnings.push(`[${group.label}] Missing: ${names} → ${group.impact}`)
		}
	}

	// Check optional groups — info only
	for (const group of optionalGroups) {
		const missing = group.vars.filter((v) => !isSet(v.value))
		if (missing.length > 0) {
			const names = missing.map((v) => v.name).join(', ')
			info.push(`[${group.label}] ${names} not configured → ${group.impact}`)
		}
	}

	// Language info
	if (additionalLanguages) {
		info.push(
			`[i18n] DEFAULT_LANGUAGE=${defaultLanguage}, ADDITIONAL_LANGUAGES=${additionalLanguages}`,
		)
	} else {
		info.push(`[i18n] Single-language mode (DEFAULT_LANGUAGE=${defaultLanguage})`)
	}

	// Output
	const divider = '─'.repeat(60)

	console.log('')
	console.log(`${divider}`)
	console.log(' Growth Engine — Environment Check')
	console.log(`${divider}`)

	if (warnings.length === 0) {
		console.log(' ✓ All required environment variables are set')
	} else {
		for (const w of warnings) {
			console.warn(` ⚠ ${w}`)
		}
	}

	for (const i of info) {
		console.log(` ℹ ${i}`)
	}

	console.log(`${divider}`)
	console.log('')
}
