export async function register() {
	const { checkEnv } = await import('@/lib/env')
	checkEnv()
}
