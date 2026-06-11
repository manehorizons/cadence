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

describe('cadence recommendation archive / unarchive (Phase 101 / AC-8)', () => {
  it('AC-8: archive moves a rec out of the default list; unarchive restores it', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);

    const arch = await run(['recommendation', 'archive', id], active.root);
    expect(arch.code).toBe(0);
    expect(arch.stdout).toContain(id);
    expect(arch.stdout).toMatch(/archived/i);

    const listed = await run(['recommendation', 'list'], active.root);
    expect(listed.stdout).not.toContain(id);

    const un = await run(['recommendation', 'unarchive', id], active.root);
    expect(un.code).toBe(0);
    const relisted = await run(['recommendation', 'list'], active.root);
    expect(relisted.stdout).toContain(id);
  });

  it('AC-8: `show` still finds a rec after it is archived (no vanish)', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);
    await run(['recommendation', 'archive', id], active.root);
    const show = await run(['recommendation', 'show', id], active.root);
    expect(show.code).toBe(0);
    expect(show.stdout).toContain(id);
  });

  it('AC-8: archiving an unknown id exits 1 with a clear message (no stack trace)', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['recommendation', 'archive', 'rec-20200101-001'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/not found/i);
    expect(r.stderr).not.toMatch(/at Object|node:internal/);
  });

  it('AC-8: a manual archive records archiveReason=manual', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);
    const arch = await run(['recommendation', 'archive', id], active.root);
    expect(arch.code).toBe(0);
    const json = await run(
      ['recommendation', 'list', '--archived', '--format', 'json'],
      active.root,
    );
    const parsed = JSON.parse(json.stdout) as Array<{ id: string; archiveReason?: string }>;
    expect(parsed.find((x) => x.id === id)?.archiveReason).toBe('manual');
  });
});

describe('cadence recommendation list --archived (Phase 101 / AC-9)', () => {
  it('AC-9: default list excludes archived + shows a count; --archived shows them', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);
    await run(['recommendation', 'archive', id], active.root);

    const def = await run(['recommendation', 'list'], active.root);
    expect(def.stdout).not.toContain(id);
    expect(def.stdout).toMatch(/1 archived/);

    const arch = await run(['recommendation', 'list', '--archived'], active.root);
    expect(arch.stdout).toContain(id);
  });

  it('AC-9: --archived --format json emits the archived array', async () => {
    active = await tempRepo({ initialized: true });
    const id = await addRec(active.root);
    await run(['recommendation', 'archive', id], active.root);

    const r = await run(
      ['recommendation', 'list', '--archived', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as Array<{ id: string; archiveReason?: string }>;
    expect(parsed.map((x) => x.id)).toContain(id);
    expect(parsed[0]?.archiveReason).toBe('manual');
  });

  it('AC-9: --archived is empty when nothing is archived', async () => {
    active = await tempRepo({ initialized: true });
    await addRec(active.root);
    const r = await run(['recommendation', 'list', '--archived'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/No archived recommendations|No recommendations/i);
  });
});
