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

  it('Slice 21 AC-3: list --format json → array of IntelligenceDecision (tied + untied)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice21' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['decision', 'add', '--rec', rec.id, '--title', 'tied', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'untied', '--rationale', 'r'], active.root);
    const r = await run(['decision', 'list', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toHaveLength(2);
    expect(arr[0].title).toBe('tied');
    expect(arr[0].recommendationId).toBe(rec.id);
    expect(arr[0].status).toBe('active');
    expect(arr[1].title).toBe('untied');
    expect(arr[1].recommendationId).toBeUndefined();
  });

  it('Slice 21 AC-4: empty ledger + --format json → []', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice21' });
    const r = await run(['decision', 'list', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 21 AC-5: invalid --format → exit 1 + stderr', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice21' });
    const r = await run(['decision', 'list', '--format', 'xml'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unsupported format: xml/);
  });

  it('Slice 22 AC-3: --filter-status active → only active; superseded filtered out', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice22' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['decision', 'add', '--rec', rec.id, '--title', 'D1', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', rec.id, '--title', 'D2', '--rationale', 'r'], active.root);
    const list1 = await run(['decision', 'list', '--format', 'json'], active.root);
    const arr = JSON.parse(list1.stdout);
    const d2Id = arr[1].id;
    await run(['decision', 'supersede', d2Id], active.root);
    const r = await run(['decision', 'list', '--filter-status', 'active'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/D1/);
    expect(r.stdout).not.toMatch(/D2/);
  });

  it('Slice 22 AC-4: invalid --filter-status → exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice22' });
    const r = await run(['decision', 'list', '--filter-status', 'bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid status: bogus/);
  });

  it('Slice 22 AC-5: empty after filter + terminal → status-aware message', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice22' });
    await run(['decision', 'add', '--title', 'D', '--rationale', 'r'], active.root);
    const r = await run(['decision', 'list', '--filter-status', 'rescinded'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No decisions matching status=rescinded recorded.\n');
  });

  it('Slice 23 AC-2: --filter-rec → only tied decisions; untied EXCLUDED', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice23' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['decision', 'add', '--rec', rec.id, '--title', 'tied', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'untied', '--rationale', 'r'], active.root);
    const r = await run(['decision', 'list', '--filter-rec', rec.id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/tied/);
    expect(r.stdout).not.toMatch(/untied/);
  });

  it('Slice 23 AC-3+4: --filter-rec + --filter-status + --format json → AND filter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice23' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['decision', 'add', '--rec', rec.id, '--title', 'D1', '--rationale', 'r'], active.root);
    const r = await run(
      ['decision', 'list', '--filter-rec', rec.id, '--filter-status', 'active', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('D1');
  });

  it('Slice 23 AC-5: empty after combined filters → message reflects both', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice23' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['decision', 'add', '--rec', rec.id, '--title', 'D', '--rationale', 'r'], active.root);
    const r = await run(
      ['decision', 'list', '--filter-rec', rec.id, '--filter-status', 'rescinded'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`No decisions matching status=rescinded, rec=${rec.id} recorded.\n`);
  });

  it('Slice 23 AC-6: unknown rec id → empty result, exit 0', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice23' });
    const r = await run(['decision', 'list', '--filter-rec', 'rec-bogus'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe('No decisions matching rec=rec-bogus recorded.\n');
  });

  it('Slice 24 AC-1+3: --limit 2 with combined filters', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice24' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    for (const t of ['D1', 'D2', 'D3']) {
      await run(['decision', 'add', '--rec', rec.id, '--title', t, '--rationale', 'r'], active.root);
    }
    const r = await run(
      ['decision', 'list', '--filter-rec', rec.id, '--filter-status', 'active', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    expect(arr[0].title).toBe('D1');
    expect(arr[1].title).toBe('D2');
  });

  it('Slice 24 AC-5: --limit abc → exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice24' });
    const r = await run(['decision', 'list', '--limit', 'abc'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid limit: abc/);
  });

  it('Slice 25 AC-3: --filter-text matches title OR rationale', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice25' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['decision', 'add', '--rec', rec.id, '--title', 'Use Postgres', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', rec.id, '--title', 'Other', '--rationale', 'mentions postgres in body'], active.root);
    await run(['decision', 'add', '--rec', rec.id, '--title', 'Unrelated', '--rationale', 'redis'], active.root);
    const r = await run(['decision', 'list', '--filter-text', 'postgres', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(2);
  });

  it('Slice 25 AC-6: empty after text + status → message includes both dims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice25' });
    await run(['decision', 'add', '--title', 'D', '--rationale', 'r'], active.root);
    const r = await run(['decision', 'list', '--filter-text', 'nonexistent', '--filter-status', 'active'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No decisions matching status=active, text="nonexistent" recorded.\n');
  });
});
