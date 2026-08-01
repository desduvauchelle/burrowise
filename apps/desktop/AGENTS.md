# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

## Current design direction

- Use the selected library-first, three-pane desktop layout from the Product Design ideation set.
- The wireframe is now a real Tauri desktop application. Brain-folder selection, SQLite metadata, readable session files, WAV audio persistence, Apple Speech and installed Parakeet MLX transcription, durable enrichment jobs, duplicate-aware Review decisions, canonical transcript editing, Apple sentence-embedding search, local/generated chat, interviews, and Content Studio are implemented.
- Support Light, Dark, and System themes. System is the default.
- Treat desktop UI as a future shared React library; keep service and platform concerns out of visual components.
- All native operations must go through `src/services/platform.ts` or a later package-level adapter. React components must not import Tauri APIs directly.
- Capture reliability rule: create the session and canonical placeholder files before microphone recording; persist original audio before transcription or enrichment.
- Prefer portable mono PCM WAV for capture. Apple Speech must require on-device recognition; never permit its network fallback. A recognition failure leaves audio intact, records a visible error, and remains retryable.
- Preserve the recognized wording in `transcript.md`. Current automatic title, summary, and tags are deterministic local derivations, must reuse relevant existing tags when possible, and must not be presented as model-generated analysis.
- Ask for microphone access during onboarding only after explaining the hybrid recording control, local audio storage, background-listening boundaries, and revocation. A hold records a quick thought until release; a tap records until the next tap. Never make the first capture button an unexplained permission prompt.
- Treat browser preview microphone support as optional. Show runtime-specific guidance and preserve the native desktop app as the supported recording environment.
- Retrieval is real and local: Rust owns passage indexing, scoped ranking, source reads, persisted chat, citations, and access logging. Keep these behind the platform adapter.
- Treat broad knowledge-base use as a product-wide requirement, not a Chat-only option. Search/Home, Chat, Interviews, and Studio should share configurable evidence budgets, favor coverage across distinct source files, remove repeated passages, expose actual passage/file coverage, and preserve each workflow's visible knowledge scope.
- The built-in `local-retrieval / extractive-v1` provider must remain available without model downloads. It may be supplemented by stronger embedding/generation providers, but never silently replaced by a cloud provider.
- Chat answers must expose provider/model identity, source citations, and whether general model knowledge was used. A no-evidence response must not invent an answer.
- Preserve the local-first privacy language and make provider/model choices visible where relevant.
- Route every model-backed workflow through the native capability-oriented provider middleman documented in `../../PROVIDER_ARCHITECTURE.md`; React must never call model servers, cloud APIs, terminal agents, or Keychain directly.
- Treat configured, reachable, authenticated, diagnostic-tested, and active provider states as distinct. Never collapse them into a generic Available badge.
- Store provider credentials only in macOS Keychain. Persist only secret presence, provider configuration, favorites, model metadata, and per-workflow preferences.
- Never fall back from a local provider to a cloud provider without an explicit user confirmation that names the destination and data boundary.
- Run subscription-backed terminal adapters from an empty temporary directory with the strictest supported read-only/no-tool policy; never give them the brain folder as their working directory. Codex CLI may receive an explicitly selected image through its native attachment flag, while other terminal adapters remain text-only until their attachment interfaces are implemented and tested.
- Persist the exact provider/model on each generated message or artifact. A changed preference must not rewrite historical provenance.
- Home is a dashboard for quick actions, global search/filtering, usage, recent activity, and items needing attention.
- Capture owns raw recording sessions and their canonical transcripts.
- Library owns ingested source material such as sessions, audio, files, and web imports.
- Library accepts JPEG, PNG, WebP, GIF, and HEIC image notes. Preserve the original in `sources/images/<capture>/` before analysis; HEIC normalization is a derived review input, never a replacement for the original.
- On macOS, Library accepts videos manually and through the system Share menu. Preserve the original under `sources/videos/` before local audio extraction or transcription, keep failed processing visible and retryable, and use the App Group inbox as the durable boundary between the sandboxed Share Extension and the desktop app.
- Image review uses the explicit `vision` model preference through the native provider middleman. Successful review writes searchable `source.md` with provider/model/locality provenance. Missing or failed analysis leaves the original visible and retryable.
- Before a remote image review, name the provider and model and require per-import confirmation that the original image content will leave the Mac. Never include unrelated brain files or silently fall back to a cloud provider.
- Notes owns refined atomic knowledge and must show a browsable note collection beside the selected note.
- Review rows open a detail modal with provenance, supporting quote, reasoning, proposed action, and approve/deny controls.
- Interview behavior presets are called `hosts` in the product UI. A host controls conversational behavior; knowledge scope separately controls what it may read.
- Interview hosts are Markdown files in `hosts/`; seed defaults without overwriting edits and keep user-authored hosts readable outside the app.
- Interview sessions use turn-based capture, ask one question at a time, show `local-interviewer / guided-v1`, cite every retrieved passage, and expose a per-session knowledge-access log.
- Treat Interviews like durable chat threads: keep a searchable interview library visible, allow a new interview or any prior interview to be selected, and let finished interviews resume in the same thread with their original host, scope, turns, citations, audio, and provider/model provenance intact.
- The readable interview transcript is a searchable source of truth. Persist it after every turn and lifecycle change so Search, Chat, Studio, and later features can reuse the interview without a parallel hidden store.
- Current-session interview scope means no earlier brain document is retrieved. Selected-note scope must enforce exact selected paths. Never let a host read outside the visible scope.
- Keep the desktop app shell viewport-bound with independent vertical scrolling for the global left navigation and the active content pane; scrolling content must never move the global menu.
- Keep the global navigation distinctly branded and premium rather than generic: the active route should have a confident accent icon tile, clear typographic weight, restrained depth, and polished hover feedback without competing with Capture.
- The global Capture control must record directly rather than masquerade as navigation. Reuse the shared recording button in mini and normal variants, and keep one shared recorder state so a capture started in one location can be stopped from another.
- Until automatic transcription is implemented, preserve the voice turn's raw audio and require explicit transcript confirmation before the host responds.
- Content skills are ordinary Markdown files under `skills/content/`; seed built-ins without overwriting edits and keep user-authored skills readable outside the app.
- Content projects live under `projects/` with a canonical brief, readable workflow and metadata, and versioned stage artifacts in `outputs/`. Write the next artifact before advancing workflow state.
- Keep content creation behind the platform adapter. Every stage must enforce its visible knowledge scope, cite each retrieved passage, and record the source-access log.
- Keep `local-workflow / structured-v1` visibly labeled as deterministic offline scaffolding with general knowledge off. Do not imply that it is a creative language model and never silently send project data to a cloud provider.
- Chat uses a conversation list beside the active conversation and supports starting a new chat.
- Chat submission must feel like Codex/ChatGPT: render the submitted user turn immediately, clear the composer, and place an in-thread assistant thinking state with live status plus provider/model provenance until the response arrives. Failed turns stay visible with retry and edit recovery.
- Keep the Chat composer distilled to knowledge source and model selection; answer-depth and agent-mode configuration do not belong in the per-message composer.
- Settings uses dedicated sections for display, brain location, models, providers, transcription, privacy, storage, shortcuts, and sync.
- In Transcription settings, keep every selectable row full-width and left-aligned, and use a fixed, high-contrast selection control so the active provider or correction preference is immediately obvious.
- Show the Parakeet model's total download size and persistent byte/percentage progress before, during, after, and between resumable downloads.
- Parakeet model downloads are native background jobs: leaving or returning to Transcription settings must not cancel them, and the page must reconnect to the same progress or terminal error state.
- Sync is optional and manually initiated. Account passwords authenticate with the service; encryption passphrases never leave the client and derived keys remain in memory only for the unlocked session.
- Keep the shared encryption format in `packages/sync-protocol`. React components call `src/services/syncService.ts`; native filesystem and Keychain work stays behind `src/services/platform.ts` and Rust commands.
- Never synchronize `.second-brain` operational data or generated `review/sync-conflicts` copies. Never overwrite an independently changed local file; preserve the incoming version as a reviewable conflict.
- Do not apply remote deletions automatically until the product has a recoverable, multi-device tombstone policy.
- Capture is the global primary action. Keep a prominent `Start recording` control directly beneath the brand, above ordinary navigation, and make the recorder the dominant first element on the Capture page.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
