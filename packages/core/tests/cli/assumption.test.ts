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

  it('Slice 27 AC-1+AC-2: --reverse reverses entry order', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice27' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    for (const t of ['A', 'B', 'C']) {
      await run(['assumption', 'add', '--rec', rec.id, '--text', t], active.root);
    }
    const r = await run(['assumption', 'list', '--reverse', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { text: string }) => x.text)).toEqual(['C', 'B', 'A']);
  });

  it('Slice 27 AC-3: --reverse --offset 1 --limit 2 → reverse, then page', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice27' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    for (const t of ['A', 'B', 'C', 'D']) {
      await run(['assumption', 'add', '--rec', rec.id, '--text', t], active.root);
    }
    const r = await run(
      ['assumption', 'list', '--reverse', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { text: string }) => x.text)).toEqual(['C', 'B']);
  });

  it('Slice 27 AC-4: --filter-rec + --reverse → filter, reverse subset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice27' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    for (const t of ['X', 'Y', 'Z']) {
      await run(['assumption', 'add', '--rec', rec.id, '--text', t], active.root);
    }
    const r = await run(
      ['assumption', 'list', '--filter-rec', rec.id, '--reverse', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { text: string }) => x.text)).toEqual(['Z', 'Y', 'X']);
  });

  it('Slice 33 AC-3: --filter-regex matches on text field', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice33' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'race condition in handler'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'memory leak'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'race condition in writer'], active.root);
    const r = await run(
      ['assumption', 'list', '--filter-regex', 'race condition', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    expect(arr.every((a: { text: string }) => /race condition/.test(a.text))).toBe(true);
  });

  it('Slice 35 AC-sort-1 (asn): --sort-by created returns entries by createdAt ascending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort1' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.assumptions[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.assumptions[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--sort-by', 'created', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['B', 'C', 'A']);
  });

  it('Slice 35 AC-sort-2 (asn): --sort-by created:desc returns entries by createdAt descending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort2' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.assumptions[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.assumptions[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--sort-by', 'created:desc', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['A', 'C', 'B']);
  });

  it('Slice 35 AC-sort-3 (asn): --sort-by status orders by Zod enum declaration (open<validated<rejected)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort3' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].status = 'rejected';
    ledger.assumptions[1].status = 'open';
    ledger.assumptions[2].status = 'validated';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--sort-by', 'status', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // open < validated < rejected → B, C, A.
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['B', 'C', 'A']);
  });

  it('Slice 35 AC-sort-4 (asn): stable tie-break preserves insertion order for equal-key entries', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort4' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    // Three assumptions, all status=open (default).
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const r = await run(
      ['assumption', 'list', '--sort-by', 'status', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['A', 'B', 'C']);
  });

  it('Slice 35 AC-sort-5 (asn): sort applies after --filter-status (filtered subset only)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort5' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].status = 'validated';
    ledger.assumptions[0].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.assumptions[2].status = 'validated';
    ledger.assumptions[2].createdAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--filter-status', 'validated', '--sort-by', 'created', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    expect(arr.map((x: { text: string }) => x.text)).toEqual(['C', 'A']);
  });

  it('Slice 35 AC-sort-6 (asn): --sort-by <key> --reverse equals --sort-by <key>:desc', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort6' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.assumptions[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.assumptions[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const a = await run(
      ['assumption', 'list', '--sort-by', 'created', '--reverse', '--format', 'json'],
      active.root,
    );
    const b = await run(
      ['assumption', 'list', '--sort-by', 'created:desc', '--format', 'json'],
      active.root,
    );
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
  });

  it('Slice 35 AC-sort-7 (asn): --sort-by composes with --offset and --limit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort7' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'D'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].createdAt = '2024-01-04T00:00:00+00:00';
    ledger.assumptions[1].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.assumptions[2].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.assumptions[3].createdAt = '2024-01-03T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--sort-by', 'created', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['B', 'D']);
  });

  it('Slice 35 AC-sort-8 (asn): --format json emits sorted array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'banana'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'apple'], active.root);
    const r = await run(
      ['assumption', 'list', '--sort-by', 'text', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr[0].text).toBe('apple');
    expect(arr[1].text).toBe('banana');
  });

  it('Slice 35 AC-sort-9 (asn): invalid key errors with allowed-list message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort9' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    const r = await run(
      ['assumption', 'list', '--sort-by', 'foo'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: invalid sort key: foo (allowed: created, status, text, rec)\n',
    );
  });

  it('Slice 35 AC-sort-10 (asn): malformed direction errors with use-asc-or-desc message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort10' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    const r = await run(
      ['assumption', 'list', '--sort-by', 'created:xyz'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "assumption list failed: invalid sort direction: 'xyz' (use 'asc' or 'desc')\n",
    );
  });

  it('Slice 36 AC-exact-1 (asn): --filter-text-exact returns only entries whose text equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact1' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit will handle bursts'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit will handle bursts gracefully'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'Bursts will be rare'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'Rate limit will handle bursts', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('Rate limit will handle bursts');
  });

  it('Slice 36 AC-exact-2 (asn): --filter-text-exact is case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact2' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit will handle bursts'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'RATE LIMIT WILL HANDLE BURSTS', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('Rate limit will handle bursts');
  });

  it('Slice 36 AC-exact-3 (asn): equality not substring', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact3' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit will handle bursts gracefully'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'Rate limit will handle bursts', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-4 (asn): empty literal refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact4' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: --filter-text-exact requires a non-empty value\n',
    );
  });

  it('Slice 36 AC-exact-5 (asn): mutex with --filter-text', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact5' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'foo', '--filter-text', 'bar'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: cannot combine --filter-text-exact with --filter-text\n',
    );
  });

  it('Slice 36 AC-exact-6 (asn): mutex with --filter-regex', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact6' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'foo', '--filter-regex', '^bar$'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: cannot combine --filter-text-exact with --filter-regex\n',
    );
  });

  it('Slice 36 AC-exact-7 (asn): no trim — surrounding whitespace significant', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact7' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', ' foo ', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-8 (asn): empty result includes text-exact="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'no-such-text'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No assumptions matching text-exact="no-such-text" recorded.\n',
    );
  });

  it('Slice 36 AC-exact-9 (asn): composes with --filter-status and --sort-by', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact9' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'Same text'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'Same text'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].status = 'validated';
    ledger.assumptions[0].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.assumptions[1].status = 'open';
    ledger.assumptions[1].createdAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      [
        'assumption', 'list',
        '--filter-text-exact', 'Same text',
        '--filter-status', 'validated',
        '--sort-by', 'created',
        '--format', 'json',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].status).toBe('validated');
  });

  it('Slice 36 AC-exact-10 (asn): --format json emits matched entries as JSON array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact10' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'X'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'Y'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'X', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('X');
    expect(Array.isArray(arr)).toBe(true);
  });
});
