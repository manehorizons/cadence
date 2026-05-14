---
phase: 16-interactive-verdict
id: 16-01
tier: standard
status: PENDING
---

# 16-01 — --interactive human-verdict mode

## Objective

Land the third layer of the DESIGN.md Section 3.2 hybrid: an `--interactive` settle mode that walks the user through each AC (text + linked tests + touched files) and accepts a per-AC verdict from stdin. Human ground truth as the trust-floor option for `strict` profile.

## Acceptance Criteria

### AC-1: Prompter abstraction with stdin + scripted impls
Given a `Prompter` interface with `ask(question): Promise<string>`
When implementations are inspected
Then `StdinPrompter` reads via `node:readline/promises` (refuses gracefully when stdin is not a TTY) and `ScriptedPrompter` returns pre-seeded answers in order (for tests). Both are pure-ish (no global state); the scripted one throws on exhaustion.

### AC-2: walkAcsInteractively iterates ACs and collects verdicts
Given functions `walkAcsInteractively(acs, tests, files, prompter)` are invoked
When each AC is presented
Then the function prints the AC's id + given/when/then + linked test refs + touched files, prompts the user for `pass | fail | skip` and an optional one-line note, and returns `Record<AcId, {verdict, note?}>`. Skip means "no verdict — use other gates" and is omitted from the result map.

### AC-3: settle `--interactive` fires the walker
Given `cadence settle run --auto --interactive` runs
When the walker completes
Then verdicts marked `pass` land in `acResults` (overriding any auto-derived verdict for that AC), verdicts marked `fail` land in `acResults` with `pass=false` and the note (or a default), skipped ACs fall through to the structural / coverage / deep paths, and the full per-AC outcome is recorded in `SUMMARY.json interactiveVerify`.

### AC-4: gate-enabled auto-invocation
Given the effective gate set contains `'interactive-verdict'` (per the matrix, all `strict` cells)
When `cadence settle run --auto` runs without `--interactive`
Then the walker fires anyway, behaving identically to the explicit-flag path. Failed verdicts on non-overridden ACs refuse with exit 1 unless `--force`.

### AC-5: non-TTY refusal + bypass
Given stdin is not a TTY (CI, piped invocation)
When `--interactive` (or the gate) tries to run the walker
Then settle refuses with a clear stderr message naming the conflict. `--no-interactive` bypasses the gate for one invocation; explicit `--ac` overrides still win even when the walker is gated on.

### AC-6: full suite green + self-dogfood
Given Phase 16 is complete
When `pnpm turbo run test` runs
Then ~294 → ~315+ tests pass. Phase 16's own settle uses the `ScriptedPrompter` (or just skips via `--no-interactive`) and lands cleanly. AC-1..AC-6 are each referenced by ≥1 test file.

## Tasks

### T1: Prompter interface + StdinPrompter + ScriptedPrompter
- files: `packages/core/src/verify/prompter.ts` (new), `packages/core/tests/verify/prompter.test.ts` (new)
- action: Define `Prompter` interface. Implement `StdinPrompter` using `readline/promises.createInterface({input, output})`; constructor accepts `{ input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream }` for testability, defaults to `process.stdin`/`process.stdout`. Implement `ScriptedPrompter(answers: string[])` that returns answers in order and throws when exhausted. Tests cover: stdin happy path (using a readable stream from `node:stream`), scripted ordering, scripted exhaustion throws.
- verify: vitest green.
- done: AC-1

### T2: walkAcsInteractively walker
- files: `packages/core/src/verify/interactive.ts` (new), `packages/core/tests/verify/interactive.test.ts` (new)
- action: Implement `walkAcsInteractively(input, prompter, write)` where `input` carries `{ acs, tests, files }` and `write` is the output sink (defaults to `process.stdout.write`). For each AC: write the header + given/when/then + linked tests + touched files, prompt `pass | fail | skip`, optionally prompt for a one-line note. Return `Record<AcId, {verdict: 'pass'|'fail', note?: string}>` (skip omitted). Tests use `ScriptedPrompter` + a capturing `write` to verify the full transcript.
- verify: vitest green; transcript matches expectations.
- done: AC-2

### T3: settle `--interactive` integration
- files: `packages/types/src/summary.ts`, `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/settle-interactive.test.ts` (new)
- action: Extend `SummaryZ` with optional `interactiveVerify?: Record<AcId, {verdict, note?}>`. Wire `--interactive` flag + auto-enabled when `'interactive-verdict'` in gate set. Add `--no-interactive` flag (commander auto-negates). Refuse with exit 1 + clear message when prompter is needed but stdin is not a TTY (unless `--no-interactive`). For tests, expose `settle()` to inject a `Prompter` — simplest path: read a `CADENCE_PROMPTER_SCRIPT` env var (newline-separated answers) and instantiate `ScriptedPrompter` instead of `StdinPrompter` when set. Tests cover gate firing, refusal on fail, explicit override still wins, non-TTY refusal, `--no-interactive` bypass.
- verify: vitest green; integration tests use the env-var seam.
- done: AC-3, AC-4, AC-5

### T4: docs + dogfood self-check
- files: `DESIGN.md`, `README.md`
- action: DESIGN.md Section 3.2: mark `--interactive` as shipped. Section 10 punchlist: tick Phase 16. README `## Verification → Deep verifier` section gains `### Interactive verdict` subsection explaining the walker, the prompter seam, and the `--no-interactive` bypass + non-TTY behavior. Self-dogfood: settle this phase with `--no-interactive` (since CI/agent context isn't a TTY) — the gate must not refuse when explicitly bypassed.
- verify: visual read + dogfood settle is green.
- done: AC-3, AC-6

## Boundaries

- DO NOT spawn a TUI or use ink/blessed. Plain line-based prompts only.
- DO NOT shell out to `git diff` for rendering — the walker shows test refs + file list; full diff rendering can be a later F-item.
- DO NOT replace the structural/coverage/deep verifiers. `--interactive` is *additional*: it overrides ACs the human verdicts on; other ACs still flow through the prior gates.
- DO NOT prompt asynchronously (parallel prompts for multiple ACs). One AC at a time, sequential.
- DO NOT auto-record the verifier's reasoning into the user's prompt context — keep the human verdict independent of any prior `--deep` output.
- DO NOT change `Verifier` interface (Phase 15). Interactive mode is not a `Verifier` — it's a settle-level gate, distinct in shape.
