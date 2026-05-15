---
phase: 26-anomalies-tail
id: 26-03
tier: standard
status: PENDING
---

# 26-03 — status anomalies --tail follow mode

## Objective

Add `--tail [--follow]` to `cadence status anomalies`: `--tail` prints the last N events oldest→newest, `--follow` then keeps the NDJSON log open and streams new events as they are appended, with clean Ctrl-C exit, `--type` compatibility, and a non-TTY fallback to one-shot mode.

## Acceptance Criteria

### AC-1: `--tail` prints the last N (default 20), chronological
Given a populated `.cadence/anomalies.log`
When `cadence status anomalies --tail` runs (optionally `--limit <n>`)
Then it prints the last N events oldest→newest (so the newest is last), using the same table renderer; without `--tail` the existing newest-first behaviour is unchanged

### AC-2: `--follow` streams appended events
Given `--tail --follow` on a TTY (or `CADENCE_FORCE_FOLLOW=1` test seam)
When new lines are appended to the log after the initial tail prints
Then each new event is parsed and printed as a row (no repeated header) as it arrives, tracking a byte offset so only new content is read

### AC-3: Ctrl-C exits cleanly
Given a running `--tail --follow`
When the process receives SIGINT
Then it stops the watch/poll, flushes nothing partial, and exits with code 0 (no stack trace)

### AC-4: `--follow` combines with `--type` (and `--since`)
Given `--tail --follow --type=<t>`
When streaming
Then only events whose `type === t` are printed in BOTH the initial tail and the streamed appends; an invalid `--type` still errors out before streaming; `--since` continues to filter the initial tail

### AC-5: Non-TTY falls back to non-follow
Given `--tail --follow` with a non-TTY stdout and no `CADENCE_FORCE_FOLLOW`
When it runs
Then it prints the one-shot tail, emits a stderr note that follow needs a TTY, and exits 0 without watching (no hang)

## Tasks

### T1: status.ts — --tail / --follow / poll loop / SIGINT / fallback
- files: `packages/core/src/cli/commands/status.ts`
- action: Extract the line→events parse into `parseAnomalyLines(raw): { events: AnomalyEvent[]; bad: number }`. Add `.option('--tail', ...)` and `.option('--follow', ...)`. Add a pure `tailSelect(events, limit)` returning the last N in chronological order. Behaviour: when `--tail` set, render the selected slice oldest→newest (header + rows); when absent, keep the current newest-first path verbatim. `--type` / `--since` / `--limit` validation and filtering run before tail selection (reuse existing checks). FOLLOW: only when `opts.follow` AND (`process.stdout.isTTY` OR `process.env.CADENCE_FORCE_FOLLOW === '1'`); otherwise if `opts.follow` but no TTY, write a stderr note (`status anomalies: --follow needs a TTY; showing one-shot tail.`) and return after the one-shot tail. In follow mode: record `offset = byteLength(rawBuffer)` after the initial print, then `setInterval` (200ms) that stats the file, and when size > offset reads `offset..end`, parses complete newline-terminated lines, applies the same `--type`/`--since` filters, prints each as a bare row (no header), advances `offset`. Register `process.on('SIGINT', …)` to `clearInterval` and `process.exit(0)`. Guard against truncation (size < offset → reset offset = 0).
- verify: tests/cli/status-anomalies-tail.test.ts green.
- done: AC-1, AC-2, AC-3, AC-4, AC-5

### T2: Tests
- files: `packages/core/tests/cli/status-anomalies-tail.test.ts`
- action: Unit: `tailSelect` (returns last N, chronological; N≥len returns all; N=0 → empty) and `parseAnomalyLines` (skips bad lines, counts them). Spawned-CLI (mirror existing status tests harness): seed a log with K events; (a) `--tail --limit=3` prints exactly the last 3 oldest→newest; (b) without `--tail` newest-first unchanged (regression guard); (c) `--tail --follow` with NO TTY + no seam → stderr fallback note + one-shot tail + exit 0 (no hang); (d) `--tail --follow` with `CADENCE_FORCE_FOLLOW=1`: spawn, await initial output, append two more JSON lines (one matching `--type`, one not, with `--type` set), assert only the matching one streams, then `p.kill('SIGINT')` and assert exit code 0. Use generous timeouts; never leave a process running.
- verify: `pnpm --filter @cadence/core exec vitest run tests/cli/status-anomalies-tail.test.ts` green.
- done: AC-1, AC-2, AC-3, AC-4, AC-5

### T3: README — anomalies reader section
- files: `README.md`
- action: Extend the `cadence status anomalies` documentation with `--tail` (last N chronological) and `--follow` (live stream; Ctrl-C to stop; needs a TTY, falls back otherwise), including a one-line example of watching settle in another terminal.
- verify: `pnpm turbo run typecheck test build` green.
- done: AC-1, AC-2

## Boundaries

- DO NOT change the default (no-`--tail`) output ordering or the existing `--since`/`--type`/`--limit` semantics — additive only.
- DO NOT busy-spin: the follow loop polls on an interval and must clear it on SIGINT and on exit.
- DO NOT hang on a non-TTY without the `CADENCE_FORCE_FOLLOW` seam — fall back to one-shot and return.
- DO NOT re-print the header for streamed rows, and DO NOT re-print events already shown in the initial tail (track the byte offset).
- DO NOT read the whole file on every poll tick — read only the appended `offset..end` slice.
