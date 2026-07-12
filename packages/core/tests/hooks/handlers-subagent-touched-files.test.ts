import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { HookDispatcher } from '../../src/hooks/dispatcher.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedBaseline(root: string, agentId: string): Promise<void> {
  const statePath = join(root, '.cadence/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.session.subagentBaselines[agentId] = {
    startedAt: '2026-07-06T00:00:00.000Z',
    taskStatuses: { T1: 'DONE' },
    touchedFiles: [],
  };
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

describe('handlePostToolEdit per-agent touched-file accumulation', () => {
  it('appends ctx.raw.files into the matching baseline.touchedFiles', async () => {
    active = await tempRepo({ initialized: true });
    await seedBaseline(active.root, 'agent-1');
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('post-tool-edit', {
      event: 'post-tool-edit',
      cwd: active.root,
      agentId: 'agent-1',
      raw: { files: ['src/a.ts'] },
    });
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentBaselines['agent-1'].touchedFiles).toEqual(['src/a.ts']);
  });

  it('dedups repeated files across multiple edits', async () => {
    active = await tempRepo({ initialized: true });
    await seedBaseline(active.root, 'agent-1');
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('post-tool-edit', {
      event: 'post-tool-edit',
      cwd: active.root,
      agentId: 'agent-1',
      raw: { files: ['src/a.ts'] },
    });
    await dispatcher.dispatch('post-tool-edit', {
      event: 'post-tool-edit',
      cwd: active.root,
      agentId: 'agent-1',
      raw: { files: ['src/a.ts', 'src/b.ts'] },
    });
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentBaselines['agent-1'].touchedFiles.sort()).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
  });

  it('does nothing when ctx.agentId has no matching baseline', async () => {
    active = await tempRepo({ initialized: true });
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('post-tool-edit', {
      event: 'post-tool-edit',
      cwd: active.root,
      agentId: 'agent-unknown',
      raw: { files: ['src/a.ts'] },
    });
    expect(result.ok).toBe(true);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentBaselines).toEqual({});
  });

  it('leaves the existing main-thread activeTask.touchedFiles behavior unchanged (regression)', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activeTask = { id: 'T1', status: 'IN_PROGRESS', touchedFiles: [] };
    await writeFile(statePath, JSON.stringify(state, null, 2));
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('post-tool-edit', {
      event: 'post-tool-edit',
      cwd: active.root,
      raw: { files: ['src/main-thread.ts'] },
    });
    const after = JSON.parse(await readFile(statePath, 'utf8'));
    expect(after.activeTask.touchedFiles).toEqual(['src/main-thread.ts']);
  });

  it('does not false-positive a state conflict when both activeTask and a subagent baseline are touched in one dispatch (AC-3, regression)', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activeTask = { id: 'T1', status: 'IN_PROGRESS', touchedFiles: [] };
    state.session.subagentBaselines['agent-1'] = {
      startedAt: '2026-07-06T00:00:00.000Z',
      taskStatuses: { T1: 'DONE' },
      touchedFiles: [],
    };
    await writeFile(statePath, JSON.stringify(state, null, 2));

    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('post-tool-edit', {
      event: 'post-tool-edit',
      cwd: active.root,
      agentId: 'agent-1',
      raw: { files: ['src/a.ts'] },
    });

    expect(result.ok).toBe(true);
    const after = JSON.parse(await readFile(statePath, 'utf8'));
    expect(after.activeTask.touchedFiles).toEqual(['src/a.ts']);
    expect(after.session.subagentBaselines['agent-1'].touchedFiles).toEqual(['src/a.ts']);
    expect(after.revision).toBe(2); // both sequential commits inside this one dispatch succeeded
  });
});
