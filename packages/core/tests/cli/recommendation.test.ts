import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence recommendation', () => {
  it('adds a manual recommendation and renders it', async () => {
    active = await tempRepo({ initialized: true, projectName: 'recommendation-cli' });

    const r = await run([
      'recommendation',
      'add',
      '--title',
      'Add milestone pre-mortems',
      '--summary',
      'Capture likely failure modes before milestone export.',
      '--priority',
      'high',
      '--readiness',
      'ready-for-milestone',
      '--area',
      'core',
      '--file',
      'packages/core/src/cli/commands/recommendation.ts',
      '--evidence',
      'Approved Praxis design requires milestone pre-mortems.',
    ], active.root);

    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/Added rec-\d{8}-001/);

    const raw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'recommendations.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    expect(parsed.recommendations[0].title).toBe('Add milestone pre-mortems');

    const evidenceRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'evidence.json'),
      'utf8',
    );
    const evidence = JSON.parse(evidenceRaw);
    expect(evidence.evidence[0].summary).toBe('Approved Praxis design requires milestone pre-mortems.');
    expect(parsed.recommendations[0].evidenceIds).toEqual([evidence.evidence[0].id]);

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/Add milestone pre-mortems/);
    expect(md).toMatch(/Approved Praxis design requires milestone pre-mortems\./);
  });

  it('lists recommendations', async () => {
    active = await tempRepo({ initialized: true });
    await run([
      'recommendation',
      'add',
      '--title',
      'Add context packets',
      '--summary',
      'Create compact context packet artifacts.',
    ], active.root);

    const r = await run(['recommendation', 'list'], active.root);

    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/rec-\d{8}-001/);
    expect(r.stdout).toMatch(/Add context packets/);
  });

  it('Slice 21 AC-1: list --format json → array of Recommendation', async () => {
    active = await tempRepo({ initialized: true });
    await run([
      'recommendation', 'add', '--title', 'A', '--summary', 's',
    ], active.root);
    const r = await run(['recommendation', 'list', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('A');
  });

  it('Slice 21 AC-4: empty ledger + --format json → []', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['recommendation', 'list', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 21 AC-5: invalid --format → exit 1 + stderr', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['recommendation', 'list', '--format', 'bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unsupported format: bogus/);
  });

  it('Slice 22 AC-1: --filter-status candidate → only candidate entries (terminal)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    // Both are 'candidate' by default; filter should include both
    const r = await run(['recommendation', 'list', '--filter-status', 'candidate'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/rec-\d{8}-001/);
    expect(r.stdout).toMatch(/rec-\d{8}-002/);
  });

  it('Slice 22 AC-4: invalid --filter-status → exit 1 + stderr `invalid status`', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['recommendation', 'list', '--filter-status', 'bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid status: bogus/);
  });

  it('Slice 22 AC-5: empty after filter + terminal → status-aware message', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(['recommendation', 'list', '--filter-status', 'accepted'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No recommendations matching status=accepted recorded.\n');
  });

  it('Slice 22 AC-6+AC-8: --filter-status + --format json → filtered JSON array', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--filter-status', 'accepted', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 24 AC-1+AC-2: --limit 2 caps output (terminal + JSON)', async () => {
    active = await tempRepo({ initialized: true });
    for (const t of ['A', 'B', 'C']) {
      await run(['recommendation', 'add', '--title', t, '--summary', 's'], active.root);
    }
    const term = await run(['recommendation', 'list', '--limit', '2'], active.root);
    expect(term.code).toBe(0);
    expect(term.stdout.trim().split('\n')).toHaveLength(2);
    const json = await run(['recommendation', 'list', '--limit', '2', '--format', 'json'], active.root);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toHaveLength(2);
  });

  it('Slice 24 AC-4+5: invalid --limit → exit 1', async () => {
    active = await tempRepo({ initialized: true });
    for (const value of ['0', '-1', 'abc', '1.5']) {
      const r = await run(['recommendation', 'list', '--limit', value], active.root);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(new RegExp(`invalid limit: ${value.replace(/[-.]/g, '\\$&')}`));
    }
  });

  it('Slice 24 AC-6: --limit > total → returns all', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(['recommendation', 'list', '--limit', '100', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(1);
  });

  it('Slice 25 AC-1+AC-4: --filter-text matches title (case-insensitive)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'Postgres migration', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Redis cache', '--summary', 's'], active.root);
    const r = await run(['recommendation', 'list', '--filter-text', 'POSTGRES', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Postgres migration');
  });

  it('Slice 25 AC-1: --filter-text matches summary', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 'mentions postgres in body'], active.root);
    const r = await run(['recommendation', 'list', '--filter-text', 'postgres', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(1);
  });

  it('Slice 25 AC-6: empty after text filter → message includes text dim', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(['recommendation', 'list', '--filter-text', 'nonexistent'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No recommendations matching text="nonexistent" recorded.\n');
  });

  it('Slice 26 AC-1+AC-2: --offset 2 skips first 2 (terminal + JSON)', async () => {
    active = await tempRepo({ initialized: true });
    for (const t of ['A', 'B', 'C', 'D', 'E']) {
      await run(['recommendation', 'add', '--title', t, '--summary', 's'], active.root);
    }
    const term = await run(['recommendation', 'list', '--offset', '2'], active.root);
    expect(term.code).toBe(0);
    const lines = term.stdout.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/ C$/);
    const json = await run(['recommendation', 'list', '--offset', '2', '--format', 'json'], active.root);
    expect(json.code).toBe(0);
    const arr = JSON.parse(json.stdout);
    expect(arr).toHaveLength(3);
    expect(arr[0].title).toBe('C');
  });

  it('Slice 26 AC-3: --offset 1 --limit 2 returns entries [1..3]', async () => {
    active = await tempRepo({ initialized: true });
    for (const t of ['A', 'B', 'C', 'D', 'E']) {
      await run(['recommendation', 'add', '--title', t, '--summary', 's'], active.root);
    }
    const r = await run(
      ['recommendation', 'list', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    expect(arr[0].title).toBe('B');
    expect(arr[1].title).toBe('C');
  });

  it('Slice 26 AC-5: --offset 0 → no-op (returns full set)', async () => {
    active = await tempRepo({ initialized: true });
    for (const t of ['A', 'B']) {
      await run(['recommendation', 'add', '--title', t, '--summary', 's'], active.root);
    }
    const r = await run(['recommendation', 'list', '--offset', '0', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(2);
  });

  it('Slice 26 AC-6: invalid --offset → exit 1', async () => {
    active = await tempRepo({ initialized: true });
    for (const value of ['-1', 'abc', '1.5']) {
      const r = await run(['recommendation', 'list', '--offset', value], active.root);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(new RegExp(`invalid offset: ${value.replace(/[-.]/g, '\\$&')}`));
    }
  });

  it('Slice 26 AC-7: --offset > total → empty + message includes offset dim', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const term = await run(['recommendation', 'list', '--offset', '10'], active.root);
    expect(term.code).toBe(0);
    expect(term.stdout).toBe('No recommendations matching offset=10 recorded.\n');
    const json = await run(['recommendation', 'list', '--offset', '10', '--format', 'json'], active.root);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual([]);
  });

  it('Slice 27 AC-1+AC-2: --reverse reverses entry order (terminal + JSON)', async () => {
    active = await tempRepo({ initialized: true });
    for (const t of ['A', 'B', 'C']) {
      await run(['recommendation', 'add', '--title', t, '--summary', 's'], active.root);
    }
    const term = await run(['recommendation', 'list', '--reverse'], active.root);
    expect(term.code).toBe(0);
    const lines = term.stdout.trim().split('\n');
    expect(lines[0]).toMatch(/ C$/);
    expect(lines[2]).toMatch(/ A$/);
    const json = await run(['recommendation', 'list', '--reverse', '--format', 'json'], active.root);
    expect(json.code).toBe(0);
    const arr = JSON.parse(json.stdout);
    expect(arr.map((r: { title: string }) => r.title)).toEqual(['C', 'B', 'A']);
  });

  it('Slice 27 AC-3: --reverse --offset 1 --limit 2 → reverse first, then page', async () => {
    active = await tempRepo({ initialized: true });
    for (const t of ['A', 'B', 'C', 'D', 'E']) {
      await run(['recommendation', 'add', '--title', t, '--summary', 's'], active.root);
    }
    const r = await run(
      ['recommendation', 'list', '--reverse', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['D', 'C']);
  });

  it('Slice 27 AC-4: --filter-text + --reverse → filter, then reverse subset', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'Postgres a', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Redis', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Postgres b', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--filter-text', 'postgres', '--reverse', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['Postgres b', 'Postgres a']);
  });

  it('Slice 27 AC-6: empty-after-filter message UNCHANGED by --reverse', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--filter-text', 'nonexistent', '--reverse'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No recommendations matching text="nonexistent" recorded.\n');
  });

  it('Slice 33 AC-4: --filter-regex matches on title or summary', async () => {
    active = await tempRepo({ initialized: true });
    await run(['recommendation', 'add', '--title', 'Add auth', '--summary', 'JWT-based'], active.root);
    await run(['recommendation', 'add', '--title', 'Remove cache', '--summary', 'unused'], active.root);
    await run(['recommendation', 'add', '--title', 'Add metrics', '--summary', 'prometheus'], active.root);
    const r = await run(
      ['recommendation', 'list', '--filter-regex', '^Add', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { title: string }) => x.title).sort()).toEqual(['Add auth', 'Add metrics']);
  });

  it('Slice 34.4 AC-1: --filter-converted-to <phaseId> returns only recs converted to that phase', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_4_happy' });
    // Seed three recs.
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    // Directly mark rec[0] converted→34.4-x and rec[2] converted→34.4-y via
    // ledger edit (the public converter has FK + state requirements that are
    // overkill for this fixture; the same edit-the-ledger pattern is used by
    // Slice 34.3's invalid-status tests).
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].status = 'converted';
    ledger.recommendations[0].convertedToPhaseId = '34.4-x';
    ledger.recommendations[2].status = 'converted';
    ledger.recommendations[2].convertedToPhaseId = '34.4-y';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--filter-converted-to', '34.4-x', '--format', 'json'],
      active.root,
    );

    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('A');
    expect(arr[0].convertedToPhaseId).toBe('34.4-x');
  });

  it('Slice 34.4 AC-2: empty result includes converted-to="<phaseId>" dim', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_4_empty' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    // No converted recs at all.
    const r = await run(
      ['recommendation', 'list', '--filter-converted-to', '99-z'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No recommendations matching converted-to="99-z" recorded.\n');
  });

  it('Slice 34.4 AC-3: candidate/accepted/deferred/rejected recs are excluded (only matches when convertedToPhaseId equals)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_4_status' });
    // Seed four recs.
    await run(['recommendation', 'add', '--title', 'cand', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'acc', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'def', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'conv', '--summary', 's'], active.root);
    // Mutate: leave [0] as candidate, [1] accepted, [2] deferred, [3] converted→34.4-target
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[1].status = 'accepted';
    ledger.recommendations[2].status = 'deferred';
    ledger.recommendations[3].status = 'converted';
    ledger.recommendations[3].convertedToPhaseId = '34.4-target';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--filter-converted-to', '34.4-target', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('conv');
  });

  it('Slice 34.4 AC-4: --filter-converted-to + --reverse → filter then reverse subset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_4_reverse' });
    // Seed three recs, all converted to the same phase.
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    for (const rec of ledger.recommendations) {
      rec.status = 'converted';
      rec.convertedToPhaseId = '34.4-shared';
    }
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--filter-converted-to', '34.4-shared', '--reverse', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['C', 'B', 'A']);
  });

  it('Slice 34.4 AC-5: JSON format with no matches returns []', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_4_json_empty' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--filter-converted-to', 'never-existed', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });
});
