import type { NextConfig } from 'next'

const monorepoRoot = new URL('../..', import.meta.url).pathname

const nextConfig: NextConfig = {
	transpilePackages: ['@second-brain/sync-protocol'],
	turbopack: {
		root: monorepoRoot,
	},
	serverExternalPackages: [
		'@growth-engine/sdk-server',
		'@libsql/client',
		'libsql',
		'drizzle-orm',
	],
}

export default nextConfig
