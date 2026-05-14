---
phase: 17-anomaly-notify
id: 17-01
tier: standard
status: PENDING
---

# 17-01 — anomaly notify transport

## Objective

Close DESIGN.md D4 (the last open design item): land an anomaly notification mechanism for the `auto` profile so hands-off ≠ unsupervised. Emits typed events to a configured transport whenever settle detects test failures, AC blockers, files-outside-boundary, or verifier failures.

## Acceptance Criteria

### AC-1: typed anomaly event schema
Given a Zod schema `AnomalyEventZ` in `@cadence/types`
When validated
Then it accepts `{ type, severity, message, context }` where `type` is one of `'ac-blocked' | 'ac-needs-context' | 'coverage-bypassed' | 'files-outside-boundary' | 'verifier-failure' | 'force-used'`, `severity` is `'info' | 'warn' | 'error'`, `message` is a one-line description, and `context` is a free-form `Record<string, unknown>` for type-specific payload. Rejects unknown type / severity literals.

### AC-2: Notifier interface + 3 transport impls
Given a `Notifier` interface with `notify(events: AnomalyEvent[])`
When implementations are inspected
Then `NullNotifier` (drops silently — for tests + `transport: 'none'`), `StderrNotifier` (formats one line per event to `process.stderr`), and `FileNotifier` (appends NDJSON to `.cadence/anomalies.log`) all implement it. All three are constructible without I/O setup beyond their target stream/path.

### AC-3: anomaly collector walks settle context
Given a `collectAnomalies(ctx)` function with access to draft, progress, gateSet, deepVerify, interactiveVerify, force flag, coverage-bypass flag
When invoked at the end of settle
Then it returns an `AnomalyEvent[]` covering: BLOCKED/NEEDS_CONTEXT tasks (one event each), coverage bypassed via `--allow-missing-coverage` (one event), files touched outside any task's declared `files:` list (one event per such file), `--force` used while structural/deep/interactive verdicts failed (one event), deep verifier transport failures recorded into SUMMARY (one event).

### AC-4: config + factory wire-up
Given a new `CadenceConfigZ.notify: { transport: 'stderr' | 'file' | 'none', file?: string }` field
When `selectNotifier(config)` is called
Then it returns the appropriate impl: `'stderr'` (default) → `StderrNotifier`, `'file'` → `FileNotifier(config.notify.file ?? '.cadence/anomalies.log')`, `'none'` → `NullNotifier`. Backward-compat: configs without a `notify` field parse cleanly with `transport: 'stderr'` default.

### AC-5: settle dispatches anomalies under the auto profile
Given `cadence settle run --auto` runs in a project with `profile=auto` and the gate set includes `'anomaly-notify'`
When settle completes (successfully or with `--force`)
Then collected anomalies are dispatched via the configured notifier. For `stderr` transport, each event renders as `cadence anomaly [severity] type: message`. For `file` transport, each event appends a JSON line to `.cadence/anomalies.log`. The notifier failing (e.g. file unwritable) emits a stderr warning but never blocks settle.

### AC-6: anomaly notify does not fire when gate is off
Given `profile=strict` (no `'anomaly-notify'` in gate set) OR `transport: 'none'`
When settle runs
Then no anomaly events are emitted and `.cadence/anomalies.log` is not touched. Tests assert silence in both paths.

## Tasks

### T1: AnomalyEventZ schema + Notifier interface + 3 impls
- files: `packages/types/src/anomaly.ts` (new), `packages/types/src/index.ts`, `packages/types/tests/anomaly.test.ts` (new), `packages/core/src/notify/notifier.ts` (new), `packages/core/src/notify/stderr.ts` (new), `packages/core/src/notify/file.ts` (new), `packages/core/src/notify/null.ts` (new), `packages/core/tests/notify/notifier.test.ts` (new)
- action: Zod `AnomalyEventZ` with type / severity / message / context. Re-export. Define `Notifier` interface. Implement 3 transports: NullNotifier (no-op), StderrNotifier (configurable write fn for tests), FileNotifier (NDJSON append, mkdir parent if needed). Tests cover schema parse + reject, NullNotifier silent, StderrNotifier captures via injected write fn, FileNotifier writes correct NDJSON and creates parent dirs.
- verify: vitest green for both packages.
- done: AC-1, AC-2

### T2: anomaly collector
- files: `packages/core/src/notify/collect.ts` (new), `packages/core/tests/notify/collect.test.ts` (new)
- action: Pure function `collectAnomalies(ctx): AnomalyEvent[]` where ctx holds the inputs from AC-3. No I/O. Tests cover each event type in isolation + a mixed scenario producing multiple events.
- verify: vitest green; coverage spans all 6 anomaly types.
- done: AC-3

### T3: config field + selectNotifier factory + settle integration
- files: `packages/types/src/config.ts`, `packages/types/tests/config.test.ts`, `packages/core/src/notify/factory.ts` (new), `packages/core/tests/notify/factory.test.ts` (new), `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/settle-anomaly.test.ts` (new)
- action: Extend `CadenceConfigZ` with `notify: { transport: 'stderr' | 'file' | 'none', file?: string }` (default `{ transport: 'stderr' }`). Implement `selectNotifier(config)`. Wire into settle: after acResults are finalized but before write, call `collectAnomalies(ctx)` and dispatch via the notifier — only when `'anomaly-notify'` is in the gate set. Failures from the notifier emit a one-line stderr warning but never block settle. Settle tests: anomaly fires under auto + standard tier; silent under strict (no anomaly-notify gate); silent under transport=none; file transport writes NDJSON.
- verify: vitest green; full suite green.
- done: AC-4, AC-5, AC-6

### T4: docs + dogfood self-check
- files: `DESIGN.md`, `README.md`
- action: DESIGN.md Section 3.3: mark as shipped + briefly describe transports. Section 10: tick Phase 17 (last item). README: new `## Anomaly notify` section listing event types + transports + config field. Self-dogfood: settle this phase with auto profile + stderr transport — verify stderr lists no anomalies (clean settle) and no file is created.
- verify: visual read; dogfood settle is green.
- done: AC-5, AC-6

## Boundaries

- DO NOT add slack / webhook / external-bridge transports here. Plug-in shape exists via the Notifier interface; new transports ship as future phases.
- DO NOT block settle on notifier failures. A broken anomaly log must not break the loop.
- DO NOT auto-rotate or truncate `.cadence/anomalies.log`. Operator's job.
- DO NOT emit anomalies for the `strict` profile. Strict users see everything inline via interactive prompts; anomalies are an `auto`/`standard` affordance.
- DO NOT change settle's exit code based on anomaly count. Anomalies are informational side-effects; refusal logic stays as today (force/gate-specific bypasses).
- DO NOT couple to a specific log format beyond NDJSON. Consumers parse line-by-line.
