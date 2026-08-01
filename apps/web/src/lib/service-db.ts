import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient, type Client } from '@libsql/client'

let databasePromise: Promise<Client> | null = null

export async function initializeServiceDatabase(client: Client): Promise<Client> {
	await client.batch([
		'PRAGMA foreign_keys = ON',
		`CREATE TABLE IF NOT EXISTS sync_users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			password_salt TEXT NOT NULL,
			key_salt TEXT NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS sync_sessions (
			token_hash TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			FOREIGN KEY(user_id) REFERENCES sync_users(id) ON DELETE CASCADE
		)`,
		'CREATE INDEX IF NOT EXISTS sync_sessions_user ON sync_sessions(user_id)',
		`CREATE TABLE IF NOT EXISTS sync_objects (
			user_id TEXT NOT NULL,
			brain_id TEXT NOT NULL,
			object_id TEXT NOT NULL,
			protocol_version INTEGER NOT NULL,
			algorithm TEXT NOT NULL,
			nonce TEXT NOT NULL,
			ciphertext TEXT NOT NULL,
			ciphertext_hash TEXT NOT NULL,
			deleted INTEGER NOT NULL DEFAULT 0,
			revision INTEGER NOT NULL,
			device_id TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY(user_id, brain_id, object_id),
			FOREIGN KEY(user_id) REFERENCES sync_users(id) ON DELETE CASCADE
		)`,
		'CREATE INDEX IF NOT EXISTS sync_objects_brain ON sync_objects(user_id, brain_id, revision)',
	], 'write')
	return client
}

export function createServiceDatabase(url: string, authToken?: string): Promise<Client> {
	if (url.startsWith('file:')) {
		const databasePath = url.slice('file:'.length)
		if (databasePath && databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true })
	}
	return initializeServiceDatabase(createClient({ url, authToken }))
}

export function getServiceDatabase(): Promise<Client> {
	if (!databasePromise) {
		const url = process.env.SYNC_DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:.data/second-brain-service.db'
		const authToken = process.env.SYNC_DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN
		databasePromise = createServiceDatabase(url, authToken)
	}
	return databasePromise
}
