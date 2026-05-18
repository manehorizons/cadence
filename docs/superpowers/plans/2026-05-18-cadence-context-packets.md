# CADENCE Context Packets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cadence context <scope>` (scopes `phase` + `handoff`) that emits a bounded, read-only "context packet" (JSON + Markdown) from the intelligence ledgers and CADENCE backend state.

**Architecture:** Mirror the shipped Slice-3 (`recommend`) architecture exactly — extended `@cadence/types` Zod schemas → two thin store readers → one pure `synthesizeContextPacket` → one pure `renderContextMd` → thin IO glue `runContext` → thin CLI command. Compactness is bounded-by-construction (ranked-only, top-N, open-only assumptions, file references not contents). Strictly read-only: never touches `state.json`/the loop; writes only under `.cadence/intelligence/context/`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Zod, Commander, Vitest, pnpm + Turbo monorepo. Branch `praxis-intelligence-ledger`.

**Spec:** `docs/superpowers/specs/2026-05-17-cadence-context-packets-design.md` (committed `a138714`).

---

## Conventions for every task

- Run all commands from repo root `C:\Users\digit\Documents\Projects\cadence`.
- Test a single core file: `pnpm --filter @cadence/core test -- <relative test path>`.
- Test a single types file: `pnpm --filter @cadence/types test -- tests/intelligence.test.ts`.
- The two new packet types are auto-exported: `packages/types/src/index.ts` does `export * from './intelligence.js'` — **no index edit needed**.
- `Recommendation`, `Evidence`, `Assumption`, `IntelligenceDecision`, `BackendStatus`, `AssumptionLedgerZ`, `IntelligenceDecisionLedgerZ`, `emptyAssumptionLedger`, `emptyIntelligenceDecisionLedger`, `partitionLedger`, `scoreRecommendation` all already exist — do not redefine them.
- Strict TS: never index an array without a guard. Use `const head = arr[0]!` or a length check; `noUncheckedIndexedAccess` will fail the build otherwise.
- Per-task commit messages: `feat(core): …`, `test(core): …`, `docs: …` as appropriate. Commit at the end of each task only when its tests are green.
- This slice ships on `praxis-intelligence-ledger`; **do not push, do not merge to main, PR #9 stays draft.** The CADENCE two-commit settle ceremony is the phase wrap (see "Phase Wrap" at the end) — out of per-task scope.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `packages/types/src/intelligence.ts` | `ContextScopeZ`, `ContextRecZ`, `ContextPacketZ` + inferred types | Modify |
| `packages/types/tests/intelligence.test.ts` | Schema parse tests for the new types | Modify |
| `packages/core/src/intelligence/store.ts` | `readAssumptionLedger`, `readIntelligenceDecisionLedger` | Modify |
| `packages/core/tests/intelligence/store.test.ts` | Reader tests (absent→empty, round-trip) | Modify |
| `packages/core/src/intelligence/context.ts` | Pure `synthesizeContextPacket` + IO glue `runContext` | Create |
| `packages/core/tests/intelligence/context.test.ts` | Synth + glue tests | Create |
| `packages/core/src/intelligence/render-context.ts` | Pure `renderContextMd` | Create |
| `packages/core/tests/intelligence/render-context.test.ts` | Render tests | Create |
| `packages/core/src/cli/commands/context.ts` | `cadence context <scope>` command | Create |
| `packages/core/src/cli/register.ts` | Register the new top-level command | Modify |
| `packages/core/tests/cli/context.test.ts` | Spawned-CLI tests | Create |
| `docs/reference/commands.md` | Marker-block entry + `### context` section (drift guard) | Modify |
| `CHANGELOG.md` | Unreleased entry | Modify |

---

## Task 1: Types — `ContextScopeZ` + `ContextPacketZ`

**Files:**
- Modify: `packages/types/src/intelligence.ts` (append near the other intelligence schemas, after `MilestoneLedgerZ`/before `RepoScanZ` is fine — anywhere in the file)
- Test: `packages/types/tests/intelligence.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/types/tests/intelligence.test.ts` (add `ContextPacketZ` to the import from `../src/intelligence.js`):

```typescript
describe('ContextPacketZ', () => {
  const valid = {
    schemaVersion: 1 as const,
    scope: 'phase' as const,
    generatedAt: '2026-05-18T00:00:00.000Z',
    loop: { present: false },
    recommendations: [
      {
        id: 'rec-1',
        title: 'do the thing',
        score: 83,
        status: 'accepted' as const,
        readiness: 'ready-for-milestone' as const,
        priority: 'high' as const,
        suggestedBackendAction: 'cadence milestone propose',
      },
    ],
    assumptions: [
      { id: 'as-1', recommendationId: 'rec-1', text: 'x holds', status: 'open' as const },
    ],
    decisions: [
      { id: 'dec-1', title: 'use approach A', rationale: 'cheapest', recommendationId: 'rec-1' },
    ],
    files: [{ path: 'src/a.ts', why: 'affected by rec-1 do the thing' }],
    totals: {
      recommendations: 1,
      assumptions: 1,
      decisions: 1,
      files: 1,
      recommendationsOmitted: 0,
    },
  };

  it('accepts a valid packet and both scopes', () => {
    expect(ContextPacketZ.parse(valid).scope).toBe('phase');
    expect(ContextPacketZ.parse({ ...valid, scope: 'handoff' }).scope).toBe('handoff');
  });

  it('rejects an unknown scope', () => {
    expect(() => ContextPacketZ.parse({ ...valid, scope: 'review' })).toThrow();
  });

  it('rejects an assumption whose status is not open', () => {
    expect(() =>
      ContextPacketZ.parse({
        ...valid,
        assumptions: [{ id: 'as-2', recommendationId: 'rec-1', text: 'y', status: 'validated' }],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cadence/types test -- tests/intelligence.test.ts`
Expected: FAIL — `ContextPacketZ` is not exported / not defined.

- [ ] **Step 3: Add the schemas**

Append to `packages/types/src/intelligence.ts` (the existing `z` import, `RecommendationStatusZ`, `RecommendationReadinessZ`, `RecommendationPriorityZ` are already in this file):

```typescript
export const ContextScopeZ = z.enum(['phase', 'handoff']);
export type ContextScope = z.infer<typeof ContextScopeZ>;

export const ContextRecZ = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  score: z.number().int(),
  status: RecommendationStatusZ,
  readiness: RecommendationReadinessZ,
  priority: RecommendationPriorityZ,
  suggestedBackendAction: z.string().optional(),
});
export type ContextRec = z.infer<typeof ContextRecZ>;

export const ContextPacketZ = z.object({
  schemaVersion: z.literal(1),
  scope: ContextScopeZ,
  generatedAt: z.string().datetime({ offset: true }),
  loop: z.object({
    present: z.boolean(),
    loopPosition: z.string().optional(),
    activePhase: z.string().nullable().optional(),
    activeDraft: z.string().nullable().optional(),
    activeSpec: z.string().nullable().optional(),
    tier: z.string().nullable().optional(),
    nextAction: z.string().optional(),
    stateError: z.string().optional(),
  }),
  recommendations: z.array(ContextRecZ),
  assumptions: z.array(
    z.object({
      id: z.string().min(1),
      recommendationId: z.string().min(1),
      text: z.string().min(1),
      status: z.literal('open'),
    }),
  ),
  decisions: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      rationale: z.string().min(1),
      recommendationId: z.string().optional(),
    }),
  ),
  files: z.array(
    z.object({
      path: z.string().min(1),
      why: z.string().min(1),
    }),
  ),
  totals: z.object({
    recommendations: z.number().int(),
    assumptions: z.number().int(),
    decisions: z.number().int(),
    files: z.number().int(),
    recommendationsOmitted: z.number().int(),
  }),
});
export type ContextPacket = z.infer<typeof ContextPacketZ>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cadence/types test -- tests/intelligence.test.ts`
Expected: PASS (all three new cases + existing cases).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/intelligence.ts packages/types/tests/intelligence.test.ts
git commit -m "feat(types): add ContextScope + ContextPacket schemas (Slice 5)"
```

---

## Task 2: Store — two empty-if-absent ledger readers

**Files:**
- Modify: `packages/core/src/intelligence/store.ts`
- Test: `packages/core/tests/intelligence/store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/tests/intelligence/store.test.ts` (add the two new functions to the import from `../../src/intelligence/store.js`):

```typescript
import { writeFile, mkdir } from 'node:fs/promises';

describe('assumption + decision ledger readers', () => {
  it('absent files -> empty ledgers', async () => {
    const fx = await tempRepo({ initialized: true });
    try {
      expect(await readAssumptionLedger(fx.root)).toEqual({
        schemaVersion: 1,
        assumptions: [],
      });
      expect(await readIntelligenceDecisionLedger(fx.root)).toEqual({
        schemaVersion: 1,
        decisions: [],
      });
    } finally {
      await fx.cleanup();
    }
  });

  it('reads + Zod-validates present files', async () => {
    const fx = await tempRepo({ initialized: true });
    try {
      const dir = join(fx.root, '.cadence', 'intelligence');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'assumptions.json'),
        JSON.stringify({
          schemaVersion: 1,
          assumptions: [
            {
              id: 'as-1',
              recommendationId: 'rec-1',
              text: 'db is reachable',
              status: 'open',
              createdAt: '2026-05-18T00:00:00.000Z',
            },
          ],
        }),
      );
      await writeFile(
        join(dir, 'decisions.json'),
        JSON.stringify({
          schemaVersion: 1,
          decisions: [
            {
              id: 'dec-1',
              title: 'use approach A',
              rationale: 'cheapest path',
              decidedAt: '2026-05-18T00:00:00.000Z',
            },
          ],
        }),
      );
      expect((await readAssumptionLedger(fx.root)).assumptions[0]!.id).toBe('as-1');
      expect((await readIntelligenceDecisionLedger(fx.root)).decisions[0]!.title).toBe(
        'use approach A',
      );
    } finally {
      await fx.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cadence/core test -- tests/intelligence/store.test.ts`
Expected: FAIL — `readAssumptionLedger` / `readIntelligenceDecisionLedger` not exported.

- [ ] **Step 3: Implement the readers**

In `packages/core/src/intelligence/store.ts`:

1. Extend the `@cadence/types` import with: `AssumptionLedgerZ`, `IntelligenceDecisionLedgerZ`, `emptyAssumptionLedger`, `emptyIntelligenceDecisionLedger`, `type AssumptionLedger`, `type IntelligenceDecisionLedger`.
2. Add the path constants + readers (mirror the existing `readEvidenceLedger` exactly):

```typescript
const ASSUMPTIONS_JSON = 'assumptions.json';
const DECISIONS_JSON = 'decisions.json';

function assumptionsPath(root: string): string {
  return join(intelligenceDir(root), ASSUMPTIONS_JSON);
}

function decisionsPath(root: string): string {
  return join(intelligenceDir(root), DECISIONS_JSON);
}

export async function readAssumptionLedger(root: string): Promise<AssumptionLedger> {
  const path = assumptionsPath(root);
  if (!existsSync(path)) return emptyAssumptionLedger();
  const raw = await readFile(path, 'utf8');
  return AssumptionLedgerZ.parse(JSON.parse(raw));
}

export async function readIntelligenceDecisionLedger(
  root: string,
): Promise<IntelligenceDecisionLedger> {
  const path = decisionsPath(root);
  if (!existsSync(path)) return emptyIntelligenceDecisionLedger();
  const raw = await readFile(path, 'utf8');
  return IntelligenceDecisionLedgerZ.parse(JSON.parse(raw));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cadence/core test -- tests/intelligence/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/store.ts packages/core/tests/intelligence/store.test.ts
git commit -m "feat(core): add assumption + decision ledger readers (Slice 5)"
```

---

## Task 3: Pure `synthesizeContextPacket`

**Files:**
- Create: `packages/core/src/intelligence/context.ts` (synth only this task; `runContext` added in Task 5)
- Test: `packages/core/tests/intelligence/context.test.ts`

Selection policy (from spec §Scope Selection Policy):
- `partitionLedger(recommendations)` → take **`ranked` only**.
- `scoreRecommendation` each; sort `raw` desc, tie-break `createdAt` asc then `id` asc (identical to `recommend.ts`).
- `N = scope === 'phase' ? TOP_N_PHASE : TOP_N_HANDOFF`; take top `N`; `recommendationsOmitted = max(0, ranked.length - N)`.
- `phase`: assumptions/decisions/files restricted to the selected recs' ids; `handoff`: all open assumptions, all decisions, files union over all ranked recs.
- Assumptions: `status === 'open'` only. Evidence with no `path` contributes nothing to `files`. Dedup files by `path`, first provenance wins, stable first-appearance order.
- Every interpolated free-text string passes through a module-private `oneLine` (Decision Log #9: local, not shared).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/intelligence/context.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type {
  Assumption,
  BackendStatus,
  Evidence,
  IntelligenceDecision,
  Recommendation,
} from '@cadence/types';
import { ContextPacketZ } from '@cadence/types';
import { synthesizeContextPacket } from '../../src/intelligence/context.js';

function mkRec(p: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-x',
    title: 't',
    summary: 's',
    source: 'manual',
    status: 'candidate',
    readiness: 'raw-idea',
    priority: 'low',
    leverageScore: 0,
    riskScore: 0,
    confidence: 0,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
    ...p,
  };
}
const NOW = new Date('2026-05-18T12:00:00.000Z');
const noBackend: BackendStatus = { present: false, kind: null, legalActions: [] };

describe('synthesizeContextPacket', () => {
  it('parses to ContextPacketZ and stamps generatedAt from now', () => {
    const p = synthesizeContextPacket(
      'phase',
      { recommendations: [], evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(() => ContextPacketZ.parse(p)).not.toThrow();
    expect(p.generatedAt).toBe('2026-05-18T12:00:00.000Z');
    expect(p.scope).toBe('phase');
    expect(p.loop.present).toBe(false);
    expect(p.recommendations).toEqual([]);
  });

  it('includes only ranked recs (parked/excluded never leak) and caps at TOP_N', () => {
    const recs: Recommendation[] = [];
    for (let i = 0; i < 9; i++) {
      recs.push(
        mkRec({ id: `rec-${i}`, status: 'candidate', leverageScore: i, createdAt: `2026-05-1${i}T00:00:00.000Z` }),
      );
    }
    recs.push(mkRec({ id: 'rec-rej', status: 'rejected', leverageScore: 99 }));
    recs.push(mkRec({ id: 'rec-def', status: 'deferred', leverageScore: 99 }));
    const phase = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(phase.recommendations).toHaveLength(7); // TOP_N_PHASE
    expect(phase.totals.recommendationsOmitted).toBe(2); // 9 ranked - 7
    expect(phase.recommendations.map((r) => r.id)).not.toContain('rec-rej');
    expect(phase.recommendations.map((r) => r.id)).not.toContain('rec-def');
    // highest leverage first (rec-8 ... )
    expect(phase.recommendations[0]!.id).toBe('rec-8');

    const handoff = synthesizeContextPacket(
      'handoff',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(handoff.recommendations).toHaveLength(5); // TOP_N_HANDOFF
    expect(handoff.totals.recommendationsOmitted).toBe(4);
  });

  it('carries only open assumptions; phase scopes them to selected recs, handoff carries all', () => {
    const recs = [mkRec({ id: 'rec-a', status: 'candidate', leverageScore: 5 })];
    const assumptions: Assumption[] = [
      { id: 'as-1', recommendationId: 'rec-a', text: 'open one', status: 'open', createdAt: NOW.toISOString() },
      { id: 'as-2', recommendationId: 'rec-a', text: 'closed', status: 'validated', createdAt: NOW.toISOString() },
      { id: 'as-3', recommendationId: 'rec-other', text: 'foreign open', status: 'open', createdAt: NOW.toISOString() },
    ];
    const phase = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence: [], assumptions, decisions: [], backend: noBackend },
      NOW,
    );
    expect(phase.assumptions.map((a) => a.id)).toEqual(['as-1']); // open AND tied to rec-a
    const handoff = synthesizeContextPacket(
      'handoff',
      { recommendations: recs, evidence: [], assumptions, decisions: [], backend: noBackend },
      NOW,
    );
    expect(handoff.assumptions.map((a) => a.id).sort()).toEqual(['as-1', 'as-3']); // all open
  });

  it('builds the files union from affectedFiles + evidence path, skips undefined paths, dedups', () => {
    // NOTE: the synth resolves evidence by scanning `sources.evidence` filtered
    // on `recommendationId` — it never reads `rec.evidenceIds` (deliberate per
    // spec §Error Handling). The fixture below carries no evidenceIds on purpose.
    const recs = [
      mkRec({ id: 'rec-a', status: 'candidate', leverageScore: 5, affectedFiles: ['src/a.ts', 'src/a.ts'] }),
    ];
    const evidence: Evidence[] = [
      { id: 'ev-1', recommendationId: 'rec-a', kind: 'file', summary: 's', path: 'src/b.ts', createdAt: NOW.toISOString() },
      { id: 'ev-2', recommendationId: 'rec-a', kind: 'note', summary: 's', createdAt: NOW.toISOString() }, // no path -> skipped
    ];
    const p = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence, assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(p.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']); // deduped, no undefined
  });

  it('phase decisions tie to selected recs; handoff carries all decisions', () => {
    const recs = [mkRec({ id: 'rec-a', status: 'candidate', leverageScore: 5 })];
    const decisions: IntelligenceDecision[] = [
      { id: 'dec-1', recommendationId: 'rec-a', title: 'tied', rationale: 'r', decidedAt: NOW.toISOString() },
      { id: 'dec-2', title: 'untied', rationale: 'r', decidedAt: NOW.toISOString() },
    ];
    const phase = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence: [], assumptions: [], decisions, backend: noBackend },
      NOW,
    );
    expect(phase.decisions.map((d) => d.id)).toEqual(['dec-1']);
    const handoff = synthesizeContextPacket(
      'handoff',
      { recommendations: recs, evidence: [], assumptions: [], decisions, backend: noBackend },
      NOW,
    );
    expect(handoff.decisions.map((d) => d.id).sort()).toEqual(['dec-1', 'dec-2']);
  });

  it('collapses newlines in interpolated free text', () => {
    const recs = [mkRec({ id: 'rec-a', status: 'candidate', leverageScore: 5, title: 'line1\nline2' })];
    const p = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(p.recommendations[0]!.title).toBe('line1 line2');
  });

  it('populates the loop block from a present backend', () => {
    const backend: BackendStatus = {
      present: true,
      kind: 'cadence',
      loopPosition: 'BUILD',
      activePhase: '40-foo',
      activeDraft: '40-01',
      activeSpec: null,
      tier: 'standard',
      legalActions: ['cadence done T1'],
    };
    const p = synthesizeContextPacket(
      'handoff',
      { recommendations: [], evidence: [], assumptions: [], decisions: [], backend },
      NOW,
    );
    expect(p.loop).toMatchObject({
      present: true,
      loopPosition: 'BUILD',
      activePhase: '40-foo',
      activeDraft: '40-01',
      nextAction: 'cadence done T1',
    });
  });

  it('surfaces backend stateError without throwing', () => {
    const backend: BackendStatus = {
      present: true,
      kind: 'cadence',
      legalActions: [],
      stateError: 'corrupt state.json',
    };
    const p = synthesizeContextPacket(
      'phase',
      { recommendations: [], evidence: [], assumptions: [], decisions: [], backend },
      NOW,
    );
    expect(p.loop.present).toBe(true);
    expect(p.loop.stateError).toBe('corrupt state.json');
    expect(p.loop.nextAction).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cadence/core test -- tests/intelligence/context.test.ts`
Expected: FAIL — `context.js` / `synthesizeContextPacket` does not exist.

- [ ] **Step 3: Implement the pure synth**

Create `packages/core/src/intelligence/context.ts`:

```typescript
import type {
  Assumption,
  BackendStatus,
  ContextPacket,
  ContextRec,
  ContextScope,
  Evidence,
  IntelligenceDecision,
  Recommendation,
} from '@cadence/types';
import { ContextPacketZ } from '@cadence/types';
import { partitionLedger, scoreRecommendation } from './recommend.js';

const TOP_N_PHASE = 7;
const TOP_N_HANDOFF = 5;

/** Collapse CR/LF runs to a single space so ledger free text cannot break the
 *  Markdown packet structure. Module-private by design (Decision Log #9): the
 *  Slice-4b oneLine is not exported; mirror the per-module-private convention. */
function oneLine(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

export type ContextSources = {
  recommendations: Recommendation[];
  evidence: Evidence[];
  assumptions: Assumption[];
  decisions: IntelligenceDecision[];
  backend: BackendStatus;
};

export function synthesizeContextPacket(
  scope: ContextScope,
  sources: ContextSources,
  now: Date = new Date(),
): ContextPacket {
  const { ranked } = partitionLedger(sources.recommendations);

  const scored = ranked
    .map((rec) => ({ rec, ...scoreRecommendation(rec) }))
    .sort((a, b) => {
      if (b.raw !== a.raw) return b.raw - a.raw;
      if (a.rec.createdAt !== b.rec.createdAt) {
        return a.rec.createdAt < b.rec.createdAt ? -1 : 1;
      }
      return a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0;
    });

  const n = scope === 'phase' ? TOP_N_PHASE : TOP_N_HANDOFF;
  const selected = scored.slice(0, n);
  const recommendationsOmitted = Math.max(0, scored.length - n);

  const recommendations: ContextRec[] = selected.map((s) => {
    const rec: ContextRec = {
      id: s.rec.id,
      title: oneLine(s.rec.title),
      score: s.score,
      status: s.rec.status,
      readiness: s.rec.readiness,
      priority: s.rec.priority,
    };
    if (s.rec.suggestedBackendAction) {
      rec.suggestedBackendAction = oneLine(s.rec.suggestedBackendAction);
    }
    return rec;
  });

  const selectedIds = new Set(selected.map((s) => s.rec.id));
  const inScope = (recommendationId: string): boolean =>
    scope === 'handoff' || selectedIds.has(recommendationId);

  const assumptions = sources.assumptions
    .filter((a) => a.status === 'open' && inScope(a.recommendationId))
    .map((a) => ({
      id: a.id,
      recommendationId: a.recommendationId,
      text: oneLine(a.text),
      status: 'open' as const,
    }));

  const decisions = sources.decisions
    .filter((d) =>
      scope === 'handoff'
        ? true
        : d.recommendationId !== undefined && selectedIds.has(d.recommendationId),
    )
    .map((d) => {
      const out: ContextPacket['decisions'][number] = {
        id: d.id,
        title: oneLine(d.title),
        rationale: oneLine(d.rationale),
      };
      if (d.recommendationId !== undefined) out.recommendationId = d.recommendationId;
      return out;
    });

  // File union: scope = selected recs (phase) or all ranked recs (handoff).
  const fileRecs = scope === 'handoff' ? scored.map((s) => s.rec) : selected.map((s) => s.rec);
  const fileRecIds = new Set(fileRecs.map((r) => r.id));
  const filesByPath = new Map<string, string>();
  const addFile = (path: string, why: string): void => {
    if (path && !filesByPath.has(path)) filesByPath.set(path, oneLine(why));
  };
  for (const r of fileRecs) {
    for (const f of r.affectedFiles) addFile(f, `affected by ${r.id} ${r.title}`);
  }
  for (const ev of sources.evidence) {
    if (ev.path !== undefined && fileRecIds.has(ev.recommendationId)) {
      addFile(ev.path, `evidence ${ev.id}`);
    }
  }
  const files = [...filesByPath.entries()].map(([path, why]) => ({ path, why }));

  const b = sources.backend;
  const loop: ContextPacket['loop'] = { present: b.present };
  if (b.loopPosition !== undefined) loop.loopPosition = b.loopPosition;
  if (b.activePhase !== undefined) loop.activePhase = b.activePhase;
  if (b.activeDraft !== undefined) loop.activeDraft = b.activeDraft;
  if (b.activeSpec !== undefined) loop.activeSpec = b.activeSpec;
  if (b.tier !== undefined) loop.tier = b.tier;
  const firstAction = b.legalActions[0];
  if (firstAction !== undefined) loop.nextAction = firstAction;
  if (b.stateError !== undefined) loop.stateError = b.stateError;

  return ContextPacketZ.parse({
    schemaVersion: 1,
    scope,
    generatedAt: now.toISOString(),
    loop,
    recommendations,
    assumptions,
    decisions,
    files,
    totals: {
      recommendations: recommendations.length,
      assumptions: assumptions.length,
      decisions: decisions.length,
      files: files.length,
      recommendationsOmitted,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cadence/core test -- tests/intelligence/context.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/context.ts packages/core/tests/intelligence/context.test.ts
git commit -m "feat(core): add pure synthesizeContextPacket (Slice 5)"
```

---

## Task 4: Pure `renderContextMd`

**Files:**
- Create: `packages/core/src/intelligence/render-context.ts`
- Test: `packages/core/tests/intelligence/render-context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/intelligence/render-context.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { ContextPacket } from '@cadence/types';
import { renderContextMd } from '../../src/intelligence/render-context.js';

const full: ContextPacket = {
  schemaVersion: 1,
  scope: 'phase',
  generatedAt: '2026-05-18T00:00:00.000Z',
  loop: { present: true, loopPosition: 'BUILD', activePhase: '40-foo', nextAction: 'cadence done T1' },
  recommendations: [
    { id: 'rec-a', title: 'ship it', score: 83, status: 'accepted', readiness: 'ready-for-milestone', priority: 'high', suggestedBackendAction: 'cadence milestone propose' },
  ],
  assumptions: [{ id: 'as-1', recommendationId: 'rec-a', text: 'db reachable', status: 'open' }],
  decisions: [{ id: 'dec-1', title: 'approach A', rationale: 'cheapest', recommendationId: 'rec-a' }],
  files: [{ path: 'src/a.ts', why: 'affected by rec-a ship it' }],
  totals: { recommendations: 1, assumptions: 1, decisions: 1, files: 1, recommendationsOmitted: 2 },
};

const empty: ContextPacket = {
  schemaVersion: 1,
  scope: 'handoff',
  generatedAt: '2026-05-18T00:00:00.000Z',
  loop: { present: false },
  recommendations: [],
  assumptions: [],
  decisions: [],
  files: [],
  totals: { recommendations: 0, assumptions: 0, decisions: 0, files: 0, recommendationsOmitted: 0 },
};

describe('renderContextMd', () => {
  it('renders all sections with scope label and content', () => {
    const md = renderContextMd(full);
    expect(md).toMatch(/# CADENCE Context Packet — phase/);
    expect(md).toContain('cadence done T1');
    expect(md).toContain('rec-a');
    expect(md).toContain('ship it');
    expect(md).toContain('db reachable');
    expect(md).toContain('approach A');
    expect(md).toContain('src/a.ts');
    expect(md).toContain('2 omitted');
  });

  it('uses _(none)_ placeholders when sections are empty and notes no backend', () => {
    const md = renderContextMd(empty);
    expect(md).toMatch(/# CADENCE Context Packet — handoff/);
    expect((md.match(/_\(none\)_/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(md).toMatch(/no CADENCE backend/i);
  });

  it('emits no blank-line-breaking artifacts and ends with a newline', () => {
    expect(renderContextMd(full).endsWith('\n')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cadence/core test -- tests/intelligence/render-context.test.ts`
Expected: FAIL — `render-context.js` does not exist.

- [ ] **Step 3: Implement the renderer** (mirror `render-recommend.ts` idiom — `string[]` + `join('\n')`, trailing newline)

Create `packages/core/src/intelligence/render-context.ts`:

```typescript
import type { ContextPacket } from '@cadence/types';

export function renderContextMd(packet: ContextPacket): string {
  const lines: string[] = [
    `# CADENCE Context Packet — ${packet.scope}`,
    '',
    `> Generated from \`.cadence/intelligence/context/${packet.scope}.json\` (read-only).`,
    '',
    `Generated at: ${packet.generatedAt}`,
    '',
    '## Loop',
    '',
  ];

  if (!packet.loop.present) {
    lines.push('- no CADENCE backend detected (ledger-only packet)');
  } else {
    lines.push(`- position: ${packet.loop.loopPosition ?? '—'}`);
    lines.push(
      `- active: phase ${packet.loop.activePhase ?? '—'} · draft ${packet.loop.activeDraft ?? '—'} · spec ${packet.loop.activeSpec ?? '—'} · tier ${packet.loop.tier ?? '—'}`,
    );
    if (packet.loop.nextAction) lines.push(`- next action: ${packet.loop.nextAction}`);
    if (packet.loop.stateError) lines.push(`- state error: ${packet.loop.stateError}`);
  }
  lines.push('');

  lines.push('## Recommendations', '');
  if (packet.recommendations.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const r of packet.recommendations) {
      lines.push(`### ${r.id} — ${r.title}`);
      lines.push('');
      lines.push(
        `- score: ${r.score}/100 · status: ${r.status} · ready: ${r.readiness} · priority: ${r.priority}`,
      );
      if (r.suggestedBackendAction) lines.push(`- next: ${r.suggestedBackendAction}`);
      lines.push('');
    }
  }

  lines.push('## Open Assumptions', '');
  if (packet.assumptions.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const a of packet.assumptions) {
      lines.push(`- ${a.id} (${a.recommendationId}): ${a.text}`);
    }
  }
  lines.push('');

  lines.push('## Decisions', '');
  if (packet.decisions.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const d of packet.decisions) {
      const tie = d.recommendationId ? ` [${d.recommendationId}]` : '';
      lines.push(`- ${d.id}${tie}: ${d.title} — ${d.rationale}`);
    }
  }
  lines.push('');

  lines.push('## Relevant Files', '');
  if (packet.files.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const f of packet.files) {
      lines.push(`- \`${f.path}\` — ${f.why}`);
    }
  }
  lines.push('');

  lines.push('## Totals', '');
  lines.push(
    `- recommendations ${packet.totals.recommendations} (${packet.totals.recommendationsOmitted} omitted) · assumptions ${packet.totals.assumptions} · decisions ${packet.totals.decisions} · files ${packet.totals.files}`,
  );
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cadence/core test -- tests/intelligence/render-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/render-context.ts packages/core/tests/intelligence/render-context.test.ts
git commit -m "feat(core): add pure renderContextMd (Slice 5)"
```

---

## Task 5: IO glue `runContext`

**Files:**
- Modify: `packages/core/src/intelligence/context.ts` (append `runContext`)
- Test: `packages/core/tests/intelligence/context.test.ts` (append a `runContext` describe)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/tests/intelligence/context.test.ts`:

```typescript
import { afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { ContextPacketZ as PacketZ } from '@cadence/types';
import { runContext } from '../../src/intelligence/context.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('runContext', () => {
  it('writes context/<scope>.{json,md} and returns the packet', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ctx' });
    const packet = await runContext(active.root, 'phase', new Date('2026-05-18T00:00:00.000Z'));
    expect(packet.scope).toBe('phase');

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'phase.json'),
      'utf8',
    );
    expect(() => PacketZ.parse(JSON.parse(jsonRaw))).not.toThrow();

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'phase.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Context Packet — phase/);
  });

  it('degrades cleanly with no .cadence backend', async () => {
    active = await tempRepo({ initialized: false });
    const packet = await runContext(active.root, 'handoff');
    expect(packet.loop.present).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cadence/core test -- tests/intelligence/context.test.ts`
Expected: FAIL — `runContext` not exported.

- [ ] **Step 3: Implement the glue** (append to `packages/core/src/intelligence/context.ts`; mirror `runRecommend`)

Add imports at the top of `context.ts`:

```typescript
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import {
  intelligenceDir,
  readRecommendationLedger,
  readEvidenceLedger,
  readAssumptionLedger,
  readIntelligenceDecisionLedger,
} from './store.js';
import { cadenceBackend } from './backend/cadence.js';
import { renderContextMd } from './render-context.js';
```

Append at the end of `context.ts`:

```typescript
export async function runContext(
  root: string,
  scope: ContextScope,
  now: Date = new Date(),
): Promise<ContextPacket> {
  const [recLedger, evLedger, asLedger, decLedger, backend] = await Promise.all([
    readRecommendationLedger(root),
    readEvidenceLedger(root),
    readAssumptionLedger(root),
    readIntelligenceDecisionLedger(root),
    cadenceBackend.readStatus(root),
  ]);

  const packet = synthesizeContextPacket(
    scope,
    {
      recommendations: recLedger.recommendations,
      evidence: evLedger.evidence,
      assumptions: asLedger.assumptions,
      decisions: decLedger.decisions,
      backend,
    },
    now,
  );

  const dir = join(intelligenceDir(root), 'context');
  await mkdir(dir, { recursive: true });
  await atomicWriteJSON(join(dir, `${scope}.json`), packet);
  await atomicWriteText(join(dir, `${scope}.md`), renderContextMd(packet));
  return packet;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cadence/core test -- tests/intelligence/context.test.ts`
Expected: PASS (synth + runContext describes).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/context.ts packages/core/tests/intelligence/context.test.ts
git commit -m "feat(core): add runContext IO glue (Slice 5)"
```

---

## Task 6: CLI command `cadence context <scope>`

**Files:**
- Create: `packages/core/src/cli/commands/context.ts`
- Modify: `packages/core/src/cli/register.ts`
- Test: `packages/core/tests/cli/context.test.ts`

Scope validation: this codebase does not use Commander `.choices()`. Validate the positional value with `ContextScopeZ.safeParse`; invalid → stderr one line + `process.exitCode = 2` (argument-usage error). This matches the reconciled spec §Architecture/§Flow exactly (the spec describes the same manual `safeParse` + exit-2 mechanism — there is no plan/spec deviation here). `--json` prints JSON to stdout; default prints the Markdown packet. Files are written regardless.

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/cli/context.test.ts` (copy the spawn harness from `tests/cli/recommend.test.ts`):

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence context', () => {
  it('writes artifacts and prints the Markdown packet', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ctx-cli' });
    const r = await run(['context', 'phase'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/# CADENCE Context Packet — phase/);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'phase.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'phase.md'),
      'utf8',
    );
    expect(md).toMatch(/## Loop/);
  });

  it('--json emits parseable JSON to stdout', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['context', 'handoff', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.scope).toBe('handoff');
  });

  it('rejects an invalid scope with exit 2 and a clean message', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['context', 'bogus'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/invalid scope "bogus"/);
    expect(r.stdout).toBe('');
  });

  it('degrades cleanly with no .cadence backend', async () => {
    active = await tempRepo({ initialized: false });
    const r = await run(['context', 'phase'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/no CADENCE backend detected/);
  });
});
```

- [ ] **Step 2: Build, then run test to verify it fails**

The spawned-CLI tests run the built `dist/cli/index.js`, so a build is required.

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- tests/cli/context.test.ts`
Expected: FAIL — `context` is not a known command (Commander error / non-matching output).

- [ ] **Step 3: Implement the command**

Create `packages/core/src/cli/commands/context.ts`:

```typescript
import type { Command } from 'commander';
import { ContextScopeZ } from '@cadence/types';
import { runContext } from '../../intelligence/context.js';
import { renderContextMd } from '../../intelligence/render-context.js';

export function registerContextCommand(program: Command): void {
  program
    .command('context <scope>')
    .description(
      'Emit a compact, read-only context packet (scope: phase | handoff)',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (scope: string, opts: { json?: boolean }) => {
      const parsed = ContextScopeZ.safeParse(scope);
      if (!parsed.success) {
        process.stderr.write(
          `context: invalid scope "${scope}" (expected: phase | handoff)\n`,
        );
        process.exitCode = 2;
        return;
      }
      try {
        const packet = await runContext(process.cwd(), parsed.data);
        if (opts.json) {
          process.stdout.write(JSON.stringify(packet) + '\n');
        } else {
          process.stdout.write(renderContextMd(packet));
        }
      } catch (err) {
        process.stderr.write(
          `context failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```

In `packages/core/src/cli/register.ts`:
1. Add `import { registerContextCommand } from './commands/context.js';` after the `registerMilestoneCommand` import.
2. Add `registerContextCommand(program);` as the **last** call in `registerAllCommands` (after `registerMilestoneCommand(program);`). Order matters — it must match the marker-block order in Task 7.

- [ ] **Step 4: Rebuild, then run test to verify it passes**

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- tests/cli/context.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cli/commands/context.ts packages/core/src/cli/register.ts packages/core/tests/cli/context.test.ts
git commit -m "feat(core): add cadence context <scope> command (Slice 5)"
```

---

## Task 7: Docs, CHANGELOG, drift guard, full gate

**Files:**
- Modify: `docs/reference/commands.md`
- Modify: `CHANGELOG.md`

The Phase-31 `cli-reference.test.ts` drift guard set-compares the registered top-level commands against the marker block in `docs/reference/commands.md`. A new top-level command **must** appear there or that test fails (the durable 36.1 lesson).

- [ ] **Step 1: Update the marker block**

In `docs/reference/commands.md`, add `context` as the last line inside the `<!-- cadence:commands:start -->` / `<!-- cadence:commands:end -->` block (after `milestone`), matching the `registerAllCommands` order:

```
...
recommend
milestone
context
<!-- cadence:commands:end -->
```

- [ ] **Step 2: Add the `### context` reference section**

Insert after the `### milestone` section (mirror the `### recommend` section's structure). **Before pasting, open the real `### recommend` section (`docs/reference/commands.md:636-674`) and copy its exact fence style** — the Usage block uses a single bare triple-backtick fence (not a nested/`markdown`-tagged one). The sample below shows the intended content; match the surrounding file's literal formatting rather than this plan's rendering:

```markdown
### context

```
Usage: cadence context <scope> [options]

Emit a compact, read-only context packet (scope: phase | handoff)
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
Reads the recommendation, evidence, assumption, and decision ledgers plus
CADENCE loop state **read-only** (never mutates `state.json` or transitions
the loop), then emits a bounded "context packet" for the given scope:
`phase` (context a downstream CADENCE phase carries) or `handoff` (state to
resume across a session / agent handoff). Compactness is
bounded-by-construction — only ranked recommendations (top 7 for `phase`,
top 5 for `handoff`), only open assumptions, file *references* not contents.
`phase` scopes assumptions/decisions/files to the selected recommendations;
`handoff` carries the broader trail. Both share the read-only loop block.

Writes:

- `.cadence/intelligence/context/<scope>.json`
- `.cadence/intelligence/context/<scope>.md`

With `--json`, the packet object is emitted to stdout instead of the
rendered Markdown. An unknown scope exits 2 with a clean message.

**Exit codes** — `2` for an invalid scope; `1` only on a genuine failure
(e.g. artifact write error). An empty ledger, a missing git repo, or a
missing `.cadence/` backend degrades gracefully and still exits 0.

---
```

- [ ] **Step 3: Add a CHANGELOG entry**

Under the `## [Unreleased]` heading in `CHANGELOG.md`, add (match the file's existing bullet style):

```markdown
- `cadence context <scope>` — compact read-only context packets (`phase` + `handoff`) for the strategic-intelligence layer (Praxis Slice 5).
```

- [ ] **Step 4: Run the drift guard + the full gate**

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- tests/cli/cli-reference.test.ts`
Expected: PASS (registered commands == marker block).

Then the full done-bar (not a subset — the durable pipeline lesson; `lint` included):

Run: `pnpm turbo run lint typecheck test build`
Expected: PASS — 16/16 tasks green.

- [ ] **Step 5: Commit**

```bash
git add docs/reference/commands.md CHANGELOG.md
git commit -m "docs: document cadence context packets (Slice 5)"
```

---

## Phase Wrap (CADENCE dogfood — handled at execution, noted for completeness)

This slice ships as a CADENCE phase on `praxis-intelligence-ledger`. After all tasks are green and the full gate passes, the standard two-commit settle ceremony applies (a `feat(core): …` roll-up is unnecessary here since tasks already committed feat-by-feat; the slice closes with the CADENCE `chore: settle …` if a DRAFT phase was scaffolded for it, per the recursive-dogfood workflow). **Do not push, do not merge to `main`, PR #9 stays draft** until the Praxis workstream is complete (user-held release gate).

## Done When

- `cadence context phase` and `cadence context handoff` each write `.cadence/intelligence/context/<scope>.{json,md}` and print the rendered Markdown packet; `--json` prints `ContextPacketZ`-valid JSON; invalid scope → exit 2, stderr-clean.
- Packet is bounded-by-construction with an accurate `recommendationsOmitted`; `phase` scopes to selected recs, `handoff` carries the broader trail; loop block is read-only and degrades gracefully.
- No `state.json`/loop interaction anywhere; writes confined to `.cadence/intelligence/context/`.
- `cli-reference` drift guard green; full `pnpm turbo run lint typecheck test build` 16/16.
