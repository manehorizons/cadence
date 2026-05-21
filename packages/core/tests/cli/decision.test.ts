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

describe('cadence decision (Slice 8)', () => {
  it('add: untied (no --rec) success → exit 0 + Added line + field OMITTED in JSON', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['decision', 'add', '--title', 'use postgres', '--rationale', 'concurrency'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Added dec-\d{8}-001: use postgres/m);
    expect(r.stdout).toMatch(/Next: cadence decision list/);
    const json = JSON.parse(await readFile(join(active.root, '.cadence/intelligence/decisions.json'), 'utf8'));
    expect(json.decisions).toHaveLength(1);
    expect('recommendationId' in json.decisions[0]).toBe(false);
  });

  it('add: tied (--rec known) success → recommendationId persisted', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const r = await run(['decision', 'add', '--rec', rec.id, '--title', 'tied', '--rationale', 'r'], active.root);
    expect(r.code).toBe(0);
    const json = JSON.parse(await readFile(join(active.root, '.cadence/intelligence/decisions.json'), 'utf8'));
    expect(json.decisions[0].recommendationId).toBe(rec.id);
  });

  it('add: --rec unknown → exit 1 + stderr', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['decision', 'add', '--rec', 'rec-bogus', '--title', 't', '--rationale', 'r'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/decision add failed: unknown recommendation "rec-bogus"/);
  });

  it('add: missing --title → commander usage error + non-zero exit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['decision', 'add', '--rationale', 'r'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/required option/i);
  });

  it('list: empty → "No decisions recorded."', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['decision', 'list'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^No decisions recorded\.$/m);
  });

  it('list: untied entry shows em-dash placeholder in rec column', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    await run(['decision', 'add', '--title', 'untied title', '--rationale', 'r'], active.root);
    const r = await run(['decision', 'list'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(new RegExp(`dec-\\d{8}-001\\s+active\\s+—\\s+untied title`));
  });

  it('list: tied entry shows recId in rec column', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['decision', 'add', '--rec', rec.id, '--title', 'tied title', '--rationale', 'r'], active.root);
    const r = await run(['decision', 'list'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(new RegExp(`dec-\\d{8}-001\\s+active\\s+${rec.id}\\s+tied title`));
  });
});
