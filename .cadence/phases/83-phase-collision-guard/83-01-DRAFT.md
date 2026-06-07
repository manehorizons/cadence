---
phase: 83-phase-collision-guard
id: 83-01
tier: standard
status: PENDING
---

# 83-01 — Phase-collision guard (worktree safety)

## Objective

Make phase-number collisions across sibling git worktrees (and already-merged upstream phases)

## Acceptance Criteria

### AC-1: Pure detector identifies collisions and the next free number
Given a target phase number and a list of occupancies `{ number, source, location }`
When `detectPhaseCollision(target, occupancies, opts?)` runs (no I/O)
Then it returns `collides` true iff some occupancy's `number === target` (minus `opts.excludeNumbers`),

### AC-2: Collector gathers occupancy from local, siblings, and upstream
Given a repo with sibling worktrees and an `origin` remote
When `gatherOccupancy(repoRoot, { integrationRef })` runs
Then it returns occupancies for: local `.cadence/phases/` dirs; every sibling worktree path

### AC-3: Graceful degradation — best-effort, never throws
Given no git binary / not a repo / no `origin` / a sibling with no `.cadence/` / an `integrationRef`
When `gatherOccupancy` runs
Then each failing source contributes nothing (the collector never throws), so a non-git or offline

### AC-4: Scaffold guard refuses colliding phase numbers
Given a target phase number already in use by a sibling worktree or upstream
When `cadence spec new <phase> <num>` or `cadence draft new <phase> <num>` runs
Then scaffolding is refused before any file is created, with a message naming each conflict

### AC-5: `--allow-phase-collision` bypasses the guard
Given a detected cross-worktree/upstream collision
When the same `spec new` / `draft new` (and `settle run`) command is run with `--allow-phase-collision`
Then the guard is bypassed and the command proceeds (the local same-dir `existsSync` guard is

### AC-6: Settle backstop catches the scaffold-race
Given `state.activePhase` whose number collides with a sibling worktree or upstream
When `cadence settle run` runs
Then an early precondition in `settleService` (excluding self via `excludeNumbers`) refuses with the

### AC-7: `phaseGuard` config with back-compat defaults
Given a `.cadence/config.json` with or without a `phaseGuard` block
When config is loaded
Then `phaseGuard: { enabled: boolean (default true), integrationRef: string (default "main") }`

## Tasks

### T1: Pure collision detector
- files: `packages/core/src/phases/collision.ts`, `packages/core/tests/phases/collision.test.ts`
- action: Add `detectPhaseCollision(target: number, occupancies: Occupancy[], opts?: { excludeNumbers?: number[] }): { collides: boolean; conflicts: Occupancy[]; nextFree: number }`
  plus `Occupancy = { number: number; source: 'sibling' | 'upstream' | 'local'; location: string }`
  and a `phaseNumber(dirName: string): number | null` helper (leading `^(\d+)` token, else null).
  No I/O. `conflicts` = occupancies whose `number === target` minus `excludeNumbers`;
  `collides = conflicts.length > 0`; `nextFree = max(target, ...occupancy.numbers) + 1`.
- verify: test — collision / no-collision; multiple conflicts; self-exclusion via `excludeNumbers`;
  `nextFree` with gaps and ties; `30-auth` vs `30-cache` both → `30` (collide);
  non-numeric dir names ignored.
- done: AC-1

### T2: `phaseGuard` config block
- files: `packages/types/src/config.ts`, `packages/types/tests/config.test.ts`
- action: Add to `CadenceConfigZ` an optional `phaseGuard: z.object({ enabled: z.boolean().default(true),
  integrationRef: z.string().default('main') }).default({ enabled: true, integrationRef: 'main' })`;
  add the matching entry to `defaultConfig`. Back-compat: omitting the block applies defaults.
- verify: test — config without `phaseGuard` parses with defaults `{enabled:true, integrationRef:'main'}`;
  `enabled:false` and a custom `integrationRef` round-trip; `defaultConfig` includes the block.
- done: AC-7

### T3: Impure occupancy collector
- files: `packages/core/src/phases/occupancy.ts`, `packages/core/tests/phases/occupancy.test.ts`
- action: Add `gatherOccupancy(repoRoot: string, opts: { integrationRef: string }): Promise<Occupancy[]>`
  built on a private best-effort `git()` exec wrapper (mirror `handoff/git-facts.ts`: `execFile`,
  5s timeout, `windowsHide`). Sources, each in its own try/catch contributing `[]` on any failure:
  (a) **local** — read `<repoRoot>/.cadence/phases/` dir names → `source:'local'`, `location:repoRoot`;
  (b) **sibling** — `git worktree list --porcelain`, for each `worktree <path>` where `path !== repoRoot`
  read `<path>/.cadence/phases/` → `source:'sibling'`, `location:<path>`;
  (c) **upstream** — `git ls-tree -d --name-only origin/<integrationRef> -- .cadence/phases/` →
  `source:'upstream'`, `location:'origin/<integrationRef>'`. Never throws.
- verify: test — a real ephemeral git repo (`git init`) with a sibling `git worktree add` scaffolding
  a phase dir → detected as `sibling`; a local bare remote (`git init --bare` + push) with a phase dir
  on `origin/main` → detected as `upstream`; a non-git dir, an absent `origin`, and a sibling with no
  `.cadence/` each contribute nothing (no throw). (testkit `tempRepo` gives the dir; the test drives
  `git` itself — testkit has no git helper.)
- done: AC-2, AC-3

### T4: Shared guard + scaffold integration (spec new / draft new)
- files: `packages/core/src/phases/guard.ts`, `packages/core/src/services/spec-new.ts`,
  `packages/core/src/services/draft-new.ts`, `packages/core/src/cli/commands/spec.ts`,
  `packages/core/src/cli/commands/draft.ts`, `packages/core/tests/phases/guard.test.ts`,
  `packages/core/tests/services/scaffold-collision.test.ts`
- action: Add `assertNoPhaseCollision(repoRoot, target, { config, allow, excludeNumbers? }): Promise<{ ok: true } | { ok: false; message: string }>`
  that short-circuits `ok` when `config.phaseGuard.enabled === false` or `allow === true`, else
  `gatherOccupancy` (with `config.phaseGuard.integrationRef`) → `detectPhaseCollision` → on collision
  build a message naming each conflict (`phase N is in use by worktree <path>` / `…on origin/<ref>`)
  + `suggested next free: <nextFree>` + the `--allow-phase-collision` hint. Wire into `specNewService`
  and `draftNewService` right AFTER the local `existsSync` check and BEFORE `mkdir`, deriving
  `target = phaseNumber(args.phase)` (skip guard if null); thread a new `allowPhaseCollision?: boolean`
  arg. Add `--allow-phase-collision` option to the `spec new` and `draft new` CLI commands. Load config
  best-effort (null → defaults); guard stays additive to the existing same-dir `existsSync` refusal.
- verify: test — guard returns refusal with named conflict + next-free when occupancy collides, `ok`
  when `allow`/`enabled:false`/no collision; service-level: a colliding target refuses (exit≠0, no dir
  created) and `allowPhaseCollision:true` proceeds; the local `existsSync` path is unaffected by the flag.
- done: AC-4, AC-5

### T5: Settle backstop precondition
- files: `packages/core/src/services/settle.ts`, `packages/core/src/cli/commands/settle.ts`,
  `packages/core/tests/services/settle-collision.test.ts`
- action: After the `loopPosition === 'BUILD'` precondition and config load in `settleService`, call
  `assertNoPhaseCollision(cwd, phaseNumber(state.activePhase), { config: cadenceConfig, allow: opts.allowPhaseCollision, excludeNumbers: [phaseNumber(state.activePhase)] })`
  (self-excluded so the local dir never self-collides) and on refusal `io.err(message)` +
  `return { exitCode: 1 }` before the gates run. Add `allowPhaseCollision?: boolean` to `SettleArgs`
  and the `--allow-phase-collision` option to the `settle run` CLI command.
- verify: test — settle refuses when `state.activePhase`'s number collides with a sibling worktree
  (self-excluded → no false positive from the local dir), proceeds with `--allow-phase-collision`,
  and a single-worktree settle is unaffected. Close with full `pnpm turbo run lint typecheck test build`.
- done: AC-6

## Boundaries

- DO NOT add a reservation/allocation registry, auto-renumber, or make `progress`/`recommend`
  worktree-aware allocators — observe ground truth only (Approach A).
- DO NOT make the collector throw: every git/fs failure on a source yields `[]`. The ONLY hard
  failure in the feature is an actual detected collision.
- DO NOT add the backstop as a gate in the 13-gate matrix (`gates/engine.ts`) — it is a
  `settleService` precondition, not a profile×tier cell.
- DO NOT alter the existing local same-dir `existsSync` refusal in spec-new/draft-new, and the
  `--allow-phase-collision` flag must NOT bypass it.
- `cadence-types` stays pure (Zod + types only — no git/fs in the `phaseGuard` schema).
- Defer the optional `cadence doctor` cross-worktree line to a follow-up (keep phase 83 tight).
