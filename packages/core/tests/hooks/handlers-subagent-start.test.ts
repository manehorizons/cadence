import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { HookDispatcher } from '../../src/hooks/dispatcher.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedActiveDraft(root: string): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  const draftMd = `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: APPROVED\n---\n\n# 01-01 — Demo\n\n## Objective\n\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: Demo\nGiven setup\nWhen action\nThen outcome\n\n## Tasks\n\n### T1: done thing\n- files: \`src/a.ts\`\n- action: do\n- verify: vitest\n- done: AC-1\n\n### T2: pending thing\n- files: \`src/b.ts\`\n- action: do\n- verify: vitest\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;
  await writeFile(join(phaseDir, '01-01-DRAFT.md'), draftMd);
  await writeFile(
    join(phaseDir, '01-01-PROGRESS.json'),
    JSON.stringify(
      { draftId: '01-01', tasks: { T1: { status: 'DONE', notes: '', touchedFiles: [], updatedAt: '2026-07-01T00:00:00.000Z' } } },
      null,
      2,
    ),
  );
  const statePath = join(root, '.cadence/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.activePhase = '01-foundation';
  state.activeDraft = '01-01';
  state.loopPosition = 'BUILD';
  state.tier = 'standard';
  state.openDrafts = [{ id: '01-01', since: new Date().toISOString() }];
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

describe('handleSubagentStart', () => {
  it('snapshots the task board into state.session.subagentBaselines, keyed by agentId', async () => {
    active = await tempRepo({ initialized: true });
    await seedActiveDraft(active.root);
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('subagent-start', {
      event: 'subagent-start',
      cwd: active.root,
      agentId: 'agent-1',
      agentType: 'general-purpose',
    });
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentBaselines['agent-1'].taskStatuses).toEqual({
      T1: 'DONE',
      T2: 'PENDING',
    });
    expect(state.session.subagentBaselines['agent-1'].touchedFiles).toEqual([]);
    expect(typeof state.session.subagentBaselines['agent-1'].startedAt).toBe('string');
  });

  it('returns a contextPayload nudge naming the already-finished task', async () => {
    active = await tempRepo({ initialized: true });
    await seedActiveDraft(active.root);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('subagent-start', {
      event: 'subagent-start',
      cwd: active.root,
      agentId: 'agent-1',
    });
    expect(result.ok).toBe(true);
    expect(result.contextPayload).toContain('T1');
    expect(result.contextPayload).toContain('DONE');
  });

  it('does nothing (no baseline, no throw) when ctx.agentId is absent', async () => {
    active = await tempRepo({ initialized: true });
    await seedActiveDraft(active.root);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('subagent-start', {
      event: 'subagent-start',
      cwd: active.root,
    });
    expect(result.ok).toBe(true);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentBaselines).toEqual({});
  });

  it('does nothing when there is no active draft', async () => {
    active = await tempRepo({ initialized: true });
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('subagent-start', {
      event: 'subagent-start',
      cwd: active.root,
      agentId: 'agent-1',
    });
    expect(result.ok).toBe(true);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentBaselines).toEqual({});
  });

  it('fails open (no throw, no baseline written) on a malformed DRAFT.md', async () => {
    active = await tempRepo({ initialized: true });
    const phaseDir = join(active.root, '.cadence/phases/01-foundation');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '01-01-DRAFT.md'), '{ not really markdown }');
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activePhase = '01-foundation';
    state.activeDraft = '01-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    state.openDrafts = [{ id: '01-01', since: new Date().toISOString() }];
    await writeFile(statePath, JSON.stringify(state, null, 2));

    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('subagent-start', {
      event: 'subagent-start',
      cwd: active.root,
      agentId: 'agent-1',
    });
    expect(result.ok).toBe(true);
  });
});
