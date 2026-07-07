import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

async function patchConfig(root: string, patch: Record<string, unknown>): Promise<void> {
  const path = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...cfg, ...patch }, null, 2));
}

async function seedActiveDraft(
  root: string,
  redundantWorkEnforcement?: 'off' | 'warn' | 'block',
): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  const overrideLine = redundantWorkEnforcement
    ? `redundantWorkEnforcement: ${redundantWorkEnforcement}\n`
    : '';
  const draftMd = `---\nphase: 01-foundation\nid: 01-01\ntier: standard\n${overrideLine}status: APPROVED\n---\n\n# 01-01 — Demo\n\n## Objective\n\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: Demo\nGiven setup\nWhen action\nThen outcome\n\n## Tasks\n\n### T1: finished thing\n- files: \`src/done.ts\`\n- action: do\n- verify: vitest\n- done: AC-1\n\n### T2: unfinished thing\n- files: \`src/pending.ts\`\n- action: do\n- verify: vitest\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;
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

async function readEvents(root: string): Promise<Array<{ type: string; context: Record<string, unknown> }>> {
  const path = join(root, '.cadence/anomalies.log');
  if (!existsSync(path)) return [];
  return (await readFile(path, 'utf8'))
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

describe('handlePreToolEdit redundant-task-work (warn mode, default)', () => {
  it('emits redundant-task-work for a file owned by a DONE task', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    await seedActiveDraft(active.root);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/done.ts'] },
    });
    expect(result.ok).toBe(true);
    const events = await readEvents(active.root);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('redundant-task-work');
    expect(events[0]!.context).toMatchObject({ file: 'src/done.ts', taskId: 'T1', status: 'DONE' });
  });

  it('does not emit for a file owned by a PENDING task', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    await seedActiveDraft(active.root);
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/pending.ts'] },
    });
    expect(await readEvents(active.root)).toEqual([]);
  });

  it('never blocks in warn mode (default)', async () => {
    active = await tempRepo({ initialized: true });
    await seedActiveDraft(active.root);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/done.ts'] },
    });
    expect(result.ok).toBe(true);
  });
});

describe('handlePreToolEdit redundant-task-work (block mode)', () => {
  it('refuses an edit to a DONE task file, naming the task and status', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { redundantWorkEnforcement: 'block' });
    await seedActiveDraft(active.root);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/done.ts'] },
    });
    expect(result.ok).toBe(false);
    expect(result.blockMessage).toContain('T1');
    expect(result.blockMessage).toContain('DONE');
  });

  it('allows an edit to a PENDING task file', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { redundantWorkEnforcement: 'block' });
    await seedActiveDraft(active.root);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/pending.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('DRAFT frontmatter "off" overrides a project-level "block" default', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { redundantWorkEnforcement: 'block' });
    await seedActiveDraft(active.root, 'off');
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/done.ts'] },
    });
    expect(result.ok).toBe(true);
  });
});

describe('handlePreToolEdit redundant-task-work (off mode)', () => {
  it('never runs the check at all', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, {
      redundantWorkEnforcement: 'off',
      notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') },
    });
    await seedActiveDraft(active.root);
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/done.ts'] },
    });
    expect(await readEvents(active.root)).toEqual([]);
  });
});

describe('handlePreToolEdit redundant-task-work (fail-open)', () => {
  it('never blocks when there is no active draft/phase', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { redundantWorkEnforcement: 'block' });
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/done.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('never blocks when PROGRESS.json is missing (no recorded statuses)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { redundantWorkEnforcement: 'block' });
    const phaseDir = join(active.root, '.cadence/phases/01-foundation');
    await mkdir(phaseDir, { recursive: true });
    const draftMd = `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: APPROVED\n---\n\n# 01-01 — Demo\n\n## Objective\n\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: Demo\nGiven setup\nWhen action\nThen outcome\n\n## Tasks\n\n### T1: thing\n- files: \`src/done.ts\`\n- action: do\n- verify: vitest\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;
    await writeFile(join(phaseDir, '01-01-DRAFT.md'), draftMd);
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activePhase = '01-foundation';
    state.activeDraft = '01-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    state.openDrafts = [{ id: '01-01', since: new Date().toISOString() }];
    await writeFile(statePath, JSON.stringify(state, null, 2));

    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/done.ts'] },
    });
    expect(result.ok).toBe(true);
  });
});
