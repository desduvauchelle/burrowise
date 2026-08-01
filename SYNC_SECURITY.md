# Encrypted sync security model

This document is the contract for Milestone 4 encrypted backup and synchronization. It describes version 1 of `@second-brain/sync-protocol`.

## Security goals

- A service or database operator cannot read a user's brain contents, filenames, relative paths, MIME types, or file modification times.
- A stolen service database does not contain account passwords, access tokens, encryption passphrases, or decryption keys.
- Altered ciphertext or altered object identity fails authenticated decryption.
- A stale device cannot silently overwrite a newer remote revision.
- An incoming remote object cannot silently overwrite a locally edited file.
- The ordinary local brain remains human-readable Markdown and files protected by normal macOS permissions and FileVault.

## Credentials and key lifecycle

Account passwords and encryption passphrases are separate.

The account password is sent over HTTPS for registration, sign-in, and confirmed account deletion. The service stores a salted scrypt verifier. It returns a random access token, stores only that token's SHA-256 digest, and expires the session after 30 days. The desktop app stores the token in macOS Keychain.

The encryption passphrase is used only in the client. PBKDF2-SHA256 with a random 32-byte salt and 310,000 iterations derives 512 bits. The first 256 bits become an AES-GCM key and the second 256 bits become an HMAC-SHA256 indexing key. Derived keys are non-extractable Web Crypto keys held only for the unlocked client session. The service stores the non-secret derivation salt so another authorized client can derive the same keys.

There is intentionally no server-side passphrase recovery. Losing the encryption passphrase makes the backup unrecoverable. Changing the protocol or derivation parameters requires an explicit versioned migration.

## Object format

Each local relative path maps to an HMAC-derived 64-character opaque object identifier. A logical brain name maps to a separate opaque brain identifier.

AES-256-GCM encrypts a JSON payload containing:

- protocol version
- relative path
- MIME type
- modification time
- base64 file bytes
- SHA-256 content digest

The GCM additional authenticated data binds the protocol version, opaque brain identifier, and opaque object identifier. After decryption, the client recomputes both the path-derived object identifier and content digest.

## What the service can observe

The service can observe:

- account email and creation time
- password verifier salt and encryption derivation salt
- encrypted object count and approximate size
- stable opaque brain and object identifiers within an account
- opaque device identifier, revisions, and access/update timing
- IP address and ordinary infrastructure logs

The service cannot observe from the stored object:

- brain name
- filename or relative path
- MIME type or file modification time
- file content, transcript, note text, tags, or embeddings
- encryption passphrase or derived keys

This design does not hide traffic patterns or object equality over time. It is encrypted backup, not an anonymity system.

## Conflict and deletion policy

Uploads use optimistic `baseRevision` checks. A revision mismatch returns a conflict rather than replacing the current object.

On download, the desktop app overwrites an existing file only when its current SHA-256 digest matches the version recorded in the last local sync manifest. Otherwise it keeps the local file and writes the incoming version under `review/sync-conflicts/<timestamp>/`. Conflict copies and the local `.second-brain` directory are excluded from uploads.

Remote deletion markers are ignored in version 1. This is deliberately conservative: absence or a remote tombstone cannot erase a local file. Account deletion is different and permanent; after password confirmation, the service deletes the account and database cascades all sessions and encrypted objects.

## Current limits and non-goals

- The JSON transport limits an individual plaintext file to 16 MiB in the desktop client. Larger files are reported and skipped.
- A compromised unlocked client, malicious browser extension, keylogger, or modified application can access plaintext and keys.
- XSS in the unlocked web vault can access decrypted content, so web dependency updates and a restrictive deployment policy remain security-critical.
- Local files are not app-encrypted. FileVault and macOS permissions provide at-rest protection on the Mac.
- Server-side indexing, previews, AI processing, and content recovery are impossible without a future explicit user-authorized disclosure design.
- Automatic background sync, key rotation, recovery keys, sharing, and recoverable multi-device deletion are not part of version 1.

## Operational requirements

- Production service URLs must use HTTPS.
- Keep database credentials server-only.
- Back up the ciphertext database as opaque data and test account-deletion cascades.
- Do not log request bodies for authentication or sync endpoints.
- Treat changes to `packages/sync-protocol`, object identifiers, key derivation, CORS/origin checks, authentication, or conflict handling as security-sensitive and require migration and compatibility tests.
