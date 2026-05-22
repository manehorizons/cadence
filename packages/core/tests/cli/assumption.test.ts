import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { addRecommendation } from '../../src/intelligence/store.js';

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

describe('cadence assumption (Slice 8)', () => {
  it('add: success path (AC-7)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const r = await run(['assumption', 'add', '--rec', rec.id, '--text', 'db reachable'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Added as-\d{8}-001: db reachable/m);
    expect(r.stdout).toMatch(/Next: cadence assumption list/);
    const json = await readFile(join(active.root, '.cadence/intelligence/assumptions.json'), 'utf8');
    expect(JSON.parse(json).assumptions).toHaveLength(1);
  });

  it('add: unknown rec → exit 1 + stderr (AC-7)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['assumption', 'add', '--rec', 'rec-bogus', '--text', 'will fail'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/assumption add failed: unknown recommendation "rec-bogus"/);
  });

  it('add: missing --rec → commander usage error + non-zero exit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['assumption', 'add', '--text', 'no rec'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/required option/i);
  });

  it('list: empty → "No assumptions recorded." (AC-8)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['assumption', 'list'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^No assumptions recorded\.$/m);
  });

  it('list: non-empty → one line per entry (compact, AC-8)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A1'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A2'], active.root);
    const r = await run(['assumption', 'list'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(new RegExp(`as-\\d{8}-001\\s+open\\s+${rec.id}\\s+A1`));
    expect(r.stdout).toMatch(new RegExp(`as-\\d{8}-002\\s+open\\s+${rec.id}\\s+A2`));
    expect(r.stdout).not.toMatch(/^# CADENCE Assumptions/m);
  });

  it('Slice 21 AC-2: list --format json → array of Assumption', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice21' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    const r = await run(['assumption', 'list', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('A');
    expect(arr[0].status).toBe('open');
  });

  it('Slice 21 AC-4: empty ledger + --format json → []', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice21' });
    const r = await run(['assumption', 'list', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 21 AC-5: invalid --format → exit 1 + stderr', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice21' });
    const r = await run(['assumption', 'list', '--format', 'yaml'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unsupported format: yaml/);
  });
});
