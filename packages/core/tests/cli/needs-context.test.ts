import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

/** A DRAFT declaring T1 + T2 (build task now validates ids against it). */
const TWO_TASK_DRAFT = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Two trivial tasks.

## Acceptance Criteria

### AC-1: one
Given a
When b
Then c

### AC-2: two
Given a
When b
Then c

## Tasks

### T1: t1
- files: \`src/a.ts\`
- action: a
- verify: v
- done: AC-1

### T2: t2
- files: \`src/b.ts\`
- action: a
- verify: v
- done: AC-2

## Boundaries

- none
`;

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    p.stderr.on('data', (b) => {
      stderr += b.toString();
    });
    p.on('exit', (code) => resolve({ code: code ?? 0, stderr }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence needs-context <id>', () => {
  it('records NEEDS_CONTEXT with notes in PROGRESS.json (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['needs-context', 'T1', '--notes=need spec on Y'], active.root);
    expect(r.code).toBe(0);

    const progress = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.status).toBe('NEEDS_CONTEXT');
    expect(progress.tasks.T1.notes).toBe('need spec on Y');
  });

  it('records NEEDS_CONTEXT with empty notes when --notes omitted', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['needs-context', 'T2'], active.root);
    expect(r.code).toBe(0);

    const progress = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T2.status).toBe('NEEDS_CONTEXT');
    expect(progress.tasks.T2.notes).toBe('');
  });

  it('exits non-zero with LoopViolation when not in BUILD (AC-3)', async () => {
    active = await tempRepo({ initialized: true });

    const r = await run(['needs-context', 'T1'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/BUILD/i);
  });

  it('updates state.activeTask to the just-recorded task', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    await run(['needs-context', 'T1'], active.root);

    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.activeTask?.id).toBe('T1');
    expect(state.activeTask?.status).toBe('NEEDS_CONTEXT');
  });

  it('parity with `build task --status=NEEDS_CONTEXT` (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      TWO_TASK_DRAFT,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    await run(['needs-context', 'T1', '--notes=parity'], active.root);
    await run(['build', 'task', 'T2', '--status=NEEDS_CONTEXT', '--notes=parity'], active.root);

    const progress = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    const stripIdAndTs = (entry: Record<string, unknown>) => {
      const { updatedAt: _t, ...rest } = entry as { updatedAt: string };
      return rest;
    };
    expect(stripIdAndTs(progress.tasks.T1)).toEqual(stripIdAndTs(progress.tasks.T2));
  });
});
