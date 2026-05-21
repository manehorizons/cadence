import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import {
  addIntelligenceDecision,
  addRecommendation,
} from '../../src/intelligence/store.js';

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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedRecAndDecision(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 't',
    summary: 's',
    priority: 'medium',
    readiness: 'raw-idea',
    affectedAreas: [],
    affectedFiles: [],
  });
  const d = await addIntelligenceDecision(root, {
    recommendationId: r.id,
    title: 'D1',
    rationale: 'r',
  });
  return d.id;
}

describe('cadence decision supersede (Slice 13 / AC-7)', () => {
  it('active → superseded: exit 0, success line, JSON + MD reflect new status', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const id = await seedRecAndDecision(active.root);
    const r = await run(['decision', 'supersede', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`decision ${id} → superseded\n`);
    const json = JSON.parse(
      await readFile(
        join(active.root, '.cadence/intelligence/decisions.json'),
        'utf8',
      ),
    );
    expect(json.decisions[0].status).toBe('superseded');
    const md = await readFile(
      join(active.root, '.cadence/intelligence/DECISIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Superseded[\s\S]*?### dec-/);
    expect(md).toMatch(/## Active[\s\S]*?_\(none\)_/);
  });

  it('unknown id → exit 1, stderr `refused: ... not found`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const r = await run(['decision', 'supersede', 'dec-bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'decision supersede refused: decision dec-bogus not found\n',
    );
  });

  it('non-active status → exit 1, stderr `refused: cannot supersede ...`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const id = await seedRecAndDecision(active.root);
    await run(['decision', 'supersede', id], active.root); // → superseded
    const r = await run(['decision', 'supersede', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'decision supersede refused: cannot supersede decision in status superseded\n',
    );
  });

  it('missing <id> arg → commander usage error + non-zero exit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const r = await run(['decision', 'supersede'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/missing required argument/i);
  });
});

describe('cadence decision rescind (AC-8)', () => {
  it('active → rescinded: exit 0, success line, MD reflects bucket move', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const id = await seedRecAndDecision(active.root);
    const r = await run(['decision', 'rescind', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`decision ${id} → rescinded\n`);
    const md = await readFile(
      join(active.root, '.cadence/intelligence/DECISIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Rescinded[\s\S]*?### dec-/);
    expect(md).toMatch(/## Active[\s\S]*?_\(none\)_/);
  });

  it('non-active status → exit 1, stderr `refused: cannot rescind ...`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const id = await seedRecAndDecision(active.root);
    await run(['decision', 'rescind', id], active.root);
    const r = await run(['decision', 'rescind', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'decision rescind refused: cannot rescind decision in status rescinded\n',
    );
  });
});

describe('cadence decision reactivate (AC-9)', () => {
  it('superseded → active: exit 0, success line, JSON + MD reflect', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const id = await seedRecAndDecision(active.root);
    await run(['decision', 'supersede', id], active.root);
    const r = await run(['decision', 'reactivate', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`decision ${id} → active\n`);
    const json = JSON.parse(
      await readFile(
        join(active.root, '.cadence/intelligence/decisions.json'),
        'utf8',
      ),
    );
    expect(json.decisions[0].status).toBe('active');
    const md = await readFile(
      join(active.root, '.cadence/intelligence/DECISIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Active[\s\S]*?### dec-/);
    expect(md).toMatch(/## Superseded[\s\S]*?_\(none\)_/);
  });

  it('rescinded → active: exit 0, MD reflects bucket move', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const id = await seedRecAndDecision(active.root);
    await run(['decision', 'rescind', id], active.root);
    const r = await run(['decision', 'reactivate', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`decision ${id} → active\n`);
    const md = await readFile(
      join(active.root, '.cadence/intelligence/DECISIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Active[\s\S]*?### dec-/);
    expect(md).toMatch(/## Rescinded[\s\S]*?_\(none\)_/);
  });

  it('active status → exit 1, stderr `refused: cannot reactivate ... active`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const id = await seedRecAndDecision(active.root);
    const r = await run(['decision', 'reactivate', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'decision reactivate refused: cannot reactivate decision in status active\n',
    );
  });
});
