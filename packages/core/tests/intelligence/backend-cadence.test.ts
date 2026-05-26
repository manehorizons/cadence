import { describe, expect, it, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IntelligenceMilestone } from '@cadence/types';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { cadenceBackend } from '../../src/intelligence/backend/cadence.js';
import { parseSpecMd } from '../../src/parse/spec-parser.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadenceBackend', () => {
  it('detects an initialized repo and reports IDLE status + legal action', async () => {
    active = await tempRepo({ initialized: true, projectName: 'backend-fix' });

    expect((await cadenceBackend.detect(active.root)).present).toBe(true);

    const status = await cadenceBackend.readStatus(active.root);
    expect(status.present).toBe(true);
    expect(status.kind).toBe('cadence');
    expect(status.loopPosition).toBe('IDLE');
    expect(status.activeSpec).toBeNull();
    expect(status.tier).toBeNull();
    expect(status.stateError).toBeUndefined();

    const legal = await cadenceBackend.listLegalActions(active.root);
    expect(legal).toHaveLength(1);
    expect(legal[0]).toMatch(/cadence draft new/);

    const artifacts = await cadenceBackend.readArtifacts(active.root);
    expect(artifacts.phaseCount).toBe(0);
    expect(typeof artifacts.roadmap).toBe('boolean');
  });

  it('surfaces a corrupt state.json as stateError without throwing', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, '.cadence', 'state.json'), '{ not json', 'utf8');

    const status = await cadenceBackend.readStatus(active.root);
    expect(status.present).toBe(true);
    expect(status.stateError).toBeTruthy();
    expect(status.loopPosition).toBeUndefined();
  });

  it('reports not present when .cadence is absent', async () => {
    active = await tempRepo({ initialized: false });
    expect((await cadenceBackend.detect(active.root)).present).toBe(false);
  });
});

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
    expect(md).toMatch(/## Constraints\n\n- docs drift\n- not the API\n/);
    expect(md).toMatch(/## Open Questions\n\n- needs X first\n- flaky thing\n/);
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

  it('collapses newlines in milestone-derived strings so the round-trip stays clean', () => {
    const md = cadenceBackend.renderSpecDraft(
      mkMilestone({
        name: 'Multi\nline name',
        objective: 'obj line 1\nobj line 2',
        preMortem: {
          likelyFailureModes: [],
          hiddenDependencies: ['dep\nwith newline'],
          driftRisks: [],
          outOfScope: [],
        },
      }),
      [{ id: 'rec-1', title: 'title\nwith newline' }],
    );
    // frontmatter intact (no injected lines), H1 single line
    expect(md.startsWith('---\nphase: mil-grp-auth\nid: 00-00\nstatus: PENDING\n---\n')).toBe(true);
    expect(md).toMatch(/# 00-00 — Multi line name\n/);
    const spec = parseSpecMd(md);
    expect(spec.id).toBe('00-00');
    expect(spec.objective).toBe('obj line 1 obj line 2');
    expect(spec.acceptanceCriteria).toHaveLength(1);
    expect(spec.acceptanceCriteria[0]!.name).toBe('title with newline');
    // driftRisks + outOfScope empty → placeholder bullet; parseBulletList keeps it
    expect(spec.constraints).toEqual(['_(constraint)_']);
    // hiddenDependencies has one entry (collapsed), likelyFailureModes empty
    expect(spec.openQuestions).toEqual(['dep with newline']);
  });

  it('round-trips through the real parseSpecMd and stays cadence-spec-check valid', () => {
    const md = cadenceBackend.renderSpecDraft(mkMilestone(), [
      { id: 'rec-1', title: 'First' },
      { id: 'rec-2', title: 'Second' },
    ]);
    const spec = parseSpecMd(md);
    expect(spec.id).toBe('00-00');
    expect(spec.phase).toBe('mil-grp-auth');
    expect(spec.objective).toBe('Deliver 2 recommendation(s): A; B');
    expect(spec.acceptanceCriteria.map((a) => a.id)).toEqual(['AC-1', 'AC-2']);
    expect(spec.acceptanceCriteria[0]!.name).toBe('First');
    expect(spec.objective).not.toMatch(/STAGED EXPORT/);
    expect(spec.constraints.join(' ')).not.toMatch(/STAGED EXPORT/);
    expect(spec.objective.length).toBeGreaterThan(0);
    expect(spec.acceptanceCriteria.length).toBeGreaterThan(0);
  });
});
