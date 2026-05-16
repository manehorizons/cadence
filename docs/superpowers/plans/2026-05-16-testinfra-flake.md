# Test-infra Flake Root-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the recurring full-turbo-parallel pre-push flake at its root — a shared vitest base config (centralized `testTimeout`/`hookTimeout`/`maxForks`) plus a Windows-safe `tempRepo` cleanup retry — and retire the per-test timeout band-aids.

**Architecture:** New repo-root `vitest.shared.ts` holds the timeout/pool knobs; all five vitest configs `mergeConfig` it (one source of truth, ends 5-config drift). `tempRepo().cleanup()` gains `fs.rm` `maxRetries`/`retryDelay` (fixes the Windows `EBUSY`/`ENOTEMPTY` rmdir race for every consumer). The Phase 29.5 + 30.2 per-test `{timeout:20000}` overrides are reverted (the global supersedes them).

**Tech Stack:** TypeScript, vitest 2.1 (`mergeConfig`, `pool:'forks'`, `poolOptions.forks.maxForks`), Node `fs.rm` retry, pnpm + turbo monorepo. Spec: `docs/superpowers/specs/2026-05-16-testinfra-flake-design.md`.

**Execution note (CADENCE dogfood — READ FIRST, overrides per-task git steps):**
This runs as a CADENCE phase on `main` (no worktree — project convention) under the **strict two-commit-per-phase convention**: exactly ONE substantive commit (configs + fixture + test reverts + docs, NOT `.cadence/*`) then ONE `chore: settle …` commit (`.cadence/phases/32-testinfra-flake/*` + `.cadence/STATE.md` + `.cadence/state.json`). The project's entire history follows this — **never one commit per task**.

This is **config/infra, not feature code** — there is **no TDD red-green cycle**. The spec deliberately rules out unit-testing vitest config / `fs.rm` retry as test-theater. **Verification IS the previously-blocked gate itself**: `pnpm turbo run test` green full-parallel on this Windows box across **≥3 consecutive runs**. Do not add new assertion tests; do not flag the absence of TDD steps as a gap.

Per-task "Checkpoint" entries are **stage-and-record, NOT commits** — run the targeted verification, `git add` the touched files, then `node packages/core/bin/cadence.cjs build task T<n> --status=DONE --notes "…"`. Do **not** `git commit` until Task 6.

Loop sequence: `node packages/core/bin/cadence.cjs draft new 32-testinfra-flake 01 --title="test-infra flake root-fix" --tier=standard` → fill DRAFT (ACs at the bottom of this plan) → `draft check` → `draft approve 32-testinfra-flake 01` → implement Tasks 1–5 (`build task T<n> --status=DONE` after each) → Task 6 (single substantive commit → `settle run --auto --allow-missing-coverage` → settle commit). Push is **user-gated**.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `vitest.shared.ts` | Shared test base: `testTimeout`/`hookTimeout`/`pool`/`maxForks` | **Create** (repo root) |
| `vitest.config.ts` | Root workspace config — `mergeConfig(shared)` + keep `include` + `coverage` | Modify |
| `packages/core/vitest.config.ts` | `mergeConfig(shared)` + own `include` | Modify |
| `packages/testkit/vitest.config.ts` | `mergeConfig(shared)` + own `include` | Modify |
| `packages/types/vitest.config.ts` | `mergeConfig(shared)` + own `include` | Modify |
| `packages/host-claude-code/vitest.config.ts` | `mergeConfig(shared)` + own `include` | Modify |
| `packages/testkit/src/fixture.ts` | `rm` retry options on `cleanup()` (line ~34) | Modify |
| `packages/core/tests/hooks/dispatcher.test.ts` | Drop Phase 29.5 per-test timeout + its comment | Modify (lines 88–90, 102) |
| `packages/core/tests/cli/build-per-task.test.ts` | Drop Phase 30.2 describe timeout + its comment | Modify (lines 74–78) |
| `.cadence/ROADMAP.md` | Remove "Test infra" from Deferred-v1.2+; record pulled-forward | Modify |
| `DESIGN.md` | §10 punchlist — add item 33 (Phase 32.1) | Modify (after line 230) |
| `CHANGELOG.md` | `## [Unreleased] → ### Fixed` entry | Modify |

---

## Task 1: shared vitest base + rewrite all five configs

**Files:**
- Create: `vitest.shared.ts` (repo root)
- Modify: `vitest.config.ts`, `packages/core/vitest.config.ts`, `packages/testkit/vitest.config.ts`, `packages/types/vitest.config.ts`, `packages/host-claude-code/vitest.config.ts`

- [ ] **Step 1: Create `vitest.shared.ts`** (repo root) — exact contents:

```ts
import { defineConfig } from 'vitest/config';

// Single source of truth for test timeout + worker-pool tuning across every
// package. Per-package vitest.config.ts files mergeConfig() this and add only
// their own `include` (root also adds `coverage`). Raising the timeout here
// and capping forks is the root-cause fix for the recurring full-turbo
// parallel-load flake — see
// docs/superpowers/specs/2026-05-16-testinfra-flake-design.md.
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: 'forks',
    poolOptions: { forks: { maxForks: 12 } },
  },
});
```

- [ ] **Step 2: Rewrite root `vitest.config.ts`** — exact contents (preserves the existing `include` glob and the `coverage` block verbatim):

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import shared from './vitest.shared';

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ['packages/*/tests/**/*.test.ts'],
      coverage: {
        reporter: ['text', 'html'],
        include: ['packages/*/src/**'],
      },
    },
  }),
);
```

- [ ] **Step 3: Rewrite the four package configs** — `packages/core/vitest.config.ts`, `packages/testkit/vitest.config.ts`, `packages/types/vitest.config.ts`, `packages/host-claude-code/vitest.config.ts` are currently byte-identical (`globals/environment/include: ['tests/**/*.test.ts']`). Replace **each** with exactly:

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared';

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
    },
  }),
);
```

(Same content for all four — relative import `../../vitest.shared` resolves repo-root from `packages/<name>/`. Vite's TS config loader resolves the extensionless path; if the loader errors on the path, retry with `'../../vitest.shared.ts'` — but try extensionless first, it is the vitest norm.)

- [ ] **Step 4: Verify configs load and the timeout/pool apply**

Run: `pnpm -C packages/types build && pnpm -C packages/types test`
Expected: PASS (types is the fastest package; this proves the mergeConfig base resolves, parses, and doesn't break collection). Then: `pnpm -C packages/core test -- run hooks/dispatcher`
Expected: PASS in isolation (sanity that the shared base loads for core too — full-suite tuning is Task 4). (Ordering note: testkit `dist` is rebuilt in Task 2 and the Phase 29.5 inline `}, 20000` is still present here — both are fine for this isolated sanity run; the inline override is reverted in Task 3 once the global budget from Step 1 covers it.)

- [ ] **Step 5: Checkpoint (stage only — NO commit)**

```bash
git add vitest.shared.ts vitest.config.ts packages/core/vitest.config.ts packages/testkit/vitest.config.ts packages/types/vitest.config.ts packages/host-claude-code/vitest.config.ts
```
Then: `node packages/core/bin/cadence.cjs build task T1 --status=DONE --notes "shared vitest base + 5 configs mergeConfig"`

---

## Task 2: tempRepo cleanup rmdir retry

**Files:**
- Modify: `packages/testkit/src/fixture.ts` (the `cleanup` closure, line ~34)

- [ ] **Step 1: Apply the retry options.** Replace exactly:

```ts
    cleanup: async () => rm(root, { recursive: true, force: true }),
```

with:

```ts
    cleanup: async () =>
      rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
```

(`rm` is already imported from `node:fs/promises` at the top of the file — no import change. Node retries `EBUSY`/`EMFILE`/`ENFILE`/`ENOTEMPTY`/`EPERM` with linear backoff; 5×100ms ≈ ≤1.5s worst case, well inside the 20000ms `hookTimeout` from Task 1.)

- [ ] **Step 2: Rebuild testkit** (core tests import the compiled `dist`):

Run: `pnpm -C packages/testkit build`
Expected: clean build, no errors.

- [ ] **Step 3: Sanity — a tempRepo-heavy core file still green isolated**

Run: `pnpm -C packages/core test -- run integration/end-to-end`
Expected: PASS (confirms the new cleanup signature works end-to-end; isolated so no contention yet).

- [ ] **Step 4: Checkpoint (stage only — NO commit)**

```bash
git add packages/testkit/src/fixture.ts
```
Then: `node packages/core/bin/cadence.cjs build task T2 --status=DONE --notes "tempRepo rm retry (Windows EBUSY/ENOTEMPTY)"`

---

## Task 3: revert the Phase 29.5 + 30.2 per-test timeout band-aids

**Files:**
- Modify: `packages/core/tests/hooks/dispatcher.test.ts` (lines 88–90 comment, line 102 timeout arg)
- Modify: `packages/core/tests/cli/build-per-task.test.ts` (lines 74–77 comment, line 78 describe option)

- [ ] **Step 1: Revert 29.5 in `dispatcher.test.ts`.** Delete this 3-line comment block (currently lines 88–90):

```ts
  // AC-1: 105 serial atomic state.json writes exceed vitest's 5s default
  // under turbo/parallel load on slower boxes; give this IO-bound test
  // generous headroom (logic + assertions unchanged).
```

And change the test's closing line (currently line 102) from:

```ts
  }, 20000);
```

to:

```ts
  });
```

(The `it('skill-invoke caps at 100 entries with FIFO drop', async () => { … }` body is unchanged — only the trailing `, 20000` timeout arg and the now-obsolete comment go.)

- [ ] **Step 2: Revert 30.2 in `build-per-task.test.ts`.** Delete this 4-line comment block (currently lines 74–77):

```ts
// AC-1: every it here spawns the built CLI (subprocess + execSync git +
// tempRepo IO); the 5s default testTimeout is too tight under the full
// turbo-parallel pre-push gate on slower boxes. Generous block-level
// timeout (matches Phase 29.5's dispatcher fix); logic unchanged.
```

And change the describe line (currently line 78) from:

```ts
describe('cadence build task (Phase 24.2 — per-task verifier gate)', { timeout: 20000 }, () => {
```

to:

```ts
describe('cadence build task (Phase 24.2 — per-task verifier gate)', () => {
```

- [ ] **Step 3: Verify both revert-targeted files still pass isolated** (the shared 20000ms `testTimeout` from Task 1 now covers what the inline overrides used to):

Run: `pnpm -C packages/core test -- run hooks/dispatcher cli/build-per-task`
Expected: PASS (no `Test timed out` — the global budget carries them).

- [ ] **Step 4: Checkpoint (stage only — NO commit)**

```bash
git add packages/core/tests/hooks/dispatcher.test.ts packages/core/tests/cli/build-per-task.test.ts
```
Then: `node packages/core/bin/cadence.cjs build task T3 --status=DONE --notes "revert 29.5/30.2 per-test timeout band-aids (global supersedes)"`

---

## Task 4: tune `maxForks` against the real gate (the empirical core)

**Files:** none new — iterates `vitest.shared.ts` from Task 1 only if needed.

This task IS the spec's exit criterion. The flake is probabilistic; one green run is not evidence.

- [ ] **Step 1: Full rebuild + the previously-blocked gate, run 1**

Run:
```bash
pnpm install && pnpm -C packages/types build && pnpm -C packages/testkit build && pnpm -C packages/core build && pnpm turbo run test
```
Expected: ALL packages green, no `Test timed out in *ms`, no `EBUSY`/`ENOTEMPTY rmdir`.

- [ ] **Step 2: Re-run the full gate two more times (≥3 consecutive total)**

Run (twice): `pnpm turbo run test`
Expected: green BOTH times. Three consecutive clean full-parallel runs = the bar.

- [ ] **Step 3: If any of the 3 runs flake** — adjust `poolOptions.forks.maxForks` in `vitest.shared.ts` **down** (e.g. 12 → 8 → 6; lower = less contention, slightly slower) and restart the 3-consecutive count from Step 1. If green but suite is painfully slow, you may nudge **up** (e.g. 12 → 16) but only if 3-consecutive stays green at the higher value. Record the final value in the task notes. Do not proceed until 3 consecutive full-parallel runs are clean.

- [ ] **Step 4: Isolated-core regression check** (the fork cap must not break isolated runs):

Run: `pnpm -C packages/core test`
Expected: PASS (the pre-existing isolated baseline — must stay green).

- [ ] **Step 5: Checkpoint (stage only — NO commit)**

```bash
git add vitest.shared.ts
```
(only changes if maxForks was retuned; staging a no-op is harmless)
Then: `node packages/core/bin/cadence.cjs build task T4 --status=DONE --notes "gate green 3x full-parallel; final maxForks=<N>"`

---

## Task 5: docs — ROADMAP / DESIGN §10 / CHANGELOG

**Files:** `.cadence/ROADMAP.md`, `DESIGN.md`, `CHANGELOG.md`

- [ ] **Step 1: `.cadence/ROADMAP.md` — remove the "Test infra" Deferred bullet.** Under `## Deferred to v1.2+ (not in v1.1 scope)`, delete this exact bullet:

```
- **Test infra.** Flake resolved (`896a140`); consider a serialized/fake-clock lane for future timing-sensitive tests now that CI runs 6 parallel cells.
```

and replace it with:

```
- **Test infra.** ✓ **Pulled forward into v1.1 — delivered as Phase 32.1** (shared `vitest.shared.ts` base: `testTimeout`/`hookTimeout`/`maxForks`; `tempRepo` rmdir retry; 29.5/30.2 per-test band-aids reverted). The deferral boundary was deliberately broken: the flake was costing a blocking pre-push failure + a remediation phase roughly every push (3rd recurrence at Phase 31.1).
```

- [ ] **Step 2: `DESIGN.md` §10 punchlist — add item 33.** After the existing line 230 (`32. ~~Phase 31.1 — user-guide docs/ tree …~~ ✓`) and before the blank line preceding `Sequencing rationale:`, insert:

```
33. ~~Phase 32.1 — test-infra flake root-fix: shared `vitest.shared.ts` base (`testTimeout`/`hookTimeout`/`maxForks`) + `tempRepo` rmdir retry + revert 29.5/30.2 per-test timeout band-aids (pulled the ROADMAP v1.2 test-infra lane forward; 3rd parallel-load recurrence)~~ ✓
```

- [ ] **Step 3: `CHANGELOG.md` — add to `## [Unreleased] → ### Fixed`.** Append as the last bullet of the existing `### Fixed` list under `## [Unreleased]` (immediately before the `### Changed` heading):

```
- Test infra: the recurring full-`turbo`-parallel pre-push flake (`Test timed out in 5000ms` + Windows `EBUSY`/`ENOTEMPTY rmdir` on spawn-CLI / heavy-`tempRepo` tests) is root-fixed. New repo-root `vitest.shared.ts` centralizes `testTimeout`/`hookTimeout` (20000ms) and caps the worker pool (`pool:'forks'`, `maxForks`); all five package vitest configs `mergeConfig` it (ends the 5-config drift). `tempRepo().cleanup()` now passes `maxRetries`/`retryDelay` to `fs.rm` so the Windows handle-release race is absorbed for every consumer. The Phase 29.5 (`dispatcher.test.ts`) and Phase 30.2 (`build-per-task.test.ts`) per-test `{timeout:20000}` band-aids are reverted — the global budget supersedes them. Pulled forward from the v1.2+ deferred test-infra lane after a 3rd recurrence. (Phase 32.1.)
```

- [ ] **Step 4: Verify markdown didn't break anything structural** — eyeball the three edited sections (`git diff -- .cadence/ROADMAP.md DESIGN.md CHANGELOG.md`); confirm only the intended hunks changed.

- [ ] **Step 5: Checkpoint (stage only — NO commit)**

```bash
git add .cadence/ROADMAP.md DESIGN.md CHANGELOG.md
```
Then: `node packages/core/bin/cadence.cjs build task T5 --status=DONE --notes "ROADMAP/DESIGN§10/CHANGELOG"`

---

## Task 6: single substantive commit + settle + settle commit (two-commit convention)

**Files:** none new — consolidates Tasks 1–5.

- [ ] **Step 1: Confirm staging.** `git status --short` — staged set must be exactly: `vitest.shared.ts`, the 5 vitest configs, `packages/testkit/src/fixture.ts`, the 2 reverted test files, `.cadence/ROADMAP.md`, `DESIGN.md`, `CHANGELOG.md`. **Nothing under `.cadence/phases/` or `.cadence/STATE.md`/`state.json` staged** (those belong to the settle commit). The `docs/superpowers/{specs,plans}/2026-05-16-testinfra-flake*` files are already committed (548822c / 038b95c) — not part of this commit.

- [ ] **Step 2: Single substantive commit:**

```bash
git commit -m "$(cat <<'EOF'
fix(test-infra): root-cause the full-parallel pre-push flake (Phase 32.1)

Shared vitest.shared.ts base centralizes testTimeout/hookTimeout (20000ms)
and caps the fork pool (pool:'forks', maxForks); all five package configs
mergeConfig it, ending the 5-config drift. tempRepo().cleanup() passes
maxRetries/retryDelay to fs.rm, absorbing the Windows EBUSY/ENOTEMPTY rmdir
race for every consumer. Reverts the Phase 29.5 (dispatcher) and Phase 30.2
(build-per-task) per-test {timeout:20000} band-aids — the global budget
supersedes them. Pulls the ROADMAP v1.2+ test-infra lane forward after a
3rd parallel-load recurrence (blocked the held Phase 31.1 push).

Verified: pnpm turbo run test green full-parallel x3 consecutive on the
Windows box; pnpm -C packages/core test still green isolated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Settle the phase:**

Run: `node packages/core/bin/cadence.cjs settle run --auto --allow-missing-coverage`
(`--allow-missing-coverage` is required: this phase adds **no** new `packages/**` test files by design, so the test-coverage gate has nothing to link the ACs to. Add `--allow-stale-draft` only if the DRAFT.md was edited after `draft approve`.)
Expected: a `Settled 32-…` line; loop returns to IDLE. (Treat `32-01` as illustrative — trust the id `draft new` actually produced.)

- [ ] **Step 4: Settle commit:**

```bash
git add .cadence/phases/32-testinfra-flake/ .cadence/STATE.md .cadence/state.json
git commit -m "chore: settle Phase 32.1 — test-infra flake root-fix"
```

- [ ] **Step 5: Verify + surface push readiness (push is USER-GATED — stop and ask).**

Run: `git log --oneline -6` (confirm the `fix(test-infra)…` + `chore: settle Phase 32.1…` pair on top) and `node packages/core/bin/cadence.cjs progress` (loop IDLE) and `git rev-list --count origin/main..HEAD`.

Then **stop** and report to the user: the previously-blocked gate is green ×3, the held Phase 31.1 commits (6) + the 2 spec/plan-doc commits + this phase's 2 commits are all local and **ready to push** — and that `git push` (which re-runs the now-passing pre-push hook) is their call. Do **not** push without explicit user confirmation.

---

## Done criteria

- `vitest.shared.ts` exists; all 5 vitest configs `mergeConfig` it; `testTimeout`/`hookTimeout`/`maxForks` defined **only** there (no per-config timeout duplication).
- `tempRepo().cleanup()` passes `maxRetries`+`retryDelay`; testkit rebuilt.
- Phase 29.5 + 30.2 per-test/describe `{timeout:20000}` (and their stale comments) removed.
- `pnpm turbo run test` green full-parallel ≥3 consecutive on the Windows box; `pnpm -C packages/core test` green isolated.
- ROADMAP "Test infra" moved out of Deferred-v1.2+ (recorded delivered); DESIGN §10 item 33; CHANGELOG Unreleased/Fixed entry.
- Settled as a CADENCE phase (two-commit convention). Held Phase 31.1 commits unblocked for push (user-gated — not auto-pushed).

## Acceptance Criteria (for the cadence DRAFT)

- **AC-1:** `vitest.shared.ts` exists at repo root and is the sole definition of `testTimeout`, `hookTimeout`, `pool`, and `poolOptions.forks.maxForks`.
- **AC-2:** All five vitest configs (`vitest.config.ts` + 4 package configs) import and `mergeConfig` the shared base; each keeps only its own `include` (root also keeps `coverage`); no per-config timeout/pool duplication remains.
- **AC-3:** `tempRepo().cleanup()` calls `rm` with `maxRetries` and `retryDelay`; `@cadence/testkit` rebuilt so consumers get it.
- **AC-4:** The Phase 29.5 (`dispatcher.test.ts`) and Phase 30.2 (`build-per-task.test.ts`) inline `{timeout:20000}` overrides and their now-obsolete explanatory comments are removed.
- **AC-5:** `pnpm turbo run test` passes full-parallel on this Windows box across ≥3 consecutive runs, and `pnpm -C packages/core test` still passes isolated.
- **AC-6:** `.cadence/ROADMAP.md`, `DESIGN.md` (§10 item 33), and `CHANGELOG.md` (`## [Unreleased] → ### Fixed`) record the pulled-forward delivery.
