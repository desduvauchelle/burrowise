import { describe, expect, it } from 'vitest'
import { hashPassword, normalizeEmail, verifyPassword } from './auth'

describe('account authentication', () => {
	it('normalizes account email without changing password material', () => {
		expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com')
	})

	it('stores a salted password verifier and rejects the wrong password', async () => {
		const first = await hashPassword('a sufficiently long account password')
		const second = await hashPassword('a sufficiently long account password')

		expect(first.hash).not.toBe('a sufficiently long account password')
		expect(first.salt).not.toBe(second.salt)
		expect(first.hash).not.toBe(second.hash)
		await expect(verifyPassword('a sufficiently long account password', first.hash, first.salt)).resolves.toBe(true)
		await expect(verifyPassword('the wrong account password', first.hash, first.salt)).resolves.toBe(false)
	})
})
