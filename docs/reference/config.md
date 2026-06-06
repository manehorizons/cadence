# Configuration Reference

**File:** `.cadence/config.json`

This page documents every field in the CADENCE configuration file. For conceptual explanations of profiles, gates, tiers, and providers, see [docs/concepts.md](../concepts.md). For provider setup (env vars, fallback behavior), see [docs/providers.md](../providers.md).

`cadence init` writes an initial `config.json` from the chosen preset and then overlays two detected values: `profile` (from `--gate-profile` or git-history suggestion) and `verification.testGlobs` (from layout detection — see [cadence init behavior](#cadence-init-behavior)).

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
| `verification.testCommand` | `string` (optional) | — | Shell command the `build-test-must-pass` gate runs at `cadence settle run`. When set, settle runs it and refuses on a non-zero exit unless `--allow-failing-build` / `--force`. When absent, the gate is evaluated but cannot enforce — it passes with a one-time note. |

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
| `mock` | Deterministic offline stub; always passes. No network call. | Nothing |
| `anthropic` | Calls the Anthropic API. | `ANTHROPIC_API_KEY` in environment |
| `local` | OpenAI-compatible `/v1/chat/completions` endpoint (e.g. Ollama). | `CADENCE_LOCAL_BASE_URL` + `CADENCE_LOCAL_MODEL`; falls back to `mock` with a warning if unset |

See [docs/concepts.md — Providers](../concepts.md#providers) for conceptual detail and [docs/providers.md](../providers.md) for setup instructions.

### `verifier.diffCapBytes`

The `verifier` block (the `deep-verify` gate) takes one extra field:

| Field | Type | Default | Description |
|---|---|---|---|
| `verifier.diffCapBytes` | `integer` (positive) | `262144` (256KB) | Byte budget for the unified `git diff` sent to the `deep-verify` verifier. `deep-verify` feeds the verifier the actual phase diff (`git diff HEAD` over the touched files) so it judges the implementation, not just test-linkage. A diff larger than this cap is truncated with an explicit `[diff truncated: N of M bytes]` marker, and the SUMMARY's `deepVerifyMeta` records `truncated: true` plus the original byte count. |

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

## Presets

`cadence init --profile <preset>` seeds `config.json` from one of three presets. The table shows only the fields that **differ** from `defaultConfig`; all other fields take the `defaultConfig` value.

| Field | `solo` | `team` (default) | `production` |
|---|---|---|---|
| `loopEnforcement` | `"reminder"` | `"soft"` | `"strict"` |
| `acDiscipline` | `"optional"` | `"tier-scaled"` | `"strict"` |
| `commitCadence` | `"manual"` | `"draft"` | `"draft"` |
| `hooks.preToolUseBuildGate` | `false` | `false` | `true` |

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

---

*See also: [docs/concepts.md](../concepts.md) — profiles, gates, tiers, providers | [docs/providers.md](../providers.md) — provider setup | [docs/reference/commands.md](commands.md) — CLI command reference*
