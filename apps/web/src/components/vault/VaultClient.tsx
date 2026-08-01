'use client'

import { useEffect, useMemo, useState } from 'react'
import {
	createOpaqueBrainId,
	decryptSyncObject,
	deriveVaultKeys,
	encryptSyncObject,
	generateKeySalt,
	type SyncEnvelope,
	type VaultKeys,
} from '@second-brain/sync-protocol'

interface Account { id: string; email: string; keySalt: string }
interface RemoteObject extends SyncEnvelope { revision: number; deviceId: string; updatedAt: string }
interface DecryptedFile { object: RemoteObject; path: string; mimeType: string; modifiedAt: string; content: Uint8Array; contentHash: string }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		credentials: 'same-origin',
		headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
	})
	const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
	if (!response.ok) throw new Error(body.error?.message || `Request failed (${response.status})`)
	return body as T
}

function deviceId(): string {
	const key = 'second-brain-web-device-id'
	let value = localStorage.getItem(key)
	if (!value) {
		value = `browser-${crypto.randomUUID()}`
		localStorage.setItem(key, value)
	}
	return value
}

export function VaultClient() {
	const [account, setAccount] = useState<Account | null>(null)
	const [keys, setKeys] = useState<VaultKeys | null>(null)
	const [brainId, setBrainId] = useState('')
	const [files, setFiles] = useState<DecryptedFile[]>([])
	const [mode, setMode] = useState<'login' | 'register'>('login')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [passphrase, setPassphrase] = useState('')
	const [status, setStatus] = useState('Checking your account…')
	const [busy, setBusy] = useState(false)
	const [deletePassword, setDeletePassword] = useState('')

	useEffect(() => {
		api<{ account: Account }>('/api/auth/me')
			.then(({ account: next }) => { setAccount(next); setStatus('Signed in. Enter your encryption passphrase to unlock this browser session.') })
			.catch(() => setStatus('Sign in or create an account. Sync remains optional.'))
	}, [])

	const totalBytes = useMemo(() => files.reduce((total, file) => total + file.content.byteLength, 0), [files])

	const fetchAndDecrypt = async (activeKeys: VaultKeys, opaqueBrainId: string) => {
		const response = await api<{ objects: RemoteObject[] }>(`/api/sync/objects?brainId=${opaqueBrainId}`)
		const restored: DecryptedFile[] = []
		for (const object of response.objects) {
			if (object.deleted) continue
			const decrypted = await decryptSyncObject({ keys: activeKeys, envelope: object })
			restored.push({ object, ...decrypted })
		}
		setFiles(restored.sort((left, right) => left.path.localeCompare(right.path)))
		setStatus(`${restored.length} encrypted file${restored.length === 1 ? '' : 's'} unlocked locally. The server never received their names or contents.`)
	}

	const unlock = async (nextAccount = account) => {
		if (!nextAccount || passphrase.length < 12) return
		setBusy(true)
		setStatus('Deriving keys locally…')
		try {
			const nextKeys = await deriveVaultKeys(passphrase, nextAccount.keySalt)
			const nextBrainId = await createOpaqueBrainId(nextKeys.indexKey)
			await fetchAndDecrypt(nextKeys, nextBrainId)
			setKeys(nextKeys)
			setBrainId(nextBrainId)
			setPassphrase('')
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error))
		} finally {
			setBusy(false)
		}
	}

	const authenticate = async () => {
		setBusy(true)
		setStatus(mode === 'register' ? 'Creating your account…' : 'Signing in…')
		try {
			const body = mode === 'register'
				? { email, password, keySalt: generateKeySalt() }
				: { email, password }
			const result = await api<{ account: Account }>(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) })
			setAccount(result.account)
			setPassword('')
			await unlock(result.account)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error))
			setBusy(false)
		}
	}

	const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
		if (!keys || !brainId || !event.target.files?.length) return
		setBusy(true)
		try {
			for (const file of Array.from(event.target.files)) {
				const path = `web/${file.webkitRelativePath || file.name}`
				const envelope = await encryptSyncObject({ keys, brainId, path, content: new Uint8Array(await file.arrayBuffer()), mimeType: file.type || 'application/octet-stream', modifiedAt: new Date(file.lastModified).toISOString() })
				const current = files.find((item) => item.object.objectId === envelope.objectId)
				await api('/api/sync/objects', { method: 'PUT', body: JSON.stringify({ ...envelope, deviceId: deviceId(), baseRevision: current?.object.revision ?? null }) })
			}
			await fetchAndDecrypt(keys, brainId)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error))
		} finally {
			event.target.value = ''
			setBusy(false)
		}
	}

	const download = (file: DecryptedFile) => {
		const blob = new Blob([file.content as BlobPart], { type: file.mimeType })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = file.path.split('/').pop() || 'second-brain-file'
		anchor.click()
		URL.revokeObjectURL(url)
	}

	const logout = async () => {
		await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
		setAccount(null)
		setKeys(null)
		setBrainId('')
		setFiles([])
		setStatus('Signed out. Decryption keys were discarded from this page.')
	}

	const deleteAccount = async () => {
		if (!window.confirm('Permanently delete this account and every encrypted object stored by the service? Local desktop files are not affected.')) return
		setBusy(true)
		try {
			await api('/api/sync/account', { method: 'DELETE', body: JSON.stringify({ password: deletePassword }) })
			setAccount(null)
			setKeys(null)
			setBrainId('')
			setFiles([])
			setDeletePassword('')
			setStatus('The account and every server-side encrypted object were permanently deleted. Local files were untouched.')
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="min-h-[78vh] bg-base-200 py-12">
			<div className="container mx-auto max-w-5xl px-4">
				<div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
					<div>
						<div className="badge badge-primary badge-outline mb-4">Zero-knowledge encrypted backup</div>
						<h1 className="text-4xl font-bold">Your encrypted vault</h1>
						<p className="mt-3 max-w-2xl text-base-content/65">The service authenticates your account and stores opaque blobs. Your passphrase, filenames, and file contents remain in this browser.</p>
					</div>
					{account && <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>}
				</div>

				<div role="status" className="alert mb-6 border border-base-300 bg-base-100 text-sm"><span className="text-primary">●</span><span>{status}</span></div>

				{!account ? (
					<div className="card mx-auto max-w-xl border border-base-300 bg-base-100 shadow-xl">
						<div className="card-body gap-4">
							<div className="tabs tabs-boxed grid grid-cols-2">
								<button className={`tab ${mode === 'login' ? 'tab-active' : ''}`} onClick={() => setMode('login')}>Sign in</button>
								<button className={`tab ${mode === 'register' ? 'tab-active' : ''}`} onClick={() => setMode('register')}>Create account</button>
							</div>
							<label className="form-control"><span className="label-text mb-2">Email</span><input className="input input-bordered" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
							<label className="form-control"><span className="label-text mb-2">Account password</span><input className="input input-bordered" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /><span className="mt-2 text-xs text-base-content/50">Sent securely to authenticate the account. Minimum 12 characters.</span></label>
							<label className="form-control"><span className="label-text mb-2">Encryption passphrase</span><input className="input input-bordered" type="password" autoComplete="off" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /><span className="mt-2 text-xs text-warning">Never sent to the service. There is no server-side recovery if you lose it.</span></label>
							<button className="btn btn-primary mt-2" disabled={busy || password.length < 12 || passphrase.length < 12 || !email.includes('@')} onClick={authenticate}>{busy ? <span className="loading loading-spinner loading-sm" /> : null}{mode === 'register' ? 'Create & unlock' : 'Sign in & unlock'}</button>
						</div>
					</div>
				) : !keys ? (
					<div className="card mx-auto max-w-xl border border-base-300 bg-base-100 shadow-xl">
						<div className="card-body gap-4"><h2 className="card-title">Unlock this browser session</h2><p className="text-sm text-base-content/60">Signed in as {account.email}. The service returned only your public key-derivation salt.</p><input className="input input-bordered" type="password" autoFocus autoComplete="off" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Encryption passphrase" /><button className="btn btn-primary" onClick={() => unlock()} disabled={busy || passphrase.length < 12}>Unlock locally</button></div>
					</div>
				) : (
					<div className="grid gap-6">
						<div className="stats stats-vertical border border-base-300 bg-base-100 shadow md:stats-horizontal">
							<div className="stat"><div className="stat-title">Decrypted locally</div><div className="stat-value text-primary">{files.length}</div><div className="stat-desc">files in this vault</div></div>
							<div className="stat"><div className="stat-title">Plaintext size</div><div className="stat-value text-2xl">{(totalBytes / 1024).toFixed(1)} KB</div><div className="stat-desc">not visible to the server</div></div>
							<div className="stat"><div className="stat-title">Encryption</div><div className="stat-value text-lg">AES-256-GCM</div><div className="stat-desc">authenticated per object</div></div>
						</div>
						<section className="card border border-base-300 bg-base-100 shadow-xl">
							<div className="card-body">
								<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h2 className="card-title">Files</h2><p className="text-sm text-base-content/55">Desktop backups appear here after you unlock with the same passphrase.</p></div><label className="btn btn-primary">{busy ? <span className="loading loading-spinner loading-sm" /> : null}Encrypt & upload<input className="hidden" type="file" multiple onChange={upload} /></label></div>
								<div className="mt-4 divide-y divide-base-300">{files.map((file) => <div className="flex items-center gap-4 py-4" key={file.object.objectId}><div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">◇</div><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{file.path}</strong><span className="text-xs text-base-content/50">{file.content.byteLength} bytes · revision {file.object.revision} · {new Date(file.object.updatedAt).toLocaleString()}</span></div><button className="btn btn-ghost btn-sm" onClick={() => download(file)}>Download</button></div>)}{files.length === 0 ? <div className="py-14 text-center text-sm text-base-content/50">No encrypted objects yet. Upload a file here or enable backup in the desktop app.</div> : null}</div>
							</div>
						</section>
						<details className="collapse-arrow collapse border border-error/30 bg-base-100">
							<summary className="collapse-title text-sm font-semibold text-error">Delete account and hosted backup</summary>
							<div className="collapse-content"><p className="mb-4 text-sm text-base-content/60">This permanently removes the account, sessions, and every encrypted object from the service. It does not delete files on your Mac.</p><div className="flex flex-col gap-3 md:flex-row"><input className="input input-bordered flex-1" type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="Confirm account password" /><button className="btn btn-error" disabled={busy || deletePassword.length < 12} onClick={deleteAccount}>Delete permanently</button></div></div>
						</details>
					</div>
				)}
			</div>
		</div>
	)
}
