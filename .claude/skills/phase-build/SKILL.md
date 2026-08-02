---
name: phase-build
description: Orchestrate a full CADENCE phase build end-to-end — worktree isolation, wave-based subagent dispatch from the approved DRAFT, an independent reviewer per task, main-thread re-verification of every completion claim, a whole-branch review, the single-commit settle, and a PR carrying its changeset. Use when a DRAFT is approved and the user says "build this phase", "execute the draft", "run the dispatch loop", or when resuming a partially built phase.
---

# Phase build (subagent-driven, verification-first)

The core rule this pipeline exists to enforce: **a subagent's "done, all tests
passing" is not evidence.** Subagents in this repo have twice claimed all-green
over real failures. Every completion claim gets re-verified in the main thread
before it is recorded.

## Preconditions

- Loop position is BUILD (or DRAFT with an approved draft — run `cadence progress`).
- Read the DRAFT: `.cadence/phases/<phase>/<id>-DRAFT.md`. Note each task's
  `files:` boundary, `verify:` command, and `done: AC-N` mapping. Respect
  `## Boundaries` (the Do-NOT list) absolutely.

## Pipeline

1. **Isolate.** Enter a git worktree for the phase (native worktree tool
   preferred over manual `git worktree add`; convention: branch
   `feat/<slug>`, worktree under `.claude/worktrees/<slug>`). Before *any*
   commit in this pipeline, confirm `git rev-parse --show-toplevel` points at
   the worktree — a subagent has committed to the primary checkout by mistake.
   If this build is deliberately running parallel agents (this phase and
   another in flight at once), isolate to a worktree/branch from task 1 —
   before any subagent touches a file — not reactively after a `files:`
   conflict is noticed. Also confirm no other live session already
   holds this phase/draft (check for a running `cadence` process, an open
   terminal, or recent `PROGRESS.json` activity via `cadence doctor`) before
   dispatching into it; if one might still be running, resume that session in
   place instead of starting a second one against the same draft.
2. **Plan waves.** Run `cadence dispatch plan --json`. It computes dispatch
   waves from `depends:` edges and `files:`-overlap edges. Never parallelize
   two tasks whose `files:` overlap, even if the plan seems to allow it.
3. **Per wave — implement.** Dispatch one implementer subagent per task in
   the wave (parallel Task-tool calls). Each prompt must contain: the task's
   full DRAFT text, its `files:` boundary ("touch nothing else"), TDD order
   (failing test referencing the `AC-N` token inside an asserting `it()`/
   `test()` block, then implementation), the exact `verify:` command, and an
   instruction to report the commands it ran with their real output.
4. **Per task — review.** Dispatch a fresh, independent reviewer subagent per
   completed task: adversarial, diff-scoped, checks boundary compliance, test
   honesty (assertions, not `AC-N` comment drops), and DRAFT conformance.
   Findings go back to a fix round, then re-review.
5. **Per task — re-verify yourself.** In the main thread: read the actual
   diff, then run the full pipeline yourself —
   `pnpm turbo run lint typecheck test build` (package-filtered while
   iterating; full before the wave closes). Only after this passes, record
   `cadence done <T>`. Never record DONE from a report.
6. **Whole-branch review.** After all waves: one fresh subagent reviews the
   entire branch diff against the DRAFT's Objective + ACs. It must return
   "ready to merge" with zero Critical/Important findings. History says this
   pass catches real defects the per-task reviews miss (an ordering bug, doc
   prose describing a pre-fix algorithm, stale code comments) — do not skip
   it for "simple" phases.
7. **Settle, one commit.** Run `cadence settle run --auto` — if it refuses,
   the gate is right until proven otherwise; fix the cause, don't reach for
   `--force`/`--allow-*`. Once it passes, stage everything together — source,
   tests, docs, the `.changeset/*.md` for this phase (feature PRs carry their
   own changeset, never deferred to the release PR), and the phase artifacts
   (`-DRAFT.md`, `-PROGRESS.json`, `-SUMMARY.*`, and `-SUMMARY-snapshot.*`
   if the phase produced any refused-attempt siblings — phase 247) —
   and make one commit
   (`feat:`/`fix:`, phase id in the subject). `state.json`/`STATE.md` stay
   gitignored, never committed. If the phase closes a Praxis recommendation,
   promote it to `shipped` in this same commit.
8. **Land.** Exit the worktree, then invoke the `pr-land` skill.

## Known failure modes to actively watch

- Subagent misreports test results → step 5 is non-negotiable.
- Subagent escapes its `files:` boundary → reviewer checks the diff file list
  against the DRAFT; boundary enforcement may also refuse at edit time.
- Two phases in parallel worktrees touching the same schema/parser files
  (`packages/types/src/plan.ts`, `packages/core/src/parse/draft-parser.ts`
  are repeat offenders) → expect a manual conflict resolution on the second
  merge; re-run the full suite after resolving.
- Docs written before a mid-build design change still describe the old
  design → the whole-branch review explicitly re-reads doc diffs last.
