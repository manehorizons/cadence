import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

async function patchConfig(root: string, patch: Record<string, unknown>): Promise<void> {
  const path = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...cfg, ...patch }, null, 2));
}

async function seedDraftAndBaseline(
  root: string,
  agentId: string,
  touchedFiles: string[],
): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  const draftMd = `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: APPROVED\n---\n\n# 01-01 — Demo\n\n## Objective\n\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: Demo\nGiven setup\nWhen action\nThen outcome\n\n## Tasks\n\n### T1: done thing\n- files: \`src/a.ts\`\n- action: do\n- verify: vitest\n- done: AC-1\n\n### T2: pending thing\n- files: \`src/b.ts\`\n- action: do\n- verify: vitest\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;
  await writeFile(join(phaseDir, '01-01-DRAFT.md'), draftMd);
  const statePath = join(root, '.cadence/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.activePhase = '01-foundation';
  state.activeDraft = '01-01';
  state.loopPosition = 'BUILD';
  state.tier = 'standard';
  state.openDrafts = [{ id: '01-01', since: new Date().toISOString() }];
  state.session.subagentBaselines[agentId] = {
    startedAt: '2026-07-06T00:00:00.000Z',
    taskStatuses: { T1: 'DONE', T2: 'PENDING' },
    touchedFiles,
  };
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function readEvents(root: string): Promise<Array<{ type: string; context: Record<string, unknown> }>> {
  const path = join(root, '.cadence/anomalies.log');
  if (!existsSync(path)) return [];
  return (await readFile(path, 'utf8'))
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

describe('handleSubagentResult safety net (warn mode, default)', () => {
  it('emits redundant-task-work for a touched file owned by a baseline-DONE task', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    await seedDraftAndBaseline(active.root, 'agent-1', ['src/a.ts']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('subagent-result', {
      event: 'subagent-result',
      cwd: active.root,
      agentId: 'agent-1',
    });
    expect(result.ok).toBe(true);
    const events = await readEvents(active.root);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('redundant-task-work');
    expect(events[0]!.context).toMatchObject({ taskId: 'T1', status: 'DONE' });
  });

  it('does not flag a touched file owned by a baseline-PENDING task', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    await seedDraftAndBaseline(active.root, 'agent-1', ['src/b.ts']);
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('subagent-result', {
      event: 'subagent-result',
      cwd: active.root,
      agentId: 'agent-1',
    });
    expect(await readEvents(active.root)).toEqual([]);
  });

  it('still increments subagentSpawns', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraftAndBaseline(active.root, 'agent-1', []);
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('subagent-result', {
      event: 'subagent-result',
      cwd: active.root,
      agentId: 'agent-1',
    });
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentSpawns).toBe(1);
  });

  it('prunes the baseline entry after checking, regardless of outcome', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraftAndBaseline(active.root, 'agent-1', ['src/a.ts']);
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('subagent-result', {
      event: 'subagent-result',
      cwd: active.root,
      agentId: 'agent-1',
    });
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentBaselines).toEqual({});
  });
});

describe('handleSubagentResult safety net (block mode)', () => {
  it('hard-blocks the stop (ok:false) naming the task and status', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { redundantWorkEnforcement: 'block' });
    await seedDraftAndBaseline(active.root, 'agent-1', ['src/a.ts']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('subagent-result', {
      event: 'subagent-result',
      cwd: active.root,
      agentId: 'agent-1',
    });
    expect(result.ok).toBe(false);
    expect(result.blockMessage).toContain('T1');
    expect(result.blockMessage).toContain('DONE');
  });
});

describe('handleSubagentResult safety net (fail-open / no-op cases)', () => {
  it('does nothing extra when ctx.agentId is absent (legacy SubagentStop path)', async () => {
    active = await tempRepo({ initialized: true });
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('subagent-result', {
      event: 'subagent-result',
      cwd: active.root,
    });
    expect(result.ok).toBe(true);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentSpawns).toBe(1);
  });

  it('does nothing extra when there is no baseline for this agentId', async () => {
    active = await tempRepo({ initialized: true });
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('subagent-result', {
      event: 'subagent-result',
      cwd: active.root,
      agentId: 'agent-unknown',
    });
    expect(result.ok).toBe(true);
  });

  it('fails open when the DRAFT.md is missing (baseline still pruned)', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activePhase = '01-foundation';
    state.activeDraft = '01-01';
    state.session.subagentBaselines['agent-1'] = {
      startedAt: '2026-07-06T00:00:00.000Z',
      taskStatuses: {},
      touchedFiles: ['src/a.ts'],
    };
    await writeFile(statePath, JSON.stringify(state, null, 2));
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('subagent-result', {
      event: 'subagent-result',
      cwd: active.root,
      agentId: 'agent-1',
    });
    expect(result.ok).toBe(true);
    const after = JSON.parse(await readFile(statePath, 'utf8'));
    expect(after.session.subagentBaselines).toEqual({});
  });
});
