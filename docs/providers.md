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
  - [Verifier family coverage](#verifier-family-coverage)
  - [Fallback behavior](#fallback-behavior)
  - [Quota-transparency notice](#quota-transparency-notice)
  - [Self-invocation guard](#self-invocation-guard)
  - [Readiness reporting caveat](#readiness-reporting-caveat)
  - [Deferred: batching](#deferred-batching)
- [Per-gate provider configuration](#per-gate-provider-configuration)
- [Which gate fires in which cell](#which-gate-fires-in-which-cell)
- [Producing a real-provider code-review or security-audit finding (conduction, Phase 251)](#producing-a-real-provider-code-review-or-security-audit-finding-conduction-phase-251)
  - [Check reachability first with cadence doctor](#check-reachability-first-with-cadence-doctor)
  - [code-review procedure](#code-review-procedure)
  - [security-audit procedure](#security-audit-procedure)
  - [Confirming it actually produced a real finding](#confirming-it-actually-produced-a-real-finding)
- [providerSelection — configured vs. fallback vs. empty-diff provenance (Phase 263)](#providerselection--configured-vs-fallback-vs-empty-diff-provenance-phase-263)
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
you are still on mock. Since phase 239 it checks **every** seam, not just
deep-verify: a seam left on a real provider whose credentials are absent is
reported by name, because it will silently fall back to mock at call time.

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

> **Not the same login as Claude Code.** Being logged into Claude Code (an
> OAuth/subscription session) does not satisfy this provider. `anthropic`
> calls the Anthropic SDK directly, with zero visibility into Claude Code's
> own credential store, and requires a separately API-billed
> `ANTHROPIC_API_KEY`. If you'd rather reuse your Claude Code or Codex CLI
> login instead of a raw API key, see
> [host-cli](#host-cli--headless-host-cli-claudecodex) below.

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
anthropic` is configured, CADENCE emits a loud multi-line stderr banner and
falls back to mock rather than failing hard (Phase 243 — this credential-
missing downgrade gets the same loud framing as the mock-verifier banner,
not a bare one-liner):

```

  ⚠  MOCK = NOT REAL VERIFICATION
     verifier: anthropic provider requested but ANTHROPIC_API_KEY is unset (a Claude Code/IDE login does not satisfy this — anthropic calls the Anthropic SDK directly and needs a separately API-billed key) — falling back to mock provider.
     The `mock` verifier is a deterministic, offline placeholder that only checks each AC links to a test — it is NOT real verification. Run `cadence activate` to turn on a real AI verifier.
     https://github.com/thomas-powers-jr/cadence/blob/main/docs/providers.md

```

The same fallback applies to every gate (`per-task-verify`, `code-review`,
`plan-review`, `security-audit`) — each emits a gate-prefixed version of the
same banner.

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
with the same loud, gate-prefixed banner described above (Phase 243), e.g.:

```

  ⚠  MOCK = NOT REAL VERIFICATION
     verifier: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.
     The `mock` verifier is a deterministic, offline placeholder that only checks each AC links to a test — it is NOT real verification. Run `cadence activate` to turn on a real AI verifier.
     https://github.com/thomas-powers-jr/cadence/blob/main/docs/providers.md

```

(`per-task-verify` and `code-review` emit the equivalent banner with their
own gate label in place of `verifier`.)

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
below). Every verifier family has a real `host-cli`-backed verifier wired up
— see [Verifier family coverage](#verifier-family-coverage) — so any of them
can be pointed at it to get real host-CLI verification, e.g.:

```sh
cadence config set perTaskVerifier.provider host-cli
```

`cadence activate --provider host-cli --all` flips every seam to `host-cli`
in one step; `cadence activate --provider host-cli` (no `--all`) flips only
the top-level `verifier` seam (the `deep-verify` gate) — use `--all` if you
want every family switched at once:

```sh
cadence activate --provider host-cli --all
```

`cadence settle run --deep --verifier host-cli` (T5) overrides the
`deep-verify` gate specifically — like every other family, it has a real
`host-cli` builder, so this is real host-CLI verification, not a mock
fallback.

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

### Verifier family coverage

Every verifier family has a real `host-cli`-backed verifier class wired up:
`per-task-verify` (`HostCliPerTaskVerifier`, phase 165), `deep-verify`
(`verifier` slice), `code-review`, `plan-review`, `security-audit`, and
`spec-review` (all five wired together in phase 191, shipped v1.46.0), and
`ui-spec-review` (`HostCliUiSpecReviewVerifier`, phase 205, wired from
introduction). See [Per-gate provider
configuration](#per-gate-provider-configuration) for the full family →
config key → factory source mapping.

The `hostCli` builder is optional per family at the type level
(`VerifierFactorySpec.hostCli?`), precisely so a *future* family can land
without every existing factory file changing in lockstep. A family that
hasn't supplied one yet falls back to `mock` with a stderr warning:

```
<family>: host-cli provider requested but this verifier family has not wired a host-cli builder yet — falling back to mock provider.
```

No shipped family is in that state today — the line above is what you'd see
if a new gate added a provider slice before its `host-cli` class landed, not
a description of current scope.

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

Every host-cli failure reason — `not-found`, `spawn-error`, `nonzero-exit`,
`output-error`, `self-invocation` (see [Self-invocation
guard](#self-invocation-guard)), and `timeout` (a hung subprocess; see
below) — flows through this same per-call fallback path and warning format
(`HostCliError`'s `reason` and `message`), never a second parallel fallback
mechanism. For example:

```
per-task-verify: host-cli provider failed (self-invocation: host-cli provider: refusing to spawn "claude" — cadence is already running inside a headless "claude" session (detected via CLAUDECODE=1). Spawning another headless call here risks an unbounded nested self-invocation of the same host CLI. Falling back to mock for this call.) — falling back to mock provider for this call.

per-task-verify: host-cli provider failed (timeout: host-cli provider: "claude" timed out after 180000ms without closing stdout or exiting (the spawned host-CLI subprocess's documented "never exits" limitation — see docs/providers.md) — the subprocess was killed.) — falling back to mock provider for this call.
```

**Spawn timeout.** The subprocess transport bounds how long it will wait for
the spawned host-CLI process to close stdout or exit. The timeout defaults
to 3 minutes (`180000` ms) and is configurable via `CADENCE_HOST_CLI_TIMEOUT_MS`
(env var or a `.env` file at the repo root, discovered the same way as
`CADENCE_HOST_CLI_BIN`):

```sh
export CADENCE_HOST_CLI_TIMEOUT_MS=60000   # optional override, in ms
```

If the subprocess neither closes stdout nor exits before the timeout
elapses, it is killed (`SIGKILL`) and the call rejects with a `timeout`
`HostCliError`, which is caught by the same fallback path as every other
host-cli failure reason above — the call degrades to `mock` for that call
with a stderr warning rather than hanging. A non-numeric or non-positive
`CADENCE_HOST_CLI_TIMEOUT_MS` value is treated as unset and falls back to
the 3-minute default.

### Quota-transparency notice

The first time a `host-cli` call actually spawns a subprocess — not when the
provider is merely selected in config — CADENCE writes a one-time,
always-visible stderr banner:

```
  ⚠  HOST-CLI PROVIDER: SUBSCRIPTION QUOTA IN USE
     This verification call runs through your host CLI's own
     subscription/usage quota — not a separately metered API key.
```

This fires exactly once per process, regardless of how many `host-cli` calls
are made afterward, and only when a real spawn is attempted (selecting
`provider: 'host-cli'` in config without ever calling a wired gate never
triggers it). It is stderr-only — it never touches stdout, which is reserved
for `--json` output and the MCP stdio protocol — and it is a direct,
always-on write rather than routed through the structured logger, so it
stays visible even at the default silent log level. The point is purely
transparency: unlike `anthropic`/`local`, a `host-cli` call has no separately
metered cost you can see in an API dashboard — it draws down your `claude`/
`codex` subscription's own usage/rate limits instead, and this notice makes
that fact visible the first time it actually happens.

### Self-invocation guard

If cadence is itself already running inside a headless/non-interactive
session of the *same* host-CLI family it would spawn, `host-cli` refuses to
spawn a nested subprocess and falls back to `mock` for that call instead —
using the same per-call fallback path described above (`reason:
'self-invocation'`), not a second mechanism.

For the `claude` family, this is detected via `CLAUDECODE=1`, the session
environment variable Claude Code documents as being set "in subprocesses
Claude Code spawns (Bash and PowerShell tools, tmux sessions, hook commands,
status line commands, stdio MCP server subprocesses)" — IDE integrated
terminals set it too.

**This has a first-order operator-facing consequence, not just a narrow
recursion edge case:** if you are running `cadence` from *within* a Claude
Code terminal, a Claude Code hook, or a Claude Code Bash tool call —
including the ordinary subagent-driven-build workflow this repo itself
uses — `host-cli` calls will **always** fall back to `mock`, every time,
because `CLAUDECODE=1` is ambient in that shell. This is intentional
self-invocation protection, not a bug: it is exactly as likely to trigger
from cadence's own everyday operator workflow as from a genuine
cadence-spawns-claude-spawns-cadence recursion, and both are guarded the
same way. If you need real `host-cli` verification, run the `cadence`
command from a plain terminal/CI job outside any Claude Code process, where
`CLAUDECODE` is unset.

The `codex` family is **not** guarded. The only candidate session variable,
`CODEX_SANDBOX`, is undocumented in OpenAI's official Codex CLI docs and is
narrower than a reliable family-wide session signal even where it appears
(only set under the macOS Seatbelt sandbox backend, not on Linux or other
sandbox modes, and not universal across `codex exec` invocations) — guessing
at it would risk false negatives/positives, so `codex` self-invocation is
left unguarded until a documented signal exists.

### Readiness reporting caveat

`cadence doctor` and `cadence activate` report `host-cli` as **ready** based
on config well-formedness alone — `host-cli` has no required credential by
design, so readiness here just means "nothing is missing," not "the binary
is confirmed installed and authenticated." Whether the binary actually
exists and is logged in is only discovered lazily on the first real
verification call. Don't be surprised if `doctor` reports `host-cli` as
ready and a subsequent gate run still falls back to mock — that fallback,
with its stderr warning, is the actual live check.

### Deferred: batching

Batching multiple ACs into a single subprocess spawn per gate run is
explicitly deferred — not implemented by this provider today. (Quota
transparency, previously listed here as deferred alongside batching, is now
implemented — see [Quota-transparency notice](#quota-transparency-notice).)

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
| `ui-spec-review` | `uiSpecReview` | `packages/core/src/verify/ui-spec-review-factory.ts` |

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
| `ui-spec-review` | `uiSpecReview` | `spec approve`, only when a sibling `<id>-UI-SPEC.md` exists |

"Cells that include it" refers to the profile × tier intersection — e.g.
`per-task-verify` fires in `strict × standard` and `strict × complex` but not
in `auto` or `quick-fix` rows. See the gate matrix for the full picture.

`spec-review` is the exception: it is not a gate-matrix cell. It runs
unconditionally at `cadence spec approve` — opting into the pre-DRAFT spec
stage *is* the opt-in. Bypass a failing/unconverged spec-review with
`--allow-spec-review-failure`.

`ui-spec-review` is also not a gate-matrix cell — it runs at `cadence spec
approve` alongside `spec-review`, but only when the phase's DRAFT has a
sibling `<id>-UI-SPEC.md` design contract; a phase with no UI-SPEC never
triggers it, regardless of profile/tier. Bypass with
`--allow-ui-spec-review-failure`.

---

## Producing a real-provider code-review or security-audit finding (conduction, Phase 251)

`code-review` and `security-audit` are the two most locked-down gates in the
matrix. Configuring a real provider for either one is necessary but not
sufficient — each gate is independently gated by up to three axes (profile,
provider, session), and **the two gates are not symmetric**: `security-audit`
is reachable at a single, narrower profile×tier cell than `code-review`, and
this repo's own `.cadence/config.json` blocks it on a second axis besides.
Follow the two procedures below separately — do not treat this as one
unified checklist. (This section documents the operator procedure recorded
by `dec-20260803-001`, linked to `rec-20260801-012`: the self-invocation
guard and the `auto`-profile gate set are both deliberately retained — see
[Self-invocation guard](#self-invocation-guard) — so producing a real finding
is, by design, a human-operator act performed from outside a headless agent
session, never something a flag or env var unlocks from inside one.)

### Check reachability first with cadence doctor

Before attempting either procedure below, check whether it's even needed:

```sh
cadence doctor
```

Read the `conduction-reachability` check's result. It evaluates, separately
for `code-review` and `security-audit`, whether this repo's *current*
configuration can produce a real (non-mock) finding at all, across three
axes:

- **profile** — is the gate present in `gatesFor(tier, profile).gates` at
  any `Tier`, for the project's `effectiveProfile(config, null)`?
- **provider** — is the gate's own seam (`codeReview.provider` /
  `securityAudit.provider`) still `'mock'`?
- **session** — is the gate's own provider `'host-cli'` *and* is this a
  headless Claude Code session (`CLAUDECODE=1`)? (The session axis never
  blocks a gate configured to `anthropic`/`local`/`mock` — the
  self-invocation guard only sits inside the `host-cli` spawn path.)

`status: 'ok'` means both gates are reachable today and neither procedure is
needed. `status: 'warning'` names, in its `detail` field, exactly which axis
or axes block which gate, and its `remediation` field gives the fix for each
one. There is no `--fix` for this check (`fixId: null`) — every remediation
below is an operator decision, not something safe to auto-apply.

### code-review procedure

1. **Clear the profile axis.** Override `profile:` in the DRAFT's own
   frontmatter — not a CLI flag; `draft.profile` wins over `config.profile`
   in `effectiveProfile()` (`gates/engine.ts`):

   ```yaml
   profile: standard   # tier: complex only
   # or
   profile: strict      # tier: standard OR complex
   ```

   Any of these three profile×tier cells — `standard`×`complex`,
   `strict`×`standard`, `strict`×`complex` — includes `code-review` in the
   gate set (`gates/engine.ts`'s `DELTAS` matrix). The project default
   (`auto` profile) never does, at any tier.

2. **Clear the provider axis.** `codeReview.provider` must not be `mock`:

   ```sh
   cadence config get codeReview.provider
   cadence config set codeReview.provider host-cli   # or anthropic / local
   ```

3. **Clear the session axis.** Run `cadence settle run` from a real
   interactive terminal — a plain shell, not a headless Claude Code session,
   hook, or Bash-tool call (`CLAUDECODE` must be unset). If
   `codeReview.provider` is `host-cli` and `CLAUDECODE=1` is set, the
   self-invocation guard (`isSelfInvocation`, `host-cli-client.ts`) fires and
   falls back to `mock` for that call, by design — see
   [Self-invocation guard](#self-invocation-guard). A gate on
   `anthropic`/`local` is unaffected by this axis.

4. **Run the settle** from that terminal:

   ```sh
   cadence settle run
   ```

### security-audit procedure

`security-audit` is strictly narrower than `code-review` on the profile
axis, and this repo's own `.cadence/config.json` currently blocks it on the
provider axis too (`securityAudit.provider: 'mock'`) — clearing
`code-review`'s blockers does **not** clear `security-audit`'s. Treat it as
its own procedure:

1. **Clear the profile axis.** `security-audit`'s *only* reachable
   profile×tier cell is `strict`×`complex` — nothing else works:

   ```yaml
   profile: strict   # tier: complex — the only cell that includes security-audit
   ```

2. **Clear the provider axis.** Reconfigure `securityAudit.provider` off
   `mock` — via a direct config edit, or `cadence activate`:

   ```sh
   cadence config set securityAudit.provider host-cli   # or anthropic / local
   # or, to flip every seam at once (including securityAudit):
   cadence activate --provider host-cli --all
   ```

   Reconfiguring this default is an ordinary, sanctioned config change (an
   operator can do it independently, any time) — it is not the same kind of
   decision as the profile override above, which is scoped to a single
   DRAFT.

3. **Clear the session axis**, same as `code-review` above: run from a real
   interactive terminal, `CLAUDECODE` unset, if the resolved provider is
   `host-cli`.

4. **Run the settle**:

   ```sh
   cadence settle run
   ```

### Confirming it actually produced a real finding

Don't infer success from the run completing quietly — read the persisted
SUMMARY. Two places carry provider identity:

- `SUMMARY.json`'s `gates[]` array (`GateProvenance[]`): find the entry with
  `gate: 'code-review'` (or `'security-audit'`) and check its `provider`
  field is not `'mock'` (and, if populated, its `model` field).
- `SUMMARY.json`'s `assurance.verifierRollup[]`: an array of `{ provider,
  model?, gateCount }` grouped across every gate that carried verifier
  identity — a non-`mock` `provider` entry there confirms it too.

**Do not look for a field called `verifierIdentity`** — that name belongs to
an internal `GateFlags` field used during gate evaluation only. By the time
a result is persisted, `gates/registry.ts` has already lifted it onto the
`GateProvenance` entry's `provider`/`model` fields above; `verifierIdentity`
itself never appears in a written SUMMARY.

If the mock-fallback banner (`⚠ MOCK = NOT REAL VERIFICATION`, see
[mock — offline deterministic default](#mock--offline-deterministic-default)
above) printed to stderr during the run, the finding is mock regardless of
what the SUMMARY otherwise looks like — the banner and the persisted
`provider` field always agree.

---

## providerSelection — configured vs. fallback vs. empty-diff provenance (Phase 263)

`provider`/`model` on a persisted `GateProvenance` entry (see [Confirming it
actually produced a real finding](#confirming-it-actually-produced-a-real-finding)
above) always agree with the mock-fallback banner — a fallback, whether it
happens at selection time or call time, resolves to the mock verifier and
its result carries `provider: 'mock'`, same as a gate genuinely configured
to mock on purpose. That is exactly the ambiguity `provider` alone cannot
resolve: a `provider: 'mock'` entry looks identical whether mock was the
operator's actual configured choice or a silent downgrade from
`anthropic`/`local`/`host-cli`. An optional `providerSelection` field on
`GateProvenance` closes that gap by naming which of three epistemically
distinct states produced the entry:

- **`configured`** — the provider actually run was the operator's real
  configured choice (including a deliberately configured `mock`).
- **`fallback`** — the gate silently fell back to `mock`, either at
  selection time (`createVerifierFactory`, e.g. a missing
  `ANTHROPIC_API_KEY`, unset `local` base URL/model, or a verifier family
  with no `host-cli` builder wired) or at call time (`wrapWithFallback`'s
  Proxy, e.g. a `host-cli` spawn failure) — any fallback in a run wins over
  any successful call in the same run.
- **`empty-diff`** — `code-review`/`security-audit` were configured to a
  real (non-mock) provider and it was called, but `touchedFiles` was
  non-empty while `ctx.diff()` was empty, so the call was structurally
  unable to judge anything.

`providerSelection` is persisted for five of the seven verifier seams:
`code-review`, `security-audit` (lifted onto the `GateProvenance` entry the
same way `provider`/`model` already are) and `spec-review`,
`ui-spec-review`, `plan-review` (threaded into `runConvergentReview`'s
`<id>-SPEC-REVIEW.json` / `<id>-UI-SPEC-REVIEW.json` /
`<id>-PLAN-REVIEW.json` sidecar files). `deep-verify` and `per-task-verify`
are deliberately excluded from persistence — neither persists *any*
provider/model identity into `gates[]` today, and this repo's own
`perTaskVerifier.provider`/`verifier.provider` are already `host-cli`;
adding baseline provider persistence to either as a side effect here would
grow `deriveAssuranceRecord`'s `verifierRollup` with real `host-cli`
entries on ordinary auto-profile settles, silently moving
`assurance.overall` toward `strong` with no review gate having actually
run — the exact false-confidence failure this field exists to make
visible elsewhere, not something to introduce as a byproduct. That gap is
tracked separately (`dec-20260808-008`), not closed by this phase.

The field is additive and optional with no `.default(...)` — it is absent
from every `SUMMARY.json` written before Phase 263, and stays absent
afterward for any settle where the tagged gate didn't run
(`status !== 'ran'`) or ran on one of the two untagged seams. To count
`providerSelection` values across every `SUMMARY.json` in this repo's
`.cadence/phases/` corpus in one command:

```sh
find .cadence/phases -name "*-SUMMARY.json" -print0 | xargs -0 node -e '
const fs = require("fs");
const counts = { configured: 0, fallback: 0, "empty-diff": 0, absent: 0 };
let files = 0, gates = 0;
for (const f of process.argv.slice(1)) {
  files++;
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const gateList = Array.isArray(data.gates) ? data.gates : [];
  for (const g of gateList) {
    gates++;
    const ps = g && g.providerSelection;
    if (ps === "configured" || ps === "fallback" || ps === "empty-diff") {
      counts[ps]++;
    } else {
      counts.absent++;
    }
  }
}
console.log(JSON.stringify({ filesScanned: files, gatesScanned: gates, counts }, null, 2));
'
```

See
`.cadence/phases/263-provider-selection-provenance/263-01-QUERY-EVIDENCE.md`
for this exact command's actual recorded output against this repo's own
corpus (including a positive-control run proving it can detect a non-zero
result), plus the `cadence summary verify` sweep proving the new field
didn't retroactively change any historical record's content hash.

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
