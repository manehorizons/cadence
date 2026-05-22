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

  it('Slice 22 AC-2: --filter-status open → only open entries; validated filtered out', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice22' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A1'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A2'], active.root);
    // Validate the second so only A1 stays open
    const list1 = await run(['assumption', 'list', '--format', 'json'], active.root);
    const arr = JSON.parse(list1.stdout);
    const a2Id = arr[1].id;
    await run(['assumption', 'validate', a2Id], active.root);
    const r = await run(['assumption', 'list', '--filter-status', 'open'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/A1/);
    expect(r.stdout).not.toMatch(/A2/);
  });

  it('Slice 22 AC-4: invalid --filter-status → exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice22' });
    const r = await run(['assumption', 'list', '--filter-status', 'bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid status: bogus/);
  });

  it('Slice 22 AC-6: --filter-status + --format json → filtered array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice22' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    const r = await run(
      ['assumption', 'list', '--filter-status', 'validated', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 23 AC-1: --filter-rec → only entries tied to specified rec', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice23' });
    const r1 = await addRecommendation(active.root, {
      title: 'first', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const r2 = await addRecommendation(active.root, {
      title: 'second', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', r1.id, '--text', 'A-r1'], active.root);
    await run(['assumption', 'add', '--rec', r2.id, '--text', 'A-r2'], active.root);
    const r = await run(['assumption', 'list', '--filter-rec', r1.id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/A-r1/);
    expect(r.stdout).not.toMatch(/A-r2/);
  });

  it('Slice 23 AC-3+4: --filter-rec + --filter-status + --format json → AND filter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice23' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A1'], active.root);
    const r = await run(
      ['assumption', 'list', '--filter-rec', rec.id, '--filter-status', 'open', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('A1');
  });

  it('Slice 23 AC-5: empty after combined filters → message reflects both dimensions', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice23' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    const r = await run(
      ['assumption', 'list', '--filter-rec', rec.id, '--filter-status', 'validated'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`No assumptions matching status=validated, rec=${rec.id} recorded.\n`);
  });

  it('Slice 23 AC-6: unknown rec id → empty result, exit 0, no stderr', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice23' });
    const r = await run(['assumption', 'list', '--filter-rec', 'rec-bogus'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe('No assumptions matching rec=rec-bogus recorded.\n');
  });

  it('Slice 24 AC-1+3: --limit 1 after filters → only 1 entry', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice24' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    for (const t of ['A1', 'A2', 'A3']) {
      await run(['assumption', 'add', '--rec', rec.id, '--text', t], active.root);
    }
    const r = await run(
      ['assumption', 'list', '--filter-rec', rec.id, '--limit', '1', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(1);
  });

  it('Slice 24 AC-4: --limit 0 → exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice24' });
    const r = await run(['assumption', 'list', '--limit', '0'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid limit: 0/);
  });

  it('Slice 25 AC-2+AC-4: --filter-text matches assumption.text case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice25' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'postgres holds latency'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'redis cache works'], active.root);
    const r = await run(
      ['assumption', 'list', '--filter-text', 'POSTGRES', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('postgres holds latency');
  });

  it('Slice 25 AC-5: combine --filter-text + --filter-status + --limit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice25' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    for (const t of ['postgres a', 'postgres b', 'redis c']) {
      await run(['assumption', 'add', '--rec', rec.id, '--text', t], active.root);
    }
    const r = await run(
      ['assumption', 'list', '--filter-text', 'postgres', '--filter-status', 'open', '--limit', '1', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(1);
  });

  it('Slice 25 AC-7: empty `--filter-text ""` matches all', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice25' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    const r = await run(['assumption', 'list', '--filter-text', '', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(2);
  });

  it('Slice 26 AC-1+AC-3: --offset 1 --limit 2 returns entries [1..3]', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice26' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    for (const t of ['A', 'B', 'C', 'D']) {
      await run(['assumption', 'add', '--rec', rec.id, '--text', t], active.root);
    }
    const r = await run(
      ['assumption', 'list', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    expect(arr[0].text).toBe('B');
    expect(arr[1].text).toBe('C');
  });

  it('Slice 26 AC-4: filter-status + filter-rec + offset + limit (all combined)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice26' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    for (const t of ['A', 'B', 'C']) {
      await run(['assumption', 'add', '--rec', rec.id, '--text', t], active.root);
    }
    const r = await run(
      [
        'assumption', 'list',
        '--filter-status', 'open',
        '--filter-rec', rec.id,
        '--offset', '1',
        '--limit', '1',
        '--format', 'json',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('B');
  });

  it('Slice 26 AC-6: invalid --offset → exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice26' });
    for (const value of ['-1', 'abc', '1.5']) {
      const r = await run(['assumption', 'list', '--offset', value], active.root);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(new RegExp(`invalid offset: ${value.replace(/[-.]/g, '\\$&')}`));
    }
  });

  it('Slice 26 AC-7: --offset > total → empty + message includes offset dim', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice26' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    const term = await run(['assumption', 'list', '--offset', '10'], active.root);
    expect(term.code).toBe(0);
    expect(term.stdout).toBe('No assumptions matching offset=10 recorded.\n');
  });
});
