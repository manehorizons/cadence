import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  addAssumption,
  addRecommendation,
} from '../../src/intelligence/store.js';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'dist', 'cli', 'index.js',
);

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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedRecAndAssumption(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  const a = await addAssumption(root, { recommendationId: r.id, text: 'A1' });
  return a.id;
}

describe('cadence assumption validate (Slice 9 / AC-7)', () => {
  it('open → validated: exit 0, success line, JSON + MD reflect new status', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const id = await seedRecAndAssumption(active.root);
    const r = await run(['assumption', 'validate', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`assumption ${id} → validated\n`);
    const json = JSON.parse(
      await readFile(join(active.root, '.cadence/intelligence/assumptions.json'), 'utf8'),
    );
    expect(json.assumptions[0].status).toBe('validated');
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Validated[\s\S]*?### as-/);
    expect(md).toMatch(/## Open[\s\S]*?_\(none\)_/);
  });

  it('unknown id → exit 1, stderr `refused: ... not found`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const r = await run(['assumption', 'validate', 'as-bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption validate refused: assumption as-bogus not found\n',
    );
  });

  it('non-open status → exit 1, stderr `refused: cannot validate ...`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const id = await seedRecAndAssumption(active.root);
    await run(['assumption', 'validate', id], active.root); // open → validated
    const r = await run(['assumption', 'validate', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption validate refused: cannot validate assumption in status validated\n',
    );
  });

  it('missing <id> arg → commander usage error + non-zero exit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const r = await run(['assumption', 'validate'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/missing required argument/i);
  });
});

describe('cadence assumption reject (AC-8)', () => {
  it('open → rejected: exit 0, success line, JSON + MD reflect new status', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const id = await seedRecAndAssumption(active.root);
    const r = await run(['assumption', 'reject', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`assumption ${id} → rejected\n`);
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Rejected[\s\S]*?### as-/);
    expect(md).toMatch(/## Open[\s\S]*?_\(none\)_/);
  });

  it('non-open status → exit 1, stderr `refused: cannot reject ...`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const id = await seedRecAndAssumption(active.root);
    await run(['assumption', 'reject', id], active.root);
    const r = await run(['assumption', 'reject', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption reject refused: cannot reject assumption in status rejected\n',
    );
  });
});

describe('cadence assumption reopen (Slice 10 / AC-5)', () => {
  it('validated → open: exit 0, success line, JSON + MD reflect new status', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const id = await seedRecAndAssumption(active.root);
    const v = await run(['assumption', 'validate', id], active.root);
    expect(v.code).toBe(0);
    const r = await run(['assumption', 'reopen', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`assumption ${id} → open\n`);
    const json = JSON.parse(
      await readFile(join(active.root, '.cadence/intelligence/assumptions.json'), 'utf8'),
    );
    expect(json.assumptions[0].status).toBe('open');
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Open[\s\S]*?### as-/);
    expect(md).toMatch(/## Validated[\s\S]*?_\(none\)_/);
  });

  it('rejected → open: exit 0, MD reflects bucket move', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const id = await seedRecAndAssumption(active.root);
    await run(['assumption', 'reject', id], active.root);
    const r = await run(['assumption', 'reopen', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`assumption ${id} → open\n`);
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Open[\s\S]*?### as-/);
    expect(md).toMatch(/## Rejected[\s\S]*?_\(none\)_/);
  });

  it('open status → exit 1, stderr `refused: cannot reopen ... open`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const id = await seedRecAndAssumption(active.root);
    const r = await run(['assumption', 'reopen', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption reopen refused: cannot reopen assumption in status open\n',
    );
  });

  it('unknown id → exit 1, stderr `refused: ... not found`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const r = await run(['assumption', 'reopen', 'as-bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption reopen refused: assumption as-bogus not found\n',
    );
  });
});
