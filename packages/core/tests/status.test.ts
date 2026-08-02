import { describe, it, expect, afterEach } from 'vitest';
import type { Draft } from '@thomas-powers-jr/cadence-types';
import { emptyState } from '@thomas-powers-jr/cadence-types';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  deriveAcResults,
  gatherStatus,
  loadStatus,
  renderStatus,
  type ProgressFile,
} from '../src/status.js';

const baseDraft: Draft = {
  schemaVersion: 1,
  id: '05-01',
  phase: '05-status-command',
  tier: 'standard',
  title: 'cadence status — single-screen phase context',
  objective: 'Render loop state in one view',
  acceptanceCriteria: [
    { id: 'AC-1', given: '', when: '', then: '' },
    { id: 'AC-2', given: '', when: '', then: '' },
    { id: 'AC-3', given: '', when: '', then: '' },
  ],
  tasks: [
    { id: 'T1', name: 'first', files: [], action: '', verify: '', done: 'AC-1' },
    { id: 'T2', name: 'second', files: [], action: '', verify: '', done: 'AC-1, AC-2' },
    { id: 'T3', name: 'third', files: [], action: '', verify: '', done: 'AC-3' },
  ],
  boundaries: [],
  status: 'APPROVED',
};

function progress(taskMap: Record<string, string>): ProgressFile {
  return {
    draftId: '05-01',
    tasks: Object.fromEntries(
      Object.entries(taskMap).map(([id, status]) => [
        id,
        { status, notes: '', touchedFiles: [], updatedAt: '2026-05-14T00:00:00Z' },
      ]),
    ),
  };
}

describe('gatherStatus', () => {
  it('IDLE state → no draft body, next-action present', () => {
    const state = emptyState('demo');
    const r = gatherStatus(state, null, null);
    expect(r.project).toBe('demo');
    expect(r.loopPosition).toBe('IDLE');
    expect(r.activePhase).toBeNull();
    expect(r.tasks).toEqual([]);
    expect(r.acs).toEqual([]);
    expect(r.next.command).toMatch(/cadence draft new/);
  });

  // AC-3 (phase 206): `next` is deliberately narrowed to {command, reason} —
  // nextAction()'s new legalMoves[] (phase 206 T1) is `cadence next`'s
  // surface, not `status`'s. Mirrors the identical narrowing already pinned
  // for services/progress.ts and quickstart/build.ts.
  it('AC-3 (phase 206): next field is exactly {command, reason}, no legalMoves leak', () => {
    const state = emptyState('demo');
    const r = gatherStatus(state, null, null);
    expect(Object.keys(r.next).sort()).toEqual(['command', 'reason']);
  });

  it('BUILD with no PROGRESS.json — all tasks PENDING, all ACs pending', () => {
    const state = emptyState('demo');
    state.activePhase = '05-status-command';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const r = gatherStatus(state, baseDraft, null);
    expect(r.activeDraft).toBe('05-01');
    expect(r.draftTitle).toContain('cadence status');
    expect(r.tasks).toHaveLength(3);
    for (const t of r.tasks) expect(t.status).toBe('PENDING');
    for (const ac of r.acs) expect(ac.state).toBe('pending');
  });

  it('mixed task statuses — AC pass requires all linked tasks DONE', () => {
    const state = emptyState('demo');
    state.activePhase = '05-status-command';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const r = gatherStatus(state, baseDraft, progress({ T1: 'DONE', T2: 'DONE', T3: 'PENDING' }));
    const ac1 = r.acs.find((a) => a.id === 'AC-1');
    const ac2 = r.acs.find((a) => a.id === 'AC-2');
    const ac3 = r.acs.find((a) => a.id === 'AC-3');
    // AC-1 satisfied by T1 + T2 (both DONE)
    expect(ac1?.state).toBe('pass');
    // AC-2 satisfied by T2 (DONE)
    expect(ac2?.state).toBe('pass');
    // AC-3 satisfied by T3 (PENDING)
    expect(ac3?.state).toBe('pending');
  });

  it('BLOCKED task blocks every linked AC', () => {
    const state = emptyState('demo');
    state.activePhase = '05-status-command';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const r = gatherStatus(state, baseDraft, progress({ T1: 'DONE', T2: 'BLOCKED', T3: 'DONE' }));
    expect(r.acs.find((a) => a.id === 'AC-1')?.state).toBe('blocked');
    expect(r.acs.find((a) => a.id === 'AC-2')?.state).toBe('blocked');
    expect(r.acs.find((a) => a.id === 'AC-3')?.state).toBe('pass');
  });

  it('NEEDS_CONTEXT yields a distinct needs-context AC state', () => {
    const state = emptyState('demo');
    state.activePhase = '05-status-command';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const r = gatherStatus(state, baseDraft, progress({ T1: 'NEEDS_CONTEXT' }));
    expect(r.acs.find((a) => a.id === 'AC-1')?.state).toBe('needs-context');
  });

  it('BLOCKED beats NEEDS_CONTEXT when both link to the same AC', () => {
    // AC-1 linked to both T1 and T2; T1 BLOCKED, T2 NEEDS_CONTEXT.
    const state = emptyState('demo');
    state.activePhase = '05-status-command';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const mixedDraft: Draft = {
      ...baseDraft,
      tasks: [
        { id: 'T1', name: 'first', files: [], action: '', verify: '', done: 'AC-1' },
        { id: 'T2', name: 'second', files: [], action: '', verify: '', done: 'AC-1' },
      ],
    };
    const r = gatherStatus(state, mixedDraft, progress({ T1: 'BLOCKED', T2: 'NEEDS_CONTEXT' }));
    expect(r.acs.find((a) => a.id === 'AC-1')?.state).toBe('blocked');
  });

  it('all DONE → every AC pass', () => {
    const state = emptyState('demo');
    state.activePhase = '05-status-command';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const r = gatherStatus(state, baseDraft, progress({ T1: 'DONE', T2: 'DONE', T3: 'DONE' }));
    for (const ac of r.acs) expect(ac.state).toBe('pass');
  });

  it('task acs[] derived from "done" field (comma-separated AC refs)', () => {
    const state = emptyState('demo');
    state.activePhase = '05-status-command';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const r = gatherStatus(state, baseDraft, null);
    expect(r.tasks.find((t) => t.id === 'T2')?.acs).toEqual(['AC-1', 'AC-2']);
  });

  it('next action surfaced from progress.nextAction', () => {
    const state = emptyState('demo');
    state.activePhase = 'p';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    const r = gatherStatus(state, baseDraft, null);
    expect(r.next.command).toMatch(/cadence build|cadence settle/);
  });
});

const SAMPLE_DRAFT_MD = `---
phase: 99-sample
id: 99-01
tier: standard
status: APPROVED
---

# 99-01 — sample title

## Objective

Sample objective.

## Acceptance Criteria

### AC-1: first
Given a
When b
Then c

### AC-2: second
Given a
When b
Then c

## Tasks

### T1: alpha
- files: \`x.ts\`
- action: do
- verify: check
- done: AC-1

### T2: beta
- files: \`y.ts\`
- action: do
- verify: check
- done: AC-2

## Boundaries

- DO NOT change anything
`;

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('deriveAcResults', () => {
  it('all linked tasks DONE → every AC pass with no blockers', () => {
    const results = deriveAcResults(baseDraft, progress({ T1: 'DONE', T2: 'DONE', T3: 'DONE' }));
    expect(results).toEqual([
      { id: 'AC-1', verdict: 'pass', blockers: [] },
      { id: 'AC-2', verdict: 'pass', blockers: [] },
      { id: 'AC-3', verdict: 'pass', blockers: [] },
    ]);
  });

  it('BLOCKED task → linked ACs report blocked with task id', () => {
    const results = deriveAcResults(baseDraft, progress({ T1: 'DONE', T2: 'BLOCKED', T3: 'DONE' }));
    const ac1 = results.find((a) => a.id === 'AC-1');
    expect(ac1?.verdict).toBe('blocked');
    expect(ac1?.blockers).toEqual(['T2']);
    const ac2 = results.find((a) => a.id === 'AC-2');
    expect(ac2?.verdict).toBe('blocked');
    expect(ac2?.blockers).toEqual(['T2']);
    expect(results.find((a) => a.id === 'AC-3')?.verdict).toBe('pass');
  });

  it('PENDING task → linked AC pending with task id in blockers', () => {
    const results = deriveAcResults(baseDraft, progress({ T1: 'DONE', T2: 'DONE' }));
    const ac3 = results.find((a) => a.id === 'AC-3');
    expect(ac3?.verdict).toBe('pending');
    expect(ac3?.blockers).toEqual(['T3']);
  });

  it('NEEDS_CONTEXT yields a needs-context verdict (not blocked)', () => {
    const results = deriveAcResults(baseDraft, progress({ T1: 'NEEDS_CONTEXT' }));
    const ac1 = results.find((a) => a.id === 'AC-1');
    expect(ac1?.verdict).toBe('needs-context');
    expect(ac1?.blockers).toEqual(['T1']);
  });

  it('BLOCKED + NEEDS_CONTEXT on one AC → blocked verdict with both task ids', () => {
    const mixedDraft: Draft = {
      ...baseDraft,
      tasks: [
        { id: 'T1', name: 'first', files: [], action: '', verify: '', done: 'AC-1' },
        { id: 'T2', name: 'second', files: [], action: '', verify: '', done: 'AC-1' },
      ],
    };
    const results = deriveAcResults(mixedDraft, progress({ T1: 'BLOCKED', T2: 'NEEDS_CONTEXT' }));
    const ac1 = results.find((a) => a.id === 'AC-1');
    expect(ac1?.verdict).toBe('blocked');
    expect(ac1?.blockers.sort()).toEqual(['T1', 'T2']);
  });

  it('AC with no linked tasks → pending with empty blockers', () => {
    const orphanDraft: Draft = {
      ...baseDraft,
      acceptanceCriteria: [
        ...baseDraft.acceptanceCriteria,
        { id: 'AC-4', given: '', when: '', then: '' },
      ],
    };
    const results = deriveAcResults(orphanDraft, progress({ T1: 'DONE', T2: 'DONE', T3: 'DONE' }));
    const ac4 = results.find((a) => a.id === 'AC-4');
    expect(ac4?.verdict).toBe('pending');
    expect(ac4?.blockers).toEqual([]);
  });

  it('null progress treated as everything PENDING', () => {
    const results = deriveAcResults(baseDraft, null);
    for (const r of results) {
      expect(r.verdict).toBe('pending');
      expect(r.blockers.length).toBeGreaterThan(0);
    }
  });
});

describe('renderStatus', () => {
  it('IDLE: header + next-action only, no tables', () => {
    const state = emptyState('demo');
    const out = renderStatus(gatherStatus(state, null, null));
    expect(out).toMatch(/CADENCE — demo/);
    expect(out).toMatch(/loop:\s+IDLE/);
    expect(out).toMatch(/NEXT: cadence draft new/);
    expect(out).not.toMatch(/TASKS/);
    expect(out).not.toMatch(/ACS/);
  });

  it('BUILD: shows phase, draft, tier, tasks, ACs, next', () => {
    const state = emptyState('demo');
    state.activePhase = '05-status-command';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const out = renderStatus(
      gatherStatus(state, baseDraft, progress({ T1: 'DONE', T2: 'PENDING' })),
    );
    expect(out).toMatch(/phase: 05-status-command/);
    expect(out).toMatch(/draft: 05-01/);
    expect(out).toMatch(/tier:\s+standard/);
    expect(out).toMatch(/TASKS/);
    expect(out).toMatch(/T1\s+DONE/);
    expect(out).toMatch(/T2\s+PENDING/);
    expect(out).toMatch(/ACS/);
    expect(out).toMatch(/\[\s\]\sAC-1\s+pending/); // pending because T2 still PENDING
  });

  it('renders blocked AC with [!]', () => {
    const state = emptyState('demo');
    state.activePhase = 'p';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const out = renderStatus(
      gatherStatus(state, baseDraft, progress({ T2: 'BLOCKED' })),
    );
    expect(out).toMatch(/\[!\]\sAC-1\s+blocked/);
  });

  it('renders needs-context AC with [?]', () => {
    const state = emptyState('demo');
    state.activePhase = 'p';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const out = renderStatus(
      gatherStatus(state, baseDraft, progress({ T1: 'NEEDS_CONTEXT' })),
    );
    expect(out).toMatch(/\[\?\]\sAC-1\s+needs-context/);
  });

  it('renders passing AC with [x]', () => {
    const state = emptyState('demo');
    state.activePhase = 'p';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const out = renderStatus(
      gatherStatus(state, baseDraft, progress({ T1: 'DONE', T2: 'DONE', T3: 'DONE' })),
    );
    expect(out).toMatch(/\[x\]\sAC-1\s+pass/);
    expect(out).toMatch(/\[x\]\sAC-2\s+pass/);
    expect(out).toMatch(/\[x\]\sAC-3\s+pass/);
  });
});

describe('loadStatus', () => {
  it('IDLE fresh repo → minimal report', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fresh' });
    const r = await loadStatus(active.root);
    expect(r.project).toBe('fresh');
    expect(r.loopPosition).toBe('IDLE');
    expect(r.tasks).toEqual([]);
  });

  it('BUILD with draft on disk + no PROGRESS → all PENDING', async () => {
    active = await tempRepo({ initialized: true, projectName: 'on-disk' });
    const phaseDir = join(active.root, '.cadence/phases/99-sample');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '99-01-DRAFT.md'), SAMPLE_DRAFT_MD, 'utf8');
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activePhase = '99-sample';
    state.activeDraft = '99-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    await writeFile(statePath, JSON.stringify(state, null, 2));

    const r = await loadStatus(active.root);
    expect(r.activeDraft).toBe('99-01');
    expect(r.draftTitle).toContain('sample title');
    expect(r.tasks.map((t) => t.id)).toEqual(['T1', 'T2']);
    for (const t of r.tasks) expect(t.status).toBe('PENDING');
  });

  it('reads PROGRESS.json when present', async () => {
    active = await tempRepo({ initialized: true });
    const phaseDir = join(active.root, '.cadence/phases/99-sample');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '99-01-DRAFT.md'), SAMPLE_DRAFT_MD, 'utf8');
    await writeFile(
      join(phaseDir, '99-01-PROGRESS.json'),
      JSON.stringify({
        draftId: '99-01',
        tasks: {
          T1: { status: 'DONE', notes: '', touchedFiles: [], updatedAt: 'now' },
        },
      }),
    );
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activePhase = '99-sample';
    state.activeDraft = '99-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    await writeFile(statePath, JSON.stringify(state, null, 2));

    const r = await loadStatus(active.root);
    expect(r.tasks.find((t) => t.id === 'T1')?.status).toBe('DONE');
    expect(r.tasks.find((t) => t.id === 'T2')?.status).toBe('PENDING');
    expect(r.acs.find((a) => a.id === 'AC-1')?.state).toBe('pass');
    expect(r.acs.find((a) => a.id === 'AC-2')?.state).toBe('pending');
  });

  it('missing DRAFT.md is tolerated (degrades to no-draft report)', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activePhase = 'no-such';
    state.activeDraft = '99-01';
    state.loopPosition = 'BUILD';
    await writeFile(statePath, JSON.stringify(state, null, 2));
    const r = await loadStatus(active.root);
    expect(r.draftTitle).toBeNull();
    expect(r.tasks).toEqual([]);
  });

  it('reports the active profile (defaults to auto when nothing set)', async () => {
    active = await tempRepo({ initialized: true });
    const r = await loadStatus(active.root);
    expect(r.profile).toBe('auto');
  });

  it('renderStatus emits a profile header line', () => {
    const state = emptyState('demo');
    state.activePhase = 'p';
    state.activeDraft = '01-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const out = renderStatus(gatherStatus(state, null, null, { profile: 'strict' }));
    expect(out).toMatch(/profile:\s+strict/);
  });

  it('DRAFT frontmatter profile override beats config default', () => {
    const state = emptyState('demo');
    state.activePhase = '05-status-command';
    state.activeDraft = '05-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    const draftWithOverride = { ...baseDraft, profile: 'strict' as const };
    const r = gatherStatus(state, draftWithOverride, null, { profile: 'auto' });
    expect(r.profile).toBe('strict');
  });
});
