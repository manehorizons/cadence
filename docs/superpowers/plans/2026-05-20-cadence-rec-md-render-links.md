# CADENCE `RECOMMENDATIONS.md` Render — Assumption + Decision Link Surfacing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Slice-11's now-populated `Recommendation.assumptionIds[]` / `decisionIds[]` arrays in `RECOMMENDATIONS.md` via two conditional inline bullets per rec entry. First observable consumer of Slice-11 backfill. Closes Slice-11 § Follow-On render-extension entry.

**Architecture:** Pure additive render-layer change. Two `if (arr.length > 0) lines.push(...)` calls slotted between existing `files` and `evidence` bullets. Mirrors `affectedAreas`/`affectedFiles` conditional-bullet precedent. Zero `@cadence/types` change. Zero new CLI surface. Zero call-site change at `renderRecommendationsMd` (signature preserved).

**Tech Stack:** TypeScript, vitest; pnpm + turbo.

**Spec:** [`docs/superpowers/specs/2026-05-20-cadence-rec-md-render-links-design.md`](../specs/2026-05-20-cadence-rec-md-render-links-design.md)

**Branch:** `praxis-intelligence-ledger` (long-lived Praxis workstream; PR #9 stays draft).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/intelligence/render.ts` | Modify | Add two conditional bullets (`- assumptions:`, `- decisions:`) between `files` and `evidence` slots. |
| `packages/core/tests/intelligence/render-recommendations.test.ts` | Create | Pure-function vitest. AC-1..AC-5: empty arrays omit / populated arrays render / order preserved / both-populated slot order / both-empty bytes-equal. |
| `packages/core/tests/intelligence/store.test.ts` | Modify | Extend existing addAssumption-after-addRecommendation block (or add adjacent it-block) with a `- assumptions: <id>` matcher post-Slice-11-backfill (AC-6). |
| `CHANGELOG.md` | Modify | + Unreleased entry under Praxis stream. |
| `docs/superpowers/specs/2026-05-20-cadence-rec-link-backfill-design.md` | Modify | Reconcile § Follow-On render-extension entry (strike + annotate "SHIPPED Slice 12"). |

**Slice-11 reference patterns (mirror verbatim):**

- `addAssumption` writes asLedger then derives + writes recLedger (`packages/core/src/intelligence/store.ts` Slice-11 chain).
- `deriveRecommendationLinks` preserves ledger-insertion order (`store.ts` Slice-11).
- Conditional-bullet precedent: `if (rec.affectedAreas.length > 0) lines.push(...)` at `render.ts:31`.

---

## Per-task done-bar (apply to EVERY task before committing)

Slice-7/8/9/10/11 carried gotcha: per-task subset checks miss `lint` regressions. Full turbo gate is the done-bar.

```bash
pnpm turbo run lint typecheck test build
```

Expect 16/16 successful. Do NOT commit if red.

---

## Task 1: Extend `renderRecommendationsMd` with link bullets

**Files:**
- Modify: `packages/core/src/intelligence/render.ts`

- [ ] **Step 1: Add two conditional bullets**

In `render.ts`, between the existing `affectedFiles` bullet and the `evidence` loop (currently `render.ts:32-33`):

```ts
if (rec.assumptionIds.length > 0) lines.push(`- assumptions: ${rec.assumptionIds.join(', ')}`);
if (rec.decisionIds.length > 0) lines.push(`- decisions: ${rec.decisionIds.join(', ')}`);
```

- [ ] **Step 2: Full turbo gate**

Expect existing `store.test.ts:160-167` smoke test to still pass — new bullets slot between unrelated matchers.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(core): renderRecommendationsMd surfaces assumption + decision links (Slice 12)"
```

---

## Task 2: Pure-function tests

**Files:**
- Create: `packages/core/tests/intelligence/render-recommendations.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, expect, it } from 'vitest';
import type {
  EvidenceLedger,
  Recommendation,
  RecommendationLedger,
} from '@cadence/types';
import { renderRecommendationsMd } from '../../src/intelligence/render.js';

const emptyEv: EvidenceLedger = { schemaVersion: 1, evidence: [] };

function mkRec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    title: 't',
    summary: 's',
    source: 'manual',
    status: 'candidate',
    readiness: 'raw-idea',
    priority: 'medium',
    leverageScore: 5,
    riskScore: 5,
    confidence: 0.5,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function mkLedger(recs: Recommendation[]): RecommendationLedger {
  return { schemaVersion: 1, recommendations: recs };
}

describe('renderRecommendationsMd link bullets (Slice 12)', () => {
  it('AC-1: assumptionIds populated, decisionIds empty → only assumptions bullet', () => {
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ assumptionIds: ['as-1', 'as-2'] })]),
      emptyEv,
    );
    expect(md).toMatch(/- assumptions: as-1, as-2/);
    expect(md).not.toMatch(/- decisions:/);
  });

  it('AC-2: decisionIds populated, assumptionIds empty → only decisions bullet', () => {
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ decisionIds: ['dec-1', 'dec-2'] })]),
      emptyEv,
    );
    expect(md).toMatch(/- decisions: dec-1, dec-2/);
    expect(md).not.toMatch(/- assumptions:/);
  });

  it('AC-3: both populated → assumptions bullet appears before decisions bullet', () => {
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ assumptionIds: ['as-1'], decisionIds: ['dec-1'] })]),
      emptyEv,
    );
    const aIdx = md.indexOf('- assumptions: as-1');
    const dIdx = md.indexOf('- decisions: dec-1');
    expect(aIdx).toBeGreaterThan(-1);
    expect(dIdx).toBeGreaterThan(aIdx);
  });

  it('AC-4: both empty → neither bullet emitted', () => {
    const md = renderRecommendationsMd(mkLedger([mkRec()]), emptyEv);
    expect(md).not.toMatch(/- assumptions:/);
    expect(md).not.toMatch(/- decisions:/);
  });

  it('AC-5: insertion order within each bullet preserved (no sort)', () => {
    const md = renderRecommendationsMd(
      mkLedger([
        mkRec({
          assumptionIds: ['as-9', 'as-1', 'as-5'],
          decisionIds: ['dec-3', 'dec-1'],
        }),
      ]),
      emptyEv,
    );
    expect(md).toMatch(/- assumptions: as-9, as-1, as-5/);
    expect(md).toMatch(/- decisions: dec-3, dec-1/);
  });

  it('slot order: areas → files → assumptions → decisions → evidence', () => {
    const md = renderRecommendationsMd(
      mkLedger([
        mkRec({
          affectedAreas: ['core'],
          affectedFiles: ['src/foo.ts'],
          assumptionIds: ['as-1'],
          decisionIds: ['dec-1'],
          evidenceIds: ['ev-1'],
        }),
      ]),
      { schemaVersion: 1, evidence: [{ id: 'ev-1', recommendationId: 'rec-1', kind: 'note', summary: 'E', createdAt: '2026-05-20T00:00:00.000Z' }] },
    );
    const areasIdx = md.indexOf('- areas:');
    const filesIdx = md.indexOf('- files:');
    const aIdx = md.indexOf('- assumptions:');
    const dIdx = md.indexOf('- decisions:');
    const evIdx = md.indexOf('- evidence:');
    expect(areasIdx).toBeLessThan(filesIdx);
    expect(filesIdx).toBeLessThan(aIdx);
    expect(aIdx).toBeLessThan(dIdx);
    expect(dIdx).toBeLessThan(evIdx);
  });

  it('empty ledger path unchanged (no recommendations)', () => {
    const md = renderRecommendationsMd(mkLedger([]), emptyEv);
    expect(md).toMatch(/^# CADENCE Recommendations/);
    expect(md).toMatch(/No recommendations recorded\./);
  });
});
```

- [ ] **Step 2: Full turbo gate**

- [ ] **Step 3: Commit**

This task's source change is the test file itself; bundle in the next commit-bearing task. Skip standalone commit.

> **Actually** — since Task 1 already shipped the impl, this task's test file is a standalone test-add commit:
>
> ```bash
> git commit -m "test(core): renderRecommendationsMd link bullets pure-function coverage (Slice 12)"
> ```

---

## Task 3: Integration test — Slice-11 plumbing through to MD (AC-6)

**Files:**
- Modify: `packages/core/tests/intelligence/store.test.ts`

- [ ] **Step 1: Extend the existing addAssumption integration block**

Find the Slice-11 addAssumption-after-addRecommendation block in `store.test.ts`. Add a matcher (or a new sibling it-block) asserting the rendered `RECOMMENDATIONS.md` contains `- assumptions: <id>`:

```ts
it('Slice 12 AC-6: addAssumption populates rec MD link bullet', async () => {
  active = await tempRepo({ initialized: true, projectName: 'slice12' });
  const rec = await addRecommendation(active.root, {
    title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
  const md = await readFile(
    join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
    'utf8',
  );
  expect(md).toMatch(new RegExp(`## ${rec.id}[\\s\\S]*?- assumptions: ${a.id}`));
});
```

Repeat symmetric block for `addIntelligenceDecision` + `- decisions: <id>`.

- [ ] **Step 2: Full turbo gate**

- [ ] **Step 3: Commit**

```bash
git commit -m "test(core): integration — addAssumption populates rec MD link bullet (Slice 12 AC-6)"
```

---

## Task 4: Docs reconcile + CHANGELOG

**Files:**
- Modify: `docs/superpowers/specs/2026-05-20-cadence-rec-link-backfill-design.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Reconcile Slice-11 § Follow-On render-extension entry**

In `2026-05-20-cadence-rec-link-backfill-design.md` § Follow-On (line 246):

- Replace the `RECOMMENDATIONS.md render extension` bullet with: `~~**`RECOMMENDATIONS.md` render extension** to display `assumptionIds[].length` / `decisionIds[].length` counts (or inline list) on each rec.~~ **SHIPPED Slice 12** — see [rec-md-render-links design](2026-05-20-cadence-rec-md-render-links-design.md). Inline-ids form chosen over counts.`

Also reconcile § Decision Log #5 ("No `RECOMMENDATIONS.md` render extension. ... future consumer slice") with a "Now shipped Slice 12" annotation.

- [ ] **Step 2: CHANGELOG**

Add at top of existing `## [Unreleased]` Praxis stream:

```
- **Praxis Slice 12** — `RECOMMENDATIONS.md` now surfaces backfilled assumption + decision links inline per rec entry. Two new conditional bullets `- assumptions: as-1, as-2` and `- decisions: dec-1, dec-2`, slotted between `files` and `evidence`. Mirrors `affectedAreas`/`affectedFiles` precedent. Closes Slice-11 § Follow-On render-extension. First observable consumer of Slice-11 backfill plumbing.
```

- [ ] **Step 3: Full turbo gate**

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: document rec MD link surfacing + reconcile Slice-11 follow-ref (Slice 12)"
```

---

## Task 5: Final review pass + push

- [ ] **Step 1: Verify slice landed**

```bash
git log --oneline origin/praxis-intelligence-ledger..HEAD
```

Expect 5 commits (design + plan + impl + test + integration + docs/CHANGELOG). Order doesn't matter — content does.

- [ ] **Step 2: Pre-push gate**

```bash
pnpm turbo run lint typecheck test build
```

Must be 16/16 green LOCALLY before push.

- [ ] **Step 3: Push**

```bash
git push
```

Pre-push hook re-runs gate. PR #9 stays draft.

---

## Definition of Done

- [ ] All 8 ACs in `2026-05-20-cadence-rec-md-render-links-design.md` pass.
- [ ] Full `pnpm turbo run lint typecheck test build` green at every task's done-bar.
- [ ] Slice-11 § Follow-On render-extension entry reconciled.
- [ ] CHANGELOG entry added.
- [ ] `cli-reference.test.ts` (Phase-31.1 drift guard) passes UNCHANGED.
- [ ] No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
- [ ] Branch pushed to `origin/praxis-intelligence-ledger`. PR #9 stays draft.
- [ ] `renderRecommendationsMd` now has dedicated pure-function tests (closes the Slice-1-era smoke-test-only coverage gap).
