# Provider Setup How-To

CADENCE delegates AI gate work to a **provider**. Four providers are
available: `mock` (offline, no config needed), `anthropic` (Anthropic API),
`local` (any OpenAI-compatible endpoint, e.g. Ollama), and `host-cli` (shells
out to your already-installed, already-authenticated `claude`/`codex` CLI).
Each gate that calls an AI verifier can be configured independently.

For a conceptual overview of providers and the gate universe they serve, see
[docs/concepts.md — Providers](concepts.md#providers) and
[docs/concepts.md — The gate universe](concepts.md#the-gate-universe).

---

## Table of contents

- [Provider overview](#provider-overview)
- [Fast path — `cadence activate`](#fast-path--cadence-activate)
- [mock — offline deterministic default](#mock--offline-deterministic-default)
- [anthropic — Anthropic API](#anthropic--anthropic-api)
- [local — OpenAI-compatible endpoint](#local--openai-compatible-endpoint)
  - [Per-gate model override](#per-gate-model-override)
  - [Auth — bearer token + custom headers](#auth--bearer-token--custom-headers)
  - [Warn + mock fallback](#warn--mock-fallback)
- [host-cli — headless host CLI (`claude`/`codex`)](#host-cli--headless-host-cli-claudecodex)
  - [Binary discovery](#binary-discovery)
  - [Current scope: per-task-verify only](#current-scope-per-task-verify-only)
  - [Fallback behavior](#fallback-behavior)
  - [Readiness reporting caveat](#readiness-reporting-caveat)
  - [Deferred: batching + quota transparency](#deferred-batching--quota-transparency)
- [Per-gate provider configuration](#per-gate-provider-configuration)
- [Which gate fires in which cell](#which-gate-fires-in-which-cell)
- [Selecting a provider at the command line (Phase 73)](#selecting-a-provider-at-the-command-line-phase-73)
  - [Token usage in the SUMMARY](#token-usage-in-the-summary)
- [Deep-verify prompt id-binding (Phase 29.7)](#deep-verify-prompt-id-binding-phase-297)

---

## Provider overview

| Provider | What it does | What it requires |
|---|---|---|
| `mock` | Deterministic offline **placeholder** — only checks each AC links to a test; **not real verification** | Nothing — the default everywhere |
| `anthropic` | Calls the Anthropic API using `messages.parse` with structured output; prompt-caches the system prompt | `ANTHROPIC_API_KEY` in environment or a `.env` file at the repo root |
| `local` | POSTs to an OpenAI-compatible `/v1/chat/completions` endpoint; parses JSON output with repair retries | `CADENCE_LOCAL_BASE_URL` + a model name (env or config) |
| `host-cli` | Spawns your already-installed, already-authenticated `claude`/`codex` CLI in headless mode; parses its stdout with the same repair-retry harness `local` uses | Nothing — no separate API key. Only the CLI binary itself, already on PATH and logged in |

---

## Fast path — `cadence activate`

The rest of this page walks through configuring providers by hand
(`cadence config set …` + the env vars). For a first switch from the default
`mock` to real verification, the one-command way is **[`cadence activate`](reference/commands.md#activate)** (v1.22):

```sh
export ANTHROPIC_API_KEY=sk-ant-...
cadence activate --provider anthropic        # flips deep-verify; --all for every gate
```

It writes `verifier.provider` for you, then makes a minimal **live call** to
confirm the key actually works before reporting success (skip with `--no-check`;
`local`/`mock` skip the live check). The key is discovered from the environment
or, failing that, a `.env` file at the repo root, and is
**never written to config or logged** — only the provider name is persisted. If
the key is missing it still records your choice and prints the exact `export …`
line. Preview without writing using `--print`.

To confirm the resulting state at any time, run `cadence doctor` — its
`verification-readiness` check reports `ok` once a real provider with valid
credentials is wired, and `warning` (pointing back at `cadence activate`) while
you are still on mock.

The manual steps below remain the source of truth for per-gate configuration,
`local` setup, custom headers, and command-line provider selection.

---

## mock — offline deterministic default

`mock` is the default for every gate. It is a **placeholder, not real
verification**: it only checks that each AC links to a test, never judging the
implementation. No environment variables or config changes are needed. It is
ideal for:

- Getting started without an API key
- CI pipelines that should not make network calls
- Testing CADENCE's loop mechanics without paying for inference

To confirm a gate is using mock, run:

```sh
cadence config get verifier.provider
```

If it prints nothing or `mock`, mock is active.

---

## anthropic — Anthropic API

Set the environment variable and configure the gate:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
cadence config set verifier.provider anthropic
```

The Anthropic provider uses `messages.parse` with a `zodOutputFormat`-backed
output schema, so the model returns structured JSON directly. The system
prompt is sent with `cache_control: { type: "ephemeral" }` so repeated calls
within a session benefit from prompt caching.

Default model used when no per-gate `model` override is set: `claude-sonnet-4-6`
(from `AnthropicVerifier` in `packages/core/src/verify/anthropic-verifier.ts`).

To use a larger (Opus) model for a specific gate:

```sh
cadence config set verifier.model claude-opus-4-6
```

**Fallback behavior:** if `ANTHROPIC_API_KEY` is unset when `provider:
anthropic` is configured, CADENCE emits a stderr warning and falls back to
mock rather than failing hard:

```
verifier: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.
```

The same fallback applies to every gate (`per-task-verify`, `code-review`,
`plan-review`, `security-audit`) — each emits a gate-prefixed version of the
same warning.

**Timeout + retries (deep-verify).** To make the `deep-verify` gate dependable
when a settle depends on it, set a request timeout and a retry budget on the
`verifier` block — a transient 429/5xx/network blip then retries before failing
loud rather than failing fast:

```sh
cadence config set verifier.timeoutMs 60000   # per-request timeout (ms)
cadence config set verifier.maxRetries 4       # 0 disables retries
```

Both are optional; omitting them keeps the Anthropic SDK defaults. They apply
only to the top-level `verifier` slice (the `deep-verify` gate). (Phase 72)

---

## local — OpenAI-compatible endpoint

The `local` provider calls any server that implements the OpenAI
`/v1/chat/completions` API, for example Ollama.

**Required environment variables** (verified against
`packages/core/src/verify/factory.ts` and its siblings):

| Variable | Purpose |
|---|---|
| `CADENCE_LOCAL_BASE_URL` | Base URL of the endpoint, e.g. `http://localhost:11434/v1` |
| `CADENCE_LOCAL_MODEL` | Model name to pass in the request, e.g. `llama3.2` |

Minimal setup:

```sh
export CADENCE_LOCAL_BASE_URL=http://localhost:11434/v1
export CADENCE_LOCAL_MODEL=llama3.2
cadence config set verifier.provider local
```

The client POSTs to `${CADENCE_LOCAL_BASE_URL}/chat/completions` with
`response_format: { type: "json_object" }` and `temperature: 0`. It extracts
JSON from the response content (stripping code fences if present) and validates
against the gate's Zod schema. On validation failure it sends up to 2 repair
retries before throwing.

Source: `packages/core/src/verify/local-client.ts`.

### Per-gate model override

`CADENCE_LOCAL_MODEL` is the fallback model for all gates. To use a different
model for a specific gate, set it in config — the config value takes precedence:

```sh
# Use a faster model for per-task checks, a stronger one for code-review
cadence config set perTaskVerifier.model mistral-nemo
cadence config set codeReview.model llama3.3
```

Resolution order per gate: `config.<gate>.model` → `CADENCE_LOCAL_MODEL`.

`CADENCE_LOCAL_BASE_URL` is always required and has no per-gate config
override; all gates share the same endpoint.

### Auth — bearer token + custom headers

If your endpoint is a token-gated OpenAI-compatible proxy or gateway, supply an
API key via the environment; the `local` client sends it as an
`Authorization: Bearer <key>` header:

```sh
export CADENCE_LOCAL_API_KEY=sk-proxy-...
```

For gateways that need other headers, set `verifier.localHeaders` (applies to
the `deep-verify` gate). Custom headers are merged over the base `content-type`
and can override the derived `Authorization`:

```sh
cadence config set verifier.localHeaders '{"X-Gateway-Tenant":"acme"}'
```

When neither is configured, only `content-type` is sent. Header values are
secrets and are never logged. (Phase 72)

### Warn + mock fallback

If `CADENCE_LOCAL_BASE_URL` is unset, or if neither `config.<gate>.model`
nor `CADENCE_LOCAL_MODEL` resolves to a value, CADENCE falls back to mock
with a gate-prefixed warning, e.g.:

```
verifier: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.
per-task-verify: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.
code-review: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.
```

---

## host-cli — headless host CLI (`claude`/`codex`)

The `host-cli` provider reuses your already-installed, already-authenticated
`claude` or `codex` CLI instead of requiring a separately configured
`ANTHROPIC_API_KEY`. It spawns the binary in headless/non-interactive mode
(`claude -p "<prompt>" --output-format json`, or `codex exec --json
--skip-git-repo-check "<prompt>"` for a `codex`-named binary), parses its
stdout, and coerces it into a schema-valid verdict with the same
transport-agnostic JSON-extraction + repair-retry harness the `local`
provider uses (`packages/core/src/verify/json-repair.ts`) — only the
transport differs (subprocess spawn/capture vs. an HTTP `fetch` call).

It is selected per verifier family the same way as `mock`/`anthropic`/`local`
(see [Per-gate provider configuration](#per-gate-provider-configuration)
below). Today only the `per-task-verify` gate (`perTaskVerifier` config
key) has a real `host-cli`-backed verifier wired up — see
[Current scope](#current-scope-per-task-verify-only) — so that is the gate to
point at it to get real host-CLI verification:

```sh
cadence config set perTaskVerifier.provider host-cli
```

`cadence activate --provider host-cli` (no `--all`) only flips the
top-level `verifier` seam (the `deep-verify` gate), which is **not** the
wired family — use `--all` to also flip `perTaskVerifier` (and every other
seam) to `host-cli` in one step:

```sh
cadence activate --provider host-cli --all
```

`cadence settle run --deep --verifier host-cli` is accepted by the CLI (T5),
but it overrides the `deep-verify` gate specifically, which has no `host-cli`
builder yet — it will fall back to mock with a warning until that family is
wired in a follow-up.

### Binary discovery

The binary name/path is discovered the same way `local`'s base URL and model
are — via `CADENCE_HOST_CLI_BIN` (env var or a `.env` file at the repo root),
not a new config schema field:

```sh
export CADENCE_HOST_CLI_BIN=/usr/local/bin/codex   # optional override
```

If unset, it defaults to `claude` on PATH. The CLI family (which flags to
use, how to parse the output) is inferred from the binary's basename — a
`codex`-named binary gets `codex exec --json …`; everything else is treated
as `claude`.

### Current scope: per-task-verify only

Only the `per-task-verify` gate (`perTaskVerifier` config key, the family
that fires at `build task --status=DONE`) has a real `host-cli`-backed
verifier class wired up so far (`HostCliPerTaskVerifier` in
`packages/core/src/verify/per-task.ts`). The other five verifier
families — the top-level `verifier` slice (the `deep-verify` gate),
`codeReview`, `planReview`, `securityAudit`, and `specReview` — have no
`host-cli` builder yet, so selecting `provider: 'host-cli'` on any of them
falls back to `mock` with a stderr warning:

```
verifier: host-cli provider requested but this verifier family has not wired a host-cli builder yet — falling back to mock provider.
code-review: host-cli provider requested but this verifier family has not wired a host-cli builder yet — falling back to mock provider.
```

This is current scope for this provider, not a bug — wiring the remaining
five families, including `deep-verify` itself, is a follow-up.

### Fallback behavior

If the binary is missing (`ENOENT`) or the spawned process exits non-zero
(the common shape of an unauthenticated CLI, e.g. "not logged in"), the call
transparently falls back to `mock` for that call, with the same
stderr-warning pattern used by `anthropic`/`local`:

```
per-task-verify: host-cli provider failed (not-found: host-cli provider: binary "claude" not found on PATH) — falling back to mock provider for this call.
```

The fallback is per-call and lazy — there is no upfront probe of whether the
binary exists or is authenticated, the same way `local`/`anthropic` don't
probe connectivity at selection time either. It never hangs waiting on
interactive auth: stdin is not piped to the child process, so a CLI that
opportunistically reads stdin when it isn't a TTY sees an immediate EOF
instead of blocking.

**Known limitation:** the subprocess transport has no spawn timeout. A
process that hangs without ever closing stdout or exiting (as opposed to
exiting non-zero or erroring) is not caught by this fallback — the call
would hang rather than falling back to mock. This is a known gap, documented
honestly rather than fixed in this slice; it is out of scope per the phase's
boundaries.

### Readiness reporting caveat

`cadence doctor` and `cadence activate` report `host-cli` as **ready** based
on config well-formedness alone — `host-cli` has no required credential by
design, so readiness here just means "nothing is missing," not "the binary
is confirmed installed and authenticated." Whether the binary actually
exists and is logged in is only discovered lazily on the first real
verification call. Don't be surprised if `doctor` reports `host-cli` as
ready and a subsequent gate run still falls back to mock — that fallback,
with its stderr warning, is the actual live check.

### Deferred: batching + quota transparency

Batching multiple ACs into a single subprocess spawn per gate run, and
surfacing quota-transparency messaging (host-cli verification consumes your
host-CLI subscription's usage, not a separately metered API key), are both
explicitly deferred — not implemented by this provider today.

---

## Per-gate provider configuration

Each AI gate has its own provider and optional model config key in
`.cadence/config.json`. Configure them with `cadence config set` or edit the
JSON directly.

| Gate | Config key prefix | Factory source |
|---|---|---|
| `deep-verify` | `verifier` | `packages/core/src/verify/factory.ts` |
| `per-task-verify` | `perTaskVerifier` | `packages/core/src/verify/per-task-factory.ts` |
| `code-review` | `codeReview` | `packages/core/src/verify/code-review-factory.ts` |
| `plan-review` | `planReview` | `packages/core/src/verify/plan-review-factory.ts` |
| `security-audit` | `securityAudit` | `packages/core/src/verify/security-audit-factory.ts` |
| `spec-review` | `specReview` | `packages/core/src/verify/spec-review-factory.ts` |

Example: run the deep verifier on Anthropic, per-task checks on a local model,
and leave everything else on mock:

```sh
cadence config set verifier.provider anthropic
cadence config set perTaskVerifier.provider local
cadence config set perTaskVerifier.model mistral-nemo
```

Verify the resulting config:

```sh
cadence config get verifier.provider
cadence config get perTaskVerifier.provider
cadence config get perTaskVerifier.model
```

Run `config doctor` to surface any inconsistencies (e.g. provider set but
required env var absent):

```sh
cadence config doctor
```

---

## Which gate fires in which cell

Gates that call providers only fire in specific profile × tier cells. The full
gate matrix is documented in
[docs/concepts.md — Gate matrix](concepts.md#the-gate-universe). Quick
reference for provider-using gates:

| Gate | Provider config key | Fires at |
|---|---|---|
| `per-task-verify` | `perTaskVerifier` | `build task --status=DONE` (in cells that include it) |
| `deep-verify` | `verifier` | `settle run --deep` or cells that include it |
| `code-review` | `codeReview` | `settle run` (in cells that include it) |
| `plan-review` | `planReview` | `draft approve` (in cells that include it) |
| `security-audit` | `securityAudit` | `settle run` after code-review (in cells that include it) |
| `spec-review` | `specReview` | `spec approve` (always, whenever the pre-DRAFT spec stage is used) |

"Cells that include it" refers to the profile × tier intersection — e.g.
`per-task-verify` fires in `strict × standard` and `strict × complex` but not
in `auto` or `quick-fix` rows. See the gate matrix for the full picture.

`spec-review` is the exception: it is not a gate-matrix cell. It runs
unconditionally at `cadence spec approve` — opting into the pre-DRAFT spec
stage *is* the opt-in. Bypass a failing/unconverged spec-review with
`--allow-spec-review-failure`.

---

## Selecting a provider at the command line (Phase 73)

The `deep-verify` gate's provider is normally read from `config.verifier`. To
override it for a single run — without editing config — pass `--verifier`:

```sh
cadence settle run --deep --verifier anthropic   # force the real provider once
cadence settle run --deep --verifier mock        # force the offline stub once
```

Precedence is **flag > config > default `mock`**. An invalid value is rejected
at parse time (it does not silently downgrade). The mock-fallback banner honors
the *effective* provider, so an explicit `--verifier mock` still warns that the
results are not real, and `--verifier anthropic` suppresses the banner only when
the provider can actually be built (a missing `ANTHROPIC_API_KEY` still
warn-falls-back to mock).

### Token usage in the SUMMARY

When the `deep-verify` gate runs against a real provider, the SUMMARY's
`deepVerifyMeta` records the token usage the provider reported —
`inputTokens` / `outputTokens` — from Anthropic's `usage` field, or from a
`local` endpoint that returns an OpenAI-style `usage` block. Dollar cost is
**not** derived (no built-in price table); compute it downstream from the token
counts and your provider's rates if you need it.

---

## Deep-verify prompt id-binding (Phase 29.7)

The `deep-verify` gate (and the `per-task-verify` gate on the Anthropic
provider) uses hardened prompt id-binding: the user message explicitly
instructs the model to return exactly one verdict per AC id using the **exact
id string** from the input (e.g. `AC-1`, `AC-2`), and the response schema
is validated with Zod. If the model returns an unrecognized or renumbered id,
the result fails validation and triggers a repair retry (up to 2 retries for
the `local` provider; the Anthropic provider uses `messages.parse` structured
output which enforces the schema at the API level).

This means:

- AC ids in your DRAFT must be stable strings (e.g. `AC-1`, `AC-2`) — do not
  renumber them between draft creation and settle.
- If the verifier returns `pass=false` for an AC, the reason field cites the
  specific gap (≤ 200 characters); read it before deciding whether to bypass
  with `--allow-verifier-failure` or `--force`.

---

*See also: [docs/cli.md](cli.md) — engine how-to |
[docs/claude-code.md](claude-code.md) — host adapter how-to |
[docs/concepts.md](concepts.md) — gate universe and provider concepts |
[docs/reference/config.md](reference/config.md) — full config field reference*
