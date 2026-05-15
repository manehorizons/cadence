# CADENCE

**Coordinated AI-Driven Engineering with Notifications and Customizable Execution** — structured AI-assisted development.

CADENCE is a customizable plan/build/settle framework for AI-assisted development. Inspired by GSD (Get Shit Done) and PAUL (Plan-Apply-Unify Loop); independently implemented in TypeScript. The product center is a tunable quality regime: three user-involvement profiles (`strict` / `standard` / `auto`) × three phase tiers (`quick-fix` / `standard` / `complex`) decide which gates fire — see `DESIGN.md` for the full matrix.

> **Status:** package `0.3.0`; milestone tag `v0.5.0` (2026-05-15). Phase 12 renamed KEEL → CADENCE (`v0.2.0-rc.1`). `v0.3.0` shipped the behavioral verifier hybrid (test-coverage gate, `--deep` verifier agent, `--interactive` walker), four-transport anomaly notify (`stderr` / `file` / `none` / `webhook`), and the `auto × complex` soft cap. `v0.4.0` shipped the cheap-gate set (DRAFT-read mtime, coherence-warn + loop-violation anomalies, `skillAudit.invoked` wiring). `v0.5.0` shipped the medium gates: manual `approve` Y/N prompt (Phase 24.1), per-task verifier (Phase 24.2), and code-review verifier (Phase 24.3). Earlier history (Phases 1–11) shipped under the KEEL name; the `keel-codex-archive` tag preserves the dual-host implementation removed in Phase 11. See [CHANGELOG.md](./CHANGELOG.md) for the full spread.

## Loop

`DRAFT → BUILD → SETTLE` — define the unit of work, execute task-by-task with per-task qualify, close the loop with a SUMMARY.

## Try it (headless, with the mock host)

```bash
mkdir /tmp/cadence-demo && cd /tmp/cadence-demo
npx @cadence/core init                        # prompts: project name, gate profile
                                              # (suggested from git history); prints
                                              # a one-screen post-init summary
npx @cadence/core draft new 01-foundation 01 --title=Demo
# edit .cadence/phases/01-foundation/01-01-DRAFT.md
npx @cadence/core draft approve 01-foundation 01
npx @cadence/core status                      # full phase context in one screen
npx @cadence/core build task T1 --status=DONE
npx @cadence/core settle run --auto           # derive AC verdicts from task statuses
```

Interactive prompts only appear on a TTY. For CI / non-interactive use, pass the
values as flags — prompts are skipped and defaults applied:

```bash
npx @cadence/core init --name=demo --profile=team --gate-profile=standard
```

`--name` is the project name (prompted when omitted). `--profile` selects the
config preset (`solo | team | production`, default `team`). `--gate-profile`
sets the gate profile (`strict | standard | auto`); when omitted it is suggested
from git history (≥20 commits → `standard`, otherwise `auto`).

`settle run --auto` reads PROGRESS.json and derives each AC's verdict the same way `cadence status` does: all linked tasks DONE → pass, any BLOCKED → fail with `auto: <task> blocked`, NEEDS_CONTEXT → fail with `auto: <task> needs context`, anything still PENDING → refuses with a clear error (`--force` settles anyway). Pass explicit `--ac AC-1=fail:custom` to override the derivation for an individual AC. The legacy `--ac`-only flow still works exactly as before.

`cadence status` renders project, loop position, active draft, per-task status, AC derivation (pass/blocked/needs-context/pending), and the next-action hint. `cadence status --json` emits the same data as a single JSON document for scripting.

## Use with Claude Code

```bash
cd your-project
npx @cadence/core init --name=your-project
npx @cadence/host-claude-code install
# Start a new Claude Code session; CADENCE hooks are wired into .claude/settings.json
# and slash commands /cadence-progress /cadence-draft /cadence-approve /cadence-check
# /cadence-build /cadence-settle /cadence-done /cadence-block /cadence-needs-context
# are available under .claude/commands/.
```

`cadence init` also writes a **`CLAUDE.md`** at the repo root that primes Claude
Code on the loop, gate profile, and where state lives. It is wrapped in
`<!-- cadence:managed:start -->` / `<!-- cadence:managed:end -->` markers:
regenerate it any time with `cadence init --claude-md` (allowed on an
already-initialized project) — content outside the markers is preserved
byte-for-byte, and a `CLAUDE.md` with no markers is treated as fully
user-owned and left untouched.

> Dogfooding a local checkout of CADENCE before publishing? Build the workspace (`pnpm build`) then run `node packages/host-claude-code/bin/cadence-host-claude-code.cjs install --local --settings .claude/settings.local.json`. `--local` writes absolute paths to the workspace builds instead of `npx`-style commands; pair it with `settings.local.json` so the machine-specific paths stay out of git.

## Verification

`cadence settle run --auto` enforces two layers by default:

1. **Structural** — each AC's linked tasks must all be DONE (or pre-overridden via `--ac AC-N=pass:note`).
2. **Test-coverage** — each AC must be referenced by ≥1 test file. The scanner walks `verification.testGlobs` from `.cadence/config.json` (default: `packages/**/*.test.ts(x)`) and matches the literal token `AC-N` anywhere in test content. Refusal lists the offending ACs + the searched globs.

The convention is loose by design: put the AC id in a `describe()` / `it()` name, or in a leading comment. The gate is binary per AC — coverage-percentage tools (istanbul/c8) are out of scope.

Bypass flags:

- `cadence settle run --allow-missing-coverage` — skip the test-coverage gate for this invocation
- `cadence settle run --ac AC-1=pass:override` — explicit verdict wins; gate is skipped for that AC
- `cadence settle run --auto --force` — settle past *both* structural blockers and coverage refusals (for emergencies)

The gate fires only when the active (tier × profile) puts `'test-coverage'` in the effective `GateSet`. Under `auto × quick-fix` it does not fire. See `DESIGN.md` Section 4.2 for the full matrix.

### Deep verifier (`--deep`)

`cadence settle run --auto --deep` runs an independent verifier against each AC and records per-AC verdicts into `SUMMARY.json deepVerify`. Two providers, selected via `.cadence/config.json`:

```json
{
  "verifier": { "provider": "mock" }
}
```

- **`mock` (default)** — deterministic. Passes an AC iff it has ≥1 linked test in the coverage scan; otherwise fails with `"no linked test found"`. No I/O, no API key, works offline. Useful for CI dogfood and as a floor.
- **`anthropic`** — opt-in. Sends each AC's plain-English text + diff + test refs to Claude (default model: `claude-sonnet-4-6`, overridable via `verifier.model`). Uses `messages.parse()` with a Zod schema for typed JSON verdicts; system prompt is prompt-cached. Requires `ANTHROPIC_API_KEY` in env — if absent, silently falls back to `mock` with a stderr warning.

Failed verdicts on non-overridden ACs refuse the settle (exit 1) unless `--force` is passed. Transport failures (network / malformed JSON) refuse unless `--allow-verifier-failure` is passed (which records the failure into `deepVerify`). Explicit `--ac` overrides still win — the verifier runs for visibility but the manual verdict takes effect.

### Interactive verdict (`--interactive`)

`cadence settle run --auto --interactive` walks each AC sequentially:

```
──── AC-1 ────────────────────────────────────────────────
Given: a project is initialized
When:  cadence settle run --interactive executes
Then:  the user is prompted per AC
Linked tests (2):
  - tests/foo.test.ts:12
  - tests/bar.test.ts:45
Touched files: src/foo.ts, src/bar.ts
AC-1 verdict [pass/fail/skip]:
Note (optional, one line, blank to skip):
```

- `pass` / `fail` records into `SUMMARY.json interactiveVerify` and overrides the auto-derived verdict for that AC (with the optional note).
- `skip` falls through to the structural / coverage / deep gates — useful when the human can't judge.
- Fail verdicts on non-overridden ACs refuse the settle (exit 1) unless `--force`.
- Auto-enabled when `'interactive-verdict'` is in the active gate set (per matrix, all `strict` profile cells).
- `--no-interactive` bypasses the gate for one invocation.
- Non-TTY environments (CI, piped stdin) refuse with a clear stderr message — set `CADENCE_PROMPTER_SCRIPT` env var with newline-separated answers to drive the walker programmatically in tests.

### Code-review verifier (`code-review`)

When `'code-review'` is in the active gate set (strict-profile cells + standard×complex), `cadence settle run` reviews the phase diff before writing SUMMARY:

```
$ cadence settle run --auto
code-review: src/foo.ts:42 high — console.log left in source
settle run refused: code-review reported 1 HIGH finding(s). Pass --allow-code-review-failure to record them and settle anyway, or --force to bypass.
```

- Findings carry `severity: 'high' | 'medium' | 'low'`, a `message`, and an optional `line`.
- All findings land on `SUMMARY.codeReview` as `Record<file, Finding[]>` — present only when the gate ran.
- HIGH findings refuse settle unless `--force` or `--allow-code-review-failure` is passed; MEDIUM and LOW never block.
- Each HIGH finding dispatches a `code-review-high` anomaly (when `'anomaly-notify'` is also in the gate set, which lines up under `standard × complex`).
- Provider chosen via `config.codeReview.provider`: `mock` (deterministic — every added `console.log` is HIGH) or `anthropic` (prompt-cached `claude-sonnet-4-6`).

### Per-task verifier (`per-task-verify`)

When `'per-task-verify'` is in the active gate set (strict-profile cells), `cadence build task <id> --status=DONE` runs a verifier against the task's declared files and `git diff HEAD -- <files>` before recording the outcome:

```
$ cadence build task T1 --status=DONE
per-task-verify refused: mock: no diff since last task
Pass --allow-per-task-failure to record DONE anyway.
```

- Verdicts: `pass` / `concerns` (recorded, no error) / `refuse` (blocks DONE).
- The verdict lands on `PROGRESS.json tasks[id].perTaskVerify` (with `bypassed: true` when `--allow-per-task-failure` was used).
- `refuse` outcomes dispatch a `per-task-fail` anomaly (severity `error`, `context.taskId / provider / reason / bypassed`).
- Non-`DONE` statuses (`BLOCKED`, `NEEDS_CONTEXT`, `DONE_WITH_CONCERNS`) skip the gate — they're explicit human escalations.
- Provider chosen via `config.perTaskVerifier.provider`: `mock` (deterministic floor — `refuse` on empty files, `concerns` on empty diff, `pass` otherwise) or `anthropic` (prompt-cached `claude-sonnet-4-6`).

### Manual approve gate

When `'approve'` is in the active gate set (strict-any-tier, standard×standard, standard×complex), `cadence draft approve` prompts before transitioning to BUILD:

```
$ cadence draft approve 01-foundation 01
Approve and enter BUILD? [y/n]: y
Approved 01-01; loopPosition=BUILD
```

- `y` / `yes` proceeds; `n` / `no` (or empty / unrecognized after 3 retries) refuses with exit 1 and leaves state untouched.
- `--no-approve` bypasses the gate for one invocation — required for non-TTY runs (CI, piped) when the gate is active.
- Tests can drive the prompt via `CADENCE_PROMPTER_SCRIPT` (newline-separated answers), the same seam used by `--interactive`.
- Under `auto` profile (or any cell where `'approve'` is not in the gate set) approve is silent and behaves exactly as before.

### Plan-review verifier (`plan-review`)

When `'plan-review'` is in the active gate set (strict×complex only), `cadence draft approve` reviews the plan itself — after the manual-approve gate and before the BUILD transition:

```
$ cadence draft approve 25-plan-review 01 --no-approve
plan-review: high — AC-1 has empty then
  ↳ suggested: Fill in the then clause for AC-1.
draft approve refused: plan-review found 1 finding(s). Fix the plan, or pass --allow-plan-review-failure to proceed anyway.
```

- Input is the parsed DRAFT (objective + ACs + tasks + boundaries) — there is no diff or SUMMARY at approve time.
- `pass=false` refuses approve with exit 1 and leaves state at `loopPosition=DRAFT`; `--allow-plan-review-failure` proceeds to BUILD (findings still printed) with a `proceeding past N finding(s)` trace.
- Findings carry `severity: 'high' | 'medium' | 'low'`, a `message`, and an optional `suggestedEdit`.
- Provider chosen via `config.planReview.provider`: `mock` (deterministic floor — pass iff ≥1 AC and every AC has non-empty Given/When/Then) or `anthropic` (holistic prompt-cached `claude-sonnet-4-6`).

### Security-audit verifier (`security-audit`)

The final, most expensive gate. When `'security-audit'` is in the active gate set (strict×complex only — the rarest cell), `cadence settle run` runs an OWASP-aware pass over the phase diff after code-review and before SUMMARY is written:

```
$ cadence settle run --auto
security-audit: 12 critical — hardcoded JWT-shaped credential
settle run refused: security-audit reported 1 CRITICAL finding(s). Pass --allow-security-audit-failure to record them and settle anyway, or --force to bypass.
```

- Input is `git diff HEAD -- <files>` for the union of touched files.
- All findings (any severity) land on `SUMMARY.securityAudit` as a flat `Finding[]` — present only when the gate ran.
- CRITICAL findings refuse settle unless `--force` or `--allow-security-audit-failure`; HIGH/MEDIUM/LOW are recorded but never block.
- `Finding.severity` is `'critical' | 'high' | 'medium' | 'low'` (the `critical` tier was added for this gate).
- Provider chosen via `config.securityAudit.provider`: `mock` (deterministic — every added `Authorization:` header value or JWT-shaped string is CRITICAL) or `anthropic` (OWASP-aware prompt-cached `claude-sonnet-4-6`).

### Anomaly notify

When `'anomaly-notify'` is in the gate set (auto profile and standard×{standard,complex} cells), settle collects typed events and dispatches them via the configured transport. Event types:

- `ac-blocked` — one per task that ended `BLOCKED`
- `ac-needs-context` — one per task that ended `NEEDS_CONTEXT`
- `coverage-bypassed` — when `--allow-missing-coverage` flipped an active test-coverage gate
- `files-outside-boundary` — one per touched file not declared in any task's `files:` list
- `verifier-failure` — when the `--deep` verifier transport blew up
- `force-used` — when `--force` bypassed failing structural / deep / interactive verdicts

Configure in `.cadence/config.json`:

```jsonc
{
  "notify": {
    "transport": "stderr",          // "stderr" | "file" | "none"
    "file": ".cadence/anomalies.log" // only used when transport=file
  }
}
```

- `stderr` (default): `cadence anomaly [severity] type: message`
- `file`: appends NDJSON to `notify.file` (defaults to `.cadence/anomalies.log`); the operator owns rotation
- `none`: drops events
- `webhook`: POSTs `{events: [...]}` JSON to `notify.webhook.url` (Phase 19.1)

Notifier failures degrade to a single stderr warning and never block settle. Strict-profile cells do not include the gate — strict users see everything inline through the interactive walker.

### Webhook transport

Wire any system that speaks "incoming webhook" — Slack, Discord, Zapier, n8n, your own ingester — by pointing `notify.webhook.url` at it:

```jsonc
{
  "notify": {
    "transport": "webhook",
    "webhook": {
      "url": "https://hooks.slack.com/services/T000/B000/XXXXXXXX",
      "headers": { "Authorization": "Bearer optional-token" },
      "timeoutMs": 5000
    }
  }
}
```

Body shape: `{ "events": [ { "type": "ac-blocked", "severity": "warn", "message": "...", "context": { ... } }, ... ] }`. Empty batches skip the request entirely. Failures (non-2xx / network / timeout) write one warning to stderr and continue — the URL is never logged (it may carry a secret).

**Hook-side detection (Phase 17.2).** `cadence`'s pre-tool-edit hook also fires `files-outside-boundary` *at edit time* when an active draft is loaded and the host (e.g., Claude Code) is about to touch a file outside the union of the draft's `tasks[].files`. Detection only — the hook never refuses the edit. Same transport contract as settle-time emission.

### Reading recorded anomalies

```bash
cadence status anomalies                                       # newest 20 events, all types
cadence status anomalies --type files-outside-boundary --limit 5
cadence status anomalies --since 2026-05-14T00:00:00Z         # events stamped at-or-after midnight UTC
cadence status anomalies --since 2026-05-14T00:00:00Z --type force-used
cadence status anomalies --tail --limit 10                    # last 10, oldest→newest
cadence status anomalies --tail --follow                      # live stream; Ctrl-C to stop
cadence status anomalies --tail --follow --type force-used    # follow, filtered
```

`status anomalies` parses `.cadence/anomalies.log` (or `config.notify.file`), skips malformed lines (count reported on stderr), and prints a table newest-first. `--since <iso>` filters events whose stamped `ts` is `>=` the boundary; invalid ISO8601 exits 1. Each event carries an emitter-stamped `ts` since Phase 17.3.

`--tail` flips the output to the last N events oldest→newest (the default no-`--tail` listing stays newest-first). Add `--follow` to keep the log open and stream new events as they are appended — handy when `cadence settle` runs in one terminal and you watch events in another. `--follow` honours `--type` / `--since` on both the initial tail and the streamed appends, exits cleanly on Ctrl-C (SIGINT), and needs a TTY — on a non-TTY it prints the one-shot tail, notes the fallback on stderr, and exits.

## Codex support — archived

Codex CLI host adapter shipped earlier as `@keel/host-codex` (Phases 02 / 09). Phase 11 removed it from main; the complete pre-removal state is preserved on the `keel-codex-archive` git tag. Resurrection is a future v1.x/v2 phase.

## Host capabilities

Currently single-host: Claude Code only. The capabilities surface (hook coverage, blocking events, slash command support) is declared inline in `@cadence/host-claude-code` as a plain typed constant. If a second host returns, we'll re-evaluate whether a schema-validated abstraction is worth its complexity cost.

## Packages

- `@cadence/core` — CLI + state engine + parsers + classifier + hook dispatcher
- `@cadence/types` — Zod schemas + TS interfaces
- `@cadence/testkit` — fixture builder + MockHostAdapter for tests
- `@cadence/host-claude-code` — Claude Code host adapter: hook installer + event mapping + slash command codegen

## License

MIT
