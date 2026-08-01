import { authenticateRequest } from '@/lib/auth'
import { apiError, apiJson, apiOptions } from '@/lib/api-response'
import { getServiceDatabase } from '@/lib/service-db'
import { syncObjectSchema } from '@/lib/sync-schema'

export const runtime = 'nodejs'
export const OPTIONS = apiOptions
const ACCOUNT_QUOTA_BYTES = 1024 * 1024 * 1024

function serializedObject(row: Record<string, unknown>) {
	return {
		protocolVersion: Number(row.protocol_version),
		algorithm: String(row.algorithm),
		brainId: String(row.brain_id),
		objectId: String(row.object_id),
		nonce: String(row.nonce),
		ciphertext: String(row.ciphertext),
		ciphertextHash: String(row.ciphertext_hash),
		deleted: Number(row.deleted) !== 0,
		revision: Number(row.revision),
		deviceId: String(row.device_id),
		updatedAt: String(row.updated_at),
	}
}

export async function GET(request: Request) {
	const user = await authenticateRequest(request)
	if (!user) return apiError(request, 401, 'not_authenticated', 'Sign in to access encrypted backups.')
	const brainId = new URL(request.url).searchParams.get('brainId')
	if (!brainId || !/^[a-f0-9]{64}$/.test(brainId)) return apiError(request, 400, 'invalid_brain', 'A valid opaque brain identifier is required.')
	const client = await getServiceDatabase()
	const result = await client.execute({
		sql: `SELECT protocol_version, algorithm, brain_id, object_id, nonce, ciphertext,
			ciphertext_hash, deleted, revision, device_id, updated_at
			FROM sync_objects WHERE user_id = ?1 AND brain_id = ?2 ORDER BY revision`,
		args: [user.id, brainId],
	})
	return apiJson(request, { objects: result.rows.map((row) => serializedObject(row as Record<string, unknown>)) })
}

export async function PUT(request: Request) {
	const user = await authenticateRequest(request)
	if (!user) return apiError(request, 401, 'not_authenticated', 'Sign in to upload encrypted backups.')
	const parsed = syncObjectSchema.safeParse(await request.json().catch(() => null))
	if (!parsed.success) return apiError(request, 400, 'invalid_envelope', 'The encrypted object envelope is invalid or too large.')
	const object = parsed.data
	const client = await getServiceDatabase()
	const currentResult = await client.execute({
		sql: 'SELECT revision, ciphertext FROM sync_objects WHERE user_id = ?1 AND brain_id = ?2 AND object_id = ?3',
		args: [user.id, object.brainId, object.objectId],
	})
	const current = currentResult.rows[0]
	const currentRevision = current ? Number(current.revision) : null
	if (object.baseRevision !== currentRevision) {
		return apiJson(request, { error: { code: 'sync_conflict', message: 'The remote object changed since this client last synchronized.' }, currentRevision }, 409)
	}
	const usage = await client.execute({ sql: 'SELECT COALESCE(SUM(LENGTH(ciphertext)), 0) AS bytes FROM sync_objects WHERE user_id = ?1', args: [user.id] })
	const existingLength = current ? String(current.ciphertext).length : 0
	const projected = Number(usage.rows[0]?.bytes || 0) - existingLength + object.ciphertext.length
	if (projected > ACCOUNT_QUOTA_BYTES * 1.37) return apiError(request, 413, 'quota_exceeded', 'This account has reached its encrypted backup quota.')
	const revision = (currentRevision || 0) + 1
	const updatedAt = new Date().toISOString()
	await client.execute({
		sql: `INSERT INTO sync_objects (user_id, brain_id, object_id, protocol_version, algorithm, nonce,
			ciphertext, ciphertext_hash, deleted, revision, device_id, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
			ON CONFLICT(user_id, brain_id, object_id) DO UPDATE SET
			protocol_version = excluded.protocol_version, algorithm = excluded.algorithm,
			nonce = excluded.nonce, ciphertext = excluded.ciphertext,
			ciphertext_hash = excluded.ciphertext_hash, deleted = excluded.deleted,
			revision = excluded.revision, device_id = excluded.device_id, updated_at = excluded.updated_at`,
		args: [user.id, object.brainId, object.objectId, object.protocolVersion, object.algorithm, object.nonce, object.ciphertext, object.ciphertextHash, object.deleted ? 1 : 0, revision, object.deviceId, updatedAt],
	})
	return apiJson(request, { object: { ...object, revision, updatedAt } })
}
