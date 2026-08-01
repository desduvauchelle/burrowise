# Burrowise provider middleman

Status: accepted architecture, implemented in desktop version 0.4.0.

## Product contract

Burrowise owns one native provider middleman. React never calls a model server,
cloud API, command-line agent, or Keychain directly. Every model-backed workflow
uses the same capability-oriented Rust service and receives a normalized result.

The middleman must never treat configuration, reachability, authentication, a
successful diagnostic, and active selection as the same state. It reports them
separately and records the exact provider and model used for every generated
message or artifact.

There is no automatic local-to-cloud fallback. Selecting or testing a remote
provider is an explicit user action, and its UI states what data leaves the Mac.

## Normalized capabilities

- `text-generation`
- `streaming-text`
- `embeddings`
- `image-generation`
- `image-understanding`
- `speech-to-text`
- `text-to-speech`
- `tool-calling`

The provider release implements non-streaming text generation for Chat,
Interviews, and Studio, plus image understanding for Library image notes. Image
review receives only the selected image and review instruction, records the
provider/model/locality on the derived source, and never falls back to cloud.
The contract retains the other capability names so unsupported functionality is
reported honestly rather than inferred from a provider brand.

## Transports

| Transport | Initial providers | Contract |
|---|---|---|
| Built-in | Local Retrieval, Guided Interviewer, Structured Workflow | Deterministic offline fallback; never described as an LLM |
| OpenAI Responses | Direct OpenAI | `POST /responses`, dynamically discovered models |
| OpenAI-compatible chat | Ollama, LM Studio, llama.cpp, Gemini, OpenRouter, Vercel AI Gateway | `GET /models` or provider discovery endpoint; `POST /chat/completions` |
| Anthropic Messages | Direct Anthropic | `GET /models`; `POST /messages` |
| Restricted terminal CLI | Codex, Claude Code, Gemini CLI | Existing authenticated executable, empty temporary working directory, read-only/no-tool policy where supported, structured output, timeout |

Local OpenAI-compatible providers share request/response normalization but keep
separate profiles because discovery, startup guidance, authentication, and error
behavior differ.

## Persistent configuration

Readable application configuration may contain:

- provider identifier and enabled state;
- base URL or executable path;
- one-time remote-provider consent state;
- cached model metadata and diagnostic timestamps;
- favorite model references;
- general and per-workflow preferred model references.

Secrets are stored only in macOS Keychain. Configuration exposes only whether a
credential exists. The app may use an environment variable for an explicitly
initiated diagnostic, but it never copies, displays, or persists that value.

Preference keys are `general`, `chat`, `interview`, `studio`, `embedding`, and
`background`. Conversations, interviews, projects, messages, and generated
artifacts snapshot the provider/model actually used. Changing a preference does
not rewrite history.

## Cost accounting

Every cloud generation that reaches a successful provider HTTP response is
written to an app-level SQLite cost ledger, including Chat, Interviews, Studio,
image review, and real provider diagnostics. A billed response remains recorded
even when it contains no usable assistant text and the application treats the
generation as failed.
The ledger records the gateway request ID, provider, model, upstream provider
when reported, workflow, token counts, timestamp, cost, and cost source. It does
not store prompts, outputs, credentials, or brain paths, and it is not part of
brain sync.

Provider-reported cost is authoritative. OpenRouter includes cost accounting in
its non-streaming response, so that value is stored directly. When a gateway
returns token usage without cost, the middleman estimates cost from the pricing
returned by dynamic model discovery. Pricing is cached with model metadata
rather than hard-coded. Calls that cannot be priced remain visible as unpriced;
they are never counted as free.

Settings shows current-month and lifetime spend, request and token totals,
provider rollups, recent calls, and whether each amount was reported or
estimated. A user may set a monthly monitoring budget. The budget is deliberately
non-blocking; a future hard cap requires a separate product decision because an
unknown or delayed gateway charge must not cause unsafe retry behavior.

## Data boundary

Generation receives the user instruction plus only the passages allowed by the
visible knowledge scope. The access record contains provider, model, locality,
source paths, exact retrieved quotes, request time, and whether general model
knowledge was permitted. It never contains credentials or hidden reasoning.

Terminal adapters receive the constructed prompt through standard input whenever
the CLI supports it. They run from an empty temporary directory and are not given
the brain folder as a working directory or argument.

## Acceptance levels

- **Contract-tested**: a mock HTTP server or fake executable proves request,
  normalization, timeout, and error behavior.
- **Discovered**: the actual server or executable is installed and answers its
  health/model probe.
- **Live-tested**: an authenticated real generation succeeds through the app.

Release notes list these levels per provider. A provider is never labeled simply
`Available` when only a binary, port, or credential was detected.

## Version 0.4.0 verification matrix

| Provider | Contract | This Mac | Live generation |
|---|---|---|---|
| Built-in Retrieval, Interviewer, Workflow | Passed | Bundled | Passed through workflow tests |
| Ollama | Passed | Executable found; server not running | Not run |
| LM Studio | Passed | Runtime/server not found | Not run |
| llama.cpp | Passed | Runtime/server not found | Not run |
| OpenAI API | Passed | No app credential configured | Not run |
| Anthropic API | Passed | No app credential configured | Not run |
| Gemini API | Passed | No app credential configured | Not run |
| OpenRouter | Passed | No app credential configured | Not run |
| Vercel AI Gateway | Passed | No app credential configured | Not run |
| Codex CLI | Passed | Executable and login found | Passed with `gpt-5.4`; installed CLI rejected `gpt-5.6-sol` as requiring an update |
| Claude Code CLI | Passed | Executable not found | Not run |
| Gemini CLI | Passed | Executable not found | Not run |

“Contract passed” means registry, request/response normalization, safety checks,
and failure behavior are automated. It is deliberately not a claim that an
unconfigured third-party service generated a response.

## Accepted user decisions

1. Vercel means AI Gateway; the Vercel AI SDK is not the desktop core.
2. One normalized capability contract owns multiple transports.
3. Ollama, LM Studio, and llama.cpp share normalization but remain distinct.
4. Subscription-backed CLIs are explicit experimental local adapters.
5. Cloud credentials live in Keychain.
6. Models are discovered dynamically with cache, manual IDs, favorites, recents,
   filters, and truthful stale/unavailable states.
7. General and per-workflow preferences coexist; persisted work snapshots usage.
8. No automatic local-to-cloud fallback.
9. Only scoped prompts/passages leave the Mac, with a visible access record.
10. Contract-tested, discovered, and live-tested are separate release claims.
