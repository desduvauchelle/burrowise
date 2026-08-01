# Implementation status

This file tracks delivery against the product milestones in `PRODUCT.md`. It describes working code, not design intent.

## Milestone 1 — Capture and organize

### Working now

- Tauri 2 desktop shell with the existing React interface.
- Native macOS folder picker for first-run brain setup.
- Explicit microphone-permission onboarding after folder selection, with a privacy explanation before macOS is asked.
- Persisted granted, denied, unsupported, and skipped permission states with retry and System Settings recovery.
- Brain folder initialization with readable `sessions`, `notes`, `review`, and `hosts` directories.
- Rebuildable SQLite metadata in `.second-brain/metadata.sqlite3`.
- Application configuration stores brain folders as an array and selects one active brain.
- Press-and-hold recording uses the system WebView microphone APIs.
- Portable mono PCM WAV capture is preferred so the original audio remains readable and Apple Speech receives a dependable input format.
- A session folder and placeholder transcript are created before microphone capture begins.
- Original audio is sent to Rust as raw bytes and persisted locally with its actual media type.
- `session.md`, `session.json`, `transcript.md`, `audio.*`, and `extractions/` are created for each capture.
- Session status moves from `recording` to `awaiting_transcription` after the audio is durable.
- A separate, explained Speech Recognition permission step appears before Apple Speech is used.
- Apple Speech is called directly through the macOS Speech framework; requests require on-device recognition and fail visibly instead of falling back to Apple's network service.
- Successful recognition writes the user's exact recognized wording to `transcript.md`, then creates a local title, concise extractive summary, and up to seven automatic tags.
- Tagging reuses relevant tags already present in the brain and supplements them with local concept and keyword matching. It does not call a cloud model.
- Completed transcripts are added to the local search index automatically; failed recognition keeps the original audio and exposes a retry action.
- Browser development uses a platform adapter and IndexedDB fallback without putting browser concerns into the capture UI.
- Transcription-provider registry and persisted selection for Record only, Apple Speech, and Parakeet.
- Canonical transcript editing separates exact wording saves from explicitly confirmed re-organization; optional AI cleanup returns a provider-attributed draft and never writes until the user saves it.
- Capture enrichment is represented by durable SQLite jobs with retry counts, startup reclamation, and an actionable failed-job Review record.
- Atomic proposals compare against canonical notes and propose create, merge, or append-source actions with rollback-safe approval.
- An installed `parakeet-mlx` CLI is detected and used for capture and interview transcription without sending audio off the Mac.
- Native storage test proves that session files, audio, JSON metadata, and the SQLite row agree.

### Completed reliability expansion

- Rolling audio snapshots are durable before live Apple Speech previews run and recover after interruption.
- Parakeet CLI installation, resumable model download, validation, and cache progress are available in Settings.
- Session deletion uses recoverable macOS Trash with an impact confirmation.

### Explicit future improvements

- Optional model-backed summaries/extraction can supplement the deterministic local baseline after provider selection.
- Additional languages and optional embedding providers remain roadmap work.

## Milestone 2 — Retrieve and chat

### Working now

- Recursive indexing of Markdown and text files inside the active brain, excluding `.second-brain` operational data.
- Passage-level chunking with document titles, relative paths, source types, and stable identifiers.
- Rebuildable SQLite passage index.
- Lexical, Apple on-device sentence-embedding semantic, transparent related-term, and balanced ranking with strict scopes for sessions, notes, sources, and explicitly selected files.
- Search result highlighting, relevance breakdown, full source inspection, and Reveal in Finder.
- Persisted local conversations and messages.
- Whole-brain, session-only, and selected-note chat scopes.
- Offline extractive answers that stay close to source wording and cite every passage used.
- Knowledge-access log containing every cited passage.
- Visible provider/model identity and explicit general-knowledge status on every assistant message.
- Safe no-answer behavior: the built-in provider refuses to invent an answer when retrieval finds no evidence.
- Browser adapter with the same search/chat contract for portable React development.

### Follow-up improvements

- Add optional user-configured embedding providers while keeping Apple sentence embeddings and the offline related-term baseline.
- Broaden live-provider acceptance across installed local runtimes and user-configured remote accounts; unavailable runtimes remain visible only as Add Connection templates.
- Add incremental filesystem-watcher indexing instead of manual/full rebuilds.
- Add richer selected-folder and current-session scope pickers.
- Conversation rename, Markdown export, and confirmed deletion are implemented; source notes are never affected by conversation deletion.

### Generation connections

- Settings exposes a real Connections page instead of the provider registry itself.
- Add Connection offers grouped local runtimes (Ollama, LM Studio, llama.cpp), cloud APIs and gateways (including Vercel AI Gateway), and terminal-subscription adapters (Codex CLI, Claude Code CLI, Gemini CLI).
- Each saved connection can be named, enabled or disabled, edited, tested with a fixed diagnostic, and deleted through an in-app confirmation.
- Cloud consent is explicit and validation failures stay inside the editor. API keys are stored in macOS Keychain and are removed with the connection.
- Deleting a connection also clears model routes and favorites that referenced it, returning workflows to safe local defaults.
- Version 0.5.1 supports one persisted connection per provider type; multiple accounts or endpoints of the same type are follow-up work.

## Milestone 3 — Interview

### Working now

- Five local Markdown host presets are seeded into `hosts/` without overwriting user edits.
- User-authored hosts can be created in the app with a name, description, traits, stages, and plain-language instructions; they remain editable outside the app.
- Host behavior and knowledge access are separate setup choices.
- Whole-brain, selected-note, and current-session-only scopes are enforced by the local interview service.
- Interviews, turns, stages, provider/model identity, citations, and status persist in SQLite.
- Every interview gets a readable session folder with `session.md`, `session.json`, `transcript.md`, and an `audio/` directory.
- Deterministic `local-interviewer / guided-v1` replies work fully offline, use host stages, ask one question at a time, and do not invent general knowledge.
- Retrieved passages are cited in the conversation and recorded individually in a visible interview access log.
- Typed turns work end to end.
- Press-and-hold voice turns save original audio first, then require a confirmed transcript before the host may reply.
- Active interviews resume after navigation or restart, completed interviews remain browsable, and ending an interview preserves its local files.
- Browser development uses the same host/session/turn/access-log contract through the platform adapter.
- Native tests cover host seeding and authoring, cited interview turns, access logging, raw audio persistence, transcript confirmation, and readable transcript output.

### Follow-up improvements

- Apple Speech and Parakeet automatically process saved voice turns; manual confirmation remains the safe fallback when local transcription is unavailable.
- Add host duplication/editing and validation feedback for externally edited malformed Markdown.
- Interview rename, consolidated Markdown export, recoverable Trash deletion, and voice-audio retention are implemented.
- Configurable local, terminal-subscription, and confirmed remote generation providers can replace the deterministic interviewer while preserving scope, citations, and provider/model snapshots.
- Add transcript-derived summaries and atomic-note proposals to Review once Milestone 1 enrichment is implemented.

## Milestone 4 — Account and sync

### Working now

- Growth Engine Next.js application for the public site, blog, contact surface, and encrypted browser vault.
- Email/password account registration and sign-in with salted scrypt password verifiers, expiring hashed bearer sessions, secure browser cookies, and rate limiting.
- A shared `@second-brain/sync-protocol` package used by both desktop and web clients.
- Client-side AES-256-GCM encryption with a user passphrase that is never sent to or stored by the service.
- HMAC-derived opaque brain and object identifiers; filenames, paths, MIME types, file modification times, and contents remain inside authenticated ciphertext.
- Authenticated encrypted-object APIs backed by local libSQL in development or Turso/libSQL in production.
- Optimistic object revisions so stale clients cannot silently replace a newer remote object.
- Desktop access tokens stored in macOS Keychain. The encryption passphrase and derived keys exist only in process memory for the unlocked app session.
- Two-way desktop synchronization of ordinary brain files while excluding `.second-brain` operational data and generated sync-conflict copies.
- Conflict-safe downloads: a changed local file is never overwritten unless its current hash matches the last synchronized version. Incoming alternatives are written under `review/sync-conflicts/`.
- Conservative deletion behavior: remote deletion markers are ignored in this first version, and deleting an account permanently cascades all server sessions and encrypted objects after password confirmation.
- Browser vault unlock, encrypted upload, local decryption, and download without disclosing plaintext to the server.
- Security and recovery behavior documented in `SYNC_SECURITY.md`.

### Current limits

- One logical brain per account/passphrase is exposed in the UI, while the wire protocol supports opaque brain identifiers.
- Files larger than 16 MiB are skipped by the initial JSON object transport and reported in the sync result.
- There is no server-side passphrase recovery. Losing the encryption passphrase makes the encrypted backup unrecoverable.
- Automatic remote deletion propagation remains disabled until a recoverable tombstone and multi-device retention design is implemented.
- Sync is manual from Settings; background scheduling and a dedicated conflict-resolution UI are follow-up work.

## Milestone 5 — Content studio foundation

### Working now

- A dedicated three-pane Studio experience for browsing projects, configuring a new project, following stage progress, reading the selected Markdown artifact, and inspecting the source-access log.
- Five built-in content skills are seeded into `skills/content/` without overwriting files the user has edited: YouTube script, social campaign, blog post, short story, and novella/book.
- User-authored skills can be created with a name, description, output type, plain-language instructions, and any ordered list of stages. They remain ordinary Markdown files editable outside the app.
- Every native content project is a readable folder under `projects/` with `brief.md`, `project.md`, `project.json`, `workflow.md`, and versioned Markdown files under `outputs/`.
- Project and step state persists in SQLite, so work resumes at the next incomplete stage after navigation or restart.
- Projects can use the whole brain, notes, sessions, imported sources, or exact selected files. Selected-file scope is enforced rather than treated as a ranking hint.
- Every retrieved passage is cited in the stage artifact and written to a project access log with its source path, title, and supporting quote.
- The native executor writes the next output file before advancing project state, preserving a recoverable artifact if later metadata work fails.
- The visible `local-workflow / structured-v1` provider runs offline, declares general knowledge off, and produces deterministic grounded scaffolds tailored to planning, drafting, character, and editorial stages.
- Browser development uses the same content skill/project/step contract through the platform adapter and persists a virtual preview in browser storage.
- Native tests cover built-in skill seeding, exact selected-source grounding, resumable progress, output persistence, citations, access logging, and user-authored skill files.

### Current limits

- The built-in provider is a structured workflow scaffold, not a creative language model. Ollama, LM Studio, llama.cpp, command-line agents, Vercel AI Gateway, OpenRouter, and direct cloud APIs are configurable connections; actual availability depends on the user's installed runtime, login, or API key.
- Images and video are not generated in this milestone.
- Long-form skills have durable stages, but the executor does not yet expand an outline dynamically into one stage per chapter. A user-created skill can define explicit chapter stages in the meantime.
- Stages run only when the user requests the next one; unattended loops, checkpoints, branching, retries, and background scheduling remain follow-up work.
- The browser adapter demonstrates the shared React contract with virtual paths. The Tauri runtime is the implementation that writes readable files to the selected brain.
