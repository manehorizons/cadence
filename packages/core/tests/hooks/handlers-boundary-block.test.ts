import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { HookDispatcher } from '../../src/hooks/dispatcher.js';

// Phase 155 T2 — boundaryEnforcement: 'block' mode (AC-2, AC-3, AC-4).

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
  taskFiles: string[],
  draftBoundaryEnforcement?: 'warn' | 'block',
): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  const filesLines =
    taskFiles.length > 0
      ? taskFiles.map((f) => `- files: \`${f}\``).join('\n')
      : '- files: (none)';
  const overrideLine = draftBoundaryEnforcement
    ? `boundaryEnforcement: ${draftBoundaryEnforcement}\n`
    : '';
  const draftMd = `---\nphase: 01-foundation\nid: 01-01\ntier: standard\n${overrideLine}status: APPROVED\n---\n\n# 01-01 — Demo\n\n## Objective\n\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: Demo\nGiven setup\nWhen action\nThen outcome\n\n## Tasks\n\n### T1: do thing\n${filesLines}\n- action: do\n- verify: vitest\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;
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

describe('handlePreToolEdit boundaryEnforcement: block', () => {
  it('AC-2: refuses an out-of-boundary edit, naming the file', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, ['src/known.ts']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(false);
    expect(result.blockMessage).toContain('src/elsewhere.ts');
  });

  it('AC-2: allows an edit whose file is declared', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, ['src/known.ts']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/known.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('AC-3: never blocks when there is no active draft/phase', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('AC-4: never blocks when the draft declares zero files (fails open)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, []);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/anything.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('warn mode (default) still never blocks, even with a declared boundary', async () => {
    active = await tempRepo({ initialized: true });
    await seedActiveDraft(active.root, ['src/known.ts']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('AC-5: DRAFT frontmatter boundaryEnforcement: warn overrides a project-level block default', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, ['src/known.ts'], 'warn');
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('AC-5: DRAFT frontmatter boundaryEnforcement: block overrides a project-level warn default', async () => {
    active = await tempRepo({ initialized: true });
    await seedActiveDraft(active.root, ['src/known.ts'], 'block');
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(false);
    expect(result.blockMessage).toContain('src/elsewhere.ts');
  });
});
