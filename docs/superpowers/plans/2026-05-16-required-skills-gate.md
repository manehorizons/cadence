# Required-Skill Enforcement Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phase declares skills it must invoke (`requiredSkills` in DRAFT frontmatter ∪ `config.skillAudit.required`); `settle run` refuses on shortfall with `--allow-skill-audit-miss` bypass and an unconditional `skill-audit-miss` anomaly — closing the pre-existing ROADMAP 23.4 open question.

**Architecture:** Additive type changes (`DraftZ.requiredSkills?`, `config.skillAudit.required`, `AnomalyTypeZ += skill-audit-miss`). A pure `satisfies()` match helper (exact OR `:`-suffix). A settle-time check (NOT a `gates/engine.ts` matrix cell — declaring skills *is* the opt-in): inert when effective-required empty; skip+warn when `telemetry.skillInvocations` off; else refuse + emit unless `--allow-skill-audit-miss`. Anomaly emission is **unconditional / profile-independent** (deliberate, called-out divergence from the `anomaly-notify`-gated `code-review-high`/`loop-violation` precedent — strict cells lack that gate and must still get an audit trail).

**Tech Stack:** TypeScript, Zod, commander, vitest, pnpm+turbo monorepo. Spec: `docs/superpowers/specs/2026-05-16-required-skills-gate-design.md`.

**Execution note (CADENCE dogfood — READ FIRST, overrides per-task git steps):**
Runs as a CADENCE phase on `main` (no worktree — project convention, same override as 32.x/33.1) under the **two-commit-per-phase convention**: ONE substantive commit (src+tests+docs, NOT `.cadence/*`) then ONE `chore: settle …` commit (`.cadence/phases/34-required-skills/*` + STATE + state.json). **Never one commit per task.** Future commits land under the pseudonymous git identity the user set repo-locally (unrelated to this feature; just session context — do not echo or alter it).

Per-task "Checkpoint" = stage-and-record, NOT commit: run the verification, `git add` the touched files, then `node packages/core/bin/cadence.cjs build task T<n> --status=DONE --notes "…"`. Do **not** `git commit` until Task 6. **Verify the FULL gate** at Task 6 (`pnpm turbo run lint typecheck test build`) — the pre-push hook is the whole gate, not just test (Phase 32.2 lesson).

This phase **adds `packages/**` tests**, so the `test-coverage` gate enforces normally — **`--allow-missing-coverage` is NOT used**; every test file must literally contain its `AC-N` tokens (the gate greps for them). The `34-01` DRAFT itself declares **no** `requiredSkills` (effective-empty ⇒ the new check is inert for its own settle — deliberately avoid bootstrapping a brand-new gate against itself; self-dogfooding is a noted follow-up once proven).

Loop: `node packages/core/bin/cadence.cjs draft new 34-required-skills 01 --title="required-skill enforcement gate" --tier=standard` → fill DRAFT (ACs at bottom; **no requiredSkills frontmatter**) → `draft check .cadence/phases/34-required-skills/34-01-DRAFT.md` → `draft approve 34-required-skills 01` → Tasks 1–5 (`build task T<n> --status=DONE` each) → Task 6 (substantive commit → `settle run --auto` → settle commit). Push user-gated. Implements ROADMAP open-question 23.4 closure; dogfood phase id `34-01`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/types/src/anomaly.ts` | `AnomalyTypeZ += 'skill-audit-miss'` | Modify |
| `packages/types/src/config.ts` | `skillAudit:{required:[]}` schema + default/presets | Modify |
| `packages/types/src/plan.ts` | `DraftZ.requiredSkills?: string[]` | Modify |
| `packages/core/src/parse/draft-parser.ts` | parse `requiredSkills` frontmatter list | Modify |
| `packages/core/src/verify/skill-match.ts` | pure `satisfies(req, invoked[])` + `missingSkills(required, invoked)` | **Create** |
| `packages/core/src/notify/skill-audit.ts` | `emitSkillAuditMiss(notifier, ctx)` (mirror `notify/code-review.ts`) | **Create** |
| `packages/core/src/cli/commands/settle.ts` | `--allow-skill-audit-miss` flag + resolve-effective + check + unconditional emit + `state.skillAudit.required` write | Modify |
| `packages/core/tests/verify/skill-match.test.ts` | pure-fn unit (TDD) | **Create** |
| `packages/core/tests/parse/draft-parser-required-skills.test.ts` | frontmatter parse | **Create** |
| `packages/types/tests/config.test.ts` / `plan.test.ts` | schema default/back-compat (extend existing) | Modify |
| `packages/core/tests/cli/settle-skill-audit.test.ts` | settle integration, 6 paths a–f | **Create** |
| `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` | docs + 23.4 close + v1.2 backlog | Modify |

---

## Task 1: type changes (types package)

**Files:** `packages/types/src/anomaly.ts`, `config.ts`, `plan.ts`

- [ ] **Step 1:** `anomaly.ts` — append `'skill-audit-miss'` to the `AnomalyTypeZ` enum (after `'code-review-high',` on line ~22):

```ts
  'code-review-high',
  'skill-audit-miss',
]);
```

- [ ] **Step 2:** `config.ts` — add a `skillAudit` block to the config schema. Place it adjacent to the `telemetry` block (~line 45-49). Add:

```ts
  skillAudit: z.object({
    required: z.array(z.string()).default([]),
  }).default({ required: [] }),
```

(The `.default(...)` makes an old `config.json` lacking `skillAudit` parse to `{ required: [] }` — back-compat.) Then in `defaultConfig` (~line 184, near `telemetry: { … }`) add `skillAudit: { required: [] },`. If presets exist that spread/override config, leave them — the schema default covers absence.

- [ ] **Step 3:** `plan.ts` — add to `DraftZ` (after `boundaries` / before `status`, ~line 36):

```ts
  requiredSkills: z.array(z.string()).optional(),
```

- [ ] **Step 4:** Extend the existing type tests. In `packages/types/tests/config.test.ts` add a case: a config object **without** `skillAudit` parses and yields `skillAudit.required === []` (back-compat); a config with `skillAudit:{required:['x']}` round-trips. In `packages/types/tests/plan.test.ts` add: a Draft without `requiredSkills` parses (`requiredSkills` undefined); with `requiredSkills:['a']` round-trips. Reference token `AC-1` and `AC-5` in test names/comments (coverage gate greps AC tokens).

- [ ] **Step 5:** Run + build:

Run: `pnpm -C packages/types test && pnpm -C packages/types build`
Expected: PASS; clean tsc.

- [ ] **Step 6: Checkpoint (stage only — NO commit)**

```bash
git add packages/types/src/anomaly.ts packages/types/src/config.ts packages/types/src/plan.ts packages/types/tests
```
Then: `node packages/core/bin/cadence.cjs build task T1 --status=DONE --notes "types: AnomalyTypeZ+=skill-audit-miss; config.skillAudit.required (default []); DraftZ.requiredSkills?; schema tests"`

---

## Task 2: `skill-match.ts` pure helper (TDD)

**Files:** Create `packages/core/src/verify/skill-match.ts` + `packages/core/tests/verify/skill-match.test.ts`

- [ ] **Step 1: Write failing tests** — `packages/core/tests/verify/skill-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { satisfies, missingSkills } from '../../src/verify/skill-match.js';

describe('skill-match (AC-2)', () => {
  it('AC-2: exact match', () => {
    expect(satisfies('brainstorming', ['brainstorming'])).toBe(true);
  });
  it('AC-2: namespace-suffix match (plugin-qualified invoked)', () => {
    expect(satisfies('brainstorming', ['superpowers:brainstorming'])).toBe(true);
    expect(satisfies('caveman', ['caveman:caveman'])).toBe(true);
  });
  it('AC-2: no loose substring / no false positive', () => {
    expect(satisfies('brain', ['superpowers:brainstorming'])).toBe(false);
    expect(satisfies('storming', ['superpowers:brainstorming'])).toBe(false);
  });
  it('AC-2: case-sensitive', () => {
    expect(satisfies('Brainstorming', ['brainstorming'])).toBe(false);
  });
  it('AC-2: empty invoked → unsatisfied', () => {
    expect(satisfies('tdd', [])).toBe(false);
  });
  it('AC-2: missingSkills returns only unsatisfied', () => {
    expect(missingSkills(['a', 'b'], ['superpowers:a'])).toEqual(['b']);
    expect(missingSkills([], ['x'])).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run → FAIL (module not found). `pnpm -C packages/core test -- run verify/skill-match`

- [ ] **Step 3: Implement** `packages/core/src/verify/skill-match.ts`:

```ts
/**
 * A required skill token `req` is satisfied by an invoked entry `inv` iff
 * `inv === req` OR `inv` ends with `:${req}` (tolerates plugin/namespace
 * prefixes like `superpowers:brainstorming` without loose substring matching).
 * Case-sensitive — skill ids are.
 */
export function satisfies(req: string, invoked: readonly string[]): boolean {
  const suffix = `:${req}`;
  return invoked.some((inv) => inv === req || inv.endsWith(suffix));
}

/** Required tokens with no satisfying invoked entry, order preserved. */
export function missingSkills(
  required: readonly string[],
  invoked: readonly string[],
): string[] {
  return required.filter((r) => !satisfies(r, invoked));
}
```

- [ ] **Step 4:** Run → PASS (6). `pnpm -C packages/core test -- run verify/skill-match`

- [ ] **Step 5: Checkpoint** — `git add packages/core/src/verify/skill-match.ts packages/core/tests/verify/skill-match.test.ts` ; `node packages/core/bin/cadence.cjs build task T2 --status=DONE --notes "pure satisfies()/missingSkills() + unit tests (AC-2) green"`

---

## Task 3: parse `requiredSkills` frontmatter

**Files:** `packages/core/src/parse/draft-parser.ts` + `packages/core/tests/parse/draft-parser-required-skills.test.ts`

Frontmatter format (line-based parser stores everything after the first `:` as a raw string): `requiredSkills: brainstorming, writing-plans` (comma-separated; optional `[ ]`/quotes tolerated).

- [ ] **Step 1: Write failing test** — `packages/core/tests/parse/draft-parser-required-skills.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDraftMd } from '../../src/parse/draft-parser.js';

const base = (fm: string) => `---
phase: 34-x
id: 34-01
tier: standard
${fm}---

# 34-01 — t

## Objective
o

## Acceptance Criteria

### AC-1: a
Given g
When w
Then t

## Tasks

### T1: t
- files: \`x.ts\`
- action: a
- verify: v
- done: AC-1

## Boundaries

- none
`;

describe('draft-parser requiredSkills (AC-1)', () => {
  it('AC-1: absent → undefined', () => {
    expect(parseDraftMd(base('')).requiredSkills).toBeUndefined();
  });
  it('AC-1: comma list parsed + trimmed', () => {
    expect(parseDraftMd(base('requiredSkills: brainstorming, writing-plans\n')).requiredSkills)
      .toEqual(['brainstorming', 'writing-plans']);
  });
  it('AC-1: brackets/quotes tolerated, empties dropped', () => {
    expect(parseDraftMd(base('requiredSkills: ["tdd", , brainstorming]\n')).requiredSkills)
      .toEqual(['tdd', 'brainstorming']);
  });
});
```

- [ ] **Step 2:** Run → FAIL. `pnpm -C packages/core test -- run parse/draft-parser-required-skills`

- [ ] **Step 3: Implement** — in `draft-parser.ts`, add a list parser and wire it into the `draft` object spread (mirror the existing `profile` optional pattern at ~line 88):

```ts
function parseSkillList(v: string): string[] {
  return v
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.replace(/['"]/g, '').trim())
    .filter((s) => s.length > 0);
}
```

Then in the `const draft: Draft = { … }` literal, alongside the existing
`...(fm.profile !== undefined ? { profile: ... } : {})` spread, add:

```ts
    ...(fm.requiredSkills !== undefined
      ? { requiredSkills: parseSkillList(fm.requiredSkills) }
      : {}),
```

**Caution:** the `fm.profile` spread is currently the *last* property in the
literal (no trailing comma after it). When appending the new spread, add a
comma after the `profile` spread so both are valid literal members (the
snippet above already ends with `,`).

- [ ] **Step 4:** Run → PASS (3). Re-run the whole parse suite: `pnpm -C packages/core test -- run parse` → PASS (no regression).

- [ ] **Step 5: Checkpoint** — `git add packages/core/src/parse/draft-parser.ts packages/core/tests/parse/draft-parser-required-skills.test.ts` ; `build task T3 --status=DONE --notes "requiredSkills frontmatter parse (comma/bracket/quote tolerant) (AC-1)"`

---

## Task 4: emit helper + settle wiring + integration tests

**Files:** Create `packages/core/src/notify/skill-audit.ts`; modify `packages/core/src/cli/commands/settle.ts`; create `packages/core/tests/cli/settle-skill-audit.test.ts`

- [ ] **Step 1: Create `packages/core/src/notify/skill-audit.ts`** (mirror `notify/code-review.ts` transport+no-throw; the caller does NOT gate on `anomaly-notify`):

```ts
import type { AnomalyEvent } from '@cadence/types';
import type { selectNotifier } from './factory.js';

/**
 * Emits a single `skill-audit-miss` anomaly. UNCONDITIONAL by design — unlike
 * `emitCodeReviewHigh`/`emitLoopViolation` the caller does NOT gate this on the
 * `anomaly-notify` gate (strict cells lack it; a strict phase that fails the
 * skill requirement must still leave an audit trail). Transport failure → one
 * stderr warning, never throws (refusal is computed independently).
 */
export async function emitSkillAuditMiss(
  notifier: ReturnType<typeof selectNotifier>,
  ctx: {
    required: string[];
    invoked: string[];
    missing: string[];
    severity: 'warn' | 'error';
    bypassed?: boolean;
    unenforceable?: boolean;
  },
): Promise<void> {
  const event: AnomalyEvent = {
    type: 'skill-audit-miss',
    severity: ctx.severity,
    message:
      ctx.unenforceable === true
        ? `skill-audit unenforceable — telemetry.skillInvocations disabled; required [${ctx.required.join(', ')}] not verified`
        : `skill-audit miss — required skill(s) not invoked: ${ctx.missing.join(', ')}`,
    context: {
      required: ctx.required,
      invoked: ctx.invoked,
      missing: ctx.missing,
      ...(ctx.bypassed !== undefined ? { bypassed: ctx.bypassed } : {}),
      ...(ctx.unenforceable !== undefined ? { unenforceable: ctx.unenforceable } : {}),
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

- [ ] **Step 2: settle.ts — add the flag AND extend the `opts` type.** Two edits in `settle.ts`:

  (2a) After the `--allow-security-audit-failure` `.option(...)` (~line 97-100) add:

```ts
    .option(
      '--allow-skill-audit-miss',
      'do not refuse when required skills were not invoked; emit a warn anomaly (bypassed:true) and settle anyway',
    )
```

  (2b) **Required for typecheck:** the action handler's `opts` parameter is an *explicitly-typed inline object literal* (~lines 102-114) enumerating every flag (`allowCodeReviewFailure?`, `allowSecurityAuditFailure?`, `allowStaleDraft?`, …). Add a member to that type literal alongside the siblings:

```ts
      allowSkillAuditMiss?: boolean;
```

(Commander camelCases `--allow-skill-audit-miss` → `opts.allowSkillAuditMiss`, consistent with `--allow-code-review-failure` → `opts.allowCodeReviewFailure`. Without 2b, `opts.allowSkillAuditMiss` is a `Property does not exist` TS error that fails the Task-6 gate.)

- [ ] **Step 3: settle.ts — imports.** Add near the other notify imports (~line 27-31):

```ts
import { emitSkillAuditMiss } from '../../notify/skill-audit.js';
import { missingSkills } from '../../verify/skill-match.js';
```

- [ ] **Step 4: settle.ts — the check.** Locate the SUMMARY object literal that contains `skillAudit: state.skillAudit,` (~line 631). **Immediately before** that object is assembled (and after the existing code-review / security-audit refusals), insert the resolve+check. `cadenceConfig` and `draft` and `state` and `gateSet` are already in scope here; `selectNotifier` is imported. `--allow-skill-audit-miss` is read from the command opts object the same way sibling `--allow-*` flags are (match the existing access pattern, e.g. `opts.allowSkillAuditMiss`):

```ts
        // Required-skill enforcement (Phase 34.1 — ROADMAP 23.4). NOT a
        // gates/engine.ts matrix cell: declaring skills IS the opt-in.
        // `cadenceConfig` is `… | null` (null when loadConfig failed) — every
        // deref is optional-chained, mirroring the existing `cadenceConfig?.`
        // call sites in this file. Deliberate null-config behavior: still
        // compute+record the effective required (so SUMMARY stays truthful),
        // but SKIP enforcement when config didn't load (cannot read telemetry
        // reliably; never false-refuse on a degraded-config path — same
        // never-false-refuse principle as the telemetry-off case).
        {
          const effectiveRequired = [
            ...new Set([
              ...(cadenceConfig?.skillAudit?.required ?? []),
              ...(draft.requiredSkills ?? []),
            ]),
          ];
          if (effectiveRequired.length > 0 && cadenceConfig) {
            const invoked = state.skillAudit.invoked;
            if (!cadenceConfig.telemetry.skillInvocations) {
              // Unverifiable — invoked is never populated. Warn, never refuse.
              await emitSkillAuditMiss(selectNotifier(cadenceConfig), {
                required: effectiveRequired,
                invoked,
                missing: effectiveRequired,
                severity: 'warn',
                unenforceable: true,
              });
            } else {
              const missing = missingSkills(effectiveRequired, invoked);
              if (missing.length > 0) {
                const bypass = opts.allowSkillAuditMiss === true;
                await emitSkillAuditMiss(selectNotifier(cadenceConfig), {
                  required: effectiveRequired,
                  invoked,
                  missing,
                  severity: bypass ? 'warn' : 'error',
                  ...(bypass ? { bypassed: true } : {}),
                });
                if (!bypass) {
                  process.stderr.write(
                    `settle run refused: required skill(s) not invoked: ${missing.join(', ')}. ` +
                      `Invoke them, or pass --allow-skill-audit-miss to override.\n`,
                  );
                  process.exitCode = 1;
                  return;
                }
                process.stderr.write(
                  `skill-audit: --allow-skill-audit-miss set; proceeding past ${missing.length} missing skill(s).\n`,
                );
              }
            }
          }
          // Make Summary.skillAudit.required truthful (was always []) —
          // recorded even on the null-config skip path.
          state.skillAudit.required = effectiveRequired;
        }
```

(If the exact opts accessor differs — e.g. commander camelCases `--allow-skill-audit-miss` to `allowSkillAuditMiss` — match how `--allow-code-review-failure` is read in the same file; do not invent a new pattern.)

- [ ] **Step 5: Write integration tests** — `packages/core/tests/cli/settle-skill-audit.test.ts`, spawned-CLI idiom (`tempRepo`, built CLI, file notify transport with **absolute** `notify.file` per the known fixture gotcha). Six lettered paths, each referencing its AC token:

  - (a) AC-3/AC-4: effective-empty (no `requiredSkills`, no config) → settle proceeds, no `skill-audit-miss` in the log.
  - (b) AC-3: `requiredSkills` satisfied (seed `state.skillAudit.invoked` incl. a namespace-qualified entry) → proceeds, no miss.
  - (c) AC-3: shortfall → settle exit 1, `skill-audit-miss` severity `error`, `context.missing` correct.
  - (d) AC-3: shortfall + `--allow-skill-audit-miss` → exit 0, anomaly severity `warn`, `context.bypassed===true`.
  - (e) AC-4: shortfall + `config.telemetry.skillInvocations:false` → exit 0, anomaly `warn`, `context.unenforceable===true` (no false-refuse).
  - (f) AC-1: config baseline ∪ DRAFT `requiredSkills` → `SUMMARY.skillAudit.required` equals the deduped union (assert the written SUMMARY JSON).
  - One extra lock (per spec): a `strict`-profile fixture on path (c) still emits `skill-audit-miss` (proves the unconditional/no-`anomaly-notify`-gate divergence).

  Seed `state.skillAudit.invoked` by writing `state.json` in the fixture before settle (mirror how other settle tests seed state). Set `config.skillAudit.required` / DRAFT `requiredSkills:` in the fixture as each path needs.

- [ ] **Step 6:** Run isolated → PASS. `pnpm -C packages/core test -- run cli/settle-skill-audit verify/skill-match parse/draft-parser-required-skills`

- [ ] **Step 7: Checkpoint** — `git add packages/core/src/notify/skill-audit.ts packages/core/src/cli/commands/settle.ts packages/core/tests/cli/settle-skill-audit.test.ts` ; `build task T4 --status=DONE --notes "emitSkillAuditMiss (unconditional) + settle resolve/check/flag/state-write; 6-path+strict integration green"`

---

## Task 5: docs + ROADMAP (close 23.4 + v1.2 backlog)

**Files:** `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`

- [ ] **Step 1: DESIGN.md §10 — add item 35.** After the line `34. ~~Phase 33.1 (ROADMAP "Phase 30.1") — publish pipeline reversible proof: …~~ ✓` and before the blank line preceding `Sequencing rationale:`, insert:

```
35. ~~Phase 34.1 (closes ROADMAP open-question 23.4) — required-skill enforcement: `DraftZ.requiredSkills` ∪ `config.skillAudit.required` → effective set written to `state.skillAudit.required`; settle-time check (declaration = opt-in, NOT a gate-matrix cell), inert when empty, skip+warn when telemetry off, else refuse + unconditional `skill-audit-miss` anomaly unless `--allow-skill-audit-miss`~~ ✓
```

- [ ] **Step 2: DESIGN.md §4.1 note.** Locate the §4.1 gate-universe section (grep `## 4.1` / "4.1"). Add a one-line note that `skill-audit` enforcement ships as a **settle-time, declaration-opt-in check (not a profile×tier matrix cell)** with an unconditional `skill-audit-miss` anomaly — distinct from the `anomaly-notify`-gated anomalies. Keep it one sentence; do not restructure §4.1.

- [ ] **Step 3: CHANGELOG.md** — in `## [Unreleased] → ### Added`, after the Phase 33.1 publish-pipeline bullet and before the blank line preceding `### Fixed`, append:

```
- Required-skill enforcement gate: a phase declares `requiredSkills:` in DRAFT frontmatter and/or `config.skillAudit.required`; the union is written to `state.skillAudit.required` (making `SUMMARY.skillAudit.required` truthful — previously always `[]`). `cadence settle run` refuses when a required skill was not invoked (per `state.skillAudit.invoked`, matched exactly or by namespace suffix), emitting a new `skill-audit-miss` anomaly; `--allow-skill-audit-miss` downgrades to a warn (`bypassed:true`) and settles. Inert when nothing is declared (declaration is the opt-in — not a gate-matrix cell); skips with a warn (never false-refuses) when `telemetry.skillInvocations` is off. `AnomalyTypeZ` gains `skill-audit-miss` (additive schema bump). Closes ROADMAP open-question 23.4. (Phase 34.1.)
```

- [ ] **Step 4: `.cadence/ROADMAP.md` — close 23.4 at all three sites.**
  (i) The Open-questions entry — replace the exact line
  `- **23.4** — \`state.skillAudit.required[]\` semantics: who populates it? Config? Per-phase frontmatter? Defer to a follow-up phase if the answer isn't obvious at 23.4-DRAFT time.`
  with
  `- **23.4** — ✓ **RESOLVED (Phase 34.1):** \`required[]\` = DRAFT frontmatter \`requiredSkills\` ∪ \`config.skillAudit.required\`, enforced at \`settle run\` (declaration = opt-in; unconditional \`skill-audit-miss\` anomaly; \`--allow-skill-audit-miss\` bypass). 23.4's AC-2 SessionStop-anomaly idea superseded by the settle-time check.`
  (ii) The Deferred-to-v1.2+ "**Deferred open questions.**" bullet — find it (it enumerates `23.1, 23.4, 24.3, 26.2`) and remove `23.4` from the list (→ `23.1, 24.3, 26.2`), appending `(23.4 resolved — Phase 34.1)`.
  (iii) The incidental v1.1-status prose mention containing `(23.1 / 23.4 / 24.3 / 26.2)` — append ` (23.4 resolved — see v1.2 feature-expansion)` after that parenthetical (cosmetic, zero stale refs).

- [ ] **Step 5: `.cadence/ROADMAP.md` — add the v1.2 feature-expansion section.** After the existing `## v1.2.0 — Public release (deferred, named)` section (and its `---`), add a sibling:

```
## v1.2.0 — Feature expansion (superpowers-inspired)

Source: `docs/superpowers/2026-05-16-cadence-expansion-survey.md` (full weighing). CADENCE ships DRAFT→BUILD→SETTLE; the survey closes the gap toward the full idea→shipped arc.

- **#6 Required-skill enforcement** — ✓ delivered Phase 34.1 (closes open-question 23.4).
- **#2 Review-convergence loop primitive** — bounded `review→fix→re-review→escalate`, v1 wrapping the existing `plan-review` gate. *Next.* The core superpowers value cadence lacks (iteration vs one-shot).
- **#1 brainstorm→spec stage** — pre-DRAFT `cadence spec`; sequence AFTER #2 so spec-review reuses convergence. Heaviest; highest end-value.
- **#4 Auto-remediation on gate fail** — second attach-point of #2's engine; small once #2 exists.
- **#3 `cadence build --subagent` / #5 `cadence research` stage — PARKED.** Both invert the host-agnostic-engine anchor (cadence is driven *by* an agent; it is not an agent/research orchestrator). Revisit ONLY if that anchor is reconsidered.

Sequence: #6 ✓ → #2 → #1 → #4 ; #3/#5 parked.
```

- [ ] **Step 6:** `git diff --stat -- DESIGN.md CHANGELOG.md .cadence/ROADMAP.md` — confirm only those 3 files, hunks as intended; eyeball `git diff .cadence/ROADMAP.md` to confirm all three 23.4 sites changed + the new section added.

- [ ] **Step 7: Checkpoint** — `git add DESIGN.md CHANGELOG.md .cadence/ROADMAP.md` ; `build task T5 --status=DONE --notes "DESIGN §10 item35 + §4.1 note; CHANGELOG Added; ROADMAP 23.4 closed (3 sites) + v1.2 feature-expansion section"`

---

## Task 6: full gate + two-commit settle

**Files:** none new — consolidates T1–T5.

- [ ] **Step 1: Confirm staging.** `git diff --cached --name-only` = exactly: 3 types src + types tests, `skill-match.ts`+test, `draft-parser.ts`+test, `notify/skill-audit.ts`, `settle.ts`, `settle-skill-audit.test.ts`, DESIGN/CHANGELOG/ROADMAP. **Nothing under `.cadence/phases/`, STATE, state.json** staged; `graphify-out/` untracked (pre-existing, leave).

- [ ] **Step 2: Rebuild deps + FULL gate** (Phase 32.2 lesson — the whole pre-push hook):

Run: `pnpm install && pnpm -C packages/types build && pnpm -C packages/testkit build && pnpm -C packages/core build && pnpm turbo run lint typecheck test build`
(Re-verify package.json metadata unaffected; this phase touches none. If `pnpm install` perturbs anything, re-stage.)
Expected: 16/16 tasks green. The new `packages/**` tests satisfy `test-coverage`; do **not** use `--allow-missing-coverage`.

- [ ] **Step 3: Substantive commit:**

```bash
git commit -m "$(cat <<'EOF'
feat(core+types): required-skill enforcement gate (Phase 34.1, closes ROADMAP 23.4)

DraftZ.requiredSkills ∪ config.skillAudit.required → effective set written to
state.skillAudit.required (SUMMARY.skillAudit.required now truthful). settle
run refuses on shortfall (skill-audit-miss anomaly, severity error) unless
--allow-skill-audit-miss (→ warn, bypassed:true). Inert when nothing declared
(declaration = opt-in, NOT a gates/engine.ts matrix cell); skip+warn when
telemetry.skillInvocations off (no false-refuse). Anomaly emission is
unconditional/profile-independent — deliberate divergence from the
anomaly-notify-gated code-review-high/loop-violation precedent (strict cells
lack that gate and must still leave an audit trail). AnomalyTypeZ additive
bump. Full gate (lint+typecheck+test+build) green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Settle:**

Run: `node packages/core/bin/cadence.cjs settle run --auto`
(NO `--allow-missing-coverage` — this phase adds tests; coverage gate must pass on its own. `--allow-stale-draft` only if the DRAFT was edited post-approve. The `34-01` DRAFT declares no `requiredSkills`, so the new check is inert for this very settle.)
Expected: `Settled 34-01`; loop IDLE.

- [ ] **Step 5: Settle commit:**

```bash
git add .cadence/phases/34-required-skills/ .cadence/STATE.md .cadence/state.json
git commit -m "chore: settle Phase 34.1 — required-skill enforcement gate"
```

- [ ] **Step 6: Verify + surface push (USER-GATED — stop and ask).** `git log --oneline -4` (feat+settle pair, authored by the pseudonym), `node packages/core/bin/cadence.cjs progress` (IDLE), `git rev-list --count origin/main..HEAD`. Report green + commits-ahead; do **not** push without explicit user confirmation.

---

## Done criteria

- `DraftZ.requiredSkills?` + `config.skillAudit.required` (default `[]`, back-compat) + `AnomalyTypeZ += skill-audit-miss`.
- Pure `satisfies`/`missingSkills` (exact OR `:`-suffix, case-sensitive) unit-tested.
- `settle run`: effective = dedup(config ∪ draft) written to `state.skillAudit.required`; inert when empty; telemetry-off ⇒ warn+proceed; shortfall ⇒ `skill-audit-miss` error + exit 1 unless `--allow-skill-audit-miss` (⇒ warn+`bypassed:true`+proceed). Emission unconditional/profile-independent (strict-profile lock test passes).
- 6 integration paths a–f + the strict-profile emission lock green; `SUMMARY.skillAudit.required` truthful.
- DESIGN §10 item 35 + §4.1 note; CHANGELOG Added; ROADMAP 23.4 closed at all 3 sites + v1.2 feature-expansion section (#6 ✓ → #2 → #1 → #4; #3/#5 parked).
- Full `pnpm turbo run lint typecheck test build` green; settled two-commit; no `--allow-missing-coverage`. Push user-gated.

## Acceptance Criteria (for the cadence DRAFT — DO NOT add `requiredSkills` frontmatter to 34-01)

- **AC-1:** `DraftZ.requiredSkills?` parsed from frontmatter (comma/bracket/quote tolerant, absent→undefined); `config.skillAudit.required` schema+default `[]`; effective = `unique(config ∪ draft)` written to `state.skillAudit.required` so `Summary.skillAudit.required` is truthful.
- **AC-2:** pure `satisfies` = exact OR `endsWith(':'+req)`, case-sensitive, no loose-substring; `missingSkills` returns only unsatisfied; unit-tested.
- **AC-3:** `settle run` refuses (exit 1) + emits `skill-audit-miss` (severity error, context {required,invoked,missing}) on shortfall; `--allow-skill-audit-miss` ⇒ warn + `bypassed:true` + proceeds.
- **AC-4:** effective-empty ⇒ inert pass (no anomaly, no behavior change); `telemetry.skillInvocations:false` + non-empty required ⇒ warn anomaly `unenforceable:true` + exit 0 (no false-refuse).
- **AC-5:** `AnomalyTypeZ` gains `skill-audit-miss`; additive/back-compat for old config/draft/state; no `gates/engine.ts` matrix change; `skill-audit-miss` emission is unconditional (NOT `anomaly-notify`-gated) — verified by a strict-profile fixture.
- **AC-6:** DESIGN (§10 item 35 + §4.1 note), CHANGELOG (Added incl. AnomalyType bump), ROADMAP (23.4 closed at 3 sites + sequenced v1.2 feature-expansion #2→#1→#4, #3/#5 parked) updated.
