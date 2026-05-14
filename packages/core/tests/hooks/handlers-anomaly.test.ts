import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { HookDispatcher } from '../../src/hooks/dispatcher.js';

// AC-1: pre-tool-edit hook emits files-outside-boundary on outside edits.

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
  taskFile: string,
  draftProfile?: 'auto' | 'standard' | 'strict',
): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  const profileLine = draftProfile ? `profile: ${draftProfile}\n` : '';
  const draftMd = `---\nphase: 01-foundation\nid: 01-01\ntier: standard\n${profileLine}status: APPROVED\n---\n\n# 01-01 — Demo\n\n## Objective\n\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: Demo\nGiven setup\nWhen action\nThen outcome\n\n## Tasks\n\n### T1: do thing\n- files: \`${taskFile}\`\n- action: do\n- verify: vitest\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;
  await writeFile(join(phaseDir, '01-01-DRAFT.md'), draftMd);
  const statePath = join(root, '.cadence/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.activePhase = '01-foundation';
  state.activeDraft = '01-01';
  state.loopPosition = 'BUILD';
  state.tier = 'standard';
  state.openDrafts = [{ id: '01-01', since: new Date().toISOString() }];
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function readEvents(root: string): Promise<Array<{ type: string; severity: string; message: string; context: Record<string, unknown> }>> {
  const path = join(root, '.cadence/anomalies.log');
  if (!existsSync(path)) return [];
  const raw = await readFile(path, 'utf8');
  return raw.split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l));
}

describe('handlePreToolEdit anomaly emission', () => {
  it('emits one files-outside-boundary event per outside path', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    await seedActiveDraft(active.root, 'src/known.ts');
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts', 'src/another.ts'] },
    });
    expect(result.ok).toBe(true);
    const events = await readEvents(active.root);
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.type).toBe('files-outside-boundary');
      expect(e.severity).toBe('warn');
      expect(e.context.source).toBe('hook.preToolEdit');
    }
    expect(events.map((e) => e.context.file).sort()).toEqual(
      ['src/another.ts', 'src/elsewhere.ts'],
    );
  });

  it('does not emit when path is in declared task files', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    await seedActiveDraft(active.root, 'src/known.ts');
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/known.ts'] },
    });
    expect(existsSync(join(active.root, '.cadence/anomalies.log'))).toBe(false);
  });

  it('does not emit when there is no active draft', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(existsSync(join(active.root, '.cadence/anomalies.log'))).toBe(false);
  });

  it('does not emit when anomaly-notify gate is absent (strict profile)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    await seedActiveDraft(active.root, 'src/known.ts', 'strict');
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(existsSync(join(active.root, '.cadence/anomalies.log'))).toBe(false);
  });

  it('does not emit when ctx.raw.files is absent', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    await seedActiveDraft(active.root, 'src/known.ts');
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
    });
    expect(existsSync(join(active.root, '.cadence/anomalies.log'))).toBe(false);
  });

  it('malformed draft does not break the hook (returns ok, no events)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    // Seed a draft path with junk content.
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
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(true);
    expect(existsSync(join(active.root, '.cadence/anomalies.log'))).toBe(false);
  });

  it('stamps a schema-valid ts on every emitted event (AC-3 — Phase 17.3)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'file', file: join(active.root, '.cadence/anomalies.log') } });
    await seedActiveDraft(active.root, 'src/known.ts');
    const before = Date.now();
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    const after = Date.now();
    const events = await readEvents(active.root);
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(typeof (ev as unknown as { ts: string }).ts).toBe('string');
    const parsed = Date.parse((ev as unknown as { ts: string }).ts);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it('respects transport=none (gate on, transport silenced)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'none' } });
    await seedActiveDraft(active.root, 'src/known.ts');
    const dispatcher = new HookDispatcher(active.root);
    await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(existsSync(join(active.root, '.cadence/anomalies.log'))).toBe(false);
  });
});
