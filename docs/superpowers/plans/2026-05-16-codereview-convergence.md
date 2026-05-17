# Code-Review Convergence at Settle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the Phase 24.3 `code-review` gate at `cadence settle run` in the shipped Phase 35.1 `nextConvergence` primitive (verbatim, no re-implementation): track attempts + append-only history in a new `<id>-CODE-REVIEW.json` sidecar, hard-escalate at `config.convergence.maxAttempts` (default 3) with a new **unconditional** `code-review-unconverged` anomaly — while preserving the Phase 24.3 `--force` / `--allow-code-review-failure` bypass contract verbatim (existing `settle-code-review.test.ts` AC-4/5/6 must stay green unchanged).

**Architecture:** Pure `nextConvergence(pass,attemptsSoFar,maxAttempts)` ALREADY EXISTS (`packages/core/src/verify/converge.ts`, Phase 35.1) — reused verbatim, **not re-implemented, not re-tested**. `config.convergence.maxAttempts` ALREADY EXISTS (Phase 35.1) — reused, **no config.ts change**. New work is small: (1) `AnomalyTypeZ += 'code-review-unconverged'` (additive); (2) `emitCodeReviewUnconverged` added to the EXISTING `notify/code-review.ts` (clone of `emitPlanReviewUnconverged`); (3) the one-shot HIGH-refuse logic inside the existing `try {}` in `settle.ts`'s code-review block is replaced with the convergent block (sidecar read → `nextConvergence` → persist → branch pass/bypass/reloop/escalate), keeping the `catch {}` verbatim. No `gates/engine.ts` matrix change, no `state.json` schema change. `pass := no HIGH finding` (`highs.length === 0`). Spec: `docs/superpowers/specs/2026-05-16-codereview-convergence-design.md`.

**Tech Stack:** TypeScript, Zod, commander, vitest, pnpm+turbo monorepo (`@cadence/{core,types,testkit}`).

**Execution note (CADENCE dogfood — READ FIRST, overrides per-task git steps):**
Runs as CADENCE phase `37-codereview-convergence` / draft `37-01` on `main` (no worktree — project convention, same override as 32.x–36.1) under the **two-commit-per-phase convention**: ONE substantive commit (src+tests+docs, NOT `.cadence/*`) then ONE `chore: settle …` commit (`.cadence/phases/37-codereview-convergence/*` + STATE + state.json). **Never one commit per task.** Future commits land under the pseudonymous git identity the user set repo-locally (commits show `nullrook` — do not echo, alter, or rewrite it).

Per-task "Checkpoint" = stage-and-record, NOT commit: run the verification, `git add` the touched files, then `node packages/core/bin/cadence.cjs build task T<n> --status=DONE --notes "…"`. Do **not** `git commit` until Task 5. **Verify the FULL gate** at Task 5 (`pnpm turbo run lint typecheck test build`) — the pre-push hook is the whole gate, not just `test` (Phase 32.2/35.1/36.1 lesson: the existing code-review contract test + the Phase 31.1 `cli-reference.test.ts` drift guard are invisible to spec/plan review; the full gate is the only safety net). This phase **adds `packages/**` tests** → settle does **NOT** use `--allow-missing-coverage`; every AC token `AC-1`…`AC-6` must literally appear in a test file (the coverage gate greps test globs per AC id).

Loop: `node packages/core/bin/cadence.cjs draft new 37-codereview-convergence 01 --title="code-review convergence at settle" --tier=standard` → fill DRAFT (ACs from the "Acceptance Criteria (for the cadence DRAFT)" section at the bottom; **auto×standard** default — DO NOT add `profile:`/`requiredSkills:` frontmatter — so code-review/skill-audit/strict gates do NOT fire on this phase's own settle; no bootstrap) → `draft check .cadence/phases/37-codereview-convergence/37-01-DRAFT.md` → `draft approve 37-codereview-convergence 01` → Tasks 1–4 (`build task T<n> --status=DONE` each) → Task 5 (substantive commit → `settle run --auto` → settle commit). Push USER-GATED; also push the 2 already-committed pending spec commits `5ec3a91` + `b921893`. Survey item #4 (final feature-expansion item).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/types/src/anomaly.ts` | `AnomalyTypeZ += 'code-review-unconverged'` | Modify |
| `packages/types/tests/anomaly.test.ts` | accept the new type (AC-5) | Modify |
| `packages/core/src/notify/code-review.ts` | add `emitCodeReviewUnconverged` (alongside `emitCodeReviewHigh`; unconditional/no-throw; clone `emitPlanReviewUnconverged`) | Modify |
| `packages/core/src/cli/commands/settle.ts` | replace the one-shot HIGH-refuse inside the code-review `try {}` with the convergent block; +2 imports | Modify |
| `packages/core/tests/cli/settle-codereview-convergence.test.ts` | integration, 6 paths a–f (AC-1/2/3/4) | **Create** |
| `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` | docs + #4 ✓ / sequence (AC-6) | Modify |

**NOT touched (deliberate — the 35.1 delta):** `packages/core/src/verify/converge.ts` (exists, reused verbatim, NOT re-tested — Phase 35.1 owns its unit test), `packages/types/src/config.ts` (`convergence.maxAttempts` already shipped at 35.1), `packages/core/src/notify/plan-review.ts` / `spec-review.ts` (clone-source only, read not edited), `gates/engine.ts`, `state.json` schema.

---

## Task 1: type change — `AnomalyTypeZ += 'code-review-unconverged'`

**Files:** `packages/types/src/anomaly.ts`, `packages/types/tests/anomaly.test.ts`

- [ ] **Step 1:** `packages/types/src/anomaly.ts` — append the new literal to the `z.enum([...])` list. The current list ends:

```ts
  'skill-audit-miss',
  'plan-review-unconverged',
  'spec-review-unconverged',
]);
```

Change to:

```ts
  'skill-audit-miss',
  'plan-review-unconverged',
  'spec-review-unconverged',
  'code-review-unconverged',
]);
```

(Additive only — same precedent as 23.2/23.3/34.1/35.1/36.1. Do not reorder or touch `AnomalyEventZ`, severities, or anything else in the file.)

- [ ] **Step 2:** `packages/types/tests/anomaly.test.ts` — after the existing `it('accepts spec-review-unconverged event (AC-6)', …)` block (ends ~line 166, before `it('accepts offset-aware ts variants (AC-1)', …)`), insert a new case. **The test name MUST contain the token `AC-5`** (coverage gate greps it):

```ts
  // AC-5 (Phase 37.1) — code-review-unconverged type
  it('accepts code-review-unconverged event (AC-5)', () => {
    expect(() =>
      AnomalyEventZ.parse({
        type: 'code-review-unconverged',
        severity: 'error',
        message:
          'code-review did not converge for 37-01 after 3/3 attempts (2 finding(s))',
        context: {
          draftId: '37-01',
          attempts: 3,
          maxAttempts: 3,
          findings: 2,
          provider: 'mock',
        },
        ts: '2026-05-16T14:00:00.000Z',
      }),
    ).not.toThrow();
  });
```

- [ ] **Step 3:** Run: `pnpm -C packages/types test && pnpm -C packages/types build`
  Expected: all anomaly tests PASS (new `AC-5` case green), clean tsc, `dist/` rebuilt.

- [ ] **Step 4: Checkpoint (stage only — NO commit)**

```bash
git add packages/types/src/anomaly.ts packages/types/tests/anomaly.test.ts
```

Then: `node packages/core/bin/cadence.cjs build task T1 --status=DONE --notes "AnomalyTypeZ += code-review-unconverged (additive); anomaly schema test (AC-5)"`

---

## Task 2: `emitCodeReviewUnconverged` notify helper

**Files:** `packages/core/src/notify/code-review.ts` (extend the EXISTING file — do NOT create a new file)

- [ ] **Step 1:** Append `emitCodeReviewUnconverged` to `packages/core/src/notify/code-review.ts`, AFTER the existing `emitCodeReviewHigh` function (end of file, line ~45). It is a clone of `emitPlanReviewUnconverged` (`packages/core/src/notify/plan-review.ts`) with `draftId` context, modelled identically (unconditional by design, no-throw, refusal computed independently by the caller). The file already imports `AnomalyEvent` and `selectNotifier` (lines 1–3) — **add no imports**:

```ts

/**
 * Phase 37.1 — emits a single `code-review-unconverged` anomaly when
 * code-review@settle fails to converge after maxAttempts. UNCONDITIONAL by
 * design (mirrors emitPlanReviewUnconverged / emitSkillAuditMiss): code-review's
 * gate cells include `strict×*`, which carry NO `anomaly-notify` gate — a hard
 * human-escalation must still leave an audit trail, so the caller does NOT gate
 * this on `anomaly-notify` (unlike the sibling `emitCodeReviewHigh`, whose
 * Phase 24.3 `anomaly-notify` guard is preserved unchanged). Transport failure
 * → one stderr warning, never throws (the settle refusal/exit is computed
 * independently).
 */
export async function emitCodeReviewUnconverged(
  notifier: ReturnType<typeof selectNotifier>,
  ctx: {
    draftId: string;
    attempts: number;
    maxAttempts: number;
    findings: number;
    provider: string;
    model?: string;
    bypassed?: boolean;
  },
): Promise<void> {
  const event: AnomalyEvent = {
    type: 'code-review-unconverged',
    severity: 'error',
    message: `code-review did not converge for ${ctx.draftId} after ${ctx.attempts}/${ctx.maxAttempts} attempts (${ctx.findings} finding(s))`,
    context: {
      draftId: ctx.draftId,
      attempts: ctx.attempts,
      maxAttempts: ctx.maxAttempts,
      findings: ctx.findings,
      provider: ctx.provider,
      ...(ctx.model !== undefined ? { model: ctx.model } : {}),
      ...(ctx.bypassed !== undefined ? { bypassed: ctx.bypassed } : {}),
    },
    ts: new Date().toISOString(),
  };
  try {
    await notifier.notify([event]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `cadence-notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
    );
  }
}
```

- [ ] **Step 2:** Run: `pnpm -C packages/core build`
  Expected: clean tsc (no test yet — exercised via the integration suite in Task 3).

- [ ] **Step 3: Checkpoint** — `git add packages/core/src/notify/code-review.ts` ; `node packages/core/bin/cadence.cjs build task T2 --status=DONE --notes "emitCodeReviewUnconverged (unconditional/no-throw, clone of emitPlanReviewUnconverged, draftId ctx)"`

---

## Task 3: rewire the `settle.ts` code-review block + integration tests

**Files:** Modify `packages/core/src/cli/commands/settle.ts`; create `packages/core/tests/cli/settle-codereview-convergence.test.ts`

### 3a — imports

- [ ] **Step 1:** In `settle.ts`, add `nextConvergence` to a new import and extend the existing `emitCodeReviewHigh` import. The file currently has at line 31:

```ts
import { emitCodeReviewHigh } from '../../notify/code-review.js';
```

Change that line to:

```ts
import { emitCodeReviewHigh, emitCodeReviewUnconverged } from '../../notify/code-review.js';
```

And add (anywhere in the import block, e.g. immediately after line 31):

```ts
import { nextConvergence } from '../../verify/converge.js';
```

**Add NO other imports.** `join` (line 3), `readFile` (line 4), `existsSync` (line 5), `Finding` type (line 6), `atomicWriteText` (line 11), `selectNotifier` (line 27), `selectCodeReviewVerifier` (line 30) are ALL already imported — a duplicate import is a compile error. `nextConvergence` and `emitCodeReviewUnconverged` are the only two genuinely new symbols.

### 3b — replace the one-shot HIGH logic inside the code-review `try {}`

The current code-review block is `if (gateSet.gates.includes('code-review')) { … }` (settle.ts ~414–464). Inside its `try {`, the current lines are (settle.ts ~421–453):

```ts
            const result = await reviewer.verify({ files: touched, diff });
            codeReviewFindings = result.findings;
            const highs = collectHighFindings(result.findings);
            const bypassed =
              opts.force === true || opts.allowCodeReviewFailure === true;
            if (highs.length > 0) {
              for (const h of highs) {
                process.stderr.write(
                  `code-review: ${h.file}${h.line !== undefined ? `:${h.line}` : ''} high — ${h.message}\n`,
                );
              }
              if (!bypassed) {
                process.stderr.write(
                  `settle run refused: code-review reported ${highs.length} HIGH finding(s). ` +
                    'Pass --allow-code-review-failure to record them and settle anyway, or --force to bypass.\n',
                );
                process.exitCode = 1;
                return;
              }
              const flag = opts.force === true
                ? '--force'
                : '--allow-code-review-failure';
              process.stderr.write(
                `code-review: ${flag} set; proceeding past ${highs.length} HIGH finding(s).\n`,
              );
              if (gateSet.gates.includes('anomaly-notify')) {
                await emitCodeReviewHigh(
                  selectNotifier(cadenceConfig),
                  result.findings,
                  { provider: result.provider, bypassed: true },
                );
              }
            }
```

- [ ] **Step 2:** Replace **only** those lines (keep the `try {` opener, keep the `} catch (err) { … }` at ~454–463 VERBATIM, keep everything above `const result =` and below the `catch`) with the convergent block below. Keep the first three statements (`const result`, `codeReviewFindings = result.findings;`, `const highs = collectHighFindings(result.findings);`) and replace from `const bypassed = …` through the end of the `if (highs.length > 0) { … }`:

```ts
            const result = await reviewer.verify({ files: touched, diff });
            codeReviewFindings = result.findings;
            const highs = collectHighFindings(result.findings);
            // Phase 37.1 — code-review@settle is a bounded convergence loop
            // (Plan→CodeReview port of the shipped Phase 35.1 draft.ts block).
            // pass := no HIGH finding (the gate's existing refuse condition;
            // MEDIUM/LOW never refuse). nextConvergence + sidecar own the loop;
            // the fix between attempts is external (host edits the code).
            const pass = highs.length === 0;
            const sidecarPath = join(
              cwd,
              '.cadence/phases',
              state.activePhase,
              `${state.activeDraft}-CODE-REVIEW.json`,
            );
            // Prior attempts. Absent / corrupt / legacy-without-`attempts`
            // → attemptsSoFar = 0 (identical back-compat rule to plan-review).
            let attemptsSoFar = 0;
            let history: unknown[] = [];
            if (existsSync(sidecarPath)) {
              try {
                const prior = JSON.parse(await readFile(sidecarPath, 'utf8'));
                if (typeof prior.attempts === 'number') {
                  attemptsSoFar = prior.attempts;
                }
                if (Array.isArray(prior.history)) history = prior.history;
              } catch {
                /* corrupt/legacy → treat as fresh (attemptsSoFar 0) */
              }
            }

            const maxAttempts = cadenceConfig?.convergence?.maxAttempts ?? 3;
            const nv = nextConvergence(pass, attemptsSoFar, maxAttempts);
            const now = new Date().toISOString();
            // Phase 24.3 contract preserved (NOT narrowed): --force OR
            // --allow-code-review-failure bypasses ANY failing code-review
            // (reloop OR escalate). The convergence loop is the non-bypass path.
            const bypassed =
              !pass &&
              (opts.allowCodeReviewFailure === true || opts.force === true);

            history.push({
              at: now,
              pass,
              // Conscious HIGH-count semantics (spec): findingsCount / top-level
              // `findings` record highs.length, NOT total findings — because the
              // convergence boolean is HIGH-only. Self-consistent divergence
              // from the 35.1 source (which records total res.findings.length).
              findingsCount: highs.length,
              provider: result.provider,
              ...(result.model ? { model: result.model } : {}),
              verdict: nv.verdict,
              ...(bypassed ? { bypassed: true } : {}),
            });
            await atomicWriteText(
              sidecarPath,
              JSON.stringify(
                {
                  draftId: state.activeDraft,
                  converged: pass,
                  attempts:
                    nv.verdict === 'pass' ? attemptsSoFar : nv.attempt,
                  maxAttempts,
                  history,
                  // legacy-style top-level fields for parity with the other
                  // *-REVIEW.json sidecars:
                  pass,
                  provider: result.provider,
                  ...(result.model ? { model: result.model } : {}),
                  findings: highs.length,
                  at: now,
                },
                null,
                2,
              ) + '\n',
            );

            if (!pass) {
              for (const h of highs) {
                process.stderr.write(
                  `code-review: ${h.file}${h.line !== undefined ? `:${h.line}` : ''} high — ${h.message}\n`,
                );
              }
              if (bypassed) {
                // Phase 24.3 contract — branching proceed-line VERBATIM
                // (`--force` arm kept so the contract is not silently
                // narrowed) + code-review-high(bypassed:true) under the
                // existing `anomaly-notify` guard, exactly as Phase 24.3.
                const flag =
                  opts.force === true
                    ? '--force'
                    : '--allow-code-review-failure';
                process.stderr.write(
                  `code-review: ${flag} set; proceeding past ${highs.length} HIGH finding(s).\n`,
                );
                if (gateSet.gates.includes('anomaly-notify')) {
                  await emitCodeReviewHigh(
                    selectNotifier(cadenceConfig),
                    result.findings,
                    { provider: result.provider, bypassed: true },
                  );
                }
                if (nv.verdict === 'escalate') {
                  await emitCodeReviewUnconverged(
                    selectNotifier(cadenceConfig),
                    {
                      draftId: state.activeDraft,
                      attempts: nv.attempt,
                      maxAttempts,
                      findings: highs.length,
                      provider: result.provider,
                      ...(result.model ? { model: result.model } : {}),
                      bypassed: true,
                    },
                  );
                }
                // fall through → SUMMARY.codeReview recorded downstream
                // (codeReviewFindings already set), exactly as Phase 24.3.
              } else if (nv.verdict === 'reloop') {
                if (gateSet.gates.includes('anomaly-notify')) {
                  await emitCodeReviewHigh(
                    selectNotifier(cadenceConfig),
                    result.findings,
                    { provider: result.provider, bypassed: false },
                  );
                }
                process.stderr.write(
                  `code-review: attempt ${nv.attempt}/${maxAttempts} did not pass — ` +
                    'fix the flagged code and re-run `cadence settle run`, ' +
                    'or pass --allow-code-review-failure to proceed anyway.\n',
                );
                process.exitCode = 1;
                return;
              } else {
                // nv.verdict === 'escalate', no bypass flag → hard refuse.
                if (gateSet.gates.includes('anomaly-notify')) {
                  await emitCodeReviewHigh(
                    selectNotifier(cadenceConfig),
                    result.findings,
                    { provider: result.provider, bypassed: false },
                  );
                }
                await emitCodeReviewUnconverged(
                  selectNotifier(cadenceConfig),
                  {
                    draftId: state.activeDraft,
                    attempts: nv.attempt,
                    maxAttempts,
                    findings: highs.length,
                    provider: result.provider,
                    ...(result.model ? { model: result.model } : {}),
                  },
                );
                process.stderr.write(
                  'settle run refused: code-review did NOT converge after ' +
                    `${maxAttempts} attempts — a human decision is required. ` +
                    'Fix the flagged code, or pass --allow-code-review-failure ' +
                    'to proceed anyway.\n',
                );
                process.exitCode = 1;
                return;
              }
            }
            // pass (converged) → no stderr; codeReviewFindings already set →
            // SUMMARY.codeReview recorded downstream exactly as Phase 24.3.
```

**Why this exact branch order (critical — a reordering regresses the existing contract):**
`pass` first (silent fall-through, SUMMARY recorded). Then within `!pass`: **`bypassed` is checked BEFORE `reloop`/`escalate`** — bypass must short-circuit ANY verdict. If `reloop` were checked first, the existing `settle-code-review.test.ts` AC-5 (`--allow-code-review-failure`, first failure, default maxAttempts 3 → `nv.verdict==='reloop'`) would refuse with exit 1 instead of proceeding with exit 0 — a contract regression. With this order, AC-5's first-fail-with-flag hits the `bypassed` arm → prints the verbatim `code-review: --allow-code-review-failure set; proceeding past 1 HIGH finding(s).` line, falls through, records `SUMMARY.codeReview`, exit 0. `emitCodeReviewHigh` keeps its existing `anomaly-notify` guard in every arm (strict cells lack the gate → silent under strict, exactly as Phase 24.3); only the new `emitCodeReviewUnconverged` is unconditional.

- [ ] **Step 3:** Run: `pnpm -C packages/core build`
  Expected: clean tsc. (`cadenceConfig` may be null here; `cadenceConfig?.convergence?.maxAttempts ?? 3` is null-safe, matching the file's existing `cadenceConfig?.…` pattern. `state.activePhase`/`state.activeDraft` are guaranteed non-null — the LoopViolation guard at settle.ts:126 already asserts them.)

### 3c — regression check (Phase 24.3 contract)

- [ ] **Step 4:** Run the EXISTING contract test UNCHANGED: `pnpm -C packages/core test -- run cli/settle-code-review`
  Expected: all 5 cases GREEN with **zero edits** to `settle-code-review.test.ts`. This is the Phase 24.3 contract (the 35.1/36.1 caught-by-the-gate lesson — verify it now, not only at the full gate). Specifically still green:
  - `AC-4: refuses on HIGH` — strict×standard, no flag, no prior sidecar → `nextConvergence(false,0,3)='reloop'` → per-HIGH `code-review: src/foo.ts:N high — console.log left in source` lines (kept) + the reloop line (contains the substring `--allow-code-review-failure`) → matches both regexes; `exitCode=1`; `return` before SUMMARY assembly → no `01-01-SUMMARY.json`. ✓
  - `AC-5 + AC-6: --allow-code-review-failure records SUMMARY.codeReview` — bypass arm → exact `--allow-code-review-failure set; proceeding past 1 HIGH` line; falls through → `SUMMARY.codeReview` present; strict lacks `anomaly-notify` → `emitCodeReviewHigh` silent → `anomalies.log` (if present) has no `code-review-high`. ✓
  - `AC-6: …anomaly dispatches under standard×complex` — standard×complex carries `anomaly-notify` → bypass arm emits `code-review-high` `bypassed:true`. ✓
  - `AC-4: clean diff under strict profile settles cleanly` — `pass` → silent fall-through, no `code-review:` stderr; `SUMMARY.codeReview === {}`. ✓
  - `AC-4: auto profile … skips the gate entirely` — `code-review` not in the auto set → block not entered; `summary.codeReview` undefined. ✓
  If ANY of these fail: STOP, do not "fix" the existing test — the rewire is wrong; re-read this task.

### 3d — new convergence integration tests

- [ ] **Step 5: Write** `packages/core/tests/cli/settle-codereview-convergence.test.ts`, spawned-CLI idiom, mirroring `settle-code-review.test.ts` verbatim for the harness (`run()`, `initGitRepo`, `setStrictProfile`, `rewireT1`, `seedAcCoverage`, `tempRepo`, `afterEach` cleanup — copy them; the `MockCodeReviewVerifier` emits one HIGH `console.log left in source` for a `console.log` in a touched `src/` file, and zero findings for a clean file). **Memory gotcha (spawned-CLI vs default 5s timeout — the 29.5/30-02 flake family): use a generous describe-level timeout `{ timeout: 60_000 }`.** Notify: set `cfg.notify = { transport: 'file' }`; the spawned CLI's cwd is the repo root so `.cadence/anomalies.log` resolves (same as the existing test). Convergence speed: set `cfg.convergence = { maxAttempts: 1 }` where a path needs to reach `escalate` in a single settle run (`nextConvergence(false,0,1)='escalate'` — the converge.test.ts boundary, deterministic, no 3× re-run).

**`--no-approve` is mandatory for EVERY case (a–f), not just (e):** strict×standard (a/b/c/e/f) carries the `approve` gate and standard×complex (d) carries it too; the spawned CLI is non-TTY, so `draft approve …` WITHOUT `--no-approve` hangs/refuses before the code-review gate is ever reached. Every `draft approve` invocation in this file MUST be `draft approve <phase> <num> --no-approve` — this is exactly why the existing `settle-code-review.test.ts` always uses `--no-approve`; copy that verbatim.

**AC-6 coverage token (docs-only AC — make the linkage explicit, not incidental):** add this comment as the FIRST line of the new test file so the repo-wide coverage scanner finds the `AC-6` token deterministically here rather than relying on incidental tokens in unrelated test files:

```ts
// AC-6 is covered by the Task 4 docs changes (DESIGN.md §10 item 38 + §4.1
// note, CHANGELOG, .cadence/ROADMAP.md); no runtime assertion — this token
// satisfies the per-AC test-coverage grep for the docs-only criterion.
```

Six `it` cases, **each name containing its AC token**:

  - **(a)** `it('AC-1: clean diff converges — settle proceeds, sidecar converged:true', …)` — strict×standard (`setStrictProfile`), `rewireT1` → `src/foo.ts`, write `export const x = 1;` (clean), `git add`, `build task T1 --status=DONE`, `settle run --auto --no-interactive`. Assert `code===0`; `stderr` does NOT match `/code-review:/`; `.cadence/phases/01-foundation/01-01-CODE-REVIEW.json` parses with `converged===true`, `attempts===0`, `history.length===1`, `history[0].verdict==='pass'`, `history[0].pass===true`, `findings===0`.

  - **(b)** `it('AC-2: HIGH no flag — reloop, exit 1, attempt 1/3, sidecar attempts:1, no SUMMARY', …)` — strict×standard, default `convergence` (omit — maxAttempts 3), `src/foo.ts` = `export function f() { console.log("oops"); }`, `git add`, `seedAcCoverage('AC-1')`, `build task T1 --status=DONE --allow-per-task-failure`, `settle run --auto --no-interactive`. Assert `code===1`; `stderr` matches `/code-review: src\/foo\.ts:\d+ high — console\.log left in source/` AND `/code-review: attempt 1\/3 did not pass/` AND `/--allow-code-review-failure/`; sidecar `attempts===1`, `converged===false`, `history.length===1`, `history[0].verdict==='reloop'`; `01-01-SUMMARY.json` does NOT exist.

  - **(c)** `it('AC-3: escalate (maxAttempts:1) — exit 1, unconditional code-review-unconverged under strict (no anomaly-notify), no code-review-high', …)` — strict×standard, `cfg.convergence = { maxAttempts: 1 }`, `cfg.notify = { transport: 'file' }`, HIGH `src/foo.ts`, `seedAcCoverage`, `build task T1 --status=DONE --allow-per-task-failure`, `settle run --auto --no-interactive`. Assert `code===1`; `stderr` matches `/settle run refused: code-review did NOT converge after 1 attempts/` AND `/a human decision is required/`; `.cadence/anomalies.log` exists and matches `/"type":"code-review-unconverged"/` **(proves the unconditional lock — strict×standard carries NO `anomaly-notify`, yet the escalation anomaly still fired)** and does NOT match `/code-review-high/` **(proves `emitCodeReviewHigh`'s Phase 24.3 `anomaly-notify` guard is preserved — silent under strict)**; sidecar `history` last entry `verdict==='escalate'`, `converged===false`.

  - **(d)** `it('AC-4: escalate + --allow-code-review-failure under standard×complex — settles, SUMMARY present, BOTH anomalies, bypassed:true', …)` — **standard×complex** (mirror the existing test's AC-6 fixture exactly: `cfg.profile='standard'`, `cfg.notify={transport:'file'}`, `draft new … --tier=complex`, append T2–T6 stub tasks so complex `minTasks=6` is met, `rewireT1`-equivalent `src/foo.ts`), `cfg.convergence={maxAttempts:1}`, HIGH `src/foo.ts`, `build task T1..T6 --status=DONE`, `settle run --auto --allow-code-review-failure --allow-verifier-failure`. Assert `code===0`; `stderr` matches `/--allow-code-review-failure set; proceeding past 1 HIGH/`; `01-01-SUMMARY.json` `summary.codeReview['src/foo.ts']` has length 1 with `{severity:'high', message:'console.log left in source'}`; `.cadence/anomalies.log` matches BOTH `/"type":"code-review-high"/` and `/"type":"code-review-unconverged"/` and `/"bypassed":true/`; sidecar `history` last entry `bypassed===true`, `verdict==='escalate'`. **(standard×complex chosen deliberately: it is the only code-review cell carrying `anomaly-notify`, so "both anomalies recorded" — spec §Testing(d) — is literally true; this mirrors how the existing AC-6 already proves the both-anomaly path under std×complex.)**

  - **(e)** `it('AC-1: legacy/absent sidecar → attemptsSoFar 0 (legacy back-compat)', …)` — strict×standard, default `convergence`, `draft new` → `draft approve --no-approve`, **then** write a legacy sidecar to `.cadence/phases/01-foundation/01-01-CODE-REVIEW.json` containing exactly `{"draftId":"01-01","pass":false,"provider":"mock","findings":1,"at":"2026-05-16T00:00:00.000Z"}` (NO `attempts`, NO `history`) — write it AFTER `draft approve` and BEFORE `settle run` so it is read, not clobbered — then HIGH `src/foo.ts`, `git add`, `seedAcCoverage`, `build task T1 --status=DONE --allow-per-task-failure`, `settle run --auto --no-interactive`. Assert `code===1`; `stderr` matches `/code-review: attempt 1\/3 did not pass/` (legacy file has no `attempts` → `attemptsSoFar=0` → this run is attempt 1, NOT escalation — proves legacy→0 back-compat); sidecar now parses with `attempts===1`, `history.length===1` (the append-only history started fresh because the legacy file had none).

  - **(f)** `it('AC-4: --force (not --allow) still bypasses code-review — Phase 24.3 contract NOT narrowed', …)` — strict×standard, `cfg.convergence={maxAttempts:1}`, HIGH `src/foo.ts`, `seedAcCoverage`, `build task T1 --status=DONE --allow-per-task-failure`, `settle run --auto --no-interactive --force`. Assert `code===0`; `stderr` matches `/code-review: --force set; proceeding past 1 HIGH finding\(s\)\./` (the `--force` arm of the verbatim branching proceed-line — proves `--force` was NOT silently narrowed away when porting the flag-less 35.1 block); `01-01-SUMMARY.json` exists with `summary.codeReview['src/foo.ts']` length 1; sidecar `history` last entry `bypassed===true`.

  Helper note: `rewireT1` in the existing test points T1's `- files:` at `src/foo.ts` for the default `01-foundation/01-01` draft scaffold; reuse it verbatim for the strict×standard paths. For (d) copy the existing AC-6 test's inline frontmatter+T2–T6 fixture verbatim (it is the proven standard×complex pattern). Use `--allow-per-task-failure` on `build task` and `seedAcCoverage('AC-1')` exactly as the existing test does (so per-task-verify and test-coverage don't refuse before code-review).

- [ ] **Step 6:** Run: `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/settle-codereview-convergence cli/settle-code-review`
  Expected: the new 6-case suite PASSES and the existing `settle-code-review` 5-case suite STILL PASSES (regression). If a new case is flaky on timing, raise the describe timeout (do NOT add sleeps; the 5s-default/spawned-CLI flake is fixed by a larger vitest timeout, not retries — memory lesson).

- [ ] **Step 7: Checkpoint** — `git add packages/core/src/cli/commands/settle.ts packages/core/tests/cli/settle-codereview-convergence.test.ts` ; `node packages/core/bin/cadence.cjs build task T3 --status=DONE --notes "code-review@settle wrapped in nextConvergence (Plan→CodeReview port); <id>-CODE-REVIEW.json sidecar attempts/history; reloop/escalate/pass/bypass; --force+--allow contract preserved verbatim; 6-path integration incl. strict unconditional-anomaly + legacy→0 (AC-1/2/3/4); existing settle-code-review.test.ts green unchanged"`

---

## Task 4: docs + ROADMAP

**Files:** `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`

> Numbering drift caution (35.1/36.1 lesson): the §10 punchlist item number increments each phase. Do NOT hardcode "item 38" blindly — first `grep -nE '^\s*3[0-9]\.' DESIGN.md | tail -5` to read the actual last item number; #4 is the next integer after the Phase 36.1 item. Likewise anchor the §4.1 note AFTER the most recent (Phase 36.1 spec-stage) note, and the CHANGELOG bullet at the END of the current `## [Unreleased]` → `### Added` list.

- [ ] **Step 1: DESIGN.md §10 punchlist** — append a new item directly after the Phase 36.1 item (the current last `~~Phase 36.1 …~~ ✓` entry), before the blank line preceding `Sequencing rationale:` (use the next integer; the spec calls it "item 38" — verify against the actual tail):

```
38. ~~Phase 37.1 (v1.2 feature-expansion #4, final) — code-review convergence at settle: the Phase 24.3 `code-review` gate is no longer one-shot. It reuses the Phase 35.1 `nextConvergence` primitive verbatim — attempts + append-only `history` in a new `<id>-CODE-REVIEW.json` sidecar (`pass := no HIGH`; legacy/absent → 0), reloop on HIGH, hard-escalate at `config.convergence.maxAttempts` (default 3, shared knob) with a new **unconditional** `code-review-unconverged` anomaly. The Phase 24.3 `--force` / `--allow-code-review-failure` bypass contract is preserved verbatim (bypasses any fail; existing settle-code-review tests green). No state.json / gate-matrix change~~ ✓
```

- [ ] **Step 2: DESIGN.md §4.1 note** — after the most recent §4.1 blockquote (the Phase 36.1 spec-review note) and before `### 4.2`, add:

```
> **Code-review convergence (Phase 37.1)** — `code-review` (Expensive, Phase 24.3; cells strict×standard, strict×complex, standard×complex) is no longer one-shot: at `settle run` it tracks attempts in the `<id>-CODE-REVIEW.json` sidecar and, after `config.convergence.maxAttempts` (default 3, the shared Phase 35.1 knob) failing attempts, hard-escalates with an **unconditional** `code-review-unconverged` anomaly (un-gated like `skill-audit-miss`/`plan-review-unconverged`, since code-review's strict cells lack `anomaly-notify`). The sibling `code-review-high` anomaly keeps its Phase 24.3 `anomaly-notify` guard. Same gate cells; convergence changes *how it fails*, not *whether it fires*; `--force`/`--allow-code-review-failure` still bypass any fail. Reuses the `nextConvergence` primitive (third attach-point after plan-review #2 and spec-review #1) — the final v1.2 feature-expansion item.
```

- [ ] **Step 3: CHANGELOG.md** — at the END of the `## [Unreleased]` → `### Added` list (after the Phase 36.1 spec-stage bullet, before the blank line preceding the next `###`), append:

```
- Code-review convergence loop: `code-review` (at `cadence settle run`; cells strict×standard, strict×complex, standard×complex) is now a bounded loop instead of a stateless one-shot. It reuses the Phase 35.1 `nextConvergence` primitive verbatim; attempts + an append-only `history` are tracked in a new `<id>-CODE-REVIEW.json` sidecar (plan-review shape; `pass := no HIGH finding`; `findingsCount`/`findings` record the HIGH count; legacy/absent sidecars read as 0 attempts). After `config.convergence.maxAttempts` failing attempts (default 3 — the shared knob, no new config) `settle run` hard-escalates ("a human decision is required"), emits a new `code-review-unconverged` anomaly **unconditionally** (un-gated on `anomaly-notify` — code-review's strict cells lack it, mirroring `skill-audit-miss`/`plan-review-unconverged`), and refuses unless `--force` or the existing `--allow-code-review-failure` (which then proceeds, records `SUMMARY.codeReview`, and stamps `bypassed:true` in history). The Phase 24.3 bypass contract — including `--force` — is preserved verbatim; the sibling `code-review-high` anomaly keeps its `anomaly-notify` guard. The fix between attempts is external (host/agent edits the flagged code) — an in-core auto-fixer remains the parked survey item #3/#5. `AnomalyTypeZ` gains `code-review-unconverged` (additive). This completes the v1.2 feature-expansion sequence (#6→#2→#1→#4). (Phase 37.1.)
```

- [ ] **Step 4: `.cadence/ROADMAP.md`** — in the `## v1.2.0 — Feature expansion (superpowers-inspired)` section: (i) replace the `- **#4 …** — … **Next.** …` (or equivalent pending) line with `- **#4 Code-review convergence at settle** — ✓ **delivered Phase 37.1** (Phase 24.3 code-review@settle wrapped in the Phase 35.1 `nextConvergence`; `<id>-CODE-REVIEW.json` attempts + escalation; `--force`/`--allow-code-review-failure` contract preserved; the third `nextConvergence` attach-point).`; (ii) replace the `Sequence: …` line with `Sequence: #6 ✓ → #2 ✓ → #1 ✓ → #4 ✓ ; #1b deferred, #3/#5 parked (host-agnostic-anchor conflict). v1.2 feature-expansion COMPLETE.`

- [ ] **Step 5:** Run: `git diff --stat -- DESIGN.md CHANGELOG.md .cadence/ROADMAP.md`
  Expected: exactly those 3 files changed; eyeball `git diff .cadence/ROADMAP.md` (the 2 edits present, sequence shows all four ✓).

- [ ] **Step 6: Checkpoint** — `git add DESIGN.md CHANGELOG.md .cadence/ROADMAP.md` ; `node packages/core/bin/cadence.cjs build task T4 --status=DONE --notes "DESIGN §10 item 38 + §4.1 code-review-convergence note; CHANGELOG Added + AnomalyType bump; ROADMAP #4 ✓ / sequence #6✓→#2✓→#1✓→#4✓ COMPLETE (AC-6)"`

---

## Task 5: full gate + two-commit settle

**Files:** none new — consolidates T1–T4.

- [ ] **Step 1: Confirm staging.** Run: `git diff --cached --name-only`
  Expected EXACTLY: `packages/types/src/anomaly.ts`, `packages/types/tests/anomaly.test.ts`, `packages/core/src/notify/code-review.ts`, `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/settle-codereview-convergence.test.ts`, `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`. **Nothing under `.cadence/phases/`, `.cadence/STATE.md`, `.cadence/state.json` staged.** `graphify-out/` stays untracked (leave it).

- [ ] **Step 2: Full pre-push gate** (Phase 32.2/35.1/36.1 lesson — the WHOLE hook, not just `test`; this is the only thing that catches the existing `settle-code-review.test.ts` contract + the Phase 31.1 `cli-reference.test.ts` drift guard, both invisible to spec/plan review):

Run: `pnpm install && pnpm -C packages/types build && pnpm -C packages/core build && pnpm turbo run lint typecheck test build`
Expected: 16/16 green. New `packages/**` tests satisfy `test-coverage`; do **NOT** pass `--allow-missing-coverage`. (No new top-level CLI command was added, so the `cli-reference.test.ts` drift guard is unaffected — but the full gate confirms it.)

- [ ] **Step 3: Substantive commit** (single commit, src+tests+docs; NOT `.cadence/*`):

```bash
git commit -m "$(cat <<'EOF'
feat(core+types): code-review convergence at settle (Phase 37.1, v1.2 #4)

The Phase 24.3 code-review gate at `cadence settle run` is no longer a
stateless one-shot. It reuses the Phase 35.1 nextConvergence primitive
verbatim: attempts + append-only history in a new <id>-CODE-REVIEW.json
sidecar (pass := no HIGH finding; findingsCount = HIGH count; legacy/absent
→ 0 attempts). reloop on HIGH; hard-escalate at config.convergence.maxAttempts
(default 3, the shared knob — no new config) with a new code-review-unconverged
anomaly emitted UNCONDITIONALLY (un-gated on anomaly-notify — code-review's
strict cells lack it, mirrors skill-audit-miss/plan-review-unconverged).

Phase 24.3 bypass contract preserved verbatim and NOT narrowed: --force OR
--allow-code-review-failure still bypasses ANY failing code-review (reloop or
escalate) → settle proceeds, SUMMARY.codeReview recorded, history bypassed:true,
the existing branching "--{force|allow-code-review-failure} set; proceeding
past N HIGH finding(s)" line printed verbatim. The sibling code-review-high
anomaly keeps its existing anomaly-notify guard. Existing
settle-code-review.test.ts AC-4/5/6 stay green unchanged. AnomalyTypeZ
additive bump. Full `pnpm turbo run lint typecheck test build` green.

Completes the v1.2 feature-expansion sequence (#6 → #2 → #1 → #4).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Settle:** Run: `node packages/core/bin/cadence.cjs settle run --auto`
  (NO `--allow-missing-coverage` — this phase adds `packages/**` tests. `37-01` is `auto×standard` → `code-review` is NOT in any `auto` gate cell per `gates/engine.ts`, so the convergence gate does not fire on this phase's own settle — no bootstrap risk. Add `--allow-stale-draft` ONLY if the DRAFT.md was edited after `draft approve`.)
  Expected: `Settled 37-01`; loop returns to IDLE.

- [ ] **Step 5: Settle commit:**

```bash
git add .cadence/phases/37-codereview-convergence/ .cadence/STATE.md .cadence/state.json
git commit -m "chore: settle Phase 37.1 — code-review convergence at settle"
```

- [ ] **Step 6: Verify + surface push (USER-GATED — stop and ask).** Run: `git log --oneline -6` (expect the feat+settle pair under the `nullrook` pseudonym, plus the 2 pending spec commits `5ec3a91`+`b921893` below them), `node packages/core/bin/cadence.cjs progress` (IDLE), `git rev-list --count origin/main..HEAD` (expect 4: 2 pending spec + feat + settle). Report green + the 4 commits-ahead; do **NOT** push without explicit user confirmation (auto-mode classifier blocks direct `main` push; the user's `Bash(git push:*)` allow rule lets a confirmed retry through — the push, when approved, also lands the 2 pending spec commits).

---

## Done criteria

- `code-review`@`settle run` wrapped in the EXISTING `nextConvergence` (reused verbatim, not re-implemented/re-tested); `pass := highs.length === 0`.
- `<id>-CODE-REVIEW.json` carries `converged`/`attempts`/`maxAttempts`/append-only `history` (entries `{at,pass,findingsCount,provider,model?,verdict,bypassed?}`, `findingsCount`=HIGH count); legacy/absent/corrupt → `attemptsSoFar 0`; legacy-style top-level fields preserved.
- reloop (HIGH, below max, no bypass): incremented sidecar + per-HIGH lines + `code-review: attempt N/MAX did not pass …` + `exitCode=1`, no SUMMARY.
- escalate at `config.convergence.maxAttempts`: distinct "a human decision is required" message + **unconditional** `code-review-unconverged` anomaly (fires under strict×standard where `anomaly-notify` is absent) + hard-refuse unless bypass.
- bypass (`--force` OR `--allow-code-review-failure`) past ANY fail (reloop OR escalate) → settle proceeds, `SUMMARY.codeReview` recorded, `code-review-high` (bypassed) under its existing `anomaly-notify` guard, `bypassed:true` in history, verbatim branching proceed-line; `--force` NOT narrowed.
- **existing `settle-code-review.test.ts` AC-4/5/6 pass with ZERO edits** (Phase 24.3 contract).
- `AnomalyTypeZ` additive `code-review-unconverged`; `emitCodeReviewUnconverged` unconditional/no-throw in `notify/code-review.ts`; **no `config.ts` change** (reuse `config.convergence.maxAttempts`); no `gates/engine.ts` / `state.json` change; no `converge.ts` change.
- DESIGN §10 item 38 + §4.1 note; CHANGELOG Added + AnomalyType bump; ROADMAP #4 ✓, sequence `#6✓→#2✓→#1✓→#4✓` COMPLETE.
- Full `pnpm turbo run lint typecheck test build` green; settled two-commit (no `--allow-missing-coverage`). Push user-gated (incl. the 2 pending spec commits).

## Acceptance Criteria (for the cadence DRAFT — `37-01` is auto×standard; DO NOT add `requiredSkills`/`profile` frontmatter)

- **AC-1:** code-review@settle wrapped in `nextConvergence`; `pass := no HIGH`; `<id>-CODE-REVIEW.json` carries `converged`/`attempts`/`maxAttempts`/append-only `history` (plan-review shape, HIGH-count `findingsCount`); legacy/absent/corrupt sidecar → `attemptsSoFar 0`; legacy-style top-level fields preserved.
- **AC-2:** reloop (HIGH, below max, no bypass): incremented sidecar persist + per-HIGH lines + `attempt N/MAX did not pass` line + `exitCode=1`, settle refused, no SUMMARY.
- **AC-3:** escalate at `config.convergence.maxAttempts`: distinct human-decision message + new **unconditional** `code-review-unconverged` anomaly (verified firing under strict×standard, where `anomaly-notify` is absent; sibling `code-review-high` verified silent there — its `anomaly-notify` guard preserved) + hard-refuse unless bypass.
- **AC-4:** bypass (`--force` OR `--allow-code-review-failure`) past ANY fail (reloop OR escalate) → settle proceeds, `SUMMARY.codeReview` recorded, `code-review-high` (`bypassed:true`) under its existing `anomaly-notify` guard, `bypassed:true` in sidecar history, the existing **branching** "—{force|allow-code-review-failure} set; proceeding past N HIGH finding(s)" line printed verbatim — **existing `settle-code-review.test.ts` AC-4/5/6 stay green unchanged; `--force` keeps bypassing code-review (Phase 24.3 contract NOT narrowed)**.
- **AC-5:** `AnomalyTypeZ` additive `code-review-unconverged` (+ `emitCodeReviewUnconverged` unconditional/no-throw in `notify/code-review.ts`); no new config (reuse `config.convergence.maxAttempts`); no `gates/engine.ts` / `state.json` / `converge.ts` change; happy-path + non-code-review cells unchanged.
- **AC-6:** DESIGN (§10 item 38 + §4.1 note), CHANGELOG (Added + AnomalyType bump), ROADMAP v1.2 feature-expansion (#4 ✓ delivered Phase 37.1; sequence `#6✓→#2✓→#1✓→#4✓`; v1.2 feature-expansion COMPLETE, only #1b/#3/#5 parked remain).
