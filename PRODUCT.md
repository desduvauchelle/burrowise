# Local-First Burrowise

## Product thesis

A private, local-first desktop application that makes it effortless to capture spoken thoughts, preserve the user's authentic wording, organize those thoughts into durable Markdown knowledge, and explore or deepen them through search, chat, and AI-led interviews.

The initial product is for the developer personally, with an architecture suitable for a future commercial product.

## Version-one promise

Press and hold a button, speak, and release. The transcript appears almost immediately. The application saves the audio and a minimally corrected, human-readable transcript, then creates a title, summary, tags, and searchable atomic notes in the background. The user can search the resulting knowledge base, chat with it, or continue through an AI-hosted interview.

The product's initial front doors are capture and interview. Content production is a later layer built on top of the knowledge base; its first local, grounded workflow foundation is delivered in Milestone 5.

## Product principles

- Local-first and offline-capable by default.
- No silent fallback from a local model to a cloud provider.
- Human-readable Markdown is the canonical knowledge format.
- Audio and original wording are preserved.
- AI-derived indexes and artifacts can be rebuilt.
- Users can inspect the source behind retrieved passages and extracted notes.
- AI edits to canonical user content require an explicit action and confirmation.
- Provider boundaries remain replaceable: bundled or downloaded local models, local model servers, command-line agents where permitted, and user-supplied cloud API keys.
- Capture must succeed even when enrichment fails; unsuccessful jobs remain visibly unprocessed.

## Version-one scope

### macOS desktop application

- Tauri/Rust desktop shell.
- React and Tailwind UI designed for later reuse on web and potentially mobile.
- Application download should remain near 100 MB; models are optional post-install downloads.
- Capture inside the application is required.
- Menu-bar access is desired.
- A global hotkey is optional.
- Before any model is installed or provider is configured, the app can still record and retain raw audio.
- English is the required initial transcription language. Apple speech recognition and downloaded multilingual models should be available as provider options.

### Voice capture

- Press and hold to record; release to finish the user's turn.
- Near-instant transcript display after recording.
- Original audio is retained.
- Transcription corrections may fix recognition errors but should preserve the user's wording and natural sentence structure.
- Optional `AI clean up` can rewrite the transcript only after explicit user action.
- Chat-requested edits use a Codex-like proposed-change and confirmation flow.

### Session organization

Each capture or interview creates a session folder. The canonical transcript is immutable except for user edits or confirmed AI changes. Enrichment runs asynchronously.

```text
sessions/2026-07-25-product-idea/
  session.md
  transcript.md
  audio.m4a
  extractions/
    idea-1.md
    idea-2.md
  session.json
```

Expected derived artifacts:

- Title
- Summary
- Tags
- Automatically created atomic notes
- Source file and exact supporting quote on extracted notes
- Processing and error status

Atomic notes are created automatically, but new notes enter a review inbox. Extraction should consider existing notes, avoid obvious duplicates before writing, and make accepting, rejecting, or merging suggestions fast.

For effectively identical ideas, append the new source file and quote to the existing atomic note. For related but distinct ideas, create linked notes. For ambiguous similarity, create a merge proposal in the review inbox. Contradictory claims are preserved rather than silently merged.

Passage retrieval should show its source session and allow audio playback. Exact quotes can be found and highlighted in the transcript; timestamp-level provenance is not required initially.

### Search and chat

- Lexical search over files and passages.
- Semantic search using a rebuildable embedding index.
- Chat scopes: the current session, selected folders or notes, and the whole brain.
- Chat cites every knowledge-base source it used.
- When the brain does not contain an answer, chat may use the model's general knowledge only when the response clearly labels that material as external to the brain.
- The active provider and model are always visible in the chat composer, similar to Codex, so users can see whether a local or remote system is receiving the request.
- Read-only and read-write agent modes.
- Canonical edits in write mode require a confirmation mechanism.

### Image knowledge capture

- Import photos, scans, screenshots, diagrams, and whiteboards into Library.
- Preserve every original image in a readable `sources/images/` folder before analysis begins.
- Use an explicitly selected image-capable model to turn visible text and structure into searchable Markdown without inventing illegible content.
- Keep failed or unconfigured image analysis visible and retryable; storage succeeds independently of enrichment.
- Record the exact provider, model, and locality in the derived Markdown and image metadata.
- Require a per-import confirmation naming the destination before original image content is sent to a cloud provider. There is no local-to-cloud fallback.

### Interview mode

The AI acts as a podcast host: it guides, probes, challenges, and helps the user continue thinking. For version one, the user explicitly starts and stops each spoken turn. AI replies may be text; local speech synthesis is optional.

Interview behavior can use the whole knowledge base, including prior statements, when the user permits that scope.

The selected scope is visible at the beginning of an interview. The session records which notes or passages the interviewer actually accessed.

Interview skills are portable Markdown with structured frontmatter. They control questions and analysis but cannot execute arbitrary tools or modify files.

In the user interface, these behavior presets are called **hosts**. A host defines personality, pacing, stages, goals, and questioning behavior. Knowledge scope is configured separately and defines which sessions, notes, folders, or whole-brain context the host may access.

```markdown
---
name: Product Excavator
stages: [context, problem, evidence, alternatives, commitment]
completion: "Every claim has an example or is marked uncertain"
---

Ask one question at a time...
```

Initial behavior archetypes to explore:

- Open-ended explorer: informal, associative, tangent-friendly
- Biographical excavator: chronology, formative events, emotional turning points
- First-principles thinker: patient, philosophical, technically deep
- Evidence-to-action expert: definitions, mechanisms, evidence, protocols
- Friendly challenger: direct questions, contradictions, accountability
- Vulnerable comedian: humor and surprising associations
- Transformational coach: reframing and commitment
- Intimate confidant: candid and emotionally specific
- Investigative listener: prepared context and precise follow-ups

These presets should be expressed as editable traits rather than literal celebrity impersonations. Candidate controls include warmth, skepticism, humor, interruption frequency, follow-up depth, pace, evidence requirements, and session goals.

## Proposed storage architecture

Markdown and media files are the durable source of truth. SQLite stores operational metadata, relationships, permissions, provider settings, and background job state. Embeddings form a disposable derived index that can be rebuilt from the files.

The user selects any ordinary filesystem folder as the brain. Obsidian, editors, and coding agents may read or modify it. A filesystem watcher treats external edits as authoritative and keeps metadata and indexes synchronized. FileVault and normal macOS file permissions are sufficient for version one; app-specific file encryption is not required.

The initial product opens one brain folder at a time, but configuration stores brain folders as an array to preserve a path toward multiple brains.

Both Obsidian-style `[[wikilinks]]` and ordinary relative Markdown links are supported. When external moves or renames can be identified safely, the application repairs incoming links. Ambiguous cases are reported for review rather than guessed.

Tags are free-form. AI should consider and suggest existing tags to reduce accidental fragmentation, but users are not restricted to a controlled taxonomy.

The review inbox includes new atomic notes, uncertain tags, possible duplicates, low-confidence transcription, contradictions, and failed processing jobs.

Deleting a session also deletes its session-owned extracted notes after a confirmation that explains the impact. Normal deletion should use a recoverable trash operation where practical.

Audio retention is configurable: off, 7 days, 30 days, 3 months, 6 months, 1 year, or forever.

The provider layer must distinguish capabilities such as transcription, embeddings, text generation, text-to-speech, images, and video. Local providers may include downloaded models and user-run servers such as Ollama, LM Studio, or llama.cpp. Remote providers use user-supplied credentials initially. If a local provider is unavailable, the application explains the failure and requests confirmation before sending anything to a configured cloud provider.

The first-run experience does not force a model download. Users choose transcription and agent providers. Candidate integrations include Apple speech recognition, downloaded local models, Ollama, LM Studio, llama.cpp, OpenRouter, Vercel AI Gateway, and direct model APIs. Subscription-backed command-line agents are optional experimental adapters only where their technical and usage terms permit.

## Web and service architecture

The Growth Engine Next.js starter is intended for the public landing pages, blog, and eventual web client. The hosted service can later become the API hub for authentication, encrypted backup, and synchronization. The desktop product remains independently useful without that service.

A likely monorepo split is:

```text
apps/
  desktop/       # Tauri plus React
  web/           # Growth Engine Next.js application
packages/
  ui/            # shared React, Tailwind, and DaisyUI components
  domain/        # shared types, schemas, and workflows
  providers/     # platform-neutral capability interfaces
```

## Deferred roadmap

### Broader ingestion

- Text entry and paste
- Drag-and-drop files
- PDFs and common document formats
- Web pages
- Individual YouTube videos
- YouTube channels
- Chrome and Safari capture extensions
- System share integrations

### Sync and portability

- Optional encrypted backup and multi-device synchronization (Milestone 4 foundation implemented)
- Web vault using the shared encryption protocol; broader reuse of the desktop React interface remains incremental
- Mobile capture application
- Import/export compatible with ordinary Markdown tools and Obsidian-style workflows

Sync uses separate account and encryption credentials. The service authenticates the account but receives only ciphertext and opaque identifiers; encryption and decryption occur in authorized clients. The encryption passphrase has no server-side recovery. The server can observe account identity, ciphertext sizes and counts, opaque object identifiers, revisions, device identifiers, and access timing, but cannot read brain names, paths, MIME types, file timestamps, or content. `SYNC_SECURITY.md` is the canonical threat model.

### Content studio

- YouTube-script, social-campaign, blog-post, short-story, and long-form workflow foundations (Milestone 5 implemented)
- Readable local project folders with resumable Markdown stage artifacts (Milestone 5 implemented)
- User-created Markdown content skills and templates (Milestone 5 implemented)
- Grounded stage execution with citations and a visible source-access log (Milestone 5 implemented)
- Image generation
- Video generation
- Configurable creative model providers for actual drafting and rewriting
- Dynamic long-running loops that expand plans into chapters or sections and perform generation, critique, continuity checks, and revision
- Fully automatic generation or user-guided checkpoints

### Potential platform direction

- Optional managed provider and billing layer
- Template/skill marketplace
- Collaborative or team knowledge spaces
- Hosted synchronization service

## Unresolved decisions

- How session folders relate to the permanent knowledge hierarchy
- Similarity thresholds and review behavior for duplicate atomic notes
- Local transcription implementations and supported macOS hardware
- Exact provider interface and capability negotiation
- Background processing and failure recovery
- Whether command-line AI subscriptions can be integrated technically and under their applicable terms
- Link-repair behavior when external moves cannot be identified reliably

## Delivery sequence

### Milestone 1: capture and organize

- macOS onboarding
- Choose a brain folder
- Record raw audio before models are configured
- Choose or install a transcription provider
- Press-and-hold capture
- Immediate transcript followed by background title, summary, tags, and atomic notes
- Review inbox and processing status

Content capture is the first meaningful action after onboarding.

## Application information architecture

- **Home**: dashboard with quick actions, global search and filters, usage/storage summaries, recent activity, and Review status.
- **Capture**: raw voice and interview sessions, retained audio, canonical transcripts, and session-derived artifacts.
- **Knowledge**: one browsable and searchable workspace for refined Markdown notes and all ingested source material, including captures, files, images, web pages, and audio. Notes retain distinct editing and provenance behavior without requiring a separate navigation destination.
- **Review**: a decision queue. Every item opens to show provenance, supporting quotes, model reasoning, confidence, proposed action, and approve/deny controls.
- **Chat**: a browsable conversation history beside the active cited chat.
- **Interviews**: host selection followed by a clearly separate knowledge-scope setup.
- **Settings**: dedicated sections for display, brain location, models, agent providers, transcription, privacy and permissions, audio and storage, shortcuts, and sync.

Capture is the product's global primary action rather than an ordinary peer in navigation. A persistent `Start recording` control appears directly beneath the app brand, and the Capture screen places a large recorder before existing-session detail. Search and retrieval remain the secondary product action.

### Milestone 2: retrieve and chat

- Lexical and semantic search
- Passage-level results and source inspection
- Cited chat with session, selected, and whole-brain scopes
- Visible provider/model selection
- Clearly labeled general-model knowledge

### Milestone 3: interview

- Turn-based voice capture
- Text interviewer replies
- Preset and user-authored Markdown interview skills
- Visible knowledge scope and access log

### Milestone 4: account and sync

- Growth Engine web application and public site
- Authentication
- User-controlled encrypted backup and synchronization
- Web access consistent with the encryption design

Implemented as an initial manual-sync vertical slice. Background sync, recoverable remote deletion, large-object transport, and a dedicated conflict-resolution workflow remain follow-up work.

### Milestone 5: content studio foundation

- A dedicated Studio workspace with a project list, new-project flow, stage progress, selected output, and source-access detail.
- Five built-in Markdown skills for YouTube scripts, social campaigns, blog posts, short stories, and long-form work.
- User-authored Markdown skills with editable instructions and arbitrary ordered stages.
- Readable local project folders containing the canonical brief, workflow, project metadata, and versioned stage outputs.
- One-stage-at-a-time execution that can be closed, externally edited, and resumed without losing progress.
- Whole-brain, notes, sessions, imported-source, and exact selected-file knowledge scopes.
- A citation and access-log record for every brain passage used by a stage.
- A visible `local-workflow / structured-v1` offline provider that produces deterministic grounded scaffolds without claiming to be a creative model.

Configurable local and confirmed remote creative model providers, images, video, automatic multi-chapter expansion, and unattended long-running loops remain follow-up work.
