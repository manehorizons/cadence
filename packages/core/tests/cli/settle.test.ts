import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

async function addSecondAc(root: string): Promise<void> {
  const path = join(root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
  const raw = await readFile(path, 'utf8');
  const next = raw
    .replace(
      '\n## Tasks\n',
      '\n### AC-2: Extra\nGiven extra setup\nWhen extra action\nThen extra outcome\n\n## Tasks\n',
    )
    .replace(
      '\n## Boundaries\n',
      '\n### T2: extra task\n- files: `src/extra.ts`\n- action: do extra\n- verify: test extra\n- done: AC-2\n\n## Boundaries\n',
    );
  await writeFile(path, next);
}

async function seedCoverageTest(root: string, acIds: string[]): Promise<void> {
  const path = join(root, 'packages/core/tests/phase-121.test.ts');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, acIds.map((id) => `it('${id}', () => {});`).join('\n'));
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence settle run', () => {
  it('writes SUMMARY.md + SUMMARY.json and returns to IDLE', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(['settle', 'run', '--ac', 'AC-1=pass'], active.root);
    expect(r.code).toBe(0);

    const dir = join(active.root, '.cadence/phases/01-foundation');
    expect(existsSync(join(dir, '01-01-SUMMARY.md'))).toBe(true);
    expect(existsSync(join(dir, '01-01-SUMMARY.json'))).toBe(true);

    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('IDLE');
    expect(state.openDrafts).toHaveLength(0);

    const summary = JSON.parse(await readFile(join(dir, '01-01-SUMMARY.json'), 'utf8'));
    expect(summary.gateBypasses).toBeUndefined();
    const md = await readFile(join(dir, '01-01-SUMMARY.md'), 'utf8');
    expect(md).not.toContain('## Gate bypasses');
    expect(r.stderr).not.toContain('verification bypass audit');
  });

  it('records AC failure note in SUMMARY', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE_WITH_CONCERNS'], active.root);
    await run(['settle', 'run', '--ac', 'AC-1=fail:flaky'], active.root);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*FAIL/);
    expect(md).toContain('flaky');
  });

  it('AC-3 (phase 120): --pass-all records every AC as passing', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await addSecondAc(active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await run(['build', 'task', 'T2', '--status=DONE'], active.root);

    const r = await run(['settle', 'run', '--pass-all'], active.root);

    expect(r.code).toBe(0);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*PASS/);
    expect(md).toMatch(/AC-2.*PASS/);
  });

  it('AC-4 (phase 120): --ac-pass mixes with existing --ac fail syntax', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await addSecondAc(active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await run(['build', 'task', 'T2', '--status=DONE_WITH_CONCERNS'], active.root);

    const r = await run(['settle', 'run', '--ac-pass', 'AC-1', '--ac', 'AC-2=fail:flaky'], active.root);

    expect(r.code).toBe(0);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*PASS/);
    expect(md).toMatch(/AC-2.*FAIL/);
    expect(md).toContain('flaky');
  });

  it('AC-1/2/3 (phase 121): --allow-missing-coverage writes JSON/Markdown audit and stderr warning', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);

    const r = await run(['settle', 'run', '--auto', '--allow-missing-coverage'], active.root);

    expect(r.code).toBe(0);
    expect(r.stderr).toContain('WARNING verification bypass audit recorded in SUMMARY');
    const dir = join(active.root, '.cadence/phases/01-foundation');
    const summary = JSON.parse(await readFile(join(dir, '01-01-SUMMARY.json'), 'utf8'));
    expect(summary.gateBypasses).toEqual([
      expect.objectContaining({
        type: 'coverage-bypassed',
        severity: 'warn',
        flag: '--allow-missing-coverage',
      }),
    ]);
    const md = await readFile(join(dir, '01-01-SUMMARY.md'), 'utf8');
    expect(md).toContain('## Gate bypasses');
    expect(md).toContain('--allow-missing-coverage');
  });

  it('AC-1/3 (phase 121): --force records only when it bypasses a failing condition', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=BLOCKED'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);

    const r = await run(['settle', 'run', '--auto', '--force'], active.root);

    expect(r.code).toBe(0);
    expect(r.stderr).toContain('--force');
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.gateBypasses).toEqual([
      expect.objectContaining({
        type: 'force-used',
        severity: 'error',
        flag: '--force',
      }),
    ]);
  });
});
