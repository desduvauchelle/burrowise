import { z } from 'zod'

export const credentialsSchema = z.object({
	email: z.string().trim().email().max(320),
	password: z.string().min(12).max(256),
})

export const registrationSchema = credentialsSchema.extend({
	keySalt: z.string().min(40).max(80).regex(/^[A-Za-z0-9+/=_-]+$/),
})

export const syncObjectSchema = z.object({
	protocolVersion: z.literal(1),
	algorithm: z.literal('AES-256-GCM+PBKDF2-SHA256'),
	brainId: z.string().regex(/^[a-f0-9]{64}$/),
	objectId: z.string().regex(/^[a-f0-9]{64}$/),
	nonce: z.string().min(16).max(40),
	ciphertext: z.string().min(20).max(24_000_000),
	ciphertextHash: z.string().regex(/^[a-f0-9]{64}$/),
	deleted: z.boolean().default(false),
	deviceId: z.string().trim().min(1).max(128),
	baseRevision: z.number().int().nonnegative().nullable().default(null),
})
