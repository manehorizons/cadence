# CADENCE Milestone Export — SPEC Draft Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cadence milestone export <id> --to cadence` — render a deterministic CADENCE SPEC scaffold from an `accepted` milestone, write it to a Praxis-owned staging path, append one `exportTarget`, and flip the milestone `accepted → exported`; never touches loop state.

**Architecture:** Slice 4b, mirroring shipped slices. Extend the Slice-2 `PraxisBackend` interface with its first write method `renderSpecDraft` (pure; the `cadence` impl owns the SPEC.md format). Thin IO glue `runMilestoneExport` in `intelligence/milestone.ts` (read ledgers → validate `accepted` → render → write staged SPEC → update milestone ledger). A 5th subcommand on the existing Slice-4a `cadence milestone` parent. No `@cadence/types` schema change (4a's `IntelligenceMilestone` already carries `status:'exported'` + `exportTargets`).

**Tech Stack:** TypeScript, Zod, Commander, Vitest, existing `atomicWriteText`, `@cadence/testkit` `tempRepo`, the shipped `store.ts` ledger IO + `parse/spec-parser.ts` (`parseSpecMd`) for the round-trip guard.

**Spec:** `docs/superpowers/specs/2026-05-17-cadence-milestone-export-design.md`

---

## Spec elaboration (faithful, not a scope change)

1. **No schema task.** Slice 4a's `IntelligenceMilestoneZ` already has `status` (incl. `'exported'`) and `exportTargets: Array<{backend:'cadence';artifactPath:string;exportedAt:datetime}>`. 4b only *populates* them. No `@cadence/types` edit; no Task for it.

2. **`renderSpecDraft` takes an id+title projection, not the full `Recommendation`.** Design §3 refinement (Decision 7): the scaffold needs only `id`+`title`; the glue resolves `recommendationIds` against the recommendation ledger and passes `byId.get(rid) ?? {id:rid,title:rid}` so the backend is decoupled from the rec schema and from unresolved-id handling. Signature: `renderSpecDraft(milestone: IntelligenceMilestone, recs: ReadonlyArray<Pick<Recommendation,'id'|'title'>>): string`.

3. **`applyTransition` is NOT touched.** Export is a separate glue (`runMilestoneExport`) because it has an artifact side-effect + metadata, not a pure status flip (Decision 8). `TransitionAction`/`applyTransition` stay `'accept'|'defer'` only.

4. **Operator note placement is parser-verified.** `parse/spec-parser.ts`: `FRONTMATTER_RE = /^---\n…\n---\n/` requires frontmatter at byte 0 (note CANNOT precede it); `extractSection` only reads `## ` sections, so the H1 + a `>` blockquote between H1 and `## Objective` are invisible to `parseSpecMd`/`cadence spec check` yet visible to a human. `id:00-00` passes `SpecZ` `^\d{2}-\d{2}$`; `phase:<milestone.id>` passes `z.string()`. The round-trip guard test pins this against the real parser.

5. **No import cycle.** `milestone.ts` will import `cadenceBackend` from `./backend/cadence.js`. `backend/cadence.ts` imports only `../../state/simple.js`, `../../progress.js`, `@cadence/types` — it imports neither `milestone.ts` nor `store.ts`. Graph stays acyclic: `milestone.ts → {store.ts, backend/cadence.ts}`; `store.ts → render-milestone.ts`; `backend/cadence.ts → state/simple, progress`.

## File Structure

- Modify: `packages/core/src/intelligence/backend/cadence.ts` (extend `PraxisBackend` interface + add `renderSpecDraft` to `cadenceBackend`)
- Test: `packages/core/tests/intelligence/backend-cadence.test.ts` (extend — pure render + parseSpecMd round-trip)
- Modify: `packages/core/src/intelligence/milestone.ts` (append `ExportResult` + `runMilestoneExport` glue + value imports)
- Test: `packages/core/tests/intelligence/milestone.test.ts` (extend — `runMilestoneExport` integration)
- Modify: `packages/core/src/cli/commands/milestone.ts` (add `export` subcommand)
- Test: `packages/core/tests/cli/milestone.test.ts` (extend — spawned-CLI export)
- Modify: `docs/reference/commands.md` (`### milestone` Subcommands table + behavior sentence)
- Modify: `CHANGELOG.md` (Unreleased → Added)

## Storage Contract

- Staged SPEC: `.cadence/intelligence/exports/<milestone-id>/SPEC.md` (repo-relative; the recorded `exportTarget.artifactPath`)
- Milestone ledger update via the existing `writeMilestoneLedger` (Zod + atomic JSON + MILESTONES.md re-render). Never `.cadence/phases/`, never `state.json`, never `.synth/`.

## Commit Convention

Plan-doc-first (this file committed before task code), then per-task `feat`/`test`/`docs` commits on `praxis-intelligence-ledger`. Done-bar = full `pnpm turbo run lint typecheck test build` (Task 5) — full, not a subset (the durable 4a lesson: a subset check let a lint regression through).

---

## Task 1: `PraxisBackend.renderSpecDraft` (interface + pure cadence impl)

**Files:**
- Modify: `packages/core/src/intelligence/backend/cadence.ts`
- Test: `packages/core/tests/intelligence/backend-cadence.test.ts`

- [ ] **Step 1: Append the failing tests** to `packages/core/tests/intelligence/backend-cadence.test.ts` (merge new symbols into the existing imports — do not duplicate import lines; the file already imports `cadenceBackend`, `tempRepo`/`Fixture`, `describe/expect/it/afterEach`):

```ts
// add to imports:
//   import type { IntelligenceMilestone } from '@cadence/types';
//   import { parseSpecMd } from '../../src/parse/spec-parser.js';

function mkMilestone(p: Partial<IntelligenceMilestone> = {}): IntelligenceMilestone {
  return {
    id: 'mil-grp-auth',
    name: 'Auth hardening',
    objective: 'Deliver 2 recommendation(s): A; B',
    status: 'accepted',
    recommendationIds: ['rec-1', 'rec-2'],
    preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
    exportTargets: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}

describe('cadenceBackend.renderSpecDraft', () => {
  it('emits a deterministic CADENCE SPEC scaffold from milestone facts', () => {
    const md = cadenceBackend.renderSpecDraft(
      mkMilestone({
        preMortem: {
          likelyFailureModes: ['flaky thing'],
          hiddenDependencies: ['needs X first'],
          driftRisks: ['docs drift'],
          outOfScope: ['not the API'],
        },
      }),
      [
        { id: 'rec-1', title: 'First rec' },
        { id: 'rec-2', title: 'Second rec' },
      ],
    );
    expect(md.startsWith('---\nphase: mil-grp-auth\nid: 00-00\nstatus: PENDING\n---\n')).toBe(true);
    expect(md).toMatch(/# 00-00 — Auth hardening/);
    expect(md).toMatch(/> \*\*STAGED EXPORT — NOT YET IN THE LOOP\.\*\*/);
    expect(md).toMatch(/## Objective\n\nDeliver 2 recommendation\(s\): A; B\n/);
    expect(md).toMatch(/### AC-1: First rec\nGiven _\(precondition\)_\nWhen _\(action\)_\nThen _\(outcome\)_/);
    expect(md).toMatch(/### AC-2: Second rec/);
    // Constraints = driftRisks ++ outOfScope ; Open Questions = hiddenDependencies ++ likelyFailureModes
    expect(md).toMatch(/## Constraints\n\n- docs drift\n- not the API\n/);
    expect(md).toMatch(/## Open Questions\n\n- needs X first\n- flaky thing\n/);
    // deterministic
    expect(cadenceBackend.renderSpecDraft(mkMilestone(), [{ id: 'rec-1', title: 'X' }])).toBe(
      cadenceBackend.renderSpecDraft(mkMilestone(), [{ id: 'rec-1', title: 'X' }]),
    );
  });

  it('uses the bare id when a rec title is unresolved, and placeholders when preMortem empty', () => {
    const md = cadenceBackend.renderSpecDraft(
      mkMilestone({ recommendationIds: ['rec-9'] }),
      [{ id: 'rec-9', title: 'rec-9' }],
    );
    expect(md).toMatch(/### AC-1: rec-9/);
    expect(md).toMatch(/## Constraints\n\n- _\(constraint\)_\n/);
    expect(md).toMatch(/## Open Questions\n\n- _\(question\)_\n/);
  });

  it('round-trips through the real parseSpecMd and stays cadence-spec-check valid', () => {
    const md = cadenceBackend.renderSpecDraft(mkMilestone(), [
      { id: 'rec-1', title: 'First' },
      { id: 'rec-2', title: 'Second' },
    ]);
    const spec = parseSpecMd(md); // throws if SpecZ rejects
    expect(spec.id).toBe('00-00');
    expect(spec.phase).toBe('mil-grp-auth');
    expect(spec.objective).toBe('Deliver 2 recommendation(s): A; B');
    expect(spec.acceptanceCriteria.map((a) => a.id)).toEqual(['AC-1', 'AC-2']);
    expect(spec.acceptanceCriteria[0]!.name).toBe('First');
    // operator blockquote + H1 do NOT leak into any parsed section
    expect(spec.objective).not.toMatch(/STAGED EXPORT/);
    expect(spec.constraints.join(' ')).not.toMatch(/STAGED EXPORT/);
    // spec check contract: non-empty objective + >=1 AC
    expect(spec.objective.length).toBeGreaterThan(0);
    expect(spec.acceptanceCriteria.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- intelligence/backend-cadence`
Expected: FAIL — `cadenceBackend.renderSpecDraft` is not a function.

- [ ] **Step 3: Implement** in `packages/core/src/intelligence/backend/cadence.ts`:

(a) Extend the top type import. It currently is `import type { BackendStatus } from '@cadence/types';` — change to:
```ts
import type {
  BackendStatus,
  IntelligenceMilestone,
  Recommendation,
} from '@cadence/types';
```

(b) Add `renderSpecDraft` to the `PraxisBackend` interface (after `listLegalActions(root: string): Promise<string[]>;`):
```ts
  renderSpecDraft(
    milestone: IntelligenceMilestone,
    recs: ReadonlyArray<Pick<Recommendation, 'id' | 'title'>>,
  ): string;
```

(c) Add the method to the `cadenceBackend` object (after `listLegalActions`, as the last member — synchronous, pure, no IO):
```ts
  renderSpecDraft(
    milestone: IntelligenceMilestone,
    recs: ReadonlyArray<Pick<Recommendation, 'id' | 'title'>>,
  ): string {
    const lines: string[] = [
      '---',
      `phase: ${milestone.id}`,
      'id: 00-00',
      'status: PENDING',
      '---',
      '',
      `# 00-00 — ${milestone.name}`,
      '',
      '> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone',
      `> \`${milestone.id}\`. To promote: run \`cadence spec new <phase> <num>\``,
      '> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace',
      '> the scaffold body with this content and re-id the frontmatter.',
      '',
      '## Objective',
      '',
      milestone.objective,
      '',
      '## Acceptance Criteria',
      '',
    ];
    recs.forEach((r, i) => {
      lines.push(`### AC-${i + 1}: ${r.title || r.id}`);
      lines.push('Given _(precondition)_');
      lines.push('When _(action)_');
      lines.push('Then _(outcome)_');
      lines.push('');
    });
    lines.push('## Constraints', '');
    const constraints = [
      ...milestone.preMortem.driftRisks,
      ...milestone.preMortem.outOfScope,
    ];
    if (constraints.length === 0) lines.push('- _(constraint)_');
    else for (const c of constraints) lines.push(`- ${c}`);
    lines.push('');
    lines.push('## Open Questions', '');
    const questions = [
      ...milestone.preMortem.hiddenDependencies,
      ...milestone.preMortem.likelyFailureModes,
    ];
    if (questions.length === 0) lines.push('- _(question)_');
    else for (const q of questions) lines.push(`- ${q}`);
    lines.push('');
    return lines.join('\n');
  },
```

- [ ] **Step 4: Build core + run test**

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- intelligence/backend-cadence`
Expected: PASS (existing backend tests + the 3 new ones).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @cadence/core typecheck`
Expected: clean (interface gains a required member; `cadenceBackend` is the only impl — it now satisfies it; no other `PraxisBackend` implementor exists).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/intelligence/backend/cadence.ts packages/core/tests/intelligence/backend-cadence.test.ts
git commit -m "feat(core): add PraxisBackend.renderSpecDraft (cadence SPEC scaffold)"
```

---

## Task 2: `runMilestoneExport` glue

**Files:**
- Modify: `packages/core/src/intelligence/milestone.ts` (append)
- Test: `packages/core/tests/intelligence/milestone.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing test** to `packages/core/tests/intelligence/milestone.test.ts` (extend the `milestone.js` import with `runMilestoneExport`; the file already imports `mkdir`/`readFile`/`writeFile`/`join`, `tempRepo`/`Fixture`, `readMilestoneLedger`, `mkRec`, **and already defines `async function seedRecs(root, recs)` from Slice 4a Task 6 — REUSE it, do NOT re-declare it (a second `function seedRecs` is a duplicate-identifier error)**. Only the genuinely-new helpers `seedMilestones` + `mkMs` are declared below; append the `describe` block after the existing milestone describes):

```ts
// extend the milestone.js import with: runMilestoneExport
// REUSE the existing seedRecs / mkRec / readMilestoneLedger — do NOT redeclare them.

async function seedMilestones(root: string, ms: IntelligenceMilestone[]): Promise<void> {
  const dir = join(root, '.cadence', 'intelligence');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'milestones.json'),
    JSON.stringify({ schemaVersion: 1, milestones: ms }, null, 2),
  );
}
function mkMs(p: Partial<IntelligenceMilestone> & { id: string }): IntelligenceMilestone {
  return {
    name: p.id,
    objective: 'do the thing',
    status: 'accepted',
    recommendationIds: ['rec-1'],
    preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
    exportTargets: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}

describe('runMilestoneExport', () => {
  // NOTE: reuse the file's existing fixture+afterEach. If it uses a module-level
  // `let fx: Fixture | null` cleaned in afterEach, assign `fx = await tempRepo(...)`.
  // The snippet below uses a local try/finally so it is self-contained regardless.

  it('exports an accepted milestone: staged SPEC + exported status + exportTarget', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedRecs(t.root, [mkRec({ id: 'rec-1', title: 'Ship it' })]);
      await seedMilestones(t.root, [mkMs({ id: 'mil-grp-x', name: 'X', recommendationIds: ['rec-1'] })]);

      const res = await runMilestoneExport(t.root, 'mil-grp-x', new Date('2026-05-17T09:00:00.000Z'));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('unreachable');
      expect(res.artifactPath).toBe('.cadence/intelligence/exports/mil-grp-x/SPEC.md');

      const spec = await readFile(join(t.root, res.artifactPath), 'utf8');
      expect(spec).toMatch(/# 00-00 — X/);
      expect(spec).toMatch(/### AC-1: Ship it/);

      const led = await readMilestoneLedger(t.root);
      const m = led.milestones.find((x) => x.id === 'mil-grp-x')!;
      expect(m.status).toBe('exported');
      expect(m.exportTargets).toEqual([
        { backend: 'cadence', artifactPath: '.cadence/intelligence/exports/mil-grp-x/SPEC.md', exportedAt: '2026-05-17T09:00:00.000Z' },
      ]);
      expect(m.updatedAt).toBe('2026-05-17T09:00:00.000Z');
      // MILESTONES.md re-rendered with the exported one-liner
      const md = await readFile(join(t.root, '.cadence', 'intelligence', 'MILESTONES.md'), 'utf8');
      expect(md).toMatch(/## Exported\n\n- mil-grp-x — X → \.cadence\/intelligence\/exports\/mil-grp-x\/SPEC\.md/);
    } finally {
      await t.cleanup();
    }
  });

  it('tolerates an unresolved rec id (AC name = bare id)', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedMilestones(t.root, [mkMs({ id: 'mil-a', recommendationIds: ['rec-missing'] })]);
      const res = await runMilestoneExport(t.root, 'mil-a', new Date('2026-05-17T09:00:00.000Z'));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('unreachable');
      const spec = await readFile(join(t.root, res.artifactPath), 'utf8');
      expect(spec).toMatch(/### AC-1: rec-missing/);
    } finally {
      await t.cleanup();
    }
  });

  it('refuses unknown id and non-accepted status without writing', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedMilestones(t.root, [mkMs({ id: 'mil-p', status: 'proposed' })]);
      const miss = await runMilestoneExport(t.root, 'nope');
      expect(miss).toEqual({ ok: false, error: 'milestone nope not found' });
      const bad = await runMilestoneExport(t.root, 'mil-p');
      expect(bad).toEqual({ ok: false, error: 'cannot export milestone in status proposed' });
      // unchanged on disk + no staged file
      const led = await readMilestoneLedger(t.root);
      expect(led.milestones[0]!.status).toBe('proposed');
      await expect(readFile(join(t.root, '.cadence', 'intelligence', 'exports', 'mil-p', 'SPEC.md'), 'utf8')).rejects.toThrow();
    } finally {
      await t.cleanup();
    }
  });

  it('refuses re-export of an already-exported milestone', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedMilestones(t.root, [mkMs({ id: 'mil-e', status: 'exported' })]);
      const res = await runMilestoneExport(t.root, 'mil-e');
      expect(res).toEqual({ ok: false, error: 'cannot export milestone in status exported' });
    } finally {
      await t.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/milestone`
Expected: FAIL — `runMilestoneExport` is not exported.

- [ ] **Step 3: Append to** `packages/core/src/intelligence/milestone.ts`.

(a) Add value imports. The file currently has `import { readMilestoneLedger, readRecommendationLedger, writeMilestoneLedger } from './store.js';` and a `@cadence/types` type import. Add (do not duplicate existing lines):
```ts
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { atomicWriteText } from '../state/atomic-write.js';
import { cadenceBackend } from './backend/cadence.js';
```
Ensure `MilestoneLedger` is in the `@cadence/types` type import (it already is — used by `runProposeMilestones`).

(b) Append the export glue at the END of the file:
```ts
export type ExportResult =
  | { ok: true; ledger: MilestoneLedger; artifactPath: string }
  | { ok: false; error: string };

export async function runMilestoneExport(
  root: string,
  id: string,
  now: Date = new Date(),
): Promise<ExportResult> {
  const ledger = await readMilestoneLedger(root);
  const target = ledger.milestones.find((m) => m.id === id);
  if (!target) return { ok: false, error: `milestone ${id} not found` };
  if (target.status !== 'accepted') {
    return {
      ok: false,
      error: `cannot export milestone in status ${target.status}`,
    };
  }

  const allRecs = (await readRecommendationLedger(root)).recommendations;
  const byId = new Map(allRecs.map((r) => [r.id, r]));
  const recs = target.recommendationIds.map((rid) => {
    const r = byId.get(rid);
    return r ? { id: r.id, title: r.title } : { id: rid, title: rid };
  });

  const spec = cadenceBackend.renderSpecDraft(target, recs);

  const relPath = `.cadence/intelligence/exports/${target.id}/SPEC.md`;
  const absPath = join(root, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await atomicWriteText(absPath, spec);

  const ts = now.toISOString();
  const next: MilestoneLedger = {
    schemaVersion: 1,
    milestones: ledger.milestones.map((m) =>
      m.id === id
        ? {
            ...m,
            status: 'exported',
            exportTargets: [
              { backend: 'cadence', artifactPath: relPath, exportedAt: ts },
            ],
            updatedAt: ts,
          }
        : m,
    ),
  };
  await writeMilestoneLedger(root, next);
  return { ok: true, ledger: next, artifactPath: relPath };
}
```

- [ ] **Step 4: Build core + run test**

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- intelligence/milestone`
Expected: PASS.

- [ ] **Step 5: Typecheck (cycle guard)**

Run: `pnpm --filter @cadence/core typecheck`
Expected: clean. (Sanity: `backend/cadence.ts` does NOT import `milestone.ts`/`store.ts`, so `milestone.ts → backend/cadence.ts` introduces no cycle. If the build reports a require cycle, STOP and report BLOCKED.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/intelligence/milestone.ts packages/core/tests/intelligence/milestone.test.ts
git commit -m "feat(core): add runMilestoneExport (accepted → staged SPEC + exported)"
```

---

## Task 3: `cadence milestone export` CLI subcommand

**Files:**
- Modify: `packages/core/src/cli/commands/milestone.ts`
- Test: `packages/core/tests/cli/milestone.test.ts`

- [ ] **Step 1: Append the failing test** to `packages/core/tests/cli/milestone.test.ts` (append a new `it` inside the existing `describe('cadence milestone', ...)`; reuse the file's existing `run`, `seedRecs`, `active`/`afterEach`, and fs imports — do NOT redefine them; if `seedRecs` in this file does not accept arbitrary recs, add a local `seedMilestones` helper mirroring the one in milestone.test.ts):

```ts
  it('export --to cadence stages a SPEC for an accepted milestone', async () => {
    active = await tempRepo({ initialized: true });
    // seed an accepted milestone + its rec directly
    const dir = join(active.root, '.cadence', 'intelligence');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'recommendations.json'),
      JSON.stringify({ schemaVersion: 1, recommendations: [{
        id: 'rec-1', title: 'Ship it', summary: 's', source: 'manual',
        status: 'accepted', readiness: 'ready-for-milestone', priority: 'high',
        leverageScore: 5, riskScore: 2, confidence: 0.8, decayState: 'fresh',
        affectedAreas: [], affectedFiles: [], evidenceIds: [], assumptionIds: [],
        decisionIds: [], createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z',
      }] }, null, 2),
    );
    await writeFile(
      join(dir, 'milestones.json'),
      JSON.stringify({ schemaVersion: 1, milestones: [{
        id: 'mil-grp-x', name: 'X', objective: 'do it', status: 'accepted',
        recommendationIds: ['rec-1'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [], createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z',
      }] }, null, 2),
    );

    const ok = await run(['milestone', 'export', 'mil-grp-x', '--to', 'cadence'], active.root);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toMatch(/milestone mil-grp-x → exported/);
    expect(ok.stdout).toMatch(/staged SPEC: \.cadence\/intelligence\/exports\/mil-grp-x\/SPEC\.md/);
    expect(ok.stdout).toMatch(/cadence spec new/);
    const spec = await readFile(join(active.root, '.cadence', 'intelligence', 'exports', 'mil-grp-x', 'SPEC.md'), 'utf8');
    expect(spec).toMatch(/### AC-1: Ship it/);

    const bogus = await run(['milestone', 'export', 'mil-grp-x', '--to', 'bogus'], active.root);
    expect(bogus.code).toBe(1);
    expect(bogus.stderr).toMatch(/unknown backend "bogus"/);

    // already exported now → refused
    const again = await run(['milestone', 'export', 'mil-grp-x', '--to', 'cadence'], active.root);
    expect(again.code).toBe(1);
    expect(again.stderr).toMatch(/cannot export milestone in status exported/);

    // missing required --to → commander error, exit 1
    const noTo = await run(['milestone', 'export', 'mil-grp-x'], active.root);
    expect(noTo.code).toBe(1);
  });
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- cli/milestone`
Expected: FAIL — `error: unknown command 'export'` (or the assertions fail).

- [ ] **Step 3: Implement** in `packages/core/src/cli/commands/milestone.ts`:

(a) Extend the `milestone.js` import to add `runMilestoneExport`:
```ts
import {
  runMilestoneExport,
  runMilestoneTransition,
  runProposeMilestones,
} from '../../intelligence/milestone.js';
```

(b) Add the subcommand AFTER the `accept`/`defer` loop and BEFORE the `list` command (placement is cosmetic but keep it grouped with the other write/transition subcommands):
```ts
  cmd
    .command('export <id>')
    .description('Export an accepted milestone to a staged CADENCE SPEC draft')
    .requiredOption('--to <backend>', 'target backend (only "cadence")')
    .action(async (id: string, opts: { to: string }) => {
      try {
        if (opts.to !== 'cadence') {
          process.stderr.write(
            `milestone export refused: unknown backend "${opts.to}" (only "cadence")\n`,
          );
          process.exitCode = 1;
          return;
        }
        const res = await runMilestoneExport(process.cwd(), id);
        if (!res.ok) {
          process.stderr.write(`milestone export refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        process.stdout.write(
          `milestone ${id} → exported\n` +
            `staged SPEC: ${res.artifactPath}\n` +
            `promote with: cadence spec new <phase> <num>  (then paste + re-id)\n`,
        );
      } catch (err) {
        process.stderr.write(
          `milestone export failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
```

(No `register.ts` change — the `milestone` parent is already registered from Slice 4a.)

- [ ] **Step 4: Build core + run test + typecheck**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- cli/milestone
pnpm --filter @cadence/core typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cli/commands/milestone.ts packages/core/tests/cli/milestone.test.ts
git commit -m "feat(core): add cadence milestone export subcommand"
```

---

## Task 4: Documentation

**Files:**
- Modify: `docs/reference/commands.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the `export` row** to the `### milestone` **Subcommands** table in `docs/reference/commands.md` — insert immediately after the `defer <id>` row and before the `list [--json]` row:

```md
| `export <id> --to cadence` | Export an accepted milestone to a staged CADENCE SPEC draft |
```

- [ ] **Step 2: Add a behavior sentence** — in the `### milestone` **Behavior** prose, append this sentence to the end of the existing paragraph (before the `Writes:` list):

```md
`export <id> --to cadence` renders a deterministic CADENCE SPEC scaffold from an `accepted` milestone's own facts, writes it to `.cadence/intelligence/exports/<id>/SPEC.md`, records an `exportTarget`, and flips the milestone to `exported`; it **never** runs `cadence spec new`, allocates a loop id, or writes `state.json` — the staged SPEC is promoted manually by the operator. Export is refused for an unknown backend, unknown id, or any status other than `accepted` (re-export of an already-`exported` milestone is refused).
```

- [ ] **Step 3: Add the staged path to the Writes list** — in the `### milestone` `Writes:` bullet list, add a third bullet:

```md
- `.cadence/intelligence/exports/<id>/SPEC.md` (on `export`)
```

- [ ] **Step 4: Update CHANGELOG** — add to `## [Unreleased]` → `### Added` in `CHANGELOG.md`, immediately after the existing `cadence milestone propose | accept | defer | list` bullet:

```md
- Added `cadence milestone export <id> --to cadence`: renders a deterministic CADENCE SPEC scaffold from an `accepted` milestone (Objective verbatim; one Given/When/Then-stub AC per clustered recommendation; Constraints/Open-Questions seeded from the pre-mortem), writes it to the Praxis-owned `.cadence/intelligence/exports/<id>/SPEC.md`, records an `exportTarget`, and flips the milestone to `exported` — never invokes `cadence spec new`, allocates a loop id, or touches `state.json`; the operator promotes the staged SPEC manually.
```

- [ ] **Step 5: Run the docs tests**

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- docs`
Expected: PASS — `cli-reference.test.ts` is unaffected (it set-compares top-level command names; `milestone` already present, no marker-block change needed for a new subcommand); `readme-shakedown` stays green.

- [ ] **Step 6: Commit**

```bash
git add docs/reference/commands.md CHANGELOG.md
git commit -m "docs: document cadence milestone export"
```

---

## Task 5: Final verification

**Files:** none unless verification reveals a failure.

- [ ] **Step 1: Focused tests**

Run:
```bash
pnpm --filter @cadence/core test -- intelligence/backend-cadence intelligence/milestone cli/milestone docs
```
Expected: PASS.

- [ ] **Step 2: Package checks**

Run:
```bash
pnpm --filter @cadence/types typecheck
pnpm --filter @cadence/core typecheck
pnpm --filter @cadence/core build
```
Expected: PASS.

- [ ] **Step 3: Full repo gate (the real done-bar — mirrors `.githooks/pre-push`; FULL, not a subset)**

Run:
```bash
pnpm turbo run lint typecheck test build
```
Expected: PASS — 16/16 turbo tasks, 0 failed; `@cadence/core` test count rises by the new suites. Per the durable Slice-4a lesson, the done-bar is the full four-target turbo run including **lint** (a Task-6 cleanup in 4a orphaned a helper and only the full `lint` caught it). If it fails outside the touched intelligence/CLI/docs files, capture the failure and do not change unrelated code without a separate decision.

- [ ] **Step 4: Confirm git state**

Run:
```bash
git status --short --branch
git log --oneline -10
```
Expected: branch `praxis-intelligence-ledger`; clean tree (only `graphify-out/` untracked acceptable); design-doc + plan-doc + per-task `feat`/`docs` commits present. Push is user-authorized for this branch but is a separate explicit step AFTER the gate is green — do not push as part of plan execution.

---

## Follow-On (not in this slice)

- Context packets (`cadence context <scope>`); milestone pre-mortems as a first-class command.
- A promotion helper that scripts `spec new` + paste (still operator-initiated; explicitly NOT auto-transition).
- Multi-backend `renderSpecDraft` once a second backend exists.
