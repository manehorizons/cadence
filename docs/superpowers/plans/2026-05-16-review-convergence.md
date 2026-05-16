# Review-Convergence Loop Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing `plan-review` gate at `cadence draft approve` in a bounded review→reloop→escalate loop: track attempts in the 29.7 `<id>-PLAN-REVIEW.json` sidecar, hard-escalate at `config.convergence.maxAttempts` (default 3) with an unconditional `plan-review-unconverged` anomaly, via a reusable pure `nextConvergence` primitive (so survey #4 reuses it later).

**Architecture:** New pure `verify/converge.ts` (`nextConvergence(pass,attemptsSoFar,maxAttempts)→{verdict,attempt}`). New `notify/plan-review.ts` (`emitPlanReviewUnconverged`, modeled on the unconditional/no-throw `notify/skill-audit.ts`). Additive `AnomalyTypeZ += plan-review-unconverged` + `config.convergence` block (34.1 `skillAudit` `.default()` precedent). The `draft.ts` plan-review block is rewired: read prior sidecar attempts → verify → classify → persist new-shape sidecar+history → branch pass/reloop/escalate. No `state.json` schema change, no `gates/engine.ts` matrix change.

**Tech Stack:** TypeScript, Zod, commander, vitest, pnpm+turbo monorepo. Spec: `docs/superpowers/specs/2026-05-16-review-convergence-design.md`.

**Execution note (CADENCE dogfood — READ FIRST, overrides per-task git steps):**
Runs as a CADENCE phase on `main` (no worktree — project convention, same override as 32.x/33.1/34.1) under the **two-commit-per-phase convention**: ONE substantive commit (src+tests+docs, NOT `.cadence/*`) then ONE `chore: settle …` commit (`.cadence/phases/35-review-convergence/*` + STATE + state.json). **Never one commit per task.** Future commits land under the pseudonymous git identity the user set repo-locally (session context — do not echo or alter it).

Per-task "Checkpoint" = stage-and-record, NOT commit: run the verification, `git add` the touched files, then `node packages/core/bin/cadence.cjs build task T<n> --status=DONE --notes "…"`. Do **not** `git commit` until Task 6. **Verify the FULL gate** at Task 6 (`pnpm turbo run lint typecheck test build`) — the pre-push hook is the whole gate, not just test (Phase 32.2 lesson). This phase **adds `packages/**` tests** → settle does **NOT** use `--allow-missing-coverage`; every test file must literally contain its `AC-N` tokens (coverage gate greps them).

Loop: `node packages/core/bin/cadence.cjs draft new 35-review-convergence 01 --title="review-convergence loop primitive" --tier=standard` → fill DRAFT (ACs at bottom; `auto×standard` default so plan-review does NOT fire on this phase's own settle — no bootstrap risk) → `draft check .cadence/phases/35-review-convergence/35-01-DRAFT.md` → `draft approve 35-review-convergence 01` → Tasks 1–5 (`build task T<n> --status=DONE` each) → Task 6 (substantive commit → `settle run --auto` → settle commit). Push user-gated. Dogfood phase id `35-01`; survey item #2.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/types/src/anomaly.ts` | `AnomalyTypeZ += 'plan-review-unconverged'` | Modify |
| `packages/types/src/config.ts` | `convergence:{maxAttempts}` schema + default | Modify |
| `packages/core/src/verify/converge.ts` | pure `nextConvergence` | **Create** |
| `packages/core/src/notify/plan-review.ts` | `emitPlanReviewUnconverged` (unconditional, no-throw) | **Create** |
| `packages/core/src/cli/commands/draft.ts` | rewire the plan-review block (sidecar attempts → classify → persist → reloop/escalate/pass) | Modify |
| `packages/core/tests/verify/converge.test.ts` | pure unit (TDD) | **Create** |
| `packages/core/tests/cli/draft-approve-convergence.test.ts` | integration, 5 paths a–e | **Create** |
| `packages/types/tests/{config,anomaly}.test.ts` | schema (extend existing) | Modify |
| `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` | docs + #2 ✓ / #1 next | Modify |

---

## Task 1: type changes

**Files:** `packages/types/src/anomaly.ts`, `config.ts`, + extend `tests/{anomaly,config}.test.ts`

- [ ] **Step 1:** `anomaly.ts` — append after `'skill-audit-miss',`:

```ts
  'skill-audit-miss',
  'plan-review-unconverged',
]);
```

- [ ] **Step 2:** `config.ts` — add the `convergence` block between the `skillAudit` block and `tier:` (after line ~54 `.default({ required: [] }),`):

```ts
  convergence: z
    .object({
      maxAttempts: z.number().int().positive().default(3),
    })
    .default({ maxAttempts: 3 }),
```

- [ ] **Step 3:** `config.ts` `defaultConfig` — add after `skillAudit: { required: [] },` (line ~190):

```ts
  convergence: { maxAttempts: 3 },
```

(Presets spread `defaultConfig` so they inherit it; the schema `.default()` covers an old config.json lacking the block — back-compat, exactly the 34.1 skillAudit pattern.)

- [ ] **Step 4:** Extend `packages/types/tests/anomaly.test.ts`: a case asserting `AnomalyTypeZ.parse('plan-review-unconverged')` succeeds (reference `AC-5` in the test name). Extend `packages/types/tests/config.test.ts`: (i) config without `convergence` → `parsed.convergence.maxAttempts === 3` (back-compat); (ii) `{convergence:{maxAttempts:5}}` round-trips; (iii) `{convergence:{maxAttempts:0}}` and `{maxAttempts:1.5}` throw. Reference `AC-5` in those test names.

- [ ] **Step 5:** `pnpm -C packages/types test && pnpm -C packages/types build` → PASS + clean tsc.

- [ ] **Step 6: Checkpoint (stage only — NO commit)**

```bash
git add packages/types/src/anomaly.ts packages/types/src/config.ts packages/types/tests/anomaly.test.ts packages/types/tests/config.test.ts
```
Then: `node packages/core/bin/cadence.cjs build task T1 --status=DONE --notes "AnomalyTypeZ+=plan-review-unconverged; config.convergence.maxAttempts (default 3, back-compat); schema tests (AC-5)"`

---

## Task 2: `converge.ts` pure primitive (TDD)

**Files:** Create `packages/core/src/verify/converge.ts` + `packages/core/tests/verify/converge.test.ts`

- [ ] **Step 1: Write failing tests** — `packages/core/tests/verify/converge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextConvergence } from '../../src/verify/converge.js';

describe('nextConvergence (AC-1)', () => {
  it('AC-1: pass short-circuits regardless of attempts', () => {
    expect(nextConvergence(true, 0, 3)).toEqual({ verdict: 'pass', attempt: 0 });
    expect(nextConvergence(true, 9, 3)).toEqual({ verdict: 'pass', attempt: 9 });
  });
  it('AC-1: fail reloops while attemptsSoFar+1 < max (max 3)', () => {
    expect(nextConvergence(false, 0, 3)).toEqual({ verdict: 'reloop', attempt: 1 });
    expect(nextConvergence(false, 1, 3)).toEqual({ verdict: 'reloop', attempt: 2 });
  });
  it('AC-1: fail escalates when attemptsSoFar+1 >= max (max 3 → 3rd)', () => {
    expect(nextConvergence(false, 2, 3)).toEqual({ verdict: 'escalate', attempt: 3 });
  });
  it('AC-1: maxAttempts=1 → first fail escalates immediately', () => {
    expect(nextConvergence(false, 0, 1)).toEqual({ verdict: 'escalate', attempt: 1 });
  });
});
```

- [ ] **Step 2:** `pnpm -C packages/core test -- run verify/converge` → FAIL (module missing).

- [ ] **Step 3: Implement** `packages/core/src/verify/converge.ts`:

```ts
export type ConvergeVerdict = 'pass' | 'reloop' | 'escalate';

/**
 * Pure convergence classifier. Gate-agnostic — the caller supplies the
 * boolean (plan-review now; survey #4's settle-gate later) and the attempt
 * counters; this decides pass / reloop / escalate. No I/O.
 *
 * `attemptsSoFar` = count of FAILING reviews already recorded (>= 0).
 * `maxAttempts`   = > 0. With maxAttempts=3: fail→reloop(1)→reloop(2)→escalate(3).
 */
export function nextConvergence(
  pass: boolean,
  attemptsSoFar: number,
  maxAttempts: number,
): { verdict: ConvergeVerdict; attempt: number } {
  if (pass) return { verdict: 'pass', attempt: attemptsSoFar };
  const attempt = attemptsSoFar + 1;
  if (attempt >= maxAttempts) return { verdict: 'escalate', attempt };
  return { verdict: 'reloop', attempt };
}
```

- [ ] **Step 4:** `pnpm -C packages/core test -- run verify/converge` → PASS (4).

- [ ] **Step 5: Checkpoint** — `git add packages/core/src/verify/converge.ts packages/core/tests/verify/converge.test.ts` ; `build task T2 --status=DONE --notes "pure nextConvergence TDD red→green (AC-1)"`

---

## Task 3: `emitPlanReviewUnconverged` notify helper

**Files:** Create `packages/core/src/notify/plan-review.ts`

- [ ] **Step 1: Create** `packages/core/src/notify/plan-review.ts` (mirrors `notify/skill-audit.ts` — unconditional, no-throw, refusal independent of emission):

```ts
import type { AnomalyEvent } from '@cadence/types';
import type { selectNotifier } from './factory.js';

/**
 * Phase 35.1 — emits a single `plan-review-unconverged` anomaly when
 * plan-review fails to converge after maxAttempts. UNCONDITIONAL by design
 * (mirrors emitSkillAuditMiss): plan-review fires only `strict×complex`, and
 * strict cells carry NO `anomaly-notify` gate — a hard human-escalation must
 * still leave an audit trail, so the caller does NOT gate this on
 * `anomaly-notify`. Transport failure → one stderr warning, never throws
 * (the approve refusal/exit is computed independently).
 */
export async function emitPlanReviewUnconverged(
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
    type: 'plan-review-unconverged',
    severity: 'error',
    message: `plan-review did not converge for ${ctx.draftId} after ${ctx.attempts}/${ctx.maxAttempts} attempts (${ctx.findings} finding(s))`,
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

- [ ] **Step 2:** `pnpm -C packages/core build` → clean tsc (no test yet — exercised via the integration suite in Task 4).

- [ ] **Step 3: Checkpoint** — `git add packages/core/src/notify/plan-review.ts` ; `build task T3 --status=DONE --notes "emitPlanReviewUnconverged (unconditional/no-throw, mirrors skill-audit)"`

---

## Task 4: rewire the `draft approve` plan-review block + integration

**Files:** Modify `packages/core/src/cli/commands/draft.ts`; create `packages/core/tests/cli/draft-approve-convergence.test.ts`

- [ ] **Step 1: Imports.** In `draft.ts` add ONLY these two genuinely-new imports (near the existing `selectPlanReviewVerifier` import ~line 19):

```ts
import { nextConvergence } from '../../verify/converge.js';
import { emitPlanReviewUnconverged } from '../../notify/plan-review.js';
```

**Do NOT add a `readFile` import** — `readFile` is **already imported** at `draft.ts:2` (`import { readFile, mkdir, writeFile } from 'node:fs/promises';`); a second import is a compile error. `existsSync` (import 3), `selectNotifier` (import 13), `atomicWriteText` (import 9), `join` (import 4) are also already imported. Only the two lines above are new.

- [ ] **Step 2: Replace the plan-review block.** The current block is the entire `if (gateSet.gates.includes('plan-review')) { … }` (draft.ts ~258–300: verifier → 29.7 sidecar `atomicWriteText` → `if (!res.pass) { print findings; if(!allowPlanReviewFailure){refuse} else {proceeding} }`). Replace it **whole** with:

```ts
        if (gateSet.gates.includes('plan-review')) {
          const verifier = selectPlanReviewVerifier(cfg);
          const sidecarPath = join(
            cwd, '.cadence', 'phases', phase, `${id}-PLAN-REVIEW.json`,
          );
          // Read prior attempts. Legacy 29.7-shape sidecar (no `attempts`) or
          // absent file → attemptsSoFar = 0. history append-only.
          let attemptsSoFar = 0;
          let history: unknown[] = [];
          if (existsSync(sidecarPath)) {
            try {
              const prior = JSON.parse(await readFile(sidecarPath, 'utf8'));
              if (typeof prior.attempts === 'number') attemptsSoFar = prior.attempts;
              if (Array.isArray(prior.history)) history = prior.history;
            } catch {
              /* corrupt/legacy → treat as fresh (attemptsSoFar 0) */
            }
          }

          const res = await verifier.verify({ draft });
          const maxAttempts = cfg?.convergence?.maxAttempts ?? 3;
          const nv = nextConvergence(res.pass, attemptsSoFar, maxAttempts);
          const now = new Date().toISOString();
          const bypassed =
            nv.verdict === 'escalate' && opts.allowPlanReviewFailure === true;

          history.push({
            at: now,
            pass: res.pass,
            findingsCount: res.findings.length,
            provider: res.provider,
            ...(res.model ? { model: res.model } : {}),
            verdict: nv.verdict,
            ...(bypassed ? { bypassed: true } : {}),
          });
          await atomicWriteText(
            sidecarPath,
            JSON.stringify(
              {
                draftId: id,
                converged: res.pass,
                attempts: nv.verdict === 'pass' ? attemptsSoFar : nv.attempt,
                maxAttempts,
                history,
                // legacy 29.7 top-level fields preserved for old readers:
                pass: res.pass,
                provider: res.provider,
                ...(res.model ? { model: res.model } : {}),
                findings: res.findings.length,
                at: now,
              },
              null,
              2,
            ) + '\n',
          );

          if (nv.verdict !== 'pass') {
            for (const f of res.findings) {
              process.stderr.write(`plan-review: ${f.severity} — ${f.message}\n`);
              if (f.suggestedEdit) {
                process.stderr.write(`  ↳ suggested: ${f.suggestedEdit}\n`);
              }
            }
          }

          if (nv.verdict === 'reloop') {
            process.stderr.write(
              `plan-review: attempt ${nv.attempt}/${maxAttempts} did not pass — ` +
                `fix the DRAFT and re-run \`cadence draft approve\`.\n`,
            );
            process.exitCode = 1;
            return;
          }

          if (nv.verdict === 'escalate') {
            await emitPlanReviewUnconverged(selectNotifier(cfg), {
              draftId: id,
              attempts: nv.attempt,
              maxAttempts,
              findings: res.findings.length,
              provider: res.provider,
              ...(res.model ? { model: res.model } : {}),
              ...(bypassed ? { bypassed: true } : {}),
            });
            if (!opts.allowPlanReviewFailure) {
              process.stderr.write(
                `draft approve refused: plan-review did NOT converge after ` +
                  `${maxAttempts} attempts — a human decision is required. ` +
                  `Re-scope the plan, or pass --allow-plan-review-failure to proceed anyway.\n`,
              );
              process.exitCode = 1;
              return;
            }
            process.stderr.write(
              `plan-review: --allow-plan-review-failure set; proceeding past ` +
                `unconverged plan (${res.findings.length} finding(s)).\n`,
            );
          }
          // verdict === 'pass' (converged) → fall through to BUILD transition.
        }
```

(Leaves the `--allow-plan-review-failure` option declaration + `opts.allowPlanReviewFailure` type member untouched — both already exist. `cfg` may be `null` here; `cfg?.convergence?.maxAttempts ?? 3` is null-safe, matching the file's existing `cfg`-nullable pattern. The subsequent coherence-warn block + BUILD transition are unchanged.)

- [ ] **Step 3: Write integration tests** — `packages/core/tests/cli/draft-approve-convergence.test.ts`, spawned-CLI idiom (mirror `settle-code-review.test.ts`: `tempRepo`, `run()`, `initGitRepo`, file notify transport). Force `strict×complex` (DRAFT frontmatter `profile: strict`, `--tier=complex`, ≥6 stub tasks to satisfy complex minTasks — copy the `settle-code-review.test.ts` complex-tier fixture pattern). **Every `draft approve` invocation MUST pass `--no-approve`**: `strict×complex` includes the `approve` gate and the spawned CLI has no TTY, so without `--no-approve` it hangs/refuses before plan-review (this is exactly why `settle-code-review.test.ts` always uses `--no-approve` for strict; the `CADENCE_PROMPTER_SCRIPT` env seam is the only alternative — prefer `--no-approve`). plan-review provider = default **mock** (`MockPlanReviewVerifier`: passes iff ≥1 AC and every AC has non-empty given/when/then — so a blank-GWT AC fails, a filled one passes; drive pass/fail by editing the DRAFT's AC). Five paths, each referencing its AC token:

  - (a) AC-1: well-formed AC → approve passes → `state.loopPosition === 'BUILD'`; sidecar `converged:true`.
  - (b) AC-3: blank-GWT AC → exit 1, stderr `attempt 1/3`, sidecar `attempts:1`, `converged:false`, `history` len 1 `verdict:"reloop"`.
  - (c) AC-4: re-run `draft approve` on the still-bad DRAFT to the 3rd attempt → exit 1, stderr `did NOT converge after 3 attempts`, anomaly log contains `"type":"plan-review-unconverged"` (assert it fires **under strict** where `anomaly-notify` is absent — the unconditional lock), sidecar `history` last `verdict:"escalate"`.
  - (d) AC-4: at escalate, `draft approve … --allow-plan-review-failure` → `loopPosition === 'BUILD'`, anomaly still present, sidecar last history entry `bypassed:true`.
  - (e) AC-2: legacy back-compat. Sequence precisely: `draft new` → (force strict×complex frontmatter, bad AC) → **write a legacy 29.7-shape sidecar** to `.cadence/phases/<phase>/<id>-PLAN-REVIEW.json` (`{draftId,pass:false,provider:"mock",findings:1,at:"…"}` — NO `attempts`/`history`) → then the failing `draft approve --no-approve`. The legacy file (no `attempts`) → `attemptsSoFar = 0` → this run is attempt 1 (`stderr attempt 1/3`, NOT escalation), proving legacy→0 back-compat. (Write the sidecar AFTER `draft new` and BEFORE `draft approve` so it is read, not clobbered, by the approve.)

  Notify: set `cfg.notify = { transport: 'file' }`; assert `.cadence/anomalies.log` (spawned CLI cwd = repo root, relative path resolves — same as `settle-code-review.test.ts`). To reach the 3rd attempt in (c) drive `draft approve` 3× without fixing the DRAFT (each failing run increments the sidecar; the test asserts the escalation on the 3rd).

- [ ] **Step 4:** `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/draft-approve-convergence verify/converge` → PASS.

- [ ] **Step 5: Checkpoint** — `git add packages/core/src/cli/commands/draft.ts packages/core/tests/cli/draft-approve-convergence.test.ts` ; `build task T4 --status=DONE --notes "plan-review rewired to nextConvergence; sidecar attempts/history; reloop/escalate/pass; 5-path integration incl. strict unconditional-anomaly + legacy back-compat (AC-1/2/3/4)"`

---

## Task 5: docs + ROADMAP

**Files:** `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`

- [ ] **Step 1: DESIGN.md §10 — add item 36.** After `35. ~~Phase 34.1 …~~ ✓` and before the blank line preceding `Sequencing rationale:`, insert:

```
36. ~~Phase 35.1 (v1.2 feature-expansion #2) — review-convergence loop primitive: pure `nextConvergence` (reusable by #4); `plan-review`@approve now bounded — attempts/history in the `<id>-PLAN-REVIEW.json` sidecar, reloop on fail, hard-escalate at `config.convergence.maxAttempts` (default 3) with an unconditional `plan-review-unconverged` anomaly, override = existing `--allow-plan-review-failure`. No state.json / gate-matrix change~~ ✓
```

- [ ] **Step 2: DESIGN.md §4.1 note.** After the existing `> **Required-skill enforcement (Phase 34.1)** …` blockquote (line ~99) and before `### 4.2`, add:

```
> **Plan-review convergence (Phase 35.1)** — `plan-review` (Expensive, Phase 25.1) is no longer one-shot: at `draft approve` it tracks attempts in the `<id>-PLAN-REVIEW.json` sidecar and, after `config.convergence.maxAttempts` (default 3) failing attempts, hard-escalates with an unconditional `plan-review-unconverged` anomaly (un-gated like `skill-audit-miss`, since plan-review's only cell — strict×complex — lacks `anomaly-notify`). Same gate cell; convergence changes *how it fails*, not *whether it fires*. The `nextConvergence` primitive is reusable (survey #4's settle-gate attach-point).
```

- [ ] **Step 3: CHANGELOG.md** — in `## [Unreleased] → ### Added`, after the Phase 34.1 required-skill bullet and before the blank line preceding `### Fixed`, append:

```
- Review-convergence loop: `plan-review` (at `cadence draft approve`, strict×complex) is now a bounded loop instead of stateless one-shot. A pure `nextConvergence` primitive classifies each review pass/reloop/escalate; attempts + an append-only `history` are tracked in the existing `<id>-PLAN-REVIEW.json` sidecar (no `state.json` change; legacy 29.7-shape sidecars read as 0 attempts). After `config.convergence.maxAttempts` failing attempts (default 3) `draft approve` hard-escalates ("a human decision is required"), emits a new `plan-review-unconverged` anomaly **unconditionally** (un-gated on `anomaly-notify` — strict cells lack it, mirroring `skill-audit-miss`), and refuses unless the existing `--allow-plan-review-failure` (which then proceeds and records `bypassed:true` in history). The fix between attempts is external (host/agent edits the DRAFT) — an in-core auto-fixer is the deferred survey item #4, which reuses `nextConvergence`. `AnomalyTypeZ` gains `plan-review-unconverged` (additive). (Phase 35.1.)
```

- [ ] **Step 4: `.cadence/ROADMAP.md`** — in the `## v1.2.0 — Feature expansion (superpowers-inspired)` section:
  (i) replace the `- **#2 Review-convergence loop primitive** — … **Next.** …` line with:
  `- **#2 Review-convergence loop primitive** — ✓ **delivered Phase 35.1** (pure `nextConvergence`; `plan-review`@approve bounded with sidecar attempts + escalation; reused by #4).`
  (ii) in the `- **#1 brainstorm→spec stage** — …` line, append ` **Next.**`
  (iii) replace the `Sequence: #6 ✓ → #2 → #1 → #4 ; #3/#5 parked.` line with `Sequence: #6 ✓ → #2 ✓ → #1 (next) → #4 ; #3/#5 parked.`

- [ ] **Step 5:** `git diff --stat -- DESIGN.md CHANGELOG.md .cadence/ROADMAP.md` — only those 3; eyeball `git diff .cadence/ROADMAP.md` (3 edits present).

- [ ] **Step 6: Checkpoint** — `git add DESIGN.md CHANGELOG.md .cadence/ROADMAP.md` ; `build task T5 --status=DONE --notes "DESIGN §10 item36 + §4.1 note; CHANGELOG Added; ROADMAP #2 ✓ / #1 next (AC-6)"`

---

## Task 6: full gate + two-commit settle

**Files:** none new — consolidates T1–T5.

- [ ] **Step 1: Confirm staging.** `git diff --cached --name-only` = exactly: `anomaly.ts`, `config.ts`, types `{anomaly,config}.test.ts`, `verify/converge.ts`+test, `notify/plan-review.ts`, `cli/commands/draft.ts`, `tests/cli/draft-approve-convergence.test.ts`, DESIGN/CHANGELOG/ROADMAP. **Nothing under `.cadence/phases/`, STATE, state.json** staged; `graphify-out/` untracked (leave).

- [ ] **Step 2: Full pre-push gate** (Phase 32.2 lesson — the whole hook):

Run: `pnpm install && pnpm -C packages/types build && pnpm -C packages/core build && pnpm turbo run lint typecheck test build`
Expected: 16/16 green. New `packages/**` tests satisfy `test-coverage`; do **not** use `--allow-missing-coverage`.

- [ ] **Step 3: Substantive commit:**

```bash
git commit -m "$(cat <<'EOF'
feat(core+types): review-convergence loop primitive (Phase 35.1, v1.2 #2)

Pure nextConvergence(pass,attemptsSoFar,maxAttempts) classifier (reusable by
survey #4). plan-review@draft-approve is now bounded, not one-shot: attempts +
append-only history in the existing <id>-PLAN-REVIEW.json sidecar (no
state.json change; legacy 29.7 shape → 0). After
config.convergence.maxAttempts (default 3) failing reviews it hard-escalates
("human decision required"), emits a new plan-review-unconverged anomaly
UNCONDITIONALLY (un-gated on anomaly-notify — strict cells lack it, mirrors
skill-audit-miss), refuses unless the existing --allow-plan-review-failure
(→ proceeds, history bypassed:true). Fix is external (host edits DRAFT);
in-core auto-fix deferred to #4. AnomalyTypeZ additive bump. Full gate green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Settle:** `node packages/core/bin/cadence.cjs settle run --auto`
(NO `--allow-missing-coverage` — phase adds tests. `35-01` is `auto×standard` → plan-review does not fire on its own settle. `--allow-stale-draft` only if the DRAFT was edited post-approve.)
Expected: `Settled 35-01`; loop IDLE.

- [ ] **Step 5: Settle commit:**

```bash
git add .cadence/phases/35-review-convergence/ .cadence/STATE.md .cadence/state.json
git commit -m "chore: settle Phase 35.1 — review-convergence loop primitive"
```

- [ ] **Step 6: Verify + surface push (USER-GATED — stop and ask).** `git log --oneline -4` (feat+settle pair, pseudonym), `progress` (IDLE), `git rev-list --count origin/main..HEAD`. Report green + commits-ahead; do **not** push without explicit user confirmation (auto-mode classifier blocks direct `main` push; user's `Bash(git push:*)` allow rule lets a confirmed retry through).

---

## Done criteria

- `nextConvergence` pure, unit-tested at boundaries (attempts 0 / max-1 / max; maxAttempts=1).
- `<id>-PLAN-REVIEW.json` carries `converged`/`attempts`/`maxAttempts`/append-only `history` (entries: `{at,pass,findingsCount,provider,model?,verdict,bypassed?}`); legacy 29.7-shape → attemptsSoFar 0; legacy top-level fields preserved.
- reloop: incremented sidecar + findings + `attempt N/MAX` + exit 1, no BUILD.
- escalate at MAX: distinct message + unconditional `plan-review-unconverged` anomaly (fires under strict, no `anomaly-notify`) + hard-refuse unless `--allow-plan-review-failure` (→ proceed + `bypassed:true` history).
- happy path + non-strict×complex unchanged; no `state.json` / `gates/engine.ts` change.
- `config.convergence.maxAttempts` default 3, back-compat; `AnomalyTypeZ` additive.
- DESIGN §10 item 36 + §4.1 note; CHANGELOG Added; ROADMAP #2 ✓ / #1 next.
- Full `pnpm turbo run lint typecheck test build` green; settled two-commit (no `--allow-missing-coverage`). Push user-gated.

## Acceptance Criteria (for the cadence DRAFT — 35-01 is auto×standard; DO NOT add requiredSkills/profile frontmatter)

- **AC-1:** pure `nextConvergence(pass,attemptsSoFar,maxAttempts)` → pass (short-circuit) / reloop (`attempt<max`) / escalate (`attempt>=max`); unit-tested at attempts 0, max-1, max, and maxAttempts=1.
- **AC-2:** `<id>-PLAN-REVIEW.json` extended (`converged`,`attempts`,`maxAttempts`,append-only `history` with the normative entry shape incl. `verdict` + `bypassed?` only on escalate-override); legacy 29.7-shape sidecar (no `attempts`) → `attemptsSoFar=0`; legacy top-level fields preserved.
- **AC-3:** reloop → incremented sidecar persist + findings printed + `attempt N/MAX` line + exit 1, no BUILD transition.
- **AC-4:** escalate at MAX → distinct human-decision message + **unconditional** `plan-review-unconverged` anomaly (verified firing under strict, where `anomaly-notify` is absent) + hard-refuse unless existing `--allow-plan-review-failure` (then proceeds + `bypassed:true` in history).
- **AC-5:** `config.convergence.maxAttempts` default 3, back-compat (config without block); `AnomalyTypeZ` additive `plan-review-unconverged`; no `gates/engine.ts` matrix change; happy-path + non-strict×complex unchanged.
- **AC-6:** DESIGN (§10 item 36 + §4.1 note), CHANGELOG (Added + AnomalyType bump), ROADMAP v1.2 feature-expansion (#2 ✓ delivered Phase 35.1, #1 next, sequence updated).
