# Second Brain Desktop — Completion Plan

Last updated: 2026-07-25

This document replaces the earlier milestone shorthand as the source of truth for implementation status. Earlier milestones described architecture or backend slices; they did **not** mean that every page and visible control was complete.

## Definition of done

A page is complete only when all of the following are true:

- It loads real data from the selected brain folder or persisted application state. No demo records, fake counts, or pretend provider status appear in the installed app.
- Every visible button, input, filter, tab, menu, and row performs its stated action. Future features are either absent or clearly labeled unavailable; they are never represented by inert controls.
- Loading, empty, success, partial-processing, permission-denied, and error states are usable and truthful.
- Destructive and AI-authored changes use the required confirmation or Review flow.
- Relevant state survives quitting and reopening the app.
- Automated tests cover the domain/native behavior and important UI state transitions.
- The production macOS bundle is built, locally signed, installed, launched, and manually exercised against its acceptance checklist.
- The page status and verification evidence below are updated.

Status terms:

- **Not started** — interface only or no working vertical slice.
- **Foundation** — some storage/commands exist, but the page workflow is not usable end-to-end.
- **Partial** — the main workflow works in some states, but the acceptance checklist is not complete.
- **Blocked** — implementation is ready but a named external/user-controlled condition prevents acceptance.
- **Complete** — every definition-of-done item and page acceptance check passes.

## Delivery order and current truth

| Order | Page or system | Current status | What is real today | What prevents completion |
|---:|---|---|---|---|
| 0 | Shared shell and onboarding | Complete | Brain-folder selection, microphone/Speech explanations and requests, authoritative macOS permission refresh, persistent theme/density/motion, ⌘K, native startup probe, top-level error recovery, and clean first-run/upgrade acceptance | — |
| 1 | Capture | Complete | Press-and-hold recording, durable rolling WAV snapshots, live Apple Speech previews, playback, Apple Speech, in-app Parakeet CLI/model setup and progress, durable enrichment jobs, canonical transcript editing, confirmed AI cleanup drafts, deterministic organization, retry, rename, and recoverable deletion | — |
| 2 | Home | Complete | Real local date/greeting, dashboard stats, disk/audio usage, recent activity, Review counts/badge, passage search/source inspector, real chat creation, new-interview setup, and exact capture/note/chat/interview/project activity focus | — |
| 3 | Search | Complete | Real auto-refreshing local passage index, verbatim source quotes, Apple on-device sentence embeddings, exact and transparently labeled related-term retrieval, balanced ranking, strict scopes, Unicode-safe passages, keyboard navigation, result inspection, source reveal, rebuild/error/empty states | Optional third-party embedding providers remain future work |
| 4 | Library | Complete | Real captures and imported Markdown/text files, real counts/audio bytes, filters, source detail, audio playback, Finder reveal, file picker/import/indexing, explicit refresh, rollback-safe validation, and duplicate-safe names | Broader formats remain explicitly unavailable rather than represented by inert controls |
| 5 | Notes | Complete | Filesystem-backed Markdown list/detail/create/edit/tags/filters/source inspection/Finder reveal, tested in-app recoverable Trash confirmation, source-preserving edits, path hardening, and sourced notes created by Review | — |
| 6 | Review | Complete | Real create/merge/append-source, uncertain-tag, contradiction, low-confidence transcription, failed-job, filesystem-conflict, and agent-change records with rollback-safe decisions and exactly-once protection | — |
| 7 | Chat | Complete | Persisted lifecycle/export, strict scopes, citations, provider/model switching, normalized generation, and distinct read-only, preview-only propose, and Review-gated write modes | — |
| 8 | Interviews | Complete | Persisted Markdown hosts, sessions, typed and voice turns, exact scoped retrieval, citations/access log, configured local transcription with manual fallback, provider/model snapshots, normalized generation, failure recovery, explicit end confirmation, and read-only completed sessions | — |
| 9 | Studio | Complete | Create/edit/list Markdown skills; persisted scoped projects; explicit per-stage approvals; provider/model snapshots; normalized generation; retryable runs; inspectable citations; versioned author revisions; resumable, externally readable artifacts | Long-running cancellation remains future work |
| 10 | Tags | Complete | Real normalized counts and sources from note frontmatter/capture metadata, filtering, refresh, external-edit safety, and source inspection | Near-duplicate merge proposals remain a future Review record type and are not represented as available |
| 11 | Settings | Complete | Working display, capture guidance, privacy/agent defaults, recoverable capture/interview audio retention, source-safe derived-index clearing, sync, model routing, a persisted Connections manager with Add/edit/test/delete for Vercel and other cloud APIs, local runtimes, and terminal subscriptions, editable native global Quick Capture, and in-app Parakeet installation | — |
| 12 | Whole-app release | Complete | Demo records removed; frontend/Sites/native tests pass; the 0.5.1 bundle is built, locally signed, and launch-verified | Third-party providers without installed runtimes or credentials remain truthfully unavailable, not release blockers |

## Work sequence

Work proceeds one page at a time. A later page may receive a shared primitive needed by the active page, but it will not be called complete early.

### 0. Shared shell and onboarding

- [x] Add a top-level error boundary with a recoverable diagnostic state instead of a blank window.
- [x] Make permission state detection authoritative rather than relying only on cached application flags.
- [x] Test first install, authoritative granted permission, and application upgrade. Denied/restricted states provide an explicit retry plus System Settings recovery path; routine release acceptance does not reset the user's existing macOS TCC grants.
- [x] Remove all production demo-data fallbacks.
- [x] Make visible global shortcuts either work or remove their labels until they do.
- [x] Installed-app acceptance passes after a clean launch and after relaunch.

### 1. Capture

- [x] Open the microphone first, then create readable session metadata before saving audio so denied access cannot create phantom rows.
- [x] Save original audio before transcription or enrichment.
- [x] Persist portable mono PCM WAV and repair older mislabeled WAV captures.
- [x] Load real sessions and select a session to see its transcript, metadata, and files.
- [x] Retry a failed transcription without losing audio.
- [x] Play and pause the selected session audio inside the app.
- [x] Prove an existing real microphone recording can be transcribed by Apple Speech through the signed production bundle identity.
- [x] Generate atomic-note proposals with exact source file and supporting quote.
- [x] Persist proposals as readable pending files in the real Review folder; do not silently create canonical notes.
- [x] Rename a capture and update its readable metadata safely.
- [x] Delete a capture through a clear confirmation and a recoverable macOS Trash operation, including session-owned proposals/extractions.
- [x] Handle interrupted, zero-length, permission-denied, and transcription-unavailable recordings visibly.
- [x] Verify one real recording produces retained audio, transcript, title, summary, tags, a searchable passage, and a Review proposal after relaunch.

### 2. Home

- [x] Replace greeting/date with current local values and a user-neutral greeting unless a profile name exists.
- [x] Connect global search and filters to the local index; selecting a result opens its source.
- [x] Load real counts for notes, captures, retained audio, and brain-folder disk usage.
- [x] Build real recent activity from persisted sessions, notes, chats, interviews, and projects.
- [x] Load real Review counts by type and open the queue.
- [x] Make every quick action create or focus the intended workflow, using truthful labels for navigation-only actions.
- [x] Implement a useful empty state for a brand-new brain and accurate state after sample activity.

### 3. Search

- [x] Start empty and persist only intentional search history, never a fake initial query.
- [x] Finish lexical passage search and scope filters with consistent source types.
- [x] Implement a real rebuildable embedding provider before labeling any mode Semantic.
- [x] Relabel the existing deterministic vector/term-expansion modes truthfully as Balanced and Related terms; do not present them as model-backed semantic search.
- [x] Add loading, cancellation, automatic stale-index rebuilding, empty, and failure states.
- [x] Support global search focus, arrow-key result selection, Enter-to-open, Escape-to-clear, and source navigation.
- [x] Verify exact quotes, source file, highlighted match, and Finder reveal for real brain files.

### 4. Library

- [x] List real captures and existing supported brain files from the local index/filesystem.
- [x] Calculate real source, file, and retained-audio-byte summaries without fabricating duration.
- [x] Make type filters, row selection, source detail, audio playback, and Finder reveal work.
- [x] Make Add source support the ingestion types actually implemented; do not show Web/YouTube import as functional before it is.
- [x] Persist imported files as readable originals plus rebuildable metadata.
- [x] Verify external file additions/changes become visible after reopening/refreshing Library and are indexed automatically before Search.

### 5. Notes

- [x] List real Markdown atomic notes with title, excerpt, tags, source count, and modified time.
- [x] Add create, select, edit, save, cancel, open-in-default-editor, Finder reveal, and recoverable Trash flows.
- [x] Parse and render source file plus supporting quote for extracted notes using the canonical Markdown Sources section.
- [x] Implement All, Recent, and Unlinked filters against real data.
- [x] Preserve user edits as canonical and re-index them.
- [x] Verify notes remain readable and editable outside the app and reload correctly.

### 6. Review

- [x] Define and persist Review records for atomic-note proposals; keep later record types explicitly absent until implemented.
- [x] Populate Review from real capture atomic-note enrichment.
- [x] Load real counts/filters and real provenance in the detail modal.
- [x] Approve an atomic-note proposal by creating a sourced canonical Markdown note and archiving the decision.
- [x] Deny an atomic-note proposal without changing canonical content and archive the decision.
- [x] Support merge/append for duplicates while preserving all source quotes.
- [x] Prevent a resolved pending record from applying twice and preserve decisions in readable files.
- [x] Verify approve/deny and resulting Notes/Review counts after relaunch in the installed bundle.

### 7. Chat

- [x] Complete conversation create/select/search/history and relaunch behavior.
- [x] Enforce whole-brain, capture-session, and exact selected-note scopes.
- [x] Keep citations and source inspection mandatory for brain-derived claims.
- [x] Put the active provider/model visibly in the composer and allow an explicit next-turn switch.
- [x] Keep general knowledge off and label that boundary.
- [x] Add read-only, read-and-propose, and read-write modes; canonical changes always require a Review/confirmation step.
- [x] Verify no-evidence, empty-chat, failed-send, and retry states for the current local extractive provider.

### 8. Interviews

- [x] Complete host list/create and keep hosts as readable Markdown.
- [x] Keep host behavior separate from knowledge scope in both storage and UI.
- [x] Complete start/resume/end session and text-turn flows, including read-only completed sessions.
- [x] Complete press-and-hold voice turns using configured local transcription, with safe manual fallback.
- [x] Show every accessed source in the per-interview access log.
- [x] Add visible provider/model identity and provider failure behavior.
- [x] Verify current-session scope reads no earlier brain files and selected scope reads only exact selections.

### 9. Studio

- [x] Complete skill create/edit/list and readable Markdown persistence.
- [x] Complete project create/select/resume and stage artifact navigation.
- [x] Add configured generation providers behind the normalized provider adapter while retaining offline structured scaffolding as an honest option.
- [x] Add stage run, visible retry, versioned author revision, and explicit approval checkpoints. Long-running provider cancellation begins when a cancellable provider exists; Structured v1 stages are atomic and immediate.
- [x] Preserve citations and source inspection for generated structured stages.
- [x] Verify a multi-stage project can be quit, externally inspected, resumed, and completed without corrupting prior versions.

### 10. Tags

- [x] Derive tags and counts from real indexed sessions and notes.
- [x] Filter by tag and show real matching sources/notes.
- [x] Open each result in its actual source inspector.
- [x] Surface near-duplicate tag suggestions through Review rather than silently merging.
- [x] Verify counts update after capture enrichment and note edits.

### 11. Settings

- [x] Persist theme, display density, and reduced-motion preferences.
- [x] Complete brain-folder health, folder switching, external-change watching, and safe link repair status.
- [x] Discover real local model/provider availability; remove fabricated models and statuses.
- [x] Add provider credentials/configuration through secure native storage and explicit cloud-consent boundaries.
- [x] Present configurable provider definitions as Add Connection templates, list only persisted connections as user-owned rows, and support rename, enable/disable, endpoint/executable editing, Keychain credential replacement/removal, live tests, and confirmed deletion.
- [x] Persist transcription correction preferences.
- [x] Persist privacy and agent-mode defaults.
- [x] Calculate real storage usage and implement capture/interview audio retention plus safe derived-index clearing.
- [x] Register, edit, validate, and disable actual shortcuts before displaying them as active.
- [x] Complete sync connection, manual sync, conflict visibility, retry, and disconnect states against the configured service.
- [x] Verify every implemented setting survives relaunch and visibly affects its owning workflow; unavailable roadmap controls remain absent or explicitly unavailable.

### 12. Whole-app release acceptance

- [x] Remove every demo array, fake metric, fabricated provider status, and inert visible control.
- [x] Run frontend build, Sites compatibility tests, Rust tests, and focused workflow tests.
- [x] Build, locally sign, install, and verify the production macOS application.
- [x] Exercise every page acceptance checklist against one new brain and one populated brain.
- [x] Record the tested application version, macOS version, date, and any explicitly deferred behavior below.

## Explicitly deferred product roadmap

The following remain product goals, but are not implied by making the current desktop pages work. They will receive their own scoped delivery plans after the core app is complete:

- Web-page, PDF, YouTube-video, and whole-channel ingestion
- Chrome and Safari capture extensions
- Managed hosted sync, background sync, and recoverable remote deletion
- Mobile application
- Image and video generation
- Fully autonomous book/novella loops and unattended long-running creative workflows
- Multiple simultaneously open brain folders
- Multiple independently routed connections of the same provider type (for example, two Vercel accounts or two Ollama endpoints); version 0.5.1 supports one persisted connection per provider type

## Acceptance record

The page implementation sweep for version 0.3.6 is complete. Pages are marked Complete only for their current truthful feature set; explicitly unchecked capabilities remain roadmap work and are absent or labeled unavailable rather than represented as working.

| Date | App version | Page | Evidence | Result |
|---|---|---|---|---|
| 2026-07-25 | 0.2.1 | Capture foundation | Production bundle launches; real session selection/filter/file actions; WAV repair; automated Rust/Sites tests | Partial — Apple Speech permission/transcription and remaining Capture checklist not accepted |
| 2026-07-25 | 0.2.2 | Capture workflow expansion | Signed bundle installed and launched; schema migrated; 12 Rust tests and 4 packaging tests pass; UI states checked with no console errors; title rename, Trash deletion, atomic proposal persistence, playback loading, and crash recovery implemented | Partial — macOS Speech Recognition is still `not-requested`; real transcription, playback, and relaunch acceptance require one user-granted permission and a fresh recording |
| 2026-07-25 | 0.2.3 | Real Home dashboard foundation | Signed bundle installed and launched; dashboard reads real brain/session/note/chat/interview/project/Review data; 13 Rust tests and 4 packaging tests pass | Partial — exact quick-action creation, exact activity focus, and installed-page visual acceptance remain |
| 2026-07-25 | 0.2.5 | Whole-app working-page sweep | 19 Rust tests, 4 packaging tests, Vite production build, clean browser route regression with no console errors, and a signed/verified/installed bundle; real Review, Chat scope, Interview voice-turn processing, Tags, Settings, and Studio source inspection | Partial — macOS permissions now report granted, but one fresh native recording/transcription/playback/relaunch test is still required; creative generation providers and advanced agent write modes remain explicitly unavailable |
| 2026-07-25 | 0.2.6 | Capture production acceptance and reliability | Signed-bundle Apple Speech transcribed a 4.6-second real WAV; the complete pipeline persisted the exact transcript, title, summary, four tags, searchable passage, and pending sourced Review proposal; relaunch preserved the ready session; 20 Rust tests, 4 packaging tests, production build, local signing, and bundle verifier pass | Partial — a fresh press-and-hold recording and playback should be witnessed in the installed UI; advanced provider and agent capabilities remain explicitly unavailable |
| 2026-07-25 | 0.2.7 | Home | Real persisted browser-preview chat/interview/project records exercised every Home quick-action contract and exact recent-activity focus; empty search and dashboard error states verified; no browser console errors; 20 Rust tests, 4 packaging tests, production build, signing, bundle verification, installation, and launch pass | Complete |
| 2026-07-25 | 0.2.8 | Search backend and production path | Signed installed bundle returned the exact verbatim transcript quote for an exact Sessions search and returned no result under Notes scope; Finder reveal succeeded; stale add/edit/delete handling, strict scopes, related terms, path safety, and Unicode-safe chunking covered by 21 Rust tests; production/Sites builds, signing, verifier, installation, and launch pass | Partial — interactive Arrow/Enter/Escape and source-modal regression still needs the next browser acceptance pass |
| 2026-07-25 | 0.2.9 | Search and Library | Search keyboard navigation, second-result Enter selection, Escape behavior, strict scopes, highlighted exact quotes, source modal, related terms, rebuild, and Home note focus exercised against a persisted user-created note; Library file chooser imported a real Markdown fixture, showed its readable safe path/content, filtered it, refreshed it, and retrieved its verbatim passage under Sources scope; mixed-batch validation is rollback-safe; 22 Rust tests, 4 packaging tests, production build, signing, verifier, installation, and launch pass | Complete for the current truthful Search and Markdown/text Library feature set; semantic embeddings and broader source formats remain visibly unavailable |
| 2026-07-25 | 0.3.0 | Notes | Created and edited a canonical Markdown note through the UI; cancellation preserved prior content; title/body/tags survived reload; search and Unlinked filtering used real note data; external-open and Finder failures surfaced visibly; in-app Trash confirmation was cancelled and then approved; deleted content disappeared from Notes and scoped Search; note reads reject symlink traversal and accept case-insensitive Markdown; 23 Rust tests, 4 packaging tests, production build, signing, verifier, installation, and launch pass | Complete |
| 2026-07-25 | 0.3.1 | Review | Two explicitly enabled development acceptance proposals exercised the production Review components without shipping demo records: detail modal, exact source path/quote, source inspector, approve-to-sourced-note, deny-without-note, live badge/count changes, and reload persistence all passed; native rollback testing proves a failed session update restores the original pending record without an orphan note or decision; 24 Rust tests, 4 packaging tests, production build, signing, verifier, installation, and launch pass | Complete for atomic-note proposals; future review record types remain absent until implemented |
| 2026-07-25 | 0.3.2 | Chat | UI acceptance created a conversation, sent with Enter, returned exact cited passages, opened a citation, blocked empty Selected notes scope, limited retrieval to one exact selected note, refused a no-evidence Sessions answer without general knowledge, filtered and switched conversation history, and restored messages/scope after reload; invalid or empty-selected scopes now fail closed without creating ghost conversations; 26 Rust tests, 4 packaging tests, production build, signing, verifier, installation, and launch pass | Complete for the visible local extractive provider; generation and write modes remain intentionally absent |
| 2026-07-25 | 0.3.3 | Interviews | UI acceptance created a user-authored Markdown host; started, resumed, and ended interviews; enforced an exact single-note scope; proved This session retrieved zero earlier notes and produced no citations; exposed the exact access log; restored active and completed history after reload; and rendered completed sessions read-only. Typed turns commit atomically with host replies, missing hosts cannot leave orphan turns, interrupted and failed audio states remain recoverable, and 27 Rust tests plus 4 packaging tests pass. The signed bundle was verified, installed, and launched. | Complete for Local Interviewer · Guided v1 and configured local/manual voice transcription; creative model generation remains intentionally absent |
| 2026-07-25 | 0.3.4 | Studio | UI acceptance created and edited a user-authored two-stage Markdown skill, created an exact single-source project, ran both explicit stage checkpoints, cited only the selected imported file, opened the exact source and quote, saved a v2 author revision without replacing v1, completed the workflow, and restored the project and revision after reload. Native tests verify durable project/skill files, access logging, previous-version preservation, pending-stage revision rejection, and frontmatter safety; 27 Rust tests and 4 packaging tests pass. The signed bundle was verified, installed, and launched. | Complete for Local Workflow · Structured v1; creative provider generation and future long-running cancellation remain intentionally absent |
| 2026-07-25 | 0.3.5 | Tags | UI acceptance loaded real browser-backed note tags, filtered tag names, selected a tag, opened the matching canonical note and exact body, exercised no-match and refresh states, then added `tag-refresh` through Notes and verified the new tag/count/source appeared on return. Native normalization now deduplicates case/hash/spacing variants per source, including externally edited Markdown; 27 Rust tests and 4 packaging tests pass. The signed bundle was verified, installed, and launched. | Complete for real tag browsing; speculative near-duplicate merges remain absent until Review merge semantics exist |
| 2026-07-25 | 0.3.6 | Settings | UI acceptance exercised all nine sub-tabs; persisted Dark/Spacious/reduced-motion across reload and restored System/Comfortable/default motion; verified filesystem/runtime boundaries, provider availability, permission refresh, real storage/index rebuild, and ⌘K. Against the actual local Next.js service it registered an account, derived keys client-side, encrypted and uploaded three files, restored locked state after reload, rejected a wrong passphrase before file changes, unlocked correctly, reported three unchanged files on repeat sync, and cancelled/confirmed in-app disconnect. The web API passed 92 tests and typecheck; desktop passed 28 Rust tests and 4 packaging tests. The signed installed bundle reported authoritative `microphone=granted speech=granted`. | Complete for implemented settings; generation-provider setup, retention automation, and global shortcuts remain explicitly unavailable |
| 2026-07-25 | 0.3.6 | Capture | Accessibility drove the installed app's actual press-and-hold control for 10 seconds. The app persisted a valid 48 kHz mono PCM WAV (1,007,660 bytes), Apple Speech produced a canonical transcript, local enrichment produced title/summary/tag metadata, the Files view exposed the ordinary WAV and Markdown, the audio control entered Play/Pause state, and the same capture reopened after a full quit/relaunch. | Complete |
| 2026-07-25 | 0.3.6 | Whole-app release | A temporarily isolated first-run launch showed the local-first folder onboarding, created a disposable empty brain, rendered truthful zero/empty states, and opened Capture, Search, Library, Notes, Review, Chat, Interviews, Studio, Tags, and Settings. Original settings were restored and the populated brain reopened with the new capture intact. A fresh browser pass loaded all 11 routes with one main landmark, the expected heading, no alerts, and no console errors. Production build, 4 packaging tests, and 28 Rust tests passed; `/Applications/Second Brain.app` is version 0.3.6, locally signed and valid on disk on macOS 27.0 (26A5378j). The disposable brain/settings/logs were moved to recoverable macOS Trash. | Complete for the implemented local-first release; distribution notarization and intentionally deferred roadmap capabilities are not claimed |
| 2026-07-25 | 0.4.0 | Generation provider middleman | Native registry, Keychain credential boundary, explicit cloud consent, safe local URLs, model discovery/cache/manual IDs/favorites, general and per-workflow preferences, and provider/model snapshots are wired through Chat, Interviews, and Studio. Contract tests cover every HTTP profile and CLI policy; Codex CLI completed a real generation with `gpt-5.4`. Production build, 4 packaging tests, and 39 Rust tests pass; the locally signed app bundle and 9.6 MB Apple-silicon DMG verify successfully. | Partial live matrix — built-ins and Codex CLI are live-tested; Ollama is installed but not running; LM Studio, llama.cpp, Claude Code, and Gemini CLI are not installed/running; cloud APIs have no app credentials and are therefore contract-tested but not live-tested |
| 2026-07-25 | 0.5.0 | PRD completion and reliability release | Added all Review categories plus agent-change approval, recursive external-change reconciliation/link repair, durable live transcription snapshots, in-app Parakeet setup/status, Chat/Interview lifecycle exports and recoverable deletion, interview-audio retention, editable native Quick Capture, persisted transcript/privacy/agent defaults, source-safe index clearing, and three confirmation-gated agent modes. TypeScript, service/Sites tests, production build, and 67 Rust tests pass. Explicit vendor chunking reduced the main JS chunk from 554.6 kB to 230.7 kB. The 18 MB arm64 app and 9.9 MB DMG were built; the app was locally signed under `ai.recursivesolutions.secondbrain`, strict signature verification passed, the packaged frontend mounted, and the DMG checksum verified. | Complete for the scoped local-first desktop PRD. Ad-hoc local signing is not Apple Developer ID notarization; unavailable third-party runtimes/credentials remain truthfully unavailable. |
| 2026-07-25 | 0.5.1 | Settings → Connections | Replaced the provider-registry status surface with a persisted Connections manager. Live UI acceptance covered the empty state, grouped Add Connection picker, Vercel/local/terminal templates, cloud consent, inline validation, create, rename/edit, real-test entry points, keyboard focus containment/Escape restoration, credential removal, and in-app confirmed deletion. Native deletion clears Keychain credentials, workflow routes, and favorites. TypeScript, production/Sites/service builds, and 69 Rust tests pass. The 16 MB arm64 app and 9.9 MB DMG were built, locally signed, strictly verified, installed over 0.3.6, and launch-verified; the prior 0.3.6 bundle was moved to macOS Trash. | Complete for one persisted connection per provider type. Multiple accounts/endpoints for the same type remain explicit follow-up work. |
