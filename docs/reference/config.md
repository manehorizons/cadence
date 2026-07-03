# Configuration Reference

**File:** `.cadence/config.json`

This page documents every field in the CADENCE configuration file. For conceptual explanations of profiles, gates, tiers, and providers, see [docs/concepts.md](../concepts.md). For provider setup (env vars, fallback behavior), see [docs/providers.md](../providers.md).

`cadence init` writes an initial `config.json` from the chosen preset and then overlays two detected values: `profile` (from `--gate-profile` or git-history suggestion) and `verification.testGlobs` (from layout detection — see [cadence init behavior](#cadence-init-behavior)).

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
| `verification.testGlobs` | `string[]` | `["packages/**/*.test.ts", "packages/**/*.test.tsx"]` | Glob patterns the test-coverage scanner walks when checking AC coverage. Supports `**` and `*`. Set by `cadence init` based on repo layout — see [cadence init behavior](#cadence-init-behavior). |
| `verification.testCommand` | `string` (optional) | derived by `cadence init` — see [cadence init behavior](#cadence-init-behavior) | Shell command the `build-test-must-pass` gate runs at `cadence settle run`. When set, settle runs it and refuses on a non-zero exit unless `--allow-failing-build` / `--force`. When absent, the gate is evaluated but cannot enforce — it still passes, but (as of Phase 139) writes a loud, non-blocking stderr notice instead of passing silently. |
| `verification.coverageMode` | `"mention"` \| `"assertion"` | `"assertion"` for a fresh `cadence init` (Phase 139); the schema-level fallback for configs that predate this field stays `"mention"` | How the `test-coverage` gate counts an `AC-N` token. `mention` counts any occurrence of the token anywhere in a matched test file, including comments. `assertion` counts it only when it sits inside an asserting `it()`/`test()` block; a comment-only or assertion-less mention is reported as a *weak link* and the gate refuses with a distinct hint (closing the "mentioned-but-not-tested" false positive). Edit it with `cadence config edit coverageMode`. |

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
| `anthropic` | Calls the Anthropic API. | `ANTHROPIC_API_KEY` in environment |
| `local` | OpenAI-compatible `/v1/chat/completions` endpoint (e.g. Ollama). | `CADENCE_LOCAL_BASE_URL` + `CADENCE_LOCAL_MODEL`; falls back to `mock` with a warning if unset |

See [docs/concepts.md — Providers](../concepts.md#providers) for conceptual detail and [docs/providers.md](../providers.md) for setup instructions.

> **Turning on real verification.** Don't hand-edit these blocks for a first run — use [`cadence activate`](commands.md#activate). It flips `verifier.provider` from the default `mock` to a real provider (just the deep-verify seam by default, or `--all` for every block), validates your key with a live check, and prints the exact next step. The key is read from the environment and is **never** written here — only the provider name. [`cadence doctor`](commands.md#doctor)'s `verification-readiness` check reports whether real verification is actually wired.

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
archived — as of v1.39 it moves to the non-terminal `settle-pending` status
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

All other fields are identical to `defaultConfig` across all three presets. After scaffolding, `cadence init` overlays the detected `profile` and `verification.testGlobs` regardless of preset (see below).

---

## cadence init behavior

`cadence init` writes two fields whose values depend on the project rather than the preset:

### `profile`

Sourced from `--gate-profile <p>` if provided. Otherwise:

- If stdin is a TTY, the user is prompted (suggested value shown in brackets).
- In non-interactive mode (no TTY, no flag), the suggestion is used directly.

The suggestion is derived from git history: a repo with **20 or more commits** gets `"standard"`; fewer commits or any git error gets `"auto"`.

### `verification.testGlobs`

Detected from the repo layout at init time:

| Layout condition | Written value |
|---|---|
| `packages/` directory exists at init cwd (monorepo) | `["packages/**/*.test.ts", "packages/**/*.test.tsx"]` |
| No `packages/` directory (single-package) | `["**/*.test.ts", "**/*.test.tsx"]` |

The scanner prunes `node_modules/`, `dist/`, `.git/`, and `.turbo/`, so the broad single-package glob is safe.

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

### `verification.coverageMode` (Phase 139)

A fresh `cadence init` writes `"assertion"` for every preset (`solo`/`team`/`production` alike) — a comment-only `AC-N` mention no longer counts as tested. This only affects what a **new** `init` writes; existing `.cadence/config.json` files are never rewritten.

---

*See also: [docs/concepts.md](../concepts.md) — profiles, gates, tiers, providers | [docs/providers.md](../providers.md) — provider setup | [docs/reference/commands.md](commands.md) — CLI command reference*
