import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

async function addRec(cwd: string): Promise<string> {
  const r = await run(
    ['recommendation', 'add', '--title', 'X', '--summary', 'Y', '--readiness', 'needs-evidence'],
    cwd,
  );
  const m = r.stdout.match(/(rec-\d{8}-\d{3})/);
  if (!m) throw new Error(`could not parse rec id from: ${r.stdout}`);
  return m[1]!;
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence recommendation promote', () => {
  it('AC-5: invalid --status exits 1 naming allowed values', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);
    const r = await run(['recommendation', 'promote', id, '--status', 'bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid --status/);
    expect(r.stderr).toMatch(/accepted/);
  });

  it('AC-5: invalid --readiness exits 1 naming allowed values', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);
    const r = await run(['recommendation', 'promote', id, '--readiness', 'super-ready'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid --readiness/);
    expect(r.stderr).toMatch(/ready-for-milestone/);
  });

  it('AC-4: no flags exits 1', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);
    const r = await run(['recommendation', 'promote', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/--status and\/or --readiness/);
  });

  it('AC-1/AC-2: promote persists status + readiness across reload', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);
    const r = await run(
      ['recommendation', 'promote', id, '--status', 'accepted', '--readiness', 'ready-for-milestone'],
      active.root,
    );
    expect(r.code).toBe(0);
    const show = await run(['recommendation', 'show', id], active.root);
    expect(show.stdout).toMatch(/status: accepted/);
    expect(show.stdout).toMatch(/ready-for-milestone/);
  });

  it('AC-3: a promoted rec becomes milestone-eligible (propose clusters it)', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);
    const before = await run(['milestone', 'propose', '--json'], active.root);
    const beforeCount = JSON.parse(before.stdout).milestones?.length ?? 0;
    expect(beforeCount).toBe(0); // a candidate/needs-evidence rec is not eligible

    await run(
      ['recommendation', 'promote', id, '--status', 'accepted', '--readiness', 'ready-for-milestone'],
      active.root,
    );
    const after = await run(['milestone', 'propose', '--json'], active.root);
    const afterCount = JSON.parse(after.stdout).milestones?.length ?? 0;
    expect(afterCount).toBeGreaterThanOrEqual(1);
  });
});
