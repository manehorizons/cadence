# Provider Setup How-To

CADENCE delegates AI gate work to a **provider**. Three providers are
available: `mock` (offline, no config needed), `anthropic` (Anthropic API),
and `local` (any OpenAI-compatible endpoint, e.g. Ollama). Each gate that
calls an AI verifier can be configured independently.

For a conceptual overview of providers and the gate universe they serve, see
[docs/concepts.md — Providers](concepts.md#providers) and
[docs/concepts.md — The gate universe](concepts.md#the-gate-universe).

---

## Table of contents

- [Provider overview](#provider-overview)
- [mock — offline deterministic default](#mock--offline-deterministic-default)
- [anthropic — Anthropic API](#anthropic--anthropic-api)
- [local — OpenAI-compatible endpoint](#local--openai-compatible-endpoint)
  - [Per-gate model override](#per-gate-model-override)
  - [Warn + mock fallback](#warn--mock-fallback)
- [Per-gate provider configuration](#per-gate-provider-configuration)
- [Which gate fires in which cell](#which-gate-fires-in-which-cell)
- [Deep-verify prompt id-binding (Phase 29.7)](#deep-verify-prompt-id-binding-phase-297)

---

## Provider overview

| Provider | What it does | What it requires |
|---|---|---|
| `mock` | Deterministic offline implementation; always returns a pre-set verdict | Nothing — the default everywhere |
| `anthropic` | Calls the Anthropic API using `messages.parse` with structured output; prompt-caches the system prompt | `ANTHROPIC_API_KEY` in environment |
| `local` | POSTs to an OpenAI-compatible `/v1/chat/completions` endpoint; parses JSON output with repair retries | `CADENCE_LOCAL_BASE_URL` + a model name (env or config) |

---

## mock — offline deterministic default

`mock` is the default for every gate. No environment variables or config
changes are needed. It is ideal for:

- Getting started without an API key
- CI pipelines that should not make network calls
- Testing CADENCE's loop mechanics without paying for inference

To confirm a gate is using mock, run:

```sh
node packages/core/bin/cadence.cjs config get verifier.provider
```

If it prints nothing or `mock`, mock is active.

---

## anthropic — Anthropic API

Set the environment variable and configure the gate:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
node packages/core/bin/cadence.cjs config set verifier.provider anthropic
```

The Anthropic provider uses `messages.parse` with a `zodOutputFormat`-backed
output schema, so the model returns structured JSON directly. The system
prompt is sent with `cache_control: { type: "ephemeral" }` so repeated calls
within a session benefit from prompt caching.

Default model used when no per-gate `model` override is set: `claude-sonnet-4-6`
(from `AnthropicVerifier` in `packages/core/src/verify/anthropic-verifier.ts`).

To use a different model for a specific gate:

```sh
node packages/core/bin/cadence.cjs config set verifier.model claude-opus-4-5
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
node packages/core/bin/cadence.cjs config set verifier.provider local
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
node packages/core/bin/cadence.cjs config set perTaskVerifier.model mistral-nemo
node packages/core/bin/cadence.cjs config set codeReview.model llama3.3
```

Resolution order per gate: `config.<gate>.model` → `CADENCE_LOCAL_MODEL`.

`CADENCE_LOCAL_BASE_URL` is always required and has no per-gate config
override; all gates share the same endpoint.

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

Example: run the deep verifier on Anthropic, per-task checks on a local model,
and leave everything else on mock:

```sh
node packages/core/bin/cadence.cjs config set verifier.provider anthropic
node packages/core/bin/cadence.cjs config set perTaskVerifier.provider local
node packages/core/bin/cadence.cjs config set perTaskVerifier.model mistral-nemo
```

Verify the resulting config:

```sh
node packages/core/bin/cadence.cjs config get verifier.provider
node packages/core/bin/cadence.cjs config get perTaskVerifier.provider
node packages/core/bin/cadence.cjs config get perTaskVerifier.model
```

Run `config doctor` to surface any inconsistencies (e.g. provider set but
required env var absent):

```sh
node packages/core/bin/cadence.cjs config doctor
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

"Cells that include it" refers to the profile × tier intersection — e.g.
`per-task-verify` fires in `strict × standard` and `strict × complex` but not
in `auto` or `quick-fix` rows. See the gate matrix for the full picture.

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
