# Configuration Reference

**File:** `.cadence/config.json`

This page documents every field in the CADENCE configuration file. For conceptual explanations of profiles, gates, tiers, and providers, see [docs/concepts.md](../concepts.md). For provider setup (env vars, fallback behavior), see [docs/providers.md](../providers.md).

`cadence init` writes an initial `config.json` from the chosen preset and then overlays several detected values: `profile` (from `--gate-profile` or git-history suggestion), `verification.testGlobs` (from repo layout and detected project language), and `verification.coverageMode` (from detected project language) — see [cadence init behavior](#cadence-init-behavior).

> **Unsure what your config actually does?** Don't read this whole page — run [`cadence config explain`](#reading-your-config--cadence-config-explain). It renders your *active* configuration in plain language: which gates fire for each tier, which provider backs each gate, and any config-semantic foot-guns (e.g. a real provider set with no API key).

To change the behavior-shaping keys interactively, use [`cadence config edit`](./commands.md#config-edit); to see what your current config does, [`cadence config explain`](./commands.md#config-explain).

---

## Table of contents

- [Top-level fields](#top-level-fields)
- [subagentPolicy](#subagentpolicy)
- [modelPerClass](#modelperclass)
- [templates](#templates)
- [hooks](#hooks)
- [packs](#packs)
- [telemetry](#telemetry)
- [tier](#tier)
- [verification](#verification)
- [skillAudit](#skillaudit)
- [convergence](#convergence)
- [Gate provider blocks](#gate-provider-blocks)
- [notify](#notify)
- [logging](#logging)
- [phaseGuard](#phaseguard)
- [handoff](#handoff)
- [resume](#resume)
- [recommendations](#recommendations)
- [gates](#gates)
- [Reading your config — `cadence config explain`](#reading-your-config--cadence-config-explain)
- [Presets](#presets)
- [cadence init behavior](#cadence-init-behavior)

---

## Top-level fields

| Field | Type | Default | Description |
|---|---|---|---|
| `$schema` | `string` (optional) | — | JSON Schema URL for editor validation. Omit if not using a schema validator. |
| `schemaVersion` | `1` (literal) | — | Must be `1`. Required. Signals the config format version to the parser. |
| `profile` | `"strict" \| "standard" \| "auto"` | `"auto"` | Gate-involvement profile. Controls how many gates fire per phase. See [Profiles × tiers](../concepts.md#profiles--tiers). |
| `loopEnforcement` | `"strict" \| "soft" \| "reminder"` | `"soft"` | How hard CADENCE pushes back on out-of-loop actions. `strict` refuses; `soft` warns and continues; `reminder` logs only. |
| `acDiscipline` | `"strict" \| "tier-scaled" \| "optional"` | `"tier-scaled"` | AC (acceptance-criteria) discipline level. `strict` requires every task to have ACs; `tier-scaled` scales requirements by tier; `optional` does not enforce. |
| `workstreamBackend` | `"simple" \| "multi-branch" \| "custom:<id>"` | `"simple"` | Storage backend for workstream state. `simple` uses a single `.cadence/` dir; `multi-branch` manages one dir per git branch; `custom:<id>` delegates to a registered plugin. |
| `ruleProvider` | `"trigger-taxonomy" \| "carl" \| "custom:<id>"` | `"trigger-taxonomy"` | Source of trigger-rule definitions. `trigger-taxonomy` is the built-in ruleset; `carl` is an alternate built-in; `custom:<id>` loads a plugin. |
| `commitCadence` | `"task" \| "draft" \| "manual"` | `"draft"` | When CADENCE recommends committing. `task` = after each task; `draft` = after each settled phase; `manual` = never auto-prompted. |

---

## subagentPolicy

Controls subagent dispatch thresholds.

| Field | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `subagentPolicy.contextBudgetThreshold` | `number` | `0.3` – `0.95` | `0.7` | Fraction of the context window consumed before CADENCE considers spawning a subagent (0.3–0.95). |
| `subagentPolicy.largeTaskTokens` | `integer` (positive) | — | `8000` | Token count above which a task is classified as "large" and may be routed to a subagent. |
| `subagentPolicy.mechanicalBatchMin` | `integer` (positive) | — | `3` | Minimum number of mechanical tasks required before CADENCE batches them into a single subagent dispatch. |

---

## modelPerClass

Maps task-complexity classes to model identifiers. Values are passed directly to the provider; use any model string your provider accepts.

| Field | Type | Default |
|---|---|---|
| `modelPerClass.mechanical` | `string` | `"claude-haiku-4-5-20251001"` |
| `modelPerClass.standard` | `string` | `"claude-sonnet-4-6"` |
| `modelPerClass.complex` | `string` | `"claude-opus-4-7"` |
| `modelPerClass.drafting` | `string` | `"claude-opus-4-7"` |

---

## templates

| Field | Type | Default | Description |
|---|---|---|---|
| `templates.dir` | `string` | `".cadence/templates"` | Directory CADENCE searches for template overrides. Relative to repo root. |
| `templates.overrides` | `string[]` | `[]` | List of template names that are replaced by files in `templates.dir`. |

---

## hooks

Boolean switches that enable or disable each Claude Code hook. Hooks are registered in `settings.json`; these flags tell CADENCE whether to install/activate them.

| Field | Type | Default | Description |
|---|---|---|---|
| `hooks.sessionStart` | `boolean` | `true` | Run the session-start hook (prints loop state at the top of each Claude session). |
| `hooks.stopReminder` | `boolean` | `true` | Run the stop-reminder hook (prints a commit/loop reminder when Claude stops). |
| `hooks.preToolUseBuildGate` | `boolean` | `false` | Run the pre-tool-use build gate hook (blocks destructive tool calls when a phase is mid-flight and no task is active). |
| `hooks.userPromptSubmit` | `boolean` | `true` | Run the user-prompt-submit hook (injects loop state into each human turn). |

---

## packs

Extension pack management.

| Field | Type | Default | Description |
|---|---|---|---|
| `packs.enabled` | `string[]` | `[]` | Pack IDs to activate. |
| `packs.disabled` | `string[]` | `[]` | Pack IDs to suppress even if auto-discovered. |

---

## telemetry

All telemetry is local unless `remoteOptIn` is `true`.

| Field | Type | Default | Description |
|---|---|---|---|
| `telemetry.tokenUtilization` | `boolean` | `true` | Track token counts per phase for the local usage report. |
| `telemetry.skillInvocations` | `boolean` | `true` | Track which skills fire per session for the local usage report. |
| `telemetry.remoteOptIn` | `boolean` | `false` | Send anonymized telemetry to the CADENCE telemetry endpoint. Off by default. |

---

## tier

Boundary definitions for each tier. The coherence-check gate validates DRAFT frontmatter against these values. See [Profiles × tiers](../concepts.md#profiles--tiers).

| Field | Type | Default | Description |
|---|---|---|---|
| `tier.quickFix.maxTasks` | `integer` | `1` | Maximum tasks allowed in a `quick-fix` phase. |
| `tier.quickFix.maxFiles` | `integer` | `1` | Maximum touched files allowed in a `quick-fix` phase. |
| `tier.standard.maxTasks` | `integer` | `5` | Maximum tasks allowed in a `standard` phase. |
| `tier.standard.maxFiles` | `integer` | `8` | Maximum touched files allowed in a `standard` phase. |
| `tier.complex.maxTasks` | `integer` | `999` | Upper cap on tasks for a `complex` phase (effectively unlimited). |
| `tier.complex.minTasks` | `integer` | `6` | Minimum tasks required in a `complex` phase. |

---

## verification

| Field | Type | Default | Description |
|---|---|---|---|
| `verification.testGlobs` | `string[]` | `["packages/**/*.test.ts", "packages/**/*.test.tsx"]` | Glob patterns the test-coverage scanner walks when checking AC coverage. Supports `**` and `*`. Set by `cadence init` based on repo layout and detected project language (Phase 166) — see [cadence init behavior](#cadence-init-behavior). |
| `verification.testCommand` | `string` (optional) | derived by `cadence init` — see [cadence init behavior](#cadence-init-behavior) | Shell command the `build-test-must-pass` gate runs at `cadence settle run`. When set, settle runs it and refuses on a non-zero exit unless `--allow-failing-build` / `--force`. When absent, the gate is evaluated but cannot enforce — it still passes, but (as of Phase 139) writes a loud, non-blocking stderr notice instead of passing silently. |
| `verification.coverageMode` | `"mention"` \| `"assertion"` | `"assertion"` for a fresh `cadence init` when the detected project language is js/ts, `"mention"` for every other detected or unknown language (Phase 166); the schema-level fallback for configs that predate this field stays `"mention"` | How the `test-coverage` gate counts an `AC-N` token. `mention` counts any occurrence of the token anywhere in a matched test file, including comments. `assertion` counts it only when it sits inside an asserting test block for that file's language; a comment-only or assertion-less mention is reported as a *weak link* and the gate refuses with a distinct hint (closing the "mentioned-but-not-tested" false positive). `assertion` mode has real span-parsing support for five built-in languages — js/ts, python, go, rust, php — dispatched per file by extension; see the [supported-language matrix](#supported-language-matrix-assertion-mode). Edit it with `cadence config edit coverageMode`. |
| `verification.coverageProfiles` | `CoverageProfileConfig[]` | `[]` | Operator-defined custom assertion-mode profiles that extend `assertion` mode to a language with no built-in profile. Validated at config-load time — a bad regex, a missing required field, or an extension collision with a built-in profile refuses loudly, naming the offending field/collision and suggesting a fix. Add-only: a custom profile can never override a built-in's extensions. See [Custom coverage profiles](#custom-coverage-profiles). |

### Supported-language matrix (assertion mode)

`assertion` mode's span-finder is one shared string/comment-aware engine (phase 167) parameterized by a per-language **profile**: an opener pattern (what counts as a test), an assertion pattern (what counts as asserting inside it), a comment/string table (so text inside comments/strings is never mistaken for code), and one of four block-boundary strategies. Each test file is dispatched to the profile registered for its extension; a file whose extension no profile claims — or a block shape no profile positively recognizes — contributes zero spans (false-negative-over-false-positive is the invariant: an unrecognized shape never fabricates a span). The table below is generated from, and kept in sync with, the live profile registry (`packages/core/src/verify/coverage-profiles/registry.ts`'s `listProfiles()`) by a doc-content test (`packages/core/tests/docs/coverage-language-matrix.test.ts`) that fails on drift in either direction — a profile added without a matching row here, or a row here with no matching profile, both fail the build.

<!-- cadence:coverage-languages:start -->
| Language | Profile id | Extensions | Block strategy | Recognized shape(s) |
|---|---|---|---|---|
| JS/TS | `js-ts` | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts` | `call-expression` | `it(...)` / `test(...)` calls, optionally chained with `.only`/`.skip`/`.todo`/`.concurrent`/`.failing`, asserting via `expect(...)`, a bare `assert`, or `.should`. `.skip`/`.todo`/`.failing` mark the test skipped — an intact assertion inside one does not count as qualifying coverage (Phase 169). |
| Python | `python` | `.py` | `indentation-delimited` | `[async ]def test_<name>(...):` — module-level or a class method (indentation is resolved relative to the `def` line itself, not the enclosing class) — asserting via a standalone `assert` statement. A `def` not prefixed `test_` is never an opener, matching pytest's own collection rule. |
| Go | `go` | `.go` | `brace-delimited` | `func Test<Name>(t *testing.T)` where `<Name>` is empty or starts with an uppercase letter, digit, or underscore (mirrors `go vet`'s own naming rule) and the parameter's declared type is literally `*testing.T`, asserting via `t.Error`/`t.Errorf`/`t.Fatal`/`t.Fatalf` or testify's `assert.<Method>(...)`/`require.<Method>(...)`. Table-driven tests and `t.Run(...)` subtests fold into the outer function's span — they are never mistaken for a second, independent test opener. |
| Rust | `rust` | `.rs` | `brace-delimited` | `#[test]`-attributed functions — optionally stacked with `#[should_panic]`, and/or nested inside `#[cfg(test)] mod tests { ... }` — asserting via `assert!`, `assert_eq!`, or `assert_ne!`. A bare `#[should_panic]` with no `#[test]` on the same function is never treated as a test, matching real Rust semantics. |
| PHP | `php` | `.php` | `brace-delimited` | Both shapes in one profile: Pest `it('description', function () { ... })` / `test('description', function () { ... })` closures asserting via `expect(...)` (a description string is required — a bare closure with no description never matches), **and** PHPUnit `public function test<Name>(...): ...  { ... }` methods asserting via `$this->assert*(...)`. A non-asserting `test`-prefixed PHPUnit method still yields a span (with no assertion found), matching PHPUnit's own reflection-based discovery, which collects it regardless. |
<!-- cadence:coverage-languages:end -->

Each built-in profile's own module (`packages/core/src/verify/coverage-profiles/{js-ts,python,go,rust,php}.ts`) documents its fixed assertion set, string/comment edge cases (e.g. Go's raw strings, Rust's arbitrary-hash-count raw strings and non-nesting block comments, PHP's heredoc/nowdoc), and — for go/rust/php — the specific spoofing vectors their reviews found and closed (a comment- or string-embedded fake opener token, a nested-parens false terminator, an unmasked heredoc). Read the profile's docstring for the full detail behind any given row above.

To see exactly which test files, profile, and spans a specific AC resolved against — and why a span did or didn't satisfy the configured `coverageMode` — run [`cadence verify coverage --explain AC-N`](commands.md#verify) (`--json` for machine consumption); it is read-only and never mutates loop state.

### Custom coverage profiles

`verification.coverageProfiles` extends `assertion` mode to a language with no built-in profile — an unsupported language is never a dead end. Each entry is a JSON-serializable mirror of the engine's internal `LanguageProfile` shape (`CoverageProfileConfig`, `packages/types/src/config.ts`); `openerPattern`/`assertionPattern` are regex **source strings**, compiled (with the sticky `y` flag added to `openerPattern`) at config-load time — an invalid regex is refused loudly, naming the profile id and the field.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Unique profile id, e.g. `"ruby-rspec"`. Named in load-time refusal messages. |
| `extensions` | `string[]` (min 1) | yes | Lowercase file extensions this profile claims, e.g. `[".rb"]`. Refused at load time if any extension is already owned by a **built-in** profile — add-only, never an override. |
| `openerPattern` | `string` (regex source) | yes | What counts as a test opener. Compiled with the sticky `y` flag. |
| `assertionPattern` | `string` (regex source) | yes | What counts as an assertion inside an opener's resolved block. |
| `strategy` | `"call-expression"` \| `"brace-delimited"` \| `"indentation-delimited"` \| `"do-end-keyword"` | yes | Which block-boundary primitive resolves this profile's opener. `do-end-keyword` bounds the block from a block-opening keyword (e.g. `do`) to a matching `end`-family keyword — the shape ruby/elixir-style languages need, and the one no *built-in* profile ships (it's exercised end-to-end by a custom-profile test fixture instead). |
| `syntax` | `{ comments: { line?: string[], block?: [string, string][] }, strings: { open: string, close?: string, escape?: string \| null }[] }` | yes | Comment/string delimiter table used to mask non-code text before opener/assertion matching. Required — even an empty table must be declared explicitly, rather than silently getting no masking. |
| `keyword` | `{ blockOpenKeywords: string[], endKeyword: string }` | only when `strategy` is `"do-end-keyword"` | Refused at load time, naming the profile id, when missing for that strategy. |
| `openerMatchesStrings` | `boolean` | no (default `false`) | Default `false` masks string content from opener matching, same as every other masked region (the false-positive-averse default). Set `true` only when the opener's own syntax legitimately spans a quoted string as structure, not incidental content — e.g. a `do-end-keyword` opener like `it 'title' do`, where the quotes are the framework's own title-delimiter syntax. |

A collision with a **built-in** extension (`.ts`, `.py`, `.go`, `.rs`, `.php`, ...) is refused loudly at load time, naming the colliding extension and the built-in profile that already owns it, with a suggested fix (choose a different extension, or drop the entry) — custom profiles are add-only by design (phase 167 operator decision, 2026-07-11).

Example — a Ruby-style `do-end-keyword` profile for RSpec's `it '...' do ... end` blocks (adapted from the fixture `packages/core/tests/verify/coverage-profiles-custom.test.ts` exercises end-to-end):

```jsonc
// .cadence/config.json
{
  "verification": {
    "coverageProfiles": [
      {
        "id": "ruby-rspec",
        "extensions": [".rb"],
        "openerPattern": "\\bit\\s+'[^']*'\\s+do\\b",
        "assertionPattern": "\\bexpect\\s*\\(",
        "strategy": "do-end-keyword",
        "keyword": { "blockOpenKeywords": ["do"], "endKeyword": "end" },
        "openerMatchesStrings": true,
        "syntax": {
          "comments": { "line": ["#"] },
          "strings": [{ "open": "'" }, { "open": "\"" }]
        }
      }
    ]
  }
}
```

`openerMatchesStrings: true` is needed here because the opener's own syntax (`it 'title' do`) legitimately spans the quoted title — without it, the title's quotes would be masked to blank space along with every other string and the opener would never match at all.

---

## skillAudit

Drives the skill-audit check, which enforces that declared required skills were actually invoked during a phase. Declaring required skills (here or via a DRAFT's `requiredSkills`) is the opt-in — the check is inert when the effective required set is empty.

| Field | Type | Default | Description |
|---|---|---|---|
| `skillAudit.required` | `string[]` | `[]` | Skill IDs that must be invoked before a phase settles. At `cadence settle run`, this set is unioned with the DRAFT's `requiredSkills`; if any are missing from telemetry, settle refuses unless `--allow-skill-audit-miss` is passed. Enforcement is skipped (with a `skill-audit-miss` warning) when `telemetry.skillInvocations` is `false`. |

---

## convergence

Bounds the convergent review loops (spec-review and plan-review).

| Field | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `convergence.maxAttempts` | `integer` (positive) | — | `3` | Maximum review attempts before a convergent gate (`spec-review`, `plan-review`) gives up and requires a human decision. After `maxAttempts` non-passing attempts, the gate refuses unless the relevant `--allow-*-failure` flag is set. |

---

## Gate provider blocks

Six gates delegate to an AI verifier. Each block has the same shape:

```jsonc
{
  "provider": "mock" | "anthropic" | "local",  // default: "mock"
  "model": "<string>"                            // optional; overrides provider default
}
```

| Field | Gate it controls | When the gate fires |
|---|---|---|
| `specReview` | `spec-review` | `cadence spec approve` (always runs at this step); convergent loop bounded by `convergence.maxAttempts`; non-passing/unconverged refuses approve unless `--allow-spec-review-failure` |
| `verifier` | `deep-verify` | `cadence settle run` (when gate is in the active set) |
| `perTaskVerifier` | `per-task-verify` | `cadence build task <id> --status=DONE` (when gate is in the active set: `strict × standard` or `strict × complex`) |
| `codeReview` | `code-review` | `cadence settle run` (when gate is in the active set); HIGH findings refuse settle unless `--allow-code-review-failure` / `--force` |
| `planReview` | `plan-review` | `cadence draft approve` (`strict × complex` only); `pass=false` refuses approve unless `--allow-plan-review-failure` |
| `securityAudit` | `security-audit` | `cadence settle run` after code-review (`strict × complex` only); CRITICAL findings refuse settle unless `--allow-security-audit-failure` / `--force` |

All six blocks default to `{ "provider": "mock" }`. Provider options:

| Provider | Description | Requires |
|---|---|---|
| `mock` | Deterministic offline **placeholder** — only checks each AC links to a test; always passes, no network call. **Not real verification.** | Nothing |
| `anthropic` | Calls the Anthropic API. | `ANTHROPIC_API_KEY` in environment or a `.env` file at the repo root |
| `local` | OpenAI-compatible `/v1/chat/completions` endpoint (e.g. Ollama). | `CADENCE_LOCAL_BASE_URL` + `CADENCE_LOCAL_MODEL`; falls back to `mock` with a warning if unset |

See [docs/concepts.md — Providers](../concepts.md#providers) for conceptual detail and [docs/providers.md](../providers.md) for setup instructions.

> **Turning on real verification.** Don't hand-edit these blocks for a first run — use [`cadence activate`](commands.md#activate). It flips `verifier.provider` from the default `mock` to a real provider (just the deep-verify seam by default, or `--all` for every block), validates your key with a live check, and prints the exact next step. The key is discovered from the environment or a `.env` file at the repo root and is **never** written here — only the provider name. [`cadence doctor`](commands.md#doctor)'s `verification-readiness` check reports whether real verification is actually wired.

### `verifier` extra fields

The `verifier` block (the `deep-verify` gate) takes extra fields beyond
`provider` / `model`:

| Field | Type | Default | Description |
|---|---|---|---|
| `verifier.diffCapBytes` | `integer` (positive) | `262144` (256KB) | Byte budget for the unified `git diff` sent to the `deep-verify` verifier. `deep-verify` feeds the verifier the actual phase diff (`git diff HEAD` over the touched files) so it judges the implementation, not just test-linkage. A diff larger than this cap is truncated with an explicit `[diff truncated: N of M bytes]` marker, and the SUMMARY's `deepVerifyMeta` records `truncated: true` plus the original byte count. |
| `verifier.timeoutMs` | `integer` (positive, optional) | — | **`anthropic` only.** Per-request timeout (ms) passed to the Anthropic client. Omitted → the SDK default holds. A transient blip in a settle gate then retries (see `maxRetries`) before failing loud. (Phase 72) |
| `verifier.maxRetries` | `integer` (non-negative, optional) | — | **`anthropic` only.** Retry budget for transient (429/5xx/network) errors, passed to the Anthropic client. Omitted → the SDK default holds; an explicit `0` disables retries. (Phase 72) |
| `verifier.localHeaders` | `Record<string, string>` (optional) | — | **`local` only.** Extra HTTP headers merged over the base `content-type` on every request to the OpenAI-compatible endpoint — e.g. a custom gateway header. Merged *under* the `Authorization` bearer derived from `CADENCE_LOCAL_API_KEY` (see below), which custom headers can override. Values are secrets and are never logged. (Phase 72) |

These extra fields apply only to the top-level `verifier` slice (the
`deep-verify` gate). The other five gate provider blocks share the selection +
`model` shape but do not read the hardening fields.

**Selecting the provider at the command line.** `cadence settle run --verifier
<mock|anthropic|local>` overrides `verifier.provider` for one run (precedence
**flag > config > default `mock`**). Token usage from a real provider is
recorded on the SUMMARY's `deepVerifyMeta` (`inputTokens` / `outputTokens`);
dollar cost is not derived. (Phase 73)

#### Provider auth (environment)

| Variable | Provider | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `anthropic` | API key; absent → warn + mock fallback. |
| `CADENCE_LOCAL_BASE_URL` | `local` | Endpoint base URL; absent → warn + mock fallback. |
| `CADENCE_LOCAL_MODEL` | `local` | Fallback model when `verifier.model` is unset. |
| `CADENCE_LOCAL_API_KEY` | `local` | Optional. When set, sent as an `Authorization: Bearer <key>` header so token-gated OpenAI-compatible proxies work. Never logged. (Phase 72) |

---

## notify

Controls how CADENCE surfaces anomaly events. Only fires when the `anomaly-notify` gate is in the effective gate set.

| Field | Type | Default | Description |
|---|---|---|---|
| `notify.transport` | `"stderr" \| "file" \| "none" \| "webhook"` | `"stderr"` | Delivery transport. `stderr` writes one line per event; `file` appends NDJSON to `notify.file`; `none` drops events silently; `webhook` POSTs `{ "events": [...] }` JSON to the configured URL. |
| `notify.file` | `string` (optional) | `.cadence/anomalies.log` | Destination path for the `file` transport. Ignored for other transports. |
| `notify.webhook` | object (optional) | — | **Required when `transport === "webhook"`**; ignored otherwise. The URL is sensitive (may carry an auth token) and is never logged on failure. |
| `notify.webhook.url` | `string` (URL) | — | Full URL to POST anomaly batches to. Required when transport is `webhook`. |
| `notify.webhook.headers` | `Record<string, string>` (optional) | — | Additional HTTP headers (e.g. `Authorization`). |
| `notify.webhook.timeoutMs` | `integer` (positive, optional) | — | Request timeout in milliseconds. |

---

## logging

Operational diagnostic logging for CADENCE itself (the structured logger). This is
**distinct** from `telemetry`/`skillAudit`, which track user behavior — `logging` is operator-facing
diagnostics for *why* CADENCE did something (which gate refused, which hook fired, what a verifier
call did). It is **default-off** and writes **only to stderr**, so it never collides with `--json`
output or the `cadence mcp serve` stdio protocol channel.

| Field | Type | Default | Description |
|---|---|---|---|
| `logging.level` | `"silent" \| "error" \| "warn" \| "info" \| "debug" \| "trace"` | `"silent"` | Minimum severity emitted. `silent` emits nothing. Diagnostics are most useful at `debug`. |
| `logging.format` | `"pretty" \| "json"` (optional) | — | Output format. When omitted, the logger picks `pretty` on a TTY (stderr) and `json` otherwise. |

Instrumented seams (records carry a `seam` field): `gate` (settle gate decisions — skipped/passed/refused),
`hook` (host lifecycle event dispatch), and `verify` (AI verifier provider calls — request/response/error,
with token usage when present). Verifier auth headers and API keys are **never** logged.

### Environment overrides

Both fields can be overridden at runtime without editing `config.json` — **env wins over config**:

| Variable | Overrides | Values |
|---|---|---|
| `CADENCE_LOG_LEVEL` | `logging.level` | `silent` \| `error` \| `warn` \| `info` \| `debug` \| `trace` |
| `CADENCE_LOG_FORMAT` | `logging.format` | `pretty` \| `json` |

```bash
# Turn on debug diagnostics for a single command, JSON to stderr:
CADENCE_LOG_LEVEL=debug CADENCE_LOG_FORMAT=json cadence settle run --auto
```

An invalid env value is ignored (falls through to config, then the default) rather than failing the command.

### Interactivity (non-TTY auto-bypass)

The two interactive gates (`approve`, `interactive-verdict`) auto-bypass in a
non-TTY by default (v1.29) so agents and CI don't hit a `stdin is not a TTY`
error. These env vars tune that behavior (no `config.json` field — env only):

| Variable | Effect |
|---|---|
| `CADENCE_REQUIRE_TTY=1` | Restore the strict pre-1.29 refusal in a non-TTY (wins over the others). |
| `CADENCE_NONINTERACTIVE=1` | Force bypass even when a TTY is present (pty-allocated agents). |
| `CADENCE_PROMPTER_SCRIPT=<answers>` | Newline-separated scripted answers; when set, the prompt is always honored (never bypassed). |

See [docs/concepts.md — Non-TTY auto-bypass](../concepts.md#non-tty-auto-bypass-agents--ci)
for the full precedence and semantics.

---

## phaseGuard

Worktree-safety collision guard (v1.18). CADENCE's loop state lives in the working tree, and each
git worktree holds its own private `.cadence/`. Two worktrees branched from the same commit can both
conclude "phase N is next"; with different slugs (`30-auth` in one, `30-cache` in the other) git
**silently merges both in** — two phase 30s, no conflict marker. The guard observes ground truth
(`git worktree list` + the upstream integration ref) and **refuses** to scaffold a phase number
already claimed by a sibling worktree or upstream, naming the conflict and the next free number, so
the collision fails loud *before* wasted work. See [the worktree-concurrency note](../concepts.md#worktrees--the-single-writer-assumption).

| Field | Type | Default | Description |
|---|---|---|---|
| `phaseGuard.enabled` | `boolean` | `true` | Master switch. `false` disables the guard entirely (scaffolding behaves exactly as pre-v1.18). |
| `phaseGuard.integrationRef` | `string` | `"main"` | The upstream ref checked for already-merged phases — `origin/<integrationRef>`. Retarget if your project integrates on a branch other than `main`. |

The guard fires at **scaffold time** (`cadence spec new` / `cadence draft new`, before any file is
created) and as a **settle backstop** (`cadence settle run`, catching a scaffold-race). It is
**best-effort**: a non-git checkout, a missing `origin`, an offline run, or a configured
`integrationRef` absent on the remote each degrade silently to "no extra data" — the only hard
failure is an *actual detected collision*. Bypass a specific run with `--allow-phase-collision`
(which never bypasses the existing local same-directory refusal).

```bash
# A sibling worktree already holds phase 30 — this refuses, suggesting 31:
cadence draft new 30-cache 01
# Proceed anyway (you know what you're doing):
cadence draft new 30-cache 01 --allow-phase-collision
```

---

## handoff

Handoff retention (v1.20). `cadence handoff` writes dated `SESSION-*.md` docs into `.cadence/handoff/`;
left unmanaged they accumulate indefinitely. An **opt-in**, count-based retention policy prunes the
stale ones at **handoff-write time** (not settle — settle fires per-phase and would race the
`lastHandoff` pointer mid-session). Selection is deterministic and offline (lexicographic-descending
by filename — the ISO date prefix sorts chronologically — no git introspection).

| Field | Type | Default | Description |
|---|---|---|---|
| `handoff.retain` | `integer >= 1` (optional) | *unset* | Keep the N most-recent `SESSION-*.md` docs and hard-delete the rest on each handoff write. **Unset disables pruning entirely** (current behavior). The just-written doc (the new `lastHandoff`) is always the newest, so it is never deleted. |

Pruning is **best-effort and never silently destructive**: it only runs when `retain` is set, always
keeps the active handoff, reports what it removed (`handoff: pruned N stale doc(s): …`), and a failure
(unreadable config, `unlink` error) leaves the handoff intact rather than failing it. Because the
behavior is opt-in and the dated archive that `cadence resume` relies on is preserved (the newest N),
nothing the resume flow needs is destroyed.

`cadence doctor` includes a read-only `handoff-retention` check: `ok` when the count is within the
`retain` budget (or retention is set and the next write will self-heal the excess), and a `warning`
only when retention is **unset** and at least 10 docs have piled up — suggesting a `handoff.retain`
value to cap the growth.

```jsonc
// .cadence/config.json — keep the 10 most-recent session handoffs
{ "handoff": { "retain": 10 } }
```

---

## resume

Cross-worktree handoff discovery (v1.38, phases 142–143). `cadence handoff` writes a dated
`SESSION-*.md` doc per worktree's own `.cadence/handoff/`; a bare `cadence resume` now looks
beyond the local worktree for other resumable sessions before falling back to the old
local-only behavior.

| Field | Type | Default | Description |
|---|---|---|---|
| `resume.crossWorktree` | `boolean` | `true` | Master switch. `false` disables cross-worktree discovery entirely — `cadence resume` behaves exactly as it did before phases 142/143 (local worktree only). |
| `resume.autoList` | `boolean` | `false` | When 2+ resumable candidates exist across worktrees, `true` opens the interactive picker automatically instead of resuming local and printing a stderr nudge (`cadence resume --list`). |
| `resume.remoteCheck` | `boolean` | `true` | Origin-freshness probe (phase 163): `resume` runs a best-effort `git fetch` and warns when origin has commits this clone lacks, so a stale handoff superseded by another machine's push isn't silently replayed. `false` (or `--offline`) skips the fetch entirely — the fetch only touches remote-tracking refs, never the working tree. |

This block is **schema-only**: like `phaseGuard`/`handoff`/`logging`, it is deliberately absent
from `config edit`'s wizard catalog and `config explain`'s field rows, which are curated to a
smaller, guided field set. Hand-edit `.cadence/config.json` to change these values. See
[the worktree-concurrency note](../concepts.md#worktrees--the-single-writer-assumption) and
[`cadence resume`](commands.md#resume) for the full candidate-discovery and picker behavior.

```jsonc
// .cadence/config.json — never look outside this worktree
{ "resume": { "crossWorktree": false } }
```

---

## recommendations

Recommendation retention (v1.24). Terminal recommendations (`shipped`/`rejected`/
`converted`) drop out of the active `cadence recommend` surface but, left unmanaged,
accumulate in `.cadence/intelligence/recommendations.json` forever.
**Soft-archival** moves a finished rec aside into the ledger's `archived` array —
recoverable via [`cadence recommendation unarchive`](commands.md#recommendation-unarchive),
never deleted — keeping the active ledger lean while preserving provenance.

| Field | Type | Default | Description |
|---|---|---|---|
| `recommendations.autoArchive` | `boolean` | `true` | Automatically soft-archive a rec **immediately** when it reaches a terminal state (`shipped`/`rejected`) via [`recommendation promote`](commands.md#recommendation-promote). Also gates the settle-time transition of a `converted` rec to `settle-pending` (see below) — off leaves such a rec at `converted` through settle. Set `false` to leave terminal recs in the active ledger. Manual [`recommendation archive`](commands.md#recommendation-archive)/`unarchive` work regardless. |

Unlike [`handoff.retain`](#handoff) (a hard delete, so opt-in/off), auto-archival is
**recoverable** and so defaults **on**. Archiving itself is only ever
immediate-on-terminal-status; a `converted` rec whose phase settles is **not**
archived — instead it moves to the non-terminal `settle-pending` status
instead (see [`recommendation promote`](commands.md#recommendation-promote)),
staying in the active ledger until it's later promoted to `shipped` (which
does archive it). Both the `settle-pending` transition and the terminal-status
archival are best-effort — a failure never blocks or fails the settle. The
archive is viewable with `cadence recommendation list --archived`.

```jsonc
// .cadence/config.json — keep terminal recs in the active ledger (disable auto-archive)
{ "recommendations": { "autoArchive": false } }
```

---

## gates

Sealed-gate enforcement (Phase 141). A gate id listed in `gates.sealed` becomes
**non-bypassable** at `cadence settle run`: both the global `--force` flag and
that gate's own per-gate `--allow-*` flag are ignored, and the refusal message
names `gates.sealed` instead of the usual bypass hint. This closes the gap
where an operator (or an agent under pressure) could wave away the exact gates
a `production`-tier project cares about most.

| Field | Type | Default | Description |
|---|---|---|---|
| `gates.sealed` | `string[]` | `[]` | Gate ids that cannot be bypassed at settle time. An empty array (the default) restores normal bypass behavior for every gate. |

Only two gate ids currently check `gates.sealed` and are meaningful here:

| Gate id | Bypass flag(s) it seals shut |
|---|---|
| `test-coverage` | `--allow-missing-coverage`, `--force` |
| `build-test-must-pass` | `--allow-failing-build`, `--force` |

Naming any other gate id in `gates.sealed` currently has no effect — only
`test-coverage` and `build-test-must-pass` consult `isGateSealed`; the other
gates' bypass flags are unaffected regardless of what's listed here.

Sealing binds the **auto** settle path (`cadence settle run --auto`, the one
agents and CI use) — `cadence settle run --interactive` (non-auto) still lets
`test-coverage` pass without computing coverage, since that mode delegates
per-AC verification to the `interactive-verdict` human walker instead.

```jsonc
// .cadence/config.json — seal the two gates the production preset seals by default
{ "gates": { "sealed": ["test-coverage", "build-test-must-pass"] } }
```

See [docs/concepts.md — Gate bypass reference summary](../concepts.md#gate-bypass-reference-summary) for the full bypass-flag table these two entries interact with.

---

## boundaryEnforcement

Boundary enforcement mode (Phase 155). A DRAFT declares `files:` per task —
the allow-list of files that task may touch. `boundaryEnforcement` controls
what happens when an edit falls outside that declared set.

| Field | Type | Default | Description |
|---|---|---|---|
| `boundaryEnforcement` | `"warn" \| "block"` | `"warn"` | `warn` — an out-of-boundary edit is only notified via the `anomaly-notify` gate (unchanged historical behavior). `block` — the pre-tool-edit hook refuses the edit outright, wherever the host surfaces the touched files before the write lands. |

`block` mode fails **open** (never blocks) in two cases: when there is no
active draft/phase, and when the active draft's tasks declare zero files in
total — an enforcement mode never blocks 100% of edits as a side effect of a
DRAFT that omits `files:`.

Overridable per-phase via DRAFT frontmatter, mirroring `profile`:

```markdown
---
phase: 42-example
id: 42-01
tier: standard
boundaryEnforcement: warn
status: PENDING
---
```

A DRAFT-level override wins over the project default in `.cadence/config.json`.

```jsonc
// .cadence/config.json — refuse out-of-boundary edits project-wide
{ "boundaryEnforcement": "block" }
```

**Scope note:** `block` mode is edit-time only — it fires on `PreToolUse`,
which includes subagent-originated edits (Claude Code's `PreToolUse` hook
fires for subagent tool calls, not just main-thread ones). A settle-time diff
scan (phase 156, `boundary-scan` gate) is a second, independent line of
defense for anything that slips past edit-time detection.

---

## redundantWorkEnforcement

Redundant-work enforcement mode (subagent task-redundancy monitoring). A
DRAFT task's `files:` declares what it owns; once that task's `PROGRESS.json`
status reaches `DONE`/`DONE_WITH_CONCERNS`, `redundantWorkEnforcement`
controls what happens when an edit touches one of those files again.

| Field | Type | Default | Description |
|---|---|---|---|
| `redundantWorkEnforcement` | `"off" \| "warn" \| "block"` | `"warn"` | `off` — the check never runs. `warn` — a redundant-work edit is only notified via the `anomaly-notify` gate. `block` — the pre-tool-edit hook refuses the edit, and a `SubagentStop` safety net can hard-block a subagent's turn from ending if it slipped through edit-time detection. |

Unlike `boundaryEnforcement` (`"warn" | "block"` only), this field has a
third `"off"` value: re-touching finished work is a more subjective signal
than an out-of-boundary edit (fixing a bug just introduced by that task is a
legitimate reason to touch it again), so a full opt-out is offered.

Overridable per-phase via DRAFT frontmatter, mirroring `boundaryEnforcement`:

```markdown
---
phase: 42-example
id: 42-01
tier: standard
redundantWorkEnforcement: block
status: PENDING
---
```

```jsonc
// .cadence/config.json — refuse redundant edits project-wide
{ "redundantWorkEnforcement": "block" }
```

**Scope note:** this check runs at edit time (`handlePreToolEdit`, fires for
both main-thread and subagent edits) and again as a `SubagentStop` safety net
scoped to files touched during that specific subagent's run (tracked via
`PostToolUse`, not a git diff — a subagent's edits are normally uncommitted
working-tree changes, so there's no commit boundary to diff against). It does
not track cross-worktree task status, and it does not know which task a
subagent was *assigned* — only whether a touched file's owning task is
already finished.

---

## Reading your config — `cadence config explain`

This page is a field reference. To see what *your* config actually does — without
reading all of it — run:

```bash
cadence config explain            # curated, plain-language summary
cadence config explain verifier   # deep-dive a single block
cadence config explain --all      # every key, grouped
cadence config explain --json     # structured output for scripting
```

The default view has five parts:

1. **Profile & enforcement** — `profile`, `loopEnforcement`, `acDiscipline`, each with a one-line meaning.
2. **Gates that fire, by tier** — the concrete gate set for quick-fix / standard / complex under your profile (the `← current` marker points at the active phase's tier when a phase is mid-loop). This is the profile × tier matrix resolved for *your* settings.
3. **Verifier & gate providers** — the six provider blocks (`specReview`, `verifier`, `perTaskVerifier`, `codeReview`, `planReview`, `securityAudit`) collapsed into one table, flagging which run `mock` (offline — no real AI verification).
4. **Warnings** — config-semantic foot-guns, shown only when they apply:
   - a provider set to `anthropic`/`local` with its API key (`ANTHROPIC_API_KEY` / `CADENCE_LOCAL_API_KEY`) unset — it will silently fall back to `mock`;
   - a `hooks.*` flag enabled while the host adapter is not installed (no managed entry in `.claude/settings.json`) — the hook does nothing until `cadence-host-claude-code install`;
   - the `auto × complex` soft cap — complex phases under the `auto` profile refuse to approve/settle without `--allow-auto-complex`.
5. **Footer** — pointers to `<field>`, `--all`, and `cadence doctor`.

### How it relates to the doctor commands

`config explain` is **read-only and describes**; it does not judge structural health. It is complementary to:

- **`cadence config doctor`** — flags conflicting config *pairs* (e.g. `strict` loopEnforcement with `manual` commit cadence).
- **`cadence doctor`** — the full structural health check (Node version, init state, git hooks, host hooks, worktree collisions, handoff retention).

The three share detection logic where they overlap (e.g. the host-hooks-installed check), so their answers never drift. When `config explain` raises a warning, it points you at `cadence doctor` for the complete picture.

---

## Presets

`cadence init --profile <preset>` seeds `config.json` from one of three presets. The table shows only the fields that **differ** from `defaultConfig`; all other fields take the `defaultConfig` value.

| Field | `solo` | `team` (default) | `production` |
|---|---|---|---|
| `loopEnforcement` | `"reminder"` | `"soft"` | `"strict"` |
| `acDiscipline` | `"optional"` | `"tier-scaled"` | `"strict"` |
| `commitCadence` | `"manual"` | `"draft"` | `"draft"` |
| `hooks.preToolUseBuildGate` | `false` | `false` | `true` |
| `gates.sealed` | `[]` | `[]` | `["test-coverage", "build-test-must-pass"]` |

The `production` preset seals `test-coverage` and `build-test-must-pass` by default (see [gates](#gates)) — `solo`/`team` leave `gates.sealed` empty, so every gate's normal bypass flags still work.

All other fields are identical to `defaultConfig` across all three presets. After scaffolding, `cadence init` overlays the detected `profile`, `verification.testGlobs`, and `verification.coverageMode` regardless of preset (see below).

---

## cadence init behavior

`cadence init` writes two fields whose values depend on the project rather than the preset:

### `profile`

Sourced from `--gate-profile <p>` if provided. Otherwise:

- If stdin is a TTY, the user is prompted (suggested value shown in brackets).
- In non-interactive mode (no TTY, no flag), the suggestion is used directly.

The suggestion is derived from git history: a repo with **20 or more commits** gets `"standard"`; fewer commits or any git error gets `"auto"`.

### Project language detection (Phase 166)

`cadence init` sniffs the target repo's root for language marker files, best-effort and never throwing (a permission or fs-read failure just falls back to `unknown`). Checked in this priority order, first match wins:

| Marker file(s) present at init cwd | Detected language |
|---|---|
| `package.json` | `js` (covers JS and TS) |
| `pyproject.toml`, `setup.py`, or `requirements.txt` | `python` |
| `go.mod` | `go` |
| `Cargo.toml` | `rust` |
| `composer.json` | `php` |
| none of the above | `unknown` |

`package.json` is checked first, so a mixed-language repo with a root `package.json` alongside e.g. a nested `pyproject.toml` deterministically resolves to `js`. This detected language feeds both `verification.testGlobs` and `verification.coverageMode` below.

### `verification.testGlobs`

Detected from the repo layout and the detected project language at init time:

| Language / layout condition | Written value |
|---|---|
| `js` + `packages/` directory exists at init cwd (monorepo) | `["packages/**/*.test.ts", "packages/**/*.test.tsx"]` |
| `js` + no `packages/` directory (single-package) | `["**/*.test.ts", "**/*.test.tsx"]` |
| `python` | `["**/test_*.py", "**/*_test.py"]` |
| `go` | `["**/*_test.go"]` |
| `rust` | `["tests/**/*.rs", "**/*_test.rs", "src/**/*.rs"]` |
| `php` | `["**/*Test.php", "tests/**/*.php"]` |
| `unknown` | same layout-based fallback as `js` (monorepo vs. single-package glob above) |

The scanner prunes `node_modules/`, `dist/`, `.git/`, and `.turbo/`, so the broad single-package glob is safe. Rust's `src/**/*.rs` entry was added in Phase 167 (AC-10): idiomatic Rust unit tests commonly live inline in a `#[cfg(test)] mod tests { ... }` block within the same file as the code under test, rather than only under `tests/` or in a `*_test.rs`-suffixed file — safe to widen because the attribute-aware rust coverage profile only ever yields spans for genuine `#[test]` functions, never from ordinary source.

### `verification.testCommand` (Phase 139)

Derived from the target repo's `package.json#scripts.test`, prefixed with the detected package manager:

| Condition | Written `testCommand` |
|---|---|
| `scripts.test` exists + `pnpm-lock.yaml` present | `pnpm test` |
| `scripts.test` exists + `yarn.lock` present | `yarn test` |
| `scripts.test` exists + `bun.lockb` present | `bun test` |
| `scripts.test` exists + `package-lock.json` present, or no lockfile matched | `npm test` |
| No `scripts.test` (or no `package.json` at all) | not written — field stays absent |

`cadence init --dry-run` previews the same derived value (or its absence) without writing.

### `verification.coverageMode` (Phase 139, language-aware as of Phase 166)

A fresh `cadence init` originally wrote `"assertion"` unconditionally for every preset (Phase 139) — a comment-only `AC-N` mention no longer counts as tested. As of Phase 166, that default is language-aware, using the same [project language detection](#project-language-detection-phase-166) that drives `verification.testGlobs`:

| Detected language | Written `coverageMode` |
|---|---|
| `js` | `"assertion"` |
| `python`, `go`, `rust`, `php`, or `unknown` | `"mention"` — init also prints a stderr notice naming the detected language and explaining why `assertion` mode wasn't used |

This table records what a **fresh `cadence init`** writes, not what `assertion` mode can actually parse — those are no longer the same thing. When Phase 166 shipped this table, `assertion` mode's span-finder understood JS/TS test files only, so defaulting a non-JS/TS project to `assertion` would have produced a gate that could never pass no matter how well-tested the code was. As of Phase 167, the span-finder is a shared multi-language engine with real built-in support for python, go, rust, and php too — see the [supported-language matrix](#supported-language-matrix-assertion-mode). Phase 167 deliberately left this init default table itself unchanged (it shipped the span-parsing, not a revisit of what a fresh `init` auto-writes): a fresh init still writes `"mention"` for every non-js detected language, and switching one of `python`/`go`/`rust`/`php` to `"assertion"` is now a manual, informed choice via `cadence config edit coverageMode` — real span support exists for them today, so the switch genuinely works rather than being permanently unsatisfiable. `unknown` still gets `"mention"` since there is no profile to dispatch to at all until an operator adds one via [`verification.coverageProfiles`](#custom-coverage-profiles).

This only affects what a **new** `init` writes; existing `.cadence/config.json` files are never rewritten.

---

*See also: [docs/concepts.md](../concepts.md) — profiles, gates, tiers, providers | [docs/providers.md](../providers.md) — provider setup | [docs/reference/commands.md](commands.md) — CLI command reference*
