# brainstorm→spec Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-DRAFT `SPEC` loop position + `<id>-SPEC.md` artifact + `cadence spec new/check/approve`, where `spec approve` runs a convergent spec-review gate that **reuses Phase 35.1's `nextConvergence`** and the plan-review convergent block verbatim (Draft→Spec rename).

**Architecture:** Low-novelty structural cloning of shipped patterns: `spec-review.ts`≈`plan-review.ts`, `spec-review-factory.ts`≈`plan-review-factory.ts`, `notify/spec-review.ts`≈`notify/plan-review.ts`, `spec-parser.ts`≈`draft-parser.ts`, `spec.ts`≈`draft.ts` (incl. the Phase 35.1 corrected convergent-approve block). Additive type/config bumps. Host-agnostic: cadence scaffolds+validates; the agent/human authors `SPEC.md` externally. SPEC→DRAFT content auto-seed is deferred (#1b).

**Tech Stack:** TypeScript, Zod, commander, vitest, pnpm+turbo monorepo. Spec: `docs/superpowers/specs/2026-05-16-spec-stage-design.md`. Reuses Phase 35.1 `verify/converge.ts` (no re-implementation/re-test).

**Execution note (CADENCE dogfood — READ FIRST, overrides per-task git steps):**
Runs as a CADENCE phase on `main` (no worktree — project convention, same as 32.x/33.1/34.1/35.1) under the **two-commit-per-phase convention**: ONE substantive commit (src+tests+docs, NOT `.cadence/*`) then ONE `chore: settle …` commit. **Never one commit per task.** Future commits land under the pseudonymous git identity (session context — do not echo/alter).

Per-task "Checkpoint" = stage-and-record, NOT commit: run the verification, `git add` touched files, then `node packages/core/bin/cadence.cjs build task T<n> --status=DONE --notes "…"`. Do **not** `git commit` until Task 6. **Verify the FULL gate** at Task 6 (`pnpm turbo run lint typecheck test build`) — the pre-push hook is the whole gate (Phase 32.2/35.1 lesson; adding a `LoopPositionZ` value WILL break `progress.ts` typecheck if its arm is missed — the full gate is the safety net, not just new tests). This phase **adds `packages/**` tests** → settle does **NOT** use `--allow-missing-coverage`; test files must contain their `AC-N` tokens.

The `36-01` phase is built via the **normal `draft→build→settle` loop, NOT `cadence spec new`** (do not bootstrap the brand-new stage on itself); `auto×standard` so plan/spec-review never fire on its own settle.

Loop: `node packages/core/bin/cadence.cjs draft new 36-spec-stage 01 --title="brainstorm→spec stage" --tier=standard` → fill DRAFT (ACs at bottom; auto×standard, no profile/requiredSkills frontmatter) → `draft check .cadence/phases/36-spec-stage/36-01-DRAFT.md` → `draft approve 36-spec-stage 01` → Tasks 1–5 (`build task T<n> --status=DONE` each) → Task 6 (substantive commit → `settle run --auto` → settle commit). Push user-gated. Survey item #1; dogfood phase id `36-01`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/types/src/state.ts` | `LoopPositionZ += 'SPEC'`; `activeSpec` (activeDraft idiom) | Modify |
| `packages/types/src/spec.ts` | `SpecZ` (reuses `AcceptanceCriterionZ`) | **Create** |
| `packages/types/src/index.ts` | export `spec.js` (if barrel exports per-module) | Modify (verify) |
| `packages/types/src/anomaly.ts` | `AnomalyTypeZ += 'spec-review-unconverged'` | Modify |
| `packages/types/src/config.ts` | `specReview` block + default/presets | Modify |
| `packages/core/src/parse/spec-parser.ts` | `parseSpecMd` (clone draft-parser) | **Create** |
| `packages/core/src/verify/spec-review.ts` | `SpecReviewVerifier` mock/anthropic/local (clone plan-review) | **Create** |
| `packages/core/src/verify/spec-review-factory.ts` | `selectSpecReviewVerifier` (clone plan-review-factory) | **Create** |
| `packages/core/src/notify/spec-review.ts` | `emitSpecReviewUnconverged` (clone notify/plan-review) | **Create** |
| `packages/core/src/cli/commands/spec.ts` | `spec new/check/approve` (clone draft.ts + ported 35.1 block) | **Create** |
| `packages/core/src/cli/register.ts` | register `spec` | Modify |
| `packages/core/src/cli/commands/draft.ts` | `draft new` SPEC-aware refusal message | Modify (1 string) |
| `packages/core/src/progress.ts` | **mandatory** `case 'SPEC':` arm | Modify |
| `packages/core/tests/**` | spec-parser unit; spec integration (7 paths); type-schema extensions | **Create/Modify** |
| `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` | docs + #1 ✓ / #1b deferred / sequence | Modify |

---

## Task 1: types — LoopPosition/activeSpec, SpecZ, AnomalyType, config.specReview

**Files:** `packages/types/src/{state,spec,anomaly,config,index}.ts` + extend `tests/{state,config,anomaly,plan}.test.ts`

- [ ] **Step 1: `state.ts`** — `LoopPositionZ`: add `'SPEC'` as the first member: `z.enum(['SPEC','DRAFT','BUILD','SETTLE','IDLE'])`. Add `activeSpec: z.string().nullable().default(null)` to `CadenceStateZ` (place adjacent to `activeDraft: z.string().nullable()`). In `emptyState(...)` add `activeSpec: null` (next to `activeDraft: null`).

- [ ] **Step 2: Create `packages/types/src/spec.ts`:**

```ts
import { z } from 'zod';
import { AcceptanceCriterionZ } from './plan.js';

export const SpecZ = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^\d{2}-\d{2}$/),
  phase: z.string(),
  objective: z.string(),
  acceptanceCriteria: z.array(AcceptanceCriterionZ),
  constraints: z.array(z.string()),
  openQuestions: z.array(z.string()),
  status: z.enum(['PENDING', 'APPROVED']),
});
export type Spec = z.infer<typeof SpecZ>;
```

(`AcceptanceCriterionZ` is exported from `plan.ts` — confirmed. If `packages/types/src/index.ts` re-exports per module, add `export * from './spec.js';` mirroring the `plan.js` export line.)

- [ ] **Step 3: `anomaly.ts`** — append after `'plan-review-unconverged',`:

```ts
  'plan-review-unconverged',
  'spec-review-unconverged',
]);
```

- [ ] **Step 4: `config.ts`** — add the `specReview` block adjacent to `convergence` (after the `convergence` `.default({ maxAttempts: 3 }),` block, before `tier:`):

```ts
  specReview: z
    .object({
      provider: z.enum(['mock', 'anthropic', 'local']).default('mock'),
      model: z.string().optional(),
    })
    .default({ provider: 'mock' }),
```

In `defaultConfig`, after `convergence: { maxAttempts: 3 },` add `specReview: { provider: 'mock' },`. (Presets spread `defaultConfig`; `.default()` covers old config.json — 34.1/35.1 precedent.)

- [ ] **Step 5: Extend type tests.** `tests/state.test.ts`: `LoopPositionZ.parse('SPEC')` ok; `emptyState` has `activeSpec: null`; old state object without `activeSpec` parses → `null` (back-compat). `tests/anomaly.test.ts`: accept `spec-review-unconverged` (mirror the 35.1 plan-review-unconverged case). `tests/config.test.ts`: `specReview` default `{provider:'mock'}` when absent; round-trips provider override; rejects unknown provider. `tests/plan.test.ts` (or a new `spec.test.ts`): `SpecZ` accepts a minimal valid spec, rejects missing `objective`. Reference `AC-1`/`AC-2`/`AC-6` tokens in test names.

- [ ] **Step 6:** `pnpm -C packages/types test && pnpm -C packages/types build` → PASS + clean.

- [ ] **Step 7: Checkpoint** — `git add packages/types/src/{state,spec,anomaly,config,index}.ts packages/types/tests` ; `build task T1 --status=DONE --notes "LoopPositionZ+SPEC; state.activeSpec; SpecZ; AnomalyTypeZ+spec-review-unconverged; config.specReview; +schema tests (AC-1/2/6)"`

---

## Task 2: `spec-parser.ts` (clone draft-parser; TDD)

**Files:** Create `packages/core/src/parse/spec-parser.ts` + `packages/core/tests/parse/spec-parser.test.ts`

`spec-parser.ts` is a near-clone of `packages/core/src/parse/draft-parser.ts`: reuse `parseFrontmatter`, `stripFrontmatter`, `extractSection`, `parseAcceptanceCriteria` (same `### AC-N` Given/When/Then shape). Differences vs draft-parser: parse `## Constraints` and `## Open Questions` (each a `- ` bullet list, like `parseBoundaries`) instead of `## Tasks`/`## Boundaries`; produce a `Spec` (`SpecZ.parse`) not a `Draft`; `status` enum is `PENDING|APPROVED`.

- [ ] **Step 1: Write failing test** — `tests/parse/spec-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSpecMd } from '../../src/parse/spec-parser.js';

const SPEC = `---
phase: 36-x
id: 36-01
status: PENDING
---

# 36-01 — t

## Objective

Build the thing.

## Acceptance Criteria

### AC-1: a
Given g
When w
Then t

## Constraints

- no new deps
- host-agnostic

## Open Questions

- which provider default?
`;

describe('parseSpecMd (AC-2)', () => {
  it('AC-2: parses objective/AC/constraints/openQuestions', () => {
    const s = parseSpecMd(SPEC);
    expect(s.objective).toBe('Build the thing.');
    expect(s.acceptanceCriteria).toEqual([{ id: 'AC-1', given: 'g', when: 'w', then: 't' }]);
    expect(s.constraints).toEqual(['no new deps', 'host-agnostic']);
    expect(s.openQuestions).toEqual(['which provider default?']);
    expect(s.status).toBe('PENDING');
  });
  it('AC-2: absent optional sections → []', () => {
    const s = parseSpecMd(SPEC.replace(/## Constraints[\s\S]*## Open Questions\n\n- which provider default\?\n/, ''));
    expect(s.constraints).toEqual([]);
    expect(s.openQuestions).toEqual([]);
  });
});
```

- [ ] **Step 2:** `pnpm -C packages/core test -- run parse/spec-parser` → FAIL (module missing).

- [ ] **Step 3: Implement** `spec-parser.ts` — clone `draft-parser.ts`'s helpers (or import the exported ones if `draft-parser` exports them; otherwise reproduce `parseFrontmatter`/`stripFrontmatter`/`extractSection`/`parseAcceptanceCriteria`/a `parseBulletList` like `parseBoundaries`). `parseSpecMd(raw): Spec`:

```ts
import { SpecZ, type Spec } from '@cadence/types';
import { CadenceError } from '../errors.js';
// reproduce the small helpers from draft-parser.ts: FRONTMATTER_RE,
// parseFrontmatter, stripFrontmatter, extractSection, parseAcceptanceCriteria,
// and a parseBulletList (identical to draft-parser's parseBoundaries).

export function parseSpecMd(raw: string): Spec {
  const fm = parseFrontmatter(raw);
  const body = stripFrontmatter(raw);
  const objective = extractSection(body, 'Objective').split('\n')[0] ?? '';
  const acceptanceCriteria = parseAcceptanceCriteria(extractSection(body, 'Acceptance Criteria'));
  const constraints = parseBulletList(extractSection(body, 'Constraints'));
  const openQuestions = parseBulletList(extractSection(body, 'Open Questions'));
  const spec: Spec = {
    schemaVersion: 1,
    id: fm.id ?? '',
    phase: fm.phase ?? '',
    objective,
    acceptanceCriteria,
    constraints,
    openQuestions,
    status: (fm.status as Spec['status']) ?? 'PENDING',
  };
  return SpecZ.parse(spec);
}
```

(DRY note: if reproducing helpers, keep them private to `spec-parser.ts` — do NOT refactor `draft-parser.ts` to share, that's unrelated churn. If `draft-parser.ts` already `export`s them, import instead.)

- [ ] **Step 4:** `pnpm -C packages/core test -- run parse/spec-parser` → PASS (2); `pnpm -C packages/core test -- run parse` (no regression).

- [ ] **Step 5: Checkpoint** — `git add packages/core/src/parse/spec-parser.ts packages/core/tests/parse/spec-parser.test.ts` ; `build task T2 --status=DONE --notes "spec-parser clone (objective/AC/constraints/openQuestions) TDD green (AC-2)"`

---

## Task 3: spec-review verifier + factory + notify (clone plan-review trio)

**Files:** Create `packages/core/src/verify/spec-review.ts`, `verify/spec-review-factory.ts`, `notify/spec-review.ts`

- [ ] **Step 1: `verify/spec-review.ts`** — clone `verify/plan-review.ts` verbatim, then:
  - rename `PlanReview*`→`SpecReview*` (interface, `PlanReviewFinding`→`SpecReviewFinding`, `PlanReviewInput`/`Result`, `Mock/Anthropic/Local` classes, response schema vars).
  - `Input` is `{ spec: Spec }` (import `Spec` from `@cadence/types`) instead of `{ draft: Draft }`.
  - **Mock floor** (stricter than plan-review's, per spec): `pass` iff `spec.objective.trim()` non-empty AND `spec.acceptanceCriteria.length >= 1` AND every AC has non-empty trimmed given/when/then AND `spec.constraints.length >= 1`; one HIGH finding per defect (`objective empty` / `spec has no acceptance criteria` / `${ac.id} has empty ${field}` / `spec has no constraints`).
  - `SYSTEM_PROMPT`: adapt plan-review's to spec review (review the SPEC's objective/ACs/constraints/open-questions for coherence, falsifiable ACs, scope; pass=false on any HIGH). `formatUserMessage(spec)` mirrors plan-review's (Objective / Acceptance Criteria / Constraints / Open Questions sections).
  - Anthropic/Local impls: identical structure to plan-review's (same `messages.parse` + `zodOutputFormat` + `cache_control` for anthropic; `localChatJSON` for local).

- [ ] **Step 2: `verify/spec-review-factory.ts`** — clone `verify/plan-review-factory.ts` verbatim; rename `PlanReview`→`SpecReview`, read `config.specReview` (not `config.planReview`), warning prefixes `spec-review:`. Signature: `selectSpecReviewVerifier(config: Pick<CadenceConfig,'specReview'> | null, opts = {}): SpecReviewVerifier`.

- [ ] **Step 3: `notify/spec-review.ts`** — clone `notify/plan-review.ts` verbatim; rename `emitPlanReviewUnconverged`→`emitSpecReviewUnconverged`, `type: 'plan-review-unconverged'`→`'spec-review-unconverged'`, message/context `draftId`→`specId`. Keep it **unconditional / no-throw** (identical pattern; the rationale comment updated to "spec-review isn't a matrix cell; hard escalation must leave an audit trail").

- [ ] **Step 4:** `pnpm -C packages/core build` → clean tsc (exercised via Task 4 integration).

- [ ] **Step 5: Checkpoint** — `git add packages/core/src/verify/spec-review.ts packages/core/src/verify/spec-review-factory.ts packages/core/src/notify/spec-review.ts` ; `build task T3 --status=DONE --notes "spec-review verifier+factory+notify cloned from plan-review trio; mock floor requires >=1 constraint"`

---

## Task 4: `spec.ts` command + register + draft-guard + progress arm + integration

**Files:** Create `packages/core/src/cli/commands/spec.ts`; modify `register.ts`, `draft.ts`, `progress.ts`; create `packages/core/tests/cli/spec-stage.test.ts`

- [ ] **Step 1: `progress.ts` — mandatory `case 'SPEC':` arm.** In `nextAction`'s switch, add before `case 'BUILD':`:

```ts
    case 'SPEC': {
      const phase = state.activePhase ?? '<phase>';
      const num = state.activeSpec?.split('-')[1] ?? '<num>';
      return {
        command: `cadence spec approve ${phase} ${num}`,
        reason:
          'SPEC is open. Fill objective, ACs, constraints, run cadence spec check, then approve to leave the spec stage.',
      };
    }
```

(Optional hardening per spec: add `default: { const _x: never = state.loopPosition; return _x; }` so future enum additions fail loudly. Plan's call — recommended, one line.)

- [ ] **Step 2: `register.ts`** — add `import { registerSpecCommand } from './commands/spec.js';` and `registerSpecCommand(program);` (place the call right after `registerDraftCommand(program);`).

- [ ] **Step 3: `draft.ts` — SPEC-aware refusal.** `draft new`'s existing guard already refuses any non-IDLE (`if (state.loopPosition !== 'IDLE')`). Refine its message so a SPEC-state user is pointed at the right command. Replace the existing refusal `process.stderr.write` body with:

```ts
          const hint =
            state.loopPosition === 'SPEC'
              ? `Approve or discard the active spec (${state.activeSpec ?? '?'}) first (cadence spec approve …).`
              : `Settle or discard the active draft (${state.activeDraft ?? '?'}) first.`;
          process.stderr.write(
            `draft new refused: loopPosition is ${state.loopPosition}, not IDLE. ${hint}\n`,
          );
```

- [ ] **Step 4: Create `packages/core/src/cli/commands/spec.ts`.** Structural clone of `registerDraftCommand` (`new`/`check`/`approve` subcommands), adapted:
  - `program.command('spec').description('Spec phase workflow (pre-DRAFT)')`.
  - **`spec new <phase> <num>`**: IDLE-gated (same `state.loopPosition !== 'IDLE'` guard + message). Scaffold `<id>-SPEC.md` body:
    `---\nphase: ${phase}\nid: ${id}\nstatus: PENDING\n---\n\n# ${id} — ${opts.title}\n\n## Objective\n\n_(one sentence)_\n\n## Acceptance Criteria\n\n### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_\n\n## Constraints\n\n- _(constraint)_\n\n## Open Questions\n\n- _(question)_\n`
    Set `state.activePhase = phase; state.activeSpec = id; state.loopPosition = 'SPEC';` write state + STATE.md (mirror `draft new`). Refuse with exit 2 if `<id>-SPEC.md` exists.
  - **`spec check <path>`**: read file, `parseSpecMd`, run a minimal structural sanity (objective non-empty, ≥1 AC) — print `spec: OK` or list issues (mirror `draft check`'s shape; coherenceCheck is draft-specific so a small inline check is fine — keep it minimal, structural only).
  - **`spec approve <phase> <num>`**: **port the Phase 35.1 convergent block from `draft.ts` verbatim**, Draft→Spec:
    - option `--allow-spec-review-failure` + `opts: { allowSpecReviewFailure?: boolean }` (extend the inline opts type — Phase 34.1 lesson).
    - read `${id}-SPEC.md`, `parseSpecMd` → `spec` (refuse if missing/loopPosition≠SPEC).
    - `sidecarPath = <phase>/<id>-SPEC-REVIEW.json`; read prior `attempts`/`history` (legacy/absent→0) — identical to the plan-review block.
    - `verifier = selectSpecReviewVerifier(cfg)`; `res = verifier.verify({ spec })`; `maxAttempts = cfg?.convergence?.maxAttempts ?? 3`; `nv = nextConvergence(res.pass, attemptsSoFar, maxAttempts)` (import from `../../verify/converge.js` — **reuse, do not reimplement**); `bypassed = !res.pass && opts.allowSpecReviewFailure === true`.
    - persist `<id>-SPEC-REVIEW.json` with the **same shape** as `<id>-PLAN-REVIEW.json` (`{specId, converged, attempts, maxAttempts, history[{at,pass,findingsCount,provider,model?,verdict,bypassed?}], pass, provider, model?, findings, at}`).
    - branch identical to the shipped plan-review block (35.1 corrected semantics): `res.pass` → set SPEC.md frontmatter `status: APPROVED`, `state.loopPosition='IDLE'`, `state.activeSpec=null`, write state+STATE.md, `console.log('Approved spec <id>')`. `!res.pass`+`--allow-spec-review-failure` → print findings; if `nv.verdict==='escalate'` `emitSpecReviewUnconverged(selectNotifier(cfg), {... bypassed:true})`; print `spec-review: --allow-spec-review-failure set; proceeding past N finding(s).`; then the same APPROVED+IDLE+activeSpec=null transition. `!res.pass`,no flag,`reloop` → findings + `spec-review: attempt N/MAX did not pass — fix the SPEC and re-run \`cadence spec approve\`, or pass --allow-spec-review-failure to proceed anyway.`; exit 1; stays SPEC. `!res.pass`,no flag,`escalate` → `emitSpecReviewUnconverged(...)` (no bypass) + `spec approve refused: spec-review did NOT converge after MAX attempts — a human decision is required. Re-scope the spec, or pass --allow-spec-review-failure to proceed anyway.`; exit 1; stays SPEC.
    - To set SPEC.md `status: APPROVED`: read the file, replace the frontmatter `status: PENDING` line with `status: APPROVED`, write back (atomic).

- [ ] **Step 5: Integration tests** — `packages/core/tests/cli/spec-stage.test.ts`, spawned-CLI idiom (mirror `draft-approve-convergence.test.ts`: `tempRepo`, `run()`, `initGitRepo`, `cfg.notify={transport:'file'}`, **mock** SpecReview provider = default). Helper `writeSpec(root,{good})`: `good` SPEC has objective + AC w/ G/W/T + **≥1 Constraint** (mock floor requires it); bad SPEC has a blank-GWT AC. Paths, each AC-tokened:
  - (a) AC-1: `spec new 36-x 01` from IDLE → `36-01-SPEC.md` exists, `state.loopPosition==='SPEC'`, `state.activeSpec==='36-01'`.
  - (b) AC-1: while SPEC, `draft new 36-x 01` → exit 1, stderr mentions `spec` / not IDLE.
  - (c) AC-3: good SPEC → `spec approve 36-x 01` → exit 0, SPEC.md `status: APPROVED`, `loopPosition==='IDLE'`, `activeSpec===null`, `36-01-SPEC-REVIEW.json converged:true`; then `draft new 36-x 01` succeeds (loop unblocked).
  - (d) AC-4: bad SPEC → `spec approve` → exit 1, stderr `attempt 1/3`, sidecar `attempts:1`, stays `SPEC`.
  - (e) AC-5: bad SPEC, `spec approve` ×3 → 3rd exit 1, stderr `did NOT converge after 3 attempts`, anomaly log has `"type":"spec-review-unconverged"` (fires though spec-review is not a matrix cell — unconditional lock).
  - (f) AC-5: bad SPEC ×2 then `spec approve --allow-spec-review-failure` → exit 0, `loopPosition==='IDLE'`, `activeSpec===null`, sidecar history last `bypassed:true`, anomaly present.
  - (g) AC-3: legacy/absent `36-01-SPEC-REVIEW.json` (none) → first bad approve = `attempt 1/3` (attemptsSoFar 0).

- [ ] **Step 6:** `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/spec-stage parse/spec-parser` → PASS.

- [ ] **Step 7: Checkpoint** — `git add packages/core/src/cli/commands/spec.ts packages/core/src/cli/register.ts packages/core/src/cli/commands/draft.ts packages/core/src/progress.ts packages/core/tests/cli/spec-stage.test.ts` ; `build task T4 --status=DONE --notes "spec new/check/approve (ported 35.1 convergent block); register; draft-guard message; progress.ts SPEC arm; 7-path integration green (AC-1/3/4/5)"`

---

## Task 5: docs + ROADMAP

**Files:** `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`

- [ ] **Step 1: DESIGN.md §10 — add item 37.** After `36. ~~Phase 35.1 (v1.2 feature-expansion #2) …~~ ✓` and before the blank line preceding `Sequencing rationale:`, insert:

```
37. ~~Phase 36.1 (v1.2 feature-expansion #1) — brainstorm→spec stage: new `SPEC` loop position + `<id>-SPEC.md` artifact + `cadence spec new/check/approve`; `spec approve` runs a convergent spec-review gate reusing Phase 35.1 `nextConvergence` + sidecar/history + unconditional `spec-review-unconverged` anomaly + `--allow-spec-review-failure` (35.1 flag semantics). Host-agnostic (scaffold+validate); SPEC→DRAFT auto-seed deferred (#1b)~~ ✓
```

- [ ] **Step 2: DESIGN.md §4.1 note.** After the `> **Plan-review convergence (Phase 35.1)** …` blockquote and before `### 4.2`, add:

```
> **Spec stage (Phase 36.1)** — a pre-DRAFT `SPEC` loop position (`cadence spec new/check/approve`). `spec approve` runs a convergent spec-review gate (own `<id>-SPEC-REVIEW.json` sidecar) reusing the Phase 35.1 `nextConvergence` primitive verbatim; escalation emits an unconditional `spec-review-unconverged` anomaly; override = `--allow-spec-review-failure` (bypasses any fail). Opt-in by use (no matrix cell); host-agnostic (cadence scaffolds+validates, the agent/human authors `SPEC.md`). The SPEC→DRAFT content auto-seed is deferred (#1b).
```

- [ ] **Step 3: CHANGELOG.md** — in `## [Unreleased] → ### Added`, after the Phase 35.1 review-convergence bullet and before the blank line preceding `### Fixed`, append:

```
- brainstorm→spec stage: a new pre-DRAFT `SPEC` loop position with `cadence spec new` (scaffolds `<id>-SPEC.md`: objective / acceptance criteria / constraints / open questions), `cadence spec check` (structural sanity), and `cadence spec approve` — which runs a **convergent** spec-review gate reusing the Phase 35.1 `nextConvergence` primitive verbatim (attempts/history in a `<id>-SPEC-REVIEW.json` sidecar; reloop on fail; hard-escalate at `config.convergence.maxAttempts` with an unconditional `spec-review-unconverged` anomaly; `--allow-spec-review-failure` bypasses any fail → proceed, `bypassed:true` in history — same semantics as plan-review's `--allow-plan-review-failure`). `cadence draft new` refuses while a spec is active. Host-agnostic: cadence scaffolds + validates; the host agent/human authors the SPEC externally. `LoopPositionZ` gains `SPEC`, `AnomalyTypeZ` gains `spec-review-unconverged`, `config.specReview` added (all additive/back-compat). The SPEC→DRAFT content auto-seed is deferred. (Phase 36.1.)
```

- [ ] **Step 4: `.cadence/ROADMAP.md`** v1.2 feature-expansion section:
  (i) replace the `- **#1 brainstorm→spec stage** — … **Next.**` line with:
  `- **#1 brainstorm→spec stage** — ✓ **delivered Phase 36.1** (SPEC loop position + `cadence spec new/check/approve`; convergent spec-review reuses #2's `nextConvergence`; host-agnostic scaffold+validate). **SPEC→DRAFT content auto-seed deferred as #1b.**`
  (ii) replace `Sequence: #6 ✓ → #2 ✓ → #1 (next) → #4 ; #3/#5 parked.` with `Sequence: #6 ✓ → #2 ✓ → #1 ✓ → #4 (next) ; #1b + #3/#5 parked.`
  (iii) add a bullet after the #4 line: `- **#1b SPEC→DRAFT auto-seed** — `cadence draft new` reads an approved `<id>-SPEC.md` to pre-fill objective/ACs (deferred from #1's minimal v1).`

- [ ] **Step 5:** `git diff --stat -- DESIGN.md CHANGELOG.md .cadence/ROADMAP.md` — only those 3; eyeball the ROADMAP hunks.

- [ ] **Step 6: Checkpoint** — `git add DESIGN.md CHANGELOG.md .cadence/ROADMAP.md` ; `build task T5 --status=DONE --notes "DESIGN §10 item37 + §4.1 note; CHANGELOG Added; ROADMAP #1 ✓ + #1b deferred + sequence (AC-6)"`

---

## Task 6: full gate + two-commit settle

**Files:** none new — consolidates T1–T5.

- [ ] **Step 1: Confirm staging.** `git diff --cached --name-only` = exactly the files from T1–T5 checkpoints. **Nothing under `.cadence/phases/`, STATE, state.json** staged; `graphify-out/` untracked (leave).

- [ ] **Step 2: Full pre-push gate** (Phase 32.2/35.1 lesson — the WHOLE hook; the `progress.ts` SPEC arm is load-bearing for `typecheck`):

Run: `pnpm install && pnpm -C packages/types build && pnpm -C packages/core build && pnpm turbo run lint typecheck test build`
Expected: 16/16 green (`typecheck` proves the `progress.ts` exhaustiveness fix landed; new `packages/**` tests satisfy `test-coverage`; do **not** `--allow-missing-coverage`).

- [ ] **Step 3: Substantive commit:**

```bash
git commit -m "$(cat <<'EOF'
feat(core+types): brainstorm→spec stage (Phase 36.1, v1.2 #1)

New pre-DRAFT SPEC loop position + <id>-SPEC.md artifact + cadence
spec new/check/approve. spec approve runs a convergent spec-review gate
that REUSES Phase 35.1 nextConvergence verbatim (attempts/history in a
<id>-SPEC-REVIEW.json sidecar; reloop; hard-escalate at
config.convergence.maxAttempts → unconditional spec-review-unconverged
anomaly; --allow-spec-review-failure bypasses any fail, 35.1 semantics).
Host-agnostic: cadence scaffolds+validates, agent/human authors SPEC.md.
LoopPositionZ+SPEC, state.activeSpec, AnomalyTypeZ+spec-review-unconverged,
config.specReview — all additive/back-compat. progress.ts gains the
mandatory SPEC arm. SPEC→DRAFT auto-seed deferred (#1b). Structural clone
of the shipped draft/plan-review/notify patterns; full gate 16/16 green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Mark T6 DONE + settle** (T6 is the settle-ceremony meta-task — mark DONE so `--auto` AC-6 derivation passes, same as 34.1/35.1):

`node packages/core/bin/cadence.cjs build task T6 --status=DONE --notes "full gate 16/16; feat commit landed"` then `node packages/core/bin/cadence.cjs settle run --auto`
Expected: `Settled 36-01`; loop IDLE. (NO `--allow-missing-coverage`. `36-01` is auto×standard so spec/plan-review never fire on its own settle.)

- [ ] **Step 5: Settle commit:**

```bash
git add .cadence/phases/36-spec-stage/ .cadence/STATE.md .cadence/state.json
git commit -m "chore: settle Phase 36.1 — brainstorm→spec stage"
```

- [ ] **Step 6: Verify + surface push (USER-GATED — stop and ask).** `git log --oneline -4` (feat+settle pair, pseudonym), `progress` (IDLE), `git rev-list --count origin/main..HEAD`. Report green + commits-ahead; do **not** push without explicit user confirmation (classifier blocks direct `main` push; user's `Bash(git push:*)` allow rule lets a confirmed retry through).

---

## Done criteria

- `LoopPositionZ`+`SPEC`; `state.activeSpec` (nullable/default null, set on `spec new`, cleared on `spec approve` pass); `progress.ts` `case 'SPEC':` arm (typecheck green).
- `SpecZ`+`spec-parser` (objective/ACs/constraints/openQuestions; reuses `AcceptanceCriterionZ`; back-compat).
- `spec-review` verifier/factory/notify cloned from plan-review trio (mock floor requires ≥1 constraint).
- `cadence spec new` (IDLE-gated, scaffolds SPEC.md, loopPosition=SPEC) / `spec check` (structural) / `spec approve` (convergent, reuses `nextConvergence`; pass→APPROVED+IDLE+activeSpec=null; reloop/escalate per 35.1; `--allow-spec-review-failure` bypasses any fail). `draft new` refusal message SPEC-aware.
- `spec-review-unconverged` unconditional anomaly; `config.specReview` default mock; no `gates/engine.ts` change; no `state.json` breaking change.
- 7-path integration + spec-parser unit + type-schema tests green; full `pnpm turbo run lint typecheck test build` green; settled two-commit (no `--allow-missing-coverage`). DESIGN §10 item 37 + §4.1; CHANGELOG; ROADMAP #1 ✓ / #1b deferred / `#4 next`. Push user-gated.

## Acceptance Criteria (for the cadence DRAFT — 36-01 is auto×standard; DO NOT add profile/requiredSkills frontmatter; build via normal draft loop, NOT `cadence spec new`)

- **AC-1:** `LoopPositionZ += 'SPEC'`; `state.activeSpec` (`.nullable().default(null)`, emptyState null); `progress.ts` `case 'SPEC':` (mandatory typecheck fix); `cadence spec new` (IDLE-gated) scaffolds `<id>-SPEC.md` + `loopPosition='SPEC'` + `activeSpec=id`; `cadence draft new` refuses while SPEC with a SPEC-aware message.
- **AC-2:** `SpecZ` + `spec-parser` parse objective/ACs(GWT)/constraints/openQuestions (reuses `AcceptanceCriterionZ`; absent optional sections → []; additive/back-compat).
- **AC-3:** `cadence spec approve` runs `selectSpecReviewVerifier` through `nextConvergence` with `<id>-SPEC-REVIEW.json` attempts/history (plan-review sidecar shape); pass → SPEC.md `status:APPROVED` + `loopPosition='IDLE'` + `activeSpec=null`; legacy/absent sidecar → attemptsSoFar 0.
- **AC-4:** reloop: incremented sidecar + findings + `attempt N/MAX` + exit 1, stays SPEC, not APPROVED.
- **AC-5:** escalate at `config.convergence.maxAttempts`: distinct message + unconditional `spec-review-unconverged` anomaly + hard-refuse unless `--allow-spec-review-failure`; flag bypasses ANY fail (reloop or escalate) → APPROVED+IDLE+activeSpec=null + `bypassed:true` history (35.1 semantics).
- **AC-6:** `config.specReview` default mock (back-compat); `AnomalyTypeZ` additive `spec-review-unconverged`; no `gates/engine.ts` change; DESIGN (§10 item 37 + §4.1 note), CHANGELOG (Added + bumps), ROADMAP (#1 ✓ Phase 36.1, #1b deferred bullet, sequence `#1 ✓ → #4 (next)`).
