---
phase: 63-cadence-tutorial
id: 63-01
tier: standard
status: PENDING
---

# 63-01 — cadence tutorial — guided first-loop walkthrough

## Objective

Add a `cadence tutorial` command that runs one real DRAFT→BUILD→SETTLE loop
inside an ephemeral sandbox directory — printing each step's command and the
engine's *actual* output, pausing between steps in a TTY — so a newcomer sees
the whole loop end-to-end in ~2 minutes without touching their own project.

## Context

Phase 62 added a static "Your first loop" block to `cadence init` output (the
numbered draft→approve→done→settle list). This phase is its executable
companion: instead of *listing* the commands, `cadence tutorial` *runs* them
against a throwaway `.cadence/` in a temp dir, so the output can't drift from
real behavior (the honest-walkthrough choice). It composes the existing
extracted engine services — it does not re-implement loop logic.

Programmatic surface (confirmed): `draftNewService`, `draftApproveService`
(`src/services/{draft-new,draft-approve}.ts`), `recordTaskOutcome`
(`src/build/record.ts`), `settleService` (`src/services/settle.ts`), all taking
`(repoRoot, args, io)`; `bufferIO()` (`src/services/io.ts`) captures their
stdout. Sandbox scaffold mirrors `init.ts` lines 277–284 (`mkdir` phases/… +
`emptyState(name)` + `new SimpleStateBackend(root).commit(state)`).

## Acceptance Criteria

### AC-1: tutorial runs the full loop end-to-end and exits 0
Given any working directory (initialized as a cadence project or not)
When `cadence tutorial --no-pause` is run
Then it scaffolds a throwaway `.cadence/` in a temp dir, drives
draft→approve→done→settle through the real engine, the sandbox's final
`loopPosition` reaches `IDLE` with a SUMMARY written, and the process exits 0.

### AC-2: each of the 5 steps prints its command + real engine output
Given a tutorial run
When it executes
Then stdout shows five labeled steps (`Step 1/5 · DRAFT` … `Step 5/5 · SETTLE`),
each printing the `$ cadence …` command line followed by the engine's actual
captured output (e.g. a "Created …DRAFT.md" line for step 1, a settle/SUMMARY
line for step 5) — not hand-written narration.

### AC-3: the sandbox is isolated and always cleaned up
Given a tutorial run that completes OR throws partway
When the command returns
Then the temp dir is removed (no leftover `cadence-tutorial-*` dirs), and the
user's real `.cadence/` in the cwd — if one exists — is never read or written
by the tutorial.

### AC-4: non-interactive mode auto-advances
Given a non-TTY stdin (CI, tests, piped, agents) or the `--no-pause` flag
When `cadence tutorial` runs
Then it advances through all steps without blocking on a prompt, running to
completion; in a TTY without `--no-pause` it pauses between steps for the user.

### AC-5: runs fully offline and deterministically
Given no `ANTHROPIC_API_KEY` and no network
When `cadence tutorial` runs
Then it completes using the default mock verifier (no network calls), with a
deterministic step sequence and exit code.

## Tasks

### T1: Sandbox lifecycle helper
- files: `packages/core/src/cli/commands/tutorial.ts`
- action: Add `withSandbox(fn)` — `mkdtemp(join(tmpdir(), 'cadence-tutorial-'))`,
  scaffold a minimal `.cadence/` there (mirror init.ts 277–284: mkdir
  phases/handoff/research/archive, write a minimal `config.json` whose gate
  profile/deltas keep the settle stack passable on a no-test toy draft, then
  `emptyState('tutorial')` + `new SimpleStateBackend(root).commit(state)`), call
  `fn(root)`, and `rm(root, { recursive: true, force: true })` in a `finally`.
- verify: unit test asserts the temp dir exists during `fn` and is gone after,
  including when `fn` throws.
- done: AC-3, AC-5

### T2: Step runner over the real services
- files: `packages/core/src/cli/commands/tutorial.ts`
- action: Sequence the five steps inside `withSandbox`, each: print
  `Step N/5 · <PHASE>` + the `$ cadence …` command line, run the service with a
  fresh `bufferIO()`, then echo the buffer's captured `out`. Steps:
  (1) `draftNewService(root, { phase:'demo', num:'01', title:'Hello loop', tier:'quick-fix' }, io)`;
  (2) `draftApproveService(root, { phase:'demo', num:'01', approve:false }, io)`;
  (3) `recordTaskOutcome(root, 'T1', 'DONE', '…')`;
  (4) `settleService(root, { ac:['AC-1=pass'], force:true, allowMissingCoverage:true, …allow-flags as needed }, io)`.
  Between (1) and (2), write a toy DRAFT body with one AC + one task so approve
  + settle have something coherent to act on (reuse `renderDraftBody`/edit).
- verify: captured stdout contains all five `Step N/5` markers and at least one
  real engine line per step; final `readState(root).loopPosition === 'IDLE'`.
- done: AC-1, AC-2

### T3: Pause / auto-advance + command registration
- files: `packages/core/src/cli/commands/tutorial.ts`,
  `packages/core/src/cli/register.ts`
- action: Add a `--no-pause` flag; between steps, when stdin is a TTY and
  `--no-pause` is absent, prompt "press enter to continue …" (reuse the
  `StdinPrompter`/`isTTY` pattern from init/draft; honor
  `CADENCE_PROMPTER_SCRIPT` for scripted tests), else auto-advance. Register
  `registerTutorialCommand` in `register.ts`. End with a closing pointer back to
  `cadence init`.
- verify: with a non-TTY stdin the command completes without hanging; with a
  scripted prompter it advances on each scripted line.
- done: AC-4

### T4: Tests
- files: `packages/core/tests/cli/tutorial.test.ts`
- action: Cover AC-1..AC-5 with token refs (`AC-1`…`AC-5`). Use a non-TTY /
  `--no-pause` invocation of the command action; assert exit/return, the five
  step markers, real output lines, sandbox cleanup (no leftover temp dir +
  cwd `.cadence/` untouched), and offline completion. Run the command via its
  exported action (or a thin `runTutorial(opts, io)` seam) — do not shell out.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tutorial`
- done: AC-1, AC-2, AC-3, AC-4, AC-5

## Boundaries

- DO NOT import `@manehorizons/cadence-testkit` in production code — it is
  `private`/dev-only and must never enter a published package. The tutorial
  scaffolds its own sandbox.
- DO NOT read or mutate the user's real `.cadence/` in the cwd — every state
  read/write targets the temp dir's root.
- DO NOT add any network dependency — mock verifier only; the run must work
  with no API key and no connectivity.
- DO NOT duplicate engine logic — compose the existing `*Service` functions and
  `recordTaskOutcome`; the only new logic is sandboxing, sequencing, and
  printing.
- DO NOT leave the toy `demo` phase tier high enough to trip gates that can't
  pass offline on a no-test draft — keep it `quick-fix` and pass `force` +
  the minimal allow-flags.
