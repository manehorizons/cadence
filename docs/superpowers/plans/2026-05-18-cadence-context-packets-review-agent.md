# CADENCE Context Packets — `review` + `agent` Scopes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `cadence context <scope>` to support two new scopes — `review` (post-build audit packet with a dedicated needsAttention bucket) and `agent` (subagent dispatch brief filtered to dispatchable recs) — by adding two new policy branches to the existing `synthesizeContextPacket` switch plus a single optional field on `ContextPacketZ`.

**Architecture:** Pure additive. One enum widening (`ContextScopeZ`: 2 → 4 members), one optional field (`ContextPacketZ.needsAttention?: ContextRec[]`), two new synth-switch branches, two new render branches, two hardcoded user-facing CLI strings updated. No new files; no new modules; no new commands; no backend changes; no `state.json`/loop touch. Strict read-only boundary preserved.

**Tech Stack:** TypeScript, Zod v3, vitest, Commander; pnpm + turbo. Cadence repo monorepo (`packages/types`, `packages/core`).

**Spec:** [`docs/superpowers/specs/2026-05-18-cadence-context-packets-review-agent-design.md`](../specs/2026-05-18-cadence-context-packets-review-agent-design.md)

**Branch:** `praxis-intelligence-ledger` (long-lived Praxis workstream; PR #9 stays draft).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/types/src/intelligence.ts` | Modify | Widen `ContextScopeZ` enum; add optional `needsAttention?: ContextRec[]` to `ContextPacketZ` |
| `packages/types/tests/intelligence.test.ts` | Modify | Add parse-success cases for `review`/`agent`; add round-trip case with optional `needsAttention` |
| `packages/core/src/intelligence/context.ts` | Modify | Add `'review'` and `'agent'` branches to the `synthesizeContextPacket` switch; add `TOP_N_REVIEW = 5` and `TOP_N_AGENT = 3` constants |
| `packages/core/tests/intelligence/context.test.ts` | Modify | Add per-scope test blocks (`review`, `agent`) + byte-stability regression for `phase`/`handoff` + graceful-degrade cases |
| `packages/core/src/intelligence/render-context.ts` | Modify | Render `## Needs Attention` for `review`; strip `nextAction`+`stateError` from loop block for `agent` |
| `packages/core/tests/intelligence/render-context.test.ts` | Modify | Render assertions for both new scope branches + phase/handoff regression |
| `packages/core/src/cli/commands/context.ts` | Modify | Update `.description(...)` string and invalid-scope stderr string to list four scopes (action-body untouched) |
| `packages/core/tests/cli/context.test.ts` | Modify | Add spawn-CLI tests for `review` and `agent`; assert new four-scope expected-list in invalid-scope stderr; assert `--help` mentions all four |
| `docs/reference/commands.md` | Modify | `### context` section: usage line + behavior prose + TOP_N list updated to four scopes |
| `CHANGELOG.md` | Modify | One line under `## [Unreleased] → ### Added` |
| `docs/superpowers/specs/2026-05-17-cadence-context-packets-design.md` | Modify | Follow-On section: strike-through "review/agent scopes" forward-ref + annotate "shipped in Slice 7" (mirrors Slice 6's Follow-On reconciliation pattern) |

**Test files are NOT colocated with source** — Slice-5 convention puts vitest specs under `packages/<pkg>/tests/...`, mirroring the `src/` layout. The paths above are verified. Do NOT introduce new test helpers; reuse the local `run()` pattern in `tests/cli/context.test.ts` and the fixture helpers (`tempRepo` from `@cadence/testkit`) already in scope.

---

## Per-task done-bar (apply to EVERY task before committing)

Slice-4a / Slice-6 gotcha (carried forward in `project_praxis_layer.md` memory): **per-task subset checks miss `lint` regressions**. The done-bar is the FULL turbo gate, not a subset.

```bash
pnpm turbo run lint typecheck test build
```

Expect 16/16 successful (12+ cached after the first run). Do NOT commit if the gate is red. If lint fails for a `no-unused-vars` regression, that's the Slice-4a class of issue — fix in the same task before commit, don't carry forward.

---

## Task 1: Types — widen `ContextScopeZ` and add `needsAttention?`

**Files:**
- Modify: `packages/types/src/intelligence.ts` (lines ~324, ~338)
- Modify: `packages/types/tests/intelligence.test.ts` (existing — confirmed during plan review)

- [ ] **Step 1: Skim existing Slice-5 type tests for convention**

```bash
grep -n "ContextScopeZ\|ContextPacketZ" packages/types/tests/intelligence.test.ts
```

- [ ] **Step 2: Write failing tests**

Add to `packages/types/tests/intelligence.test.ts` (imports `from '../src/intelligence.js'` — the file is under `tests/`, not colocated):

```ts
// Imports already at top of file:
//   import { describe, expect, it } from 'vitest';
//   import { ContextScopeZ, ContextPacketZ, /* ... */ } from '../src/intelligence.js';

describe('ContextScopeZ (Slice 7)', () => {
  it.each(['phase', 'handoff', 'review', 'agent'] as const)(
    'accepts scope %s',
    (s) => {
      expect(ContextScopeZ.parse(s)).toBe(s);
    },
  );

  it('rejects unknown scope', () => {
    expect(ContextScopeZ.safeParse('bogus').success).toBe(false);
  });
});

describe('ContextPacketZ.needsAttention (Slice 7)', () => {
  const basePacket = {
    schemaVersion: 1 as const,
    scope: 'review' as const,
    generatedAt: '2026-05-18T00:00:00.000Z',
    loop: { present: false },
    recommendations: [],
    assumptions: [],
    decisions: [],
    files: [],
    totals: {
      recommendations: 0,
      assumptions: 0,
      decisions: 0,
      files: 0,
      recommendationsOmitted: 0,
    },
  };

  it('round-trips with optional needsAttention array', () => {
    const withAttn = {
      ...basePacket,
      needsAttention: [
        {
          id: 'r1',
          title: 'rotted rec',
          score: 50,
          status: 'candidate' as const,
          readiness: 'needs-evidence' as const,
          priority: 'medium' as const,
        },
      ],
    };
    expect(ContextPacketZ.parse(withAttn).needsAttention).toHaveLength(1);
  });

  it('round-trips without needsAttention (other scopes omit)', () => {
    const parsed = ContextPacketZ.parse(basePacket);
    expect(parsed.needsAttention).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests — verify they FAIL**

```bash
pnpm --filter @cadence/types test -- --run intelligence
```

Expected: failures naming the new tests (enum doesn't include `review`/`agent`; `ContextPacketZ` doesn't accept `needsAttention`).

- [ ] **Step 4: Implement — widen enum + add optional field**

In `packages/types/src/intelligence.ts`, change line ~324:

```ts
// before
export const ContextScopeZ = z.enum(['phase', 'handoff']);

// after
export const ContextScopeZ = z.enum(['phase', 'handoff', 'review', 'agent']);
```

In the same file, inside the `ContextPacketZ = z.object({...})` block (around line ~338), add the optional field. Place it AFTER the existing `files: z.array(...)` field and BEFORE `totals` to keep array-like fields grouped:

```ts
needsAttention: z.array(ContextRecZ).optional(),
```

Do NOT bump `schemaVersion`. Do NOT change `totals` (Decision-Log #8: bucket size is derivable; touching `totals` would invalidate every Slice-5 golden).

- [ ] **Step 5: Run tests — verify GREEN**

```bash
pnpm --filter @cadence/types test -- --run intelligence
```

All new and existing tests pass.

- [ ] **Step 6: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

Expected: 16/16 successful. No lint regressions.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/intelligence.ts packages/types/tests/intelligence.test.ts
git commit -m "$(cat <<'EOF'
refactor(types): expand ContextScopeZ + optional needsAttention (Slice 7)

Widens ContextScopeZ to 4 members (adds 'review', 'agent') and adds an
optional needsAttention?: ContextRec[] field to ContextPacketZ. Additive
only; schemaVersion stays 1; totals shape is intentionally unchanged
(Decision-Log #8).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Synth — `review` policy branch

**Files:**
- Modify: `packages/core/src/intelligence/context.ts`
- Modify: `packages/core/src/intelligence/context.test.ts` (or actual Slice-5 synth test file — confirm path)

- [ ] **Step 1: Confirm Slice-5 synth test file path**

```bash
ls packages/core/src/intelligence/*.test.ts packages/core/tests/intelligence/ 2>/dev/null
grep -rn "synthesizeContextPacket" packages/core --include='*.test.ts' | head
```

Use the existing colocation. Modify in place.

- [ ] **Step 2: Write failing tests for the `review` branch**

Append to the existing context test file. Include AC-2 coverage:

```ts
describe('synthesizeContextPacket — review scope (Slice 7)', () => {
  // ... fixture helpers: mkRec, mkEv, mkAs, mkDec. Reuse Slice-5 helpers
  // if they already exist in this file.

  it('selects TOP_N_REVIEW=5 ranked recs (sorted score desc, createdAt asc, id asc)', () => {
    const recs = [...]; // 8 ranked recs with deterministic scores/createdAt/ids
    const packet = synthesizeContextPacket('review', {
      recommendations: recs,
      evidence: [],
      assumptions: [],
      decisions: [],
      backend: { present: false, kind: null, legalActions: [] },
    }, new Date('2026-05-18T00:00:00.000Z'));
    expect(packet.recommendations).toHaveLength(5);
    expect(packet.recommendations.map(r => r.id)).toEqual(['r3','r1','r5','r2','r4']);
  });

  it('emits needsAttention bucket (rescored + sorted; no TOP_N cap)', () => {
    const recs = [
      // 3 ranked + 7 needsAttention (superseded/contradicted)
    ];
    const packet = synthesizeContextPacket('review', {/* ... */});
    expect(packet.needsAttention).toHaveLength(7);
    // Verify sorted by score desc, createdAt asc, id asc.
    const scores = packet.needsAttention!.map(r => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('emits needsAttention: [] (always present for review, even when empty)', () => {
    const packet = synthesizeContextPacket('review', {
      recommendations: [/* only ranked, no superseded/contradicted */],
      evidence: [], assumptions: [], decisions: [],
      backend: { present: false, kind: null, legalActions: [] },
    });
    expect(packet.needsAttention).toEqual([]);
  });

  it('includes ALL open assumptions (broad — reviewer audits all)', () => {
    // open assumptions tied to recs NOT in selected; must still be included
    const packet = synthesizeContextPacket('review', {/* ... */});
    expect(packet.assumptions.map(a => a.id)).toEqual(['a1','a2','a3']);
  });

  it('includes ALL decisions (tied + untied) — reviewer audits rationale', () => {
    const packet = synthesizeContextPacket('review', {/* ... */});
    expect(packet.decisions.map(d => d.id)).toEqual(['d1','d2','d3']);
  });

  it('files = dedup affectedFiles ∪ evidence paths from (selected ∪ needsAttention)', () => {
    const packet = synthesizeContextPacket('review', {/* ... */});
    // Assert paths from BOTH selected-rec affectedFiles AND attn-rec affectedFiles
    // are present; deduplicated by path; oneLine'd "why" preserved.
  });
});
```

- [ ] **Step 3: Run tests — verify they FAIL**

```bash
pnpm --filter @cadence/core test -- --run intelligence/context
```

Expected: failures on the new `describe` block (no `'review'` branch in switch → falls through default or current code paths).

- [ ] **Step 4: Implement the `review` branch**

In `packages/core/src/intelligence/context.ts`:

1. Add two new constants near the existing two:

```ts
const TOP_N_PHASE   = 7;   // existing
const TOP_N_HANDOFF = 5;   // existing
const TOP_N_REVIEW  = 5;   // new — Slice 7
const TOP_N_AGENT   = 3;   // new — Slice 7 (used in Task 3)
```

2. Update the `partitionLedger` destructure (the function currently only takes `.ranked`):

```ts
// before
const { ranked } = partitionLedger(sources.recommendations);

// after
const { ranked, needsAttention: attnBucket } =
  partitionLedger(sources.recommendations);
```

3. Compute the optional `needsAttention` array (rescored + sorted) ONLY when scope is `'review'`. Add after the existing `selected` computation but before the assumptions/decisions blocks:

```ts
const needsAttention: ContextRec[] | undefined =
  scope === 'review'
    ? attnBucket
        .map((rec) => ({ rec, ...scoreRecommendation(rec) }))
        .sort((a, b) => {
          if (b.raw !== a.raw) return b.raw - a.raw;
          if (a.rec.createdAt !== b.rec.createdAt) {
            return a.rec.createdAt < b.rec.createdAt ? -1 : 1;
          }
          return a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0;
        })
        .map((s): ContextRec => {
          const out: ContextRec = {
            id: s.rec.id,
            title: oneLine(s.rec.title),
            score: s.score,
            status: s.rec.status,
            readiness: s.rec.readiness,
            priority: s.rec.priority,
          };
          if (s.rec.suggestedBackendAction) {
            out.suggestedBackendAction = oneLine(s.rec.suggestedBackendAction);
          }
          return out;
        })
    : undefined;
```

4. Update the `n = scope === 'phase' ? TOP_N_PHASE : TOP_N_HANDOFF` line to include `review`:

```ts
const n =
  scope === 'phase'    ? TOP_N_PHASE :
  scope === 'review'   ? TOP_N_REVIEW :
  /* scope === 'handoff' */ TOP_N_HANDOFF;
// agent is handled by a different code path in Task 3 — leave a TODO marker here,
// or wait until Task 3 to widen the conditional. (Recommendation: wait until Task 3
// to avoid a transient unreachable branch; for now, this expression covers
// phase/handoff/review and 'agent' falls through to TOP_N_HANDOFF temporarily —
// AC-3 test that pins agent=3 will fail in Task 3's RED step, which is correct.)
```

5. Widen the `inScope` predicate to keep `review` in the broad-trail policy (open assumptions all, decisions all):

```ts
// before
const inScope = (recommendationId: string): boolean =>
  scope === 'handoff' || selectedIds.has(recommendationId);

// after
const inScope = (recommendationId: string): boolean =>
  scope === 'handoff' || scope === 'review' || selectedIds.has(recommendationId);
```

And the decisions filter:

```ts
// before
const decisions = sources.decisions.filter((d) =>
  scope === 'handoff'
    ? true
    : d.recommendationId !== undefined && selectedIds.has(d.recommendationId),
).map(/* ... */);

// after
const decisions = sources.decisions.filter((d) =>
  (scope === 'handoff' || scope === 'review')
    ? true
    : d.recommendationId !== undefined && selectedIds.has(d.recommendationId),
).map(/* ... */);
```

6. Widen the `fileRecs` source so `review` files come from selected ∪ needsAttention:

```ts
// before
const fileRecs = scope === 'handoff' ? scored.map((s) => s.rec) : selected.map((s) => s.rec);

// after
let fileRecs: Recommendation[];
if (scope === 'handoff') {
  fileRecs = scored.map((s) => s.rec);
} else if (scope === 'review') {
  // selected-rec ids + needsAttention rec ids
  const attnRecs = attnBucket;
  fileRecs = [...selected.map((s) => s.rec), ...attnRecs];
} else {
  fileRecs = selected.map((s) => s.rec);
}
```

7. Pass `needsAttention` through to the final `ContextPacketZ.parse(...)` call:

```ts
return ContextPacketZ.parse({
  schemaVersion: 1,
  scope,
  generatedAt: now.toISOString(),
  loop,
  recommendations,
  assumptions,
  decisions,
  files,
  ...(needsAttention !== undefined ? { needsAttention } : {}),
  totals: {
    recommendations: recommendations.length,
    assumptions: assumptions.length,
    decisions: decisions.length,
    files: files.length,
    recommendationsOmitted,
  },
});
```

- [ ] **Step 5: Run tests — verify GREEN for `review` (agent still failing — that's fine, Task 3)**

```bash
pnpm --filter @cadence/core test -- --run intelligence/context
```

- [ ] **Step 6: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/intelligence/context.ts packages/core/tests/intelligence/context.test.ts
git commit -m "$(cat <<'EOF'
feat(core): synth `review` scope policy + needsAttention bucket (Slice 7)

Adds TOP_N_REVIEW=5 + needsAttention bucket (rescored, sorted score desc,
createdAt asc, id asc; no TOP_N cap). Open assumptions: all (broad).
Decisions: all. Files: from selected ∪ needsAttention recs. needsAttention
is always present (even as []) for the review scope; never present for
other scopes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Synth — `agent` policy branch

**Files:**
- Modify: `packages/core/src/intelligence/context.ts`
- Modify: `packages/core/src/intelligence/context.test.ts`

- [ ] **Step 1: Write failing tests for the `agent` branch**

**FIXTURE-NEUTRALIZATION AUDIT (Slice-6 meta-lesson applied — DO NOT SKIP):** the new `agent` filter keys off `status` and `readiness`. Current `mkRec` defaults are `status='candidate'` + `readiness='raw-idea'` — meaning a default-fixture rec is EXCLUDED by the agent filter, the opposite of Slice 6's "default silently selected" failure mode. The discipline is the same regardless: **every fixture rec in this describe block MUST set `status` AND `readiness` EXPLICITLY**, so a future bump to either `mkRec` default cannot silently shift which recs the agent filter selects (e.g. if a maintainer flips the readiness default to `ready-for-milestone`, every previously-excluded fixture would suddenly become selectable and exact-array `toEqual` goldens would break in non-obvious ways). The boundary tests below pin BOTH halves of the filter (status + readiness, inclusion + exclusion).

Add this comment in the test file above the new describe block:

```ts
// Slice-7 fixture-neutralization audit (Slice-6 meta-lesson applied):
//   the `agent` filter keys off rec.status + rec.readiness. Every fixture in this
//   block sets BOTH explicitly — never relying on mkRec defaults
//   (status='candidate', readiness='raw-idea' at the time of writing, which
//   happen to EXCLUDE-by-default; a future bump could silently flip that). The
//   boundary test below pins both halves of the filter so exact-array toEqual
//   goldens stay deterministic regardless of default churn.
```

Then:

```ts
describe('synthesizeContextPacket — agent scope (Slice 7)', () => {
  it('selects TOP_N_AGENT=3 from ranked ∩ accepted ∩ ready-*', () => {
    const recs = [
      mkRec({ id: 'r1', status: 'accepted', readiness: 'ready-for-milestone',   /* highest score */ }),
      mkRec({ id: 'r2', status: 'accepted', readiness: 'ready-for-cadence-spec' }),
      mkRec({ id: 'r3', status: 'accepted', readiness: 'ready-for-milestone' }),
      mkRec({ id: 'r4', status: 'accepted', readiness: 'ready-for-milestone' }), // 4th best — excluded by TOP_N
      mkRec({ id: 'r5', status: 'accepted', readiness: 'needs-evidence' }),       // not ready — excluded
      mkRec({ id: 'r6', status: 'candidate', readiness: 'ready-for-milestone' }), // not accepted — excluded
    ];
    const packet = synthesizeContextPacket('agent', {/* ... */});
    expect(packet.recommendations.map(r => r.id)).toEqual(['r1','r2','r3']);
  });

  it('boundary: includes ready-for-milestone AND ready-for-cadence-spec; excludes others', () => {
    // Pin both halves of the filter: same status, varying readiness.
    const recs = [
      mkRec({ id: 'inc-mil',  status: 'accepted', readiness: 'ready-for-milestone' }),
      mkRec({ id: 'inc-spec', status: 'accepted', readiness: 'ready-for-cadence-spec' }),
      mkRec({ id: 'ex-need',  status: 'accepted', readiness: 'needs-evidence' }),
      mkRec({ id: 'ex-blkd',  status: 'accepted', readiness: 'blocked' }),
      mkRec({ id: 'ex-raw',   status: 'accepted', readiness: 'raw-idea' }),
      mkRec({ id: 'ex-dec',   status: 'accepted', readiness: 'needs-decision' }),
    ];
    const packet = synthesizeContextPacket('agent', {/* ... */});
    expect(packet.recommendations.map(r => r.id).sort()).toEqual(['inc-mil','inc-spec']);
  });

  it('assumptions = open ∧ tied to selected (top-3) recs', () => { /* ... */ });

  it('decisions = tied to selected (top-3) recs only', () => { /* ... */ });

  it('files = from selected (top-3) recs only (no needsAttention contribution)', () => { /* ... */ });

  it('emits empty packet honestly when no recs match (no throw)', () => {
    const recs = [
      mkRec({ id: 'a', status: 'accepted', readiness: 'needs-evidence' }),
      mkRec({ id: 'b', status: 'candidate', readiness: 'ready-for-milestone' }),
    ];
    const packet = synthesizeContextPacket('agent', {/* ... */});
    expect(packet.recommendations).toEqual([]);
    expect(packet.totals.recommendations).toBe(0);
    expect(packet.needsAttention).toBeUndefined();
  });

  it('never emits needsAttention field for agent scope', () => {
    const recs = [/* fixtures with both ranked and partition-attn recs */];
    const packet = synthesizeContextPacket('agent', {/* ... */});
    expect('needsAttention' in packet).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
pnpm --filter @cadence/core test -- --run intelligence/context
```

- [ ] **Step 3: Implement the `agent` branch**

In `packages/core/src/intelligence/context.ts`:

1. Update the `n` expression (or split it cleanly into a switch). For `agent` the rec selection isn't just `slice(0, N)` of `scored` — it filters first. Restructure as follows:

```ts
const isAgentReady = (rec: Recommendation): boolean =>
  rec.status === 'accepted' &&
  (rec.readiness === 'ready-for-milestone' ||
    rec.readiness === 'ready-for-cadence-spec');

let selected: typeof scored;
let recommendationsOmitted: number;

if (scope === 'agent') {
  const ready = scored.filter((s) => isAgentReady(s.rec));
  selected = ready.slice(0, TOP_N_AGENT);
  recommendationsOmitted = Math.max(0, ready.length - TOP_N_AGENT);
} else {
  const n =
    scope === 'phase'  ? TOP_N_PHASE :
    scope === 'review' ? TOP_N_REVIEW :
    /* handoff */        TOP_N_HANDOFF;
  selected = scored.slice(0, n);
  recommendationsOmitted = Math.max(0, scored.length - n);
}
```

2. Replace the existing `const n = ...; const selected = scored.slice(0, n); const recommendationsOmitted = Math.max(0, scored.length - n);` block (lines ~61–63) with the above.

3. Verify the existing assumptions/decisions/files filters still produce the agent contract:
   - `inScope` for agent = `selectedIds.has(recommendationId)` (NOT handoff/review broad). Existing code already does this; no change.
   - decisions filter for agent = tied-to-selected only. Existing code already does this; no change.
   - files for agent = from `selected` only. Existing code already does this; no change.
   - `needsAttention` for agent stays `undefined` (Task 2 already handles this with `scope === 'review'` gate).

4. Quick mental check: every place that branches by scope now correctly handles `'agent'`. Add NO new `if (scope === 'agent')` clauses except the rec-selection block — `agent` reuses the existing "selected-only" defaults.

- [ ] **Step 4: Run tests — verify GREEN**

```bash
pnpm --filter @cadence/core test -- --run intelligence/context
```

All Slice-5 + new Slice-7 (review + agent) synth tests pass.

- [ ] **Step 5: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/intelligence/context.ts packages/core/tests/intelligence/context.test.ts
git commit -m "$(cat <<'EOF'
feat(core): synth `agent` scope policy (Slice 7)

Adds TOP_N_AGENT=3 over ranked ∩ status='accepted' ∩
readiness ∈ {ready-for-milestone, ready-for-cadence-spec}. Assumptions
filter to selected (top-3) tied recs; decisions tied-to-selected only;
files from selected only. needsAttention stays absent for this scope.
Zero-match handled as honest-empty (no throw).

Fixture-neutralization audit applied: every agent-scope fixture sets
status + readiness explicitly so the filter cannot silently shift on a
future mkRec default change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Byte-stability regression guard for `phase` + `handoff`

**Files:**
- Modify: `packages/core/src/intelligence/context.test.ts` (test-only commit)

This is AC-5. No production code changes. Guards Tasks 2 + 3 against accidental drift in the frozen scopes.

- [ ] **Step 1: Write the regression tests**

Pick a deterministic fixture that exercises both `phase` and `handoff`. The simplest approach: snapshot the packet JSON. Slice 5 already established the fixture-and-golden pattern — check `context.test.ts` for existing snapshots; mirror them.

```ts
describe('byte-stability regression — phase + handoff frozen (Slice 7)', () => {
  const sources = mkFrozenSources(); // deterministic, dated fixture
  const now = new Date('2026-05-18T00:00:00.000Z');

  it('phase JSON has no needsAttention key (regression: Slice 7 must not pollute)', () => {
    const packet = synthesizeContextPacket('phase', sources, now);
    expect('needsAttention' in packet).toBe(false);
  });

  it('handoff JSON has no needsAttention key', () => {
    const packet = synthesizeContextPacket('handoff', sources, now);
    expect('needsAttention' in packet).toBe(false);
  });

  it('agent JSON has no needsAttention key', () => {
    const packet = synthesizeContextPacket('agent', sources, now);
    expect('needsAttention' in packet).toBe(false);
  });

  it('phase packet matches frozen golden', () => {
    expect(synthesizeContextPacket('phase', sources, now))
      .toMatchInlineSnapshot(/* inline snapshot or imported JSON golden */);
  });

  it('handoff packet matches frozen golden', () => {
    expect(synthesizeContextPacket('handoff', sources, now))
      .toMatchInlineSnapshot(/* inline snapshot or imported JSON golden */);
  });
});
```

Two ways to "freeze" the golden:
- (a) `toMatchInlineSnapshot()` — vitest writes the snapshot on first run; subsequent runs assert byte-equality. Cheap to add; the diff against the EXISTING golden (Slice 5 ran the same fixture) IS the regression check.
- (b) JSON golden file under `tests/fixtures/` — heavier; only worth it if Slice 5 already uses this pattern.

Prefer (a) unless Slice 5 used (b).

- [ ] **Step 2: Run tests — they should PASS immediately**

```bash
pnpm --filter @cadence/core test -- --run intelligence/context
```

If they FAIL, you have a real regression introduced in Task 2 or Task 3 — STOP, do not commit. Fix the actual root cause in the offending task's code (don't relax the golden). The point of this task is to catch exactly that.

- [ ] **Step 3: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/tests/intelligence/context.test.ts
git commit -m "$(cat <<'EOF'
test(core): byte-stability regression for phase + handoff (Slice 7)

Pin needsAttention key absence on phase/handoff/agent JSON, and freeze
phase + handoff packet output via inline snapshots so any future
synth-switch change that drifts the frozen scopes' bytes fails loudly.
AC-5 from the design doc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Render — `## Needs Attention` for `review` + loop-strip for `agent`

**Files:**
- Modify: `packages/core/src/intelligence/render-context.ts`
- Modify: `packages/core/tests/intelligence/render-context.test.ts`

**Render shape — pinned to actual file (verified during plan review):**

`render-context.ts` uses a `const lines: string[] = [...]` array builder + `lines.push(...)` + `return lines.join('\n')`. Recommendations render as `### ${r.id} — ${r.title}` headings with bullet rows below (NOT a pipe table). Loop block emits `- next action: ${...}` and `- state error: ${...}` (NOT `- next:` / `- error:`). All new code in this task MUST follow that idiom verbatim.

- [ ] **Step 1: Skim the existing render module + Slice-5 test file**

```bash
sed -n '1,80p' packages/core/src/intelligence/render-context.ts
grep -n "renderContextMd\|## " packages/core/tests/intelligence/render-context.test.ts | head -20
```

Reuse whatever fixture helper Slice 5 uses (search the file for the helpers used to build packets — they likely just inline a partial `ContextPacket` literal rather than a `mkXPacket` factory). Adapt the snippets below to match.

- [ ] **Step 2: Write failing render tests**

Append to `packages/core/tests/intelligence/render-context.test.ts`. Assertions pinned to the actual format (heading + bullet rows, NOT a pipe table; `- next action:` / `- state error:` exact strings):

```ts
describe('renderContextMd — review scope (Slice 7)', () => {
  it('emits a "## Needs Attention" section with all entries (no TOP_N cap)', () => {
    const packet: ContextPacket = {
      schemaVersion: 1,
      scope: 'review',
      generatedAt: '2026-05-18T00:00:00.000Z',
      loop: { present: false },
      recommendations: [],
      assumptions: [],
      decisions: [],
      files: [],
      needsAttention: [
        { id: 'a', title: 'x', score: 50, status: 'candidate', readiness: 'needs-evidence', priority: 'medium' },
        { id: 'b', title: 'y', score: 30, status: 'candidate', readiness: 'blocked',         priority: 'low'    },
      ],
      totals: { recommendations: 0, assumptions: 0, decisions: 0, files: 0, recommendationsOmitted: 0 },
    };
    const md = renderContextMd(packet);
    expect(md).toMatch(/## Needs Attention/);
    // Recommendations idiom: '### id — title' heading followed by bullet rows.
    expect(md).toMatch(/### a — x/);
    expect(md).toMatch(/### b — y/);
    expect(md).toMatch(/- score: 50\/100 · status: candidate · ready: needs-evidence · priority: medium/);
  });

  it('emits "_(none)_" under "## Needs Attention" when bucket is empty', () => {
    const packet: ContextPacket = { /* same shape, needsAttention: [] */ } as ContextPacket;
    const md = renderContextMd(packet);
    expect(md).toMatch(/## Needs Attention\n+_\(none\)_/);
  });
});

describe('renderContextMd — agent scope (Slice 7)', () => {
  it("omits '- next action:' line from Markdown loop block (JSON keeps the field)", () => {
    const packet: ContextPacket = {
      schemaVersion: 1,
      scope: 'agent',
      generatedAt: '2026-05-18T00:00:00.000Z',
      loop: {
        present: true,
        loopPosition: 'BUILD',
        activePhase: 'p1',
        activeDraft: null,
        activeSpec: null,
        tier: null,
        nextAction: 'cadence build task T1',
      },
      recommendations: [],
      assumptions: [],
      decisions: [],
      files: [],
      totals: { recommendations: 0, assumptions: 0, decisions: 0, files: 0, recommendationsOmitted: 0 },
    };
    const md = renderContextMd(packet);
    expect(md).not.toMatch(/- next action:/);
    expect(md).not.toMatch(/cadence build task T1/);
    // JSON parity: render is markdown-only — the field still lives on the packet object.
    expect(packet.loop.nextAction).toBe('cadence build task T1');
  });

  it("omits '- state error:' line from Markdown loop block (JSON keeps the field)", () => {
    const packet: ContextPacket = {
      schemaVersion: 1,
      scope: 'agent',
      generatedAt: '2026-05-18T00:00:00.000Z',
      loop: { present: true, loopPosition: 'IDLE', stateError: 'state.json corrupt' },
      recommendations: [],
      assumptions: [],
      decisions: [],
      files: [],
      totals: { recommendations: 0, assumptions: 0, decisions: 0, files: 0, recommendationsOmitted: 0 },
    };
    const md = renderContextMd(packet);
    expect(md).not.toMatch(/- state error:/);
    expect(md).not.toMatch(/state\.json corrupt/);
    expect(packet.loop.stateError).toBe('state.json corrupt');
  });

  it('phase + handoff render UNCHANGED — "- next action:" / "- state error:" still present', () => {
    const ph: ContextPacket = { /* scope: 'phase', loop: { present: true, ..., nextAction: 'cadence draft new …' } */ } as ContextPacket;
    expect(renderContextMd(ph)).toMatch(/- next action: cadence draft new …/);

    const ho: ContextPacket = { /* scope: 'handoff', loop: { present: true, ..., stateError: 'X' } */ } as ContextPacket;
    expect(renderContextMd(ho)).toMatch(/- state error: X/);
  });
});
```

- [ ] **Step 3: Run tests — verify FAIL**

```bash
pnpm --filter @cadence/core test -- --run intelligence/render-context
```

- [ ] **Step 4: Implement render branches**

In `packages/core/src/intelligence/render-context.ts`:

**(a) Gate the existing `nextAction` / `stateError` lines on `packet.scope !== 'agent'`.** The existing code at lines 22–23 is:

```ts
if (packet.loop.nextAction) lines.push(`- next action: ${packet.loop.nextAction}`);
if (packet.loop.stateError) lines.push(`- state error: ${packet.loop.stateError}`);
```

Change to:

```ts
if (packet.scope !== 'agent' && packet.loop.nextAction) lines.push(`- next action: ${packet.loop.nextAction}`);
if (packet.scope !== 'agent' && packet.loop.stateError) lines.push(`- state error: ${packet.loop.stateError}`);
```

(Preserve the truthy-check semantics — `if (packet.loop.nextAction)`, NOT `!== undefined`. An empty string would print an empty `- next action: ` line otherwise.)

**(b) Add the `## Needs Attention` section.** Add this block AFTER the existing `## Relevant Files` block (the section ending around line 71) and BEFORE the `## Totals` block (line 73). Match the existing `lines.push(...)` idiom and the existing `### id — title` heading + bullet rows used by the ranked recommendations section (lines 31–39):

```ts
if (packet.scope === 'review') {
  lines.push('## Needs Attention', '');
  const attn = packet.needsAttention ?? [];
  if (attn.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const r of attn) {
      lines.push(`### ${r.id} — ${r.title}`);
      lines.push('');
      lines.push(
        `- score: ${r.score}/100 · status: ${r.status} · ready: ${r.readiness} · priority: ${r.priority}`,
      );
      if (r.suggestedBackendAction) lines.push(`- next: ${r.suggestedBackendAction}`);
      lines.push('');
    }
  }
  lines.push('');
}
```

(Mirror the ranked-recs render verbatim — same heading shape, same bullet line, same `- next:` for `suggestedBackendAction`. Do NOT factor out a helper unless the inlined version reads worse than the existing duplicate would; keep blast radius minimal.)

**(c) JSON path verification.** Confirm `JSON.stringify` lives outside this module:

```bash
grep -n "JSON.stringify\|atomicWriteJSON" packages/core/src/intelligence/
```

Expect: writes are in `context.ts` (`atomicWriteJSON(json)`) — `render-context.ts` only builds the `.md` string. JSON is therefore untouched by these render edits.

- [ ] **Step 5: Run tests — verify GREEN**

```bash
pnpm --filter @cadence/core test -- --run intelligence/render-context
```

- [ ] **Step 6: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/intelligence/render-context.ts packages/core/tests/intelligence/render-context.test.ts
git commit -m "$(cat <<'EOF'
feat(core): render review needsAttention + agent loop-strip (Slice 7)

review: emit '## Needs Attention' section with all entries (no TOP_N cap;
mirrors synth) or '_(none)_' when empty. agent: omit nextAction +
stateError lines from the loop block in Markdown only; JSON keeps both
fields. phase + handoff render unchanged (regression-tested).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CLI — accept new scopes (string updates only) + integration tests

**Files:**
- Modify: `packages/core/src/cli/commands/context.ts` (lines 10, 17 — string updates only)
- Modify: `packages/core/tests/cli/context.test.ts`

- [ ] **Step 1: Write failing CLI integration tests**

**Reuse the EXISTING local `run()` helper at the top of `packages/core/tests/cli/context.test.ts` (lines 9–20).** Do NOT introduce a new helper file. The helper signature is:

```ts
function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }>
// — spawns `process.execPath` against `dist/cli/index.js` with the given args + cwd.
```

For the working-directory: the file uses `tempRepo` from `@cadence/testkit` (imported at top, line 6) and an `active: Fixture | null` cleanup hook. Mirror that idiom. Inspect the Slice-5 `'cadence context phase'` test in the same file (it should be a few `describe` blocks down) and copy its setup verbatim.

Append a new `describe` block to `packages/core/tests/cli/context.test.ts`:

```ts
describe('cadence context review|agent (Slice 7)', () => {
  it('cadence context review writes review.json + review.md and prints MD to stdout', async () => {
    active = await tempRepo(/* same fixture call shape Slice-5 uses */);
    const r = await run(['context', 'review'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^# CADENCE Context Packet — review/m);
    const json = await readFile(join(active.root, '.cadence/intelligence/context/review.json'), 'utf8');
    const packet = ContextPacketZ.parse(JSON.parse(json));
    expect(packet.scope).toBe('review');
    expect(packet.needsAttention).toBeDefined(); // always present for review (even as [])
    const md = await readFile(join(active.root, '.cadence/intelligence/context/review.md'), 'utf8');
    expect(md).toMatch(/## Needs Attention/);
  });

  it('cadence context agent writes agent.json + agent.md and prints MD to stdout', async () => {
    active = await tempRepo(/* ... */);
    const r = await run(['context', 'agent'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^# CADENCE Context Packet — agent/m);
    const json = await readFile(join(active.root, '.cadence/intelligence/context/agent.json'), 'utf8');
    const packet = ContextPacketZ.parse(JSON.parse(json));
    expect(packet.scope).toBe('agent');
    expect('needsAttention' in packet).toBe(false); // never present for agent
    const md = await readFile(join(active.root, '.cadence/intelligence/context/agent.md'), 'utf8');
    expect(md).not.toMatch(/- next action:/);
    expect(md).not.toMatch(/- state error:/);
  });

  it('cadence context review --json prints JSON to stdout instead of MD', async () => {
    active = await tempRepo(/* ... */);
    const r = await run(['context', 'review', '--json'], active.root);
    expect(r.code).toBe(0);
    const packet = JSON.parse(r.stdout);
    expect(packet.scope).toBe('review');
    expect(packet.needsAttention).toBeDefined();
  });

  it('invalid scope: process.exitCode = 2; stderr lists all four scopes', async () => {
    active = await tempRepo(/* ... */);
    const r = await run(['context', 'bogus'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/invalid scope "bogus"/);
    expect(r.stderr).toMatch(/expected: phase \| handoff \| review \| agent/);
  });

  it('--help mentions all four scopes via .description() tail', async () => {
    active = await tempRepo(/* ... */);
    const r = await run(['context', '--help'], active.root);
    expect(r.stdout).toMatch(/scope: phase \| handoff \| review \| agent/);
  });
});
```

Note: `r.code` (not `r.exitCode`) — matches the existing helper return shape.

- [ ] **Step 2: Run tests — verify FAIL**

```bash
pnpm --filter @cadence/core test -- --run cli/context
```

The first two should already mostly pass (synth + render are done; runContext just writes the files). The "expected: …" and `--help` assertions will FAIL because the CLI strings still say `phase | handoff`.

- [ ] **Step 3: Implement — the two string updates**

In `packages/core/src/cli/commands/context.ts`:

Line 10 (`.description(...)`):

```ts
// before
.description('Emit a compact, read-only context packet (scope: phase | handoff)')

// after
.description('Emit a compact, read-only context packet (scope: phase | handoff | review | agent)')
```

Line 17 (invalid-scope stderr):

```ts
// before
`context: invalid scope "${scope}" (expected: phase | handoff)\n`,

// after
`context: invalid scope "${scope}" (expected: phase | handoff | review | agent)\n`,
```

Nothing else in this file changes. Argument parsing, `safeParse` flow, exit codes, JSON branch, error handling — all untouched.

- [ ] **Step 4: Run tests — verify GREEN**

```bash
pnpm --filter @cadence/core test -- --run cli/context
```

All Slice-5 + new Slice-7 CLI tests pass.

- [ ] **Step 5: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cli/commands/context.ts packages/core/tests/cli/context.test.ts
git commit -m "$(cat <<'EOF'
feat(core): CLI accepts review + agent scopes (Slice 7)

Two hardcoded user-facing strings in cli/commands/context.ts extended to
list all four scopes: the .description() tail and the invalid-scope
stderr line. Argument parsing and control flow unchanged — ContextScopeZ
widening (Task 1) already lets safeParse accept the new scopes. Spawn-CLI
integration tests for review + agent cover --json, stdout MD, file
artifacts, invalid-scope stderr tail, and --help output.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Docs + forward-ref reconciliation

**Files:**
- Modify: `docs/reference/commands.md` (`### context` section, ~lines 743–780)
- Modify: `CHANGELOG.md` (one line under `## [Unreleased] → ### Added`)
- Modify: `docs/superpowers/specs/2026-05-17-cadence-context-packets-design.md` (Follow-On section: strike + annotate the `review`/`agent` forward-ref)

- [ ] **Step 1: `docs/reference/commands.md` — extend the `### context` section**

Update three places (find the existing strings via `grep -n "context\|phase | handoff" docs/reference/commands.md`):

(a) Usage block — extend the parenthetical to four scopes:

```
Emit a compact, read-only context packet (scope: phase | handoff | review | agent)
```

(b) Behavior prose — extend the scope description sentence:

```
... emits a bounded context packet for the given scope —
`phase` (forward-looking context a downstream CADENCE phase carries),
`handoff` (broad cross-session resume trail),
`review` (backward-looking audit packet with a surfaced needsAttention bucket of
  superseded/contradicted recs; assumptions + decisions surfaced in full so a
  reviewer audits all rationale), or
`agent` (subagent dispatch brief; top-3 ranked recs filtered to status=accepted ∩
  readiness ∈ {ready-for-milestone, ready-for-cadence-spec}; loop block in Markdown
  omits nextAction + stateError, JSON retains them).
```

(c) TOP_N list — extend "top 7 for `phase`, top 5 for `handoff`" to "top 7 for `phase`, top 5 for `handoff`, top 5 for `review`, top 3 (dispatchable subset) for `agent`".

Do NOT touch the `<!-- cadence:commands:begin -->` top-level marker block (`### context` is a top-level command, not a subcommand, but the marker block is auto-managed by another phase's tooling — confirm with `grep -n "cadence:commands" docs/reference/commands.md` first; if `### context` lives inside it, edit the auto-region carefully; if outside, edit freely).

- [ ] **Step 2: `CHANGELOG.md` — add one line under `## [Unreleased] → ### Added`**

Just below the existing `- 'cadence context <scope>' — compact read-only context packets (...)` line (or wherever the Slice-5 entry sits), add:

```markdown
- `cadence context review` + `cadence context agent` — two additional read-only context-packet scopes: `review` is a backward-looking audit packet that surfaces a `needsAttention` bucket of superseded/contradicted recs and carries open assumptions + decisions in full; `agent` is a subagent dispatch brief that filters to the dispatchable subset (`status=accepted` ∩ `readiness ∈ {ready-for-milestone, ready-for-cadence-spec}`) and renders without the operator-facing loop chrome (`nextAction`, `stateError`) a worker subagent doesn't need (Praxis Slice 7).
```

- [ ] **Step 3: Reconcile Slice-5 design forward-refs**

In `docs/superpowers/specs/2026-05-17-cadence-context-packets-design.md`, find the Follow-On section line `- review and agent scopes (new policy branches on the existing enum/switch).` and strike-through + annotate (mirrors Slice 6's "Milestone pre-mortems… — shipped in Slice 6" pattern):

```markdown
- ~~`review` and `agent` scopes (new policy branches on the existing enum/switch).~~ — shipped in Slice 7 ([`2026-05-18-cadence-context-packets-review-agent-design.md`](2026-05-18-cadence-context-packets-review-agent-design.md)).
```

Also grep for any other `review.+agent` or `agent.+scope` forward-refs in Slice 4b export design or Slice 6 pre-mortem design and reconcile the same way. From the spec: Decision-Log notes the reconciliation in Slice 6's design references "context-packet `review`/`agent` scopes" as next slice — that forward-ref should also be marked shipped.

```bash
grep -rn "review.*agent\|review/agent\|agent.*scope" docs/superpowers/specs/ | grep -v 2026-05-18-cadence-context-packets-review-agent-design
```

Reconcile every hit.

- [ ] **Step 4: Final full done-bar gate (the slice's done-bar)**

```bash
pnpm turbo run lint typecheck test build
```

Expected: 16/16 successful; `@cadence/core` test count = 609 (prior) + new Slice-7 tests; `@cadence/types` test count = prior + 5 new.

- [ ] **Step 5: Commit**

```bash
git add docs/reference/commands.md CHANGELOG.md docs/superpowers/specs/2026-05-17-cadence-context-packets-design.md
git commit -m "$(cat <<'EOF'
docs: document context review + agent + reconcile Slice-5 follow-ref (Slice 7)

- Extends docs/reference/commands.md ### context section to four scopes
  (usage line, behavior prose, TOP_N list).
- CHANGELOG Unreleased → Added: one-liner for Slice 7.
- Slice-5 design Follow-On: strike + annotate the now-shipped review/agent
  forward-ref (mirrors Slice-6's pre-mortem reconciliation pattern).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Verify slice complete + push**

```bash
git log --oneline -8
git status --short --branch
pnpm turbo run lint typecheck test build  # one final sanity run
git push
```

`git push` is user-gated by the Praxis workstream rules (memory: `project_praxis_layer.md`) — confirm with user before executing if they have not already authorized. The pre-push hook runs the full gate; let it run. If it fails: stop, don't bypass with `--no-verify`, and report.

After push: update `project_praxis_layer.md` memory entry to:
- Move Slice 7 into the shipped-slices list (mirror the existing entries' shape).
- Update the "NEXT SLICE" to whatever the design Follow-On now lists at the top (likely the assumption/decision intake command, or rec↔phase linkage).
- Update branch HEAD sha + PR #9 commit count.

Then write a SESSION handoff doc via the project's `/handoff` command per convention.

---

## Slice-level success criteria

Every AC from the spec passes:

- AC-1: ContextScopeZ + ContextPacketZ types (Task 1)
- AC-2: review synth (Task 2)
- AC-3: agent synth + filter precision (Task 3)
- AC-4: render branches (Task 5)
- AC-5: phase/handoff byte-stability (Task 4)
- AC-6: graceful + zero-match (Tasks 2 + 3)
- AC-7: IO + CLI (Task 6)

Done-bar passes on every task. Branch HEAD pushes clean. PR #9 stays draft + unmerged.
