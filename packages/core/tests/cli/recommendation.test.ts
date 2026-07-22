import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { Recommendation, RecommendationLedger } from '@manehorizons/cadence-types';
import { applyRecommendationPromotion } from '../../src/intelligence/store/recommendations.js';

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

  it('AC-2: --scout-id persists scoutId on the recommendation', async () => {
    active = await tempRepo({ initialized: true, projectName: 'recommendation-scout-cli' });

    const r = await run([
      'recommendation', 'add',
      '--title', 'scout survivor',
      '--summary', 'landed by a scout session',
      '--readiness', 'raw-idea',
      '--scout-id', 'scout-20260605-1430',
    ], active.root);

    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');

    const raw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'recommendations.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    expect(parsed.recommendations[0].scoutId).toBe('scout-20260605-1430');
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

  it('AC-1: oversized --filter-regex pattern is rejected before compilation', async () => {
    active = await tempRepo({ initialized: true, projectName: 'issue249_rec' });
    await run(['recommendation', 'add', '--title', 'Add auth', '--summary', 'JWT-based'], active.root);
    const overlong = 'a'.repeat(5000);
    const r = await run(
      ['recommendation', 'list', '--filter-regex', overlong, '--format', 'json'],
      active.root,
    );
    // No length guard exists yet: this currently compiles fine and succeeds
    // (exit 0), instead of being refused before new RegExp() is ever called.
    // Once T2 lands, this must become exit 1 with a validation error on stderr.
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/recommendation list failed:.*(too long|exceeds|maximum length)/i);
    expect(r.stdout).toBe('');
  });

  it('AC-2: boundary-adjacent (< 200 char) --filter-regex pattern still filters correctly', async () => {
    active = await tempRepo({ initialized: true, projectName: 'issue249_rec_ac2' });
    // core is padded out to 197 chars so the anchored pattern below lands at
    // 199 chars total — close to, but comfortably under, the 200-char cap.
    const core = 'Add authentication using JWT tokens for '.padEnd(197, 'x');
    expect(core.length).toBe(197);
    await run(['recommendation', 'add', '--title', core, '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Remove old cache layer', '--summary', 'unused'], active.root);
    const pattern = `^${core}$`;
    expect(pattern.length).toBe(199);
    const r = await run(
      ['recommendation', 'list', '--filter-regex', pattern, '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe(core);
  });

  it('AC-3: --filter-regex length boundary is enforced at exactly 200 vs 201 chars', async () => {
    active = await tempRepo({ initialized: true, projectName: 'issue249_rec_ac3' });
    const content = 'a'.repeat(200);
    await run(['recommendation', 'add', '--title', content, '--summary', 's'], active.root);

    const pattern200 = 'a'.repeat(200);
    const r200 = await run(
      ['recommendation', 'list', '--filter-regex', pattern200, '--format', 'json'],
      active.root,
    );
    expect(r200.code).toBe(0);
    expect(JSON.parse(r200.stdout)).toHaveLength(1);

    const pattern201 = 'a'.repeat(201);
    const r201 = await run(
      ['recommendation', 'list', '--filter-regex', pattern201, '--format', 'json'],
      active.root,
    );
    expect(r201.code).toBe(1);
    expect(r201.stderr).toMatch(
      /recommendation list failed:.*201 characters exceeds the maximum length of 200/,
    );
    expect(r201.stdout).toBe('');
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

  it('Slice 35 AC-sort-1 (rec): --sort-by created returns entries by createdAt ascending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort1' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.recommendations[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'created', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['B', 'C', 'A']);
  });

  it('Slice 35 AC-sort-2 (rec): --sort-by created:desc returns entries by createdAt descending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort2' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.recommendations[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'created:desc', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['A', 'C', 'B']);
  });

  it('Slice 35 AC-sort-3 (rec): --sort-by priority orders by Zod enum declaration (low<medium<high<critical)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort3' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's', '--priority', 'critical'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's', '--priority', 'low'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's', '--priority', 'high'], active.root);
    await run(['recommendation', 'add', '--title', 'D', '--summary', 's', '--priority', 'medium'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'priority', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'D', 'C', 'A']);
  });

  it('Slice 35 AC-sort-4 (rec): stable tie-break preserves insertion order for equal-key entries', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort4' });
    // Three recs all with priority=medium (the default).
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'priority', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // All equal keys → insertion order preserved.
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['A', 'B', 'C']);
  });

  it('Slice 35 AC-sort-5 (rec): sort applies after --filter-status (filtered subset only)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort5' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    // Mark [0] and [2] as accepted; leave [1] as candidate.
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].status = 'accepted';
    ledger.recommendations[0].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.recommendations[2].status = 'accepted';
    ledger.recommendations[2].createdAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--filter-status', 'accepted', '--sort-by', 'created', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    // Only the two accepted recs returned, in chronological order.
    expect(arr).toHaveLength(2);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['C', 'A']);
  });

  it('Slice 35 AC-sort-6 (rec): --sort-by <key> --reverse equals --sort-by <key>:desc', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort6' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.recommendations[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const a = await run(
      ['recommendation', 'list', '--sort-by', 'created', '--reverse', '--format', 'json'],
      active.root,
    );
    const b = await run(
      ['recommendation', 'list', '--sort-by', 'created:desc', '--format', 'json'],
      active.root,
    );
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
  });

  it('Slice 35 AC-sort-7 (rec): --sort-by composes with --offset and --limit (pagination on sorted output)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort7' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'D', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].createdAt = '2024-01-04T00:00:00+00:00';
    ledger.recommendations[1].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.recommendations[2].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[3].createdAt = '2024-01-03T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'created', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // Asc by created: [C(Jan 1), B(Jan 2), D(Jan 3), A(Jan 4)]. offset 1 → skip C. limit 2 → take [B, D].
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'D']);
  });

  it('Slice 35 AC-sort-8 (rec): --format json emits sorted array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort8' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's', '--priority', 'low'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's', '--priority', 'critical'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'priority:desc', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    // Critical first.
    expect(arr[0].title).toBe('B');
    expect(arr[1].title).toBe('A');
  });

  it('Slice 35 AC-sort-9 (rec): invalid key errors with allowed-list message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort9' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'foo'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: invalid sort key: foo (allowed: created, updated, priority, status, title, leverage, risk, confidence, decay)\n',
    );
  });

  it('Slice 35 AC-sort-10 (rec): malformed direction errors with use-asc-or-desc message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort10' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'created:xyz'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "recommendation list failed: invalid sort direction: 'xyz' (use 'asc' or 'desc')\n",
    );
  });

  it('Slice 35 AC-sort-rec-1: --sort-by leverage uses numeric compare (not lexicographic)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_lev' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    // Picked so numeric and lexicographic orders differ:
    //   numeric asc:  2, 9, 10  → B, C, A
    //   lexicographic asc on string("10") < string("2") < string("9") → A, B, C
    ledger.recommendations[0].leverageScore = 10;
    ledger.recommendations[1].leverageScore = 2;
    ledger.recommendations[2].leverageScore = 9;
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'leverage', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'C', 'A']);
  });

  it('Slice 35 AC-sort-rec-2: --sort-by decay orders by Zod enum declaration (fresh<aging<stale<superseded<contradicted<needs-revalidation)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_decay' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'D', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].decayState = 'stale';
    ledger.recommendations[1].decayState = 'fresh';
    ledger.recommendations[2].decayState = 'needs-revalidation';
    ledger.recommendations[3].decayState = 'aging';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'decay', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // Enum order: fresh, aging, stale, ..., needs-revalidation → B, D, A, C.
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'D', 'A', 'C']);
  });

  it('Slice 36 AC-exact-1 (rec): --filter-text-exact returns only entries whose scoped field equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact1' });
    await run(['recommendation', 'add', '--title', 'Adopt token bucket', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Adopt token bucket strategy', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Token bucket adoption', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'Adopt token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Adopt token bucket');
  });

  it('Slice 36 AC-exact-2 (rec): --filter-text-exact is case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact2' });
    await run(['recommendation', 'add', '--title', 'Adopt token bucket', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'ADOPT TOKEN BUCKET', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Adopt token bucket');
  });

  it('Slice 36 AC-exact-3 (rec): equality not substring — substring superset does NOT match', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact3' });
    await run(['recommendation', 'add', '--title', 'Adopt token bucket strategy', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'Adopt token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-4 (rec): empty literal refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact4' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: --filter-text-exact requires a non-empty value\n',
    );
  });

  it('Slice 36 AC-exact-5 (rec): mutex with --filter-text — combined errors with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact5' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'foo', '--filter-text', 'bar'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: cannot combine --filter-text-exact with --filter-text\n',
    );
  });

  it('Slice 36 AC-exact-6 (rec): mutex with --filter-regex — combined errors with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact6' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'foo', '--filter-regex', '^bar$'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: cannot combine --filter-text-exact with --filter-regex\n',
    );
  });

  it('Slice 36 AC-exact-7 (rec): no trim — surrounding whitespace in literal is significant', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact7' });
    await run(['recommendation', 'add', '--title', 'foo', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', ' foo ', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-8 (rec): empty result includes text-exact="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact8' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'no-such-title'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No recommendations matching text-exact="no-such-title" recorded.\n',
    );
  });

  it('Slice 36 AC-exact-9 (rec): composes with --filter-status and --sort-by', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact9' });
    await run(['recommendation', 'add', '--title', 'Same title', '--summary', 'A'], active.root);
    await run(['recommendation', 'add', '--title', 'Same title', '--summary', 'B'], active.root);
    await run(['recommendation', 'add', '--title', 'Other title', '--summary', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].status = 'accepted';
    ledger.recommendations[0].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.recommendations[1].status = 'candidate';
    ledger.recommendations[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[2].status = 'accepted';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      [
        'recommendation', 'list',
        '--filter-text-exact', 'Same title',
        '--filter-status', 'accepted',
        '--sort-by', 'created',
        '--format', 'json',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].summary).toBe('A');
  });

  it('Slice 36 AC-exact-10 (rec): --format json emits matched entries as JSON array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact10' });
    await run(['recommendation', 'add', '--title', 'X', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Y', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'X', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('X');
    expect(Array.isArray(arr)).toBe(true);
  });

  it('Slice 36 AC-exact-rec-1: matches when only summary (not title) equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_summary' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 'Token bucket'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 'Different summary'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'Token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('A');
    expect(arr[0].summary).toBe('Token bucket');
  });

  it('Slice 37 AC-flags-1 (rec): --filter-regex-flags "i" makes --filter-regex case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags1' });
    await run(['recommendation', 'add', '--title', 'Cycle planning', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'cycle review', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Other', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', '^cycle', '--filter-regex-flags', 'i', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    const titles = arr.map((r: { title: string }) => r.title).sort();
    expect(titles).toEqual(['Cycle planning', 'cycle review']);
  });

  it('Slice 37 AC-flags-2 (rec): --filter-regex-flags "is" applies both case-insensitive AND dotAll', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags2' });
    await run(['recommendation', 'add', '--title', 'Multi', '--summary', 'placeholder'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].summary = 'foo\nBAR';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--filter-regex', 'foo.bar', '--filter-regex-flags', 'is', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Multi');
  });

  it('Slice 37 AC-flags-3 (rec): orphan use without --filter-regex refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags3' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: --filter-regex-flags requires --filter-regex to also be set\n',
    );
  });

  it('Slice 37 AC-flags-4 (rec): empty value refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags4' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', 'foo', '--filter-regex-flags', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: --filter-regex-flags requires a non-empty value\n',
    );
  });

  it('Slice 37 AC-flags-5 (rec): invalid flag letter refuses with exit 1, naming the letter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags5' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', 'foo', '--filter-regex-flags', 'g'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "recommendation list failed: invalid flag letter: 'g' (allowed: i, m, s, u)\n",
    );
  });

  it('Slice 37 AC-flags-6 (rec): empty result includes both regex="..." AND regex-flags="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags6' });
    await run(['recommendation', 'add', '--title', 'Cycle planning', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', '^no-such-prefix', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No recommendations matching regex="^no-such-prefix", regex-flags="i" recorded.\n',
    );
  });

  it('Slice 37 AC-flags-rec-1: duplicate flag letter refuses with exit 1, naming the letter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags_rec1' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', 'foo', '--filter-regex-flags', 'ii'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "recommendation list failed: duplicate flag letter: 'i'\n",
    );
  });

  describe('evidence add', () => {
    it('adds a note as evidence and links it to the recommendation', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_evidence_add_happy' });
      const added = await run(
        ['recommendation', 'add', '--title', 'A', '--summary', 's'],
        active.root,
      );
      const recId = added.stdout.match(/Added (rec-\d{8}-\d{3})/)?.[1];
      expect(recId).toBeDefined();

      const r = await run(
        ['recommendation', 'evidence', 'add', recId as string, '--note', 'Saw it fail in CI'],
        active.root,
      );

      expect(r.code).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout).toMatch(
        new RegExp(`^Added ev-\\d{8}-\\d{3} to ${recId}: Saw it fail in CI\\n$`),
      );

      const recRaw = await readFile(
        join(active.root, '.cadence', 'intelligence', 'recommendations.json'),
        'utf8',
      );
      const recLedger = JSON.parse(recRaw);
      const rec = recLedger.recommendations.find((x: { id: string }) => x.id === recId);
      expect(rec).toBeDefined();

      const evRaw = await readFile(
        join(active.root, '.cadence', 'intelligence', 'evidence.json'),
        'utf8',
      );
      const evLedger = JSON.parse(evRaw);
      const newEvidence = evLedger.evidence.find(
        (e: { summary: string }) => e.summary === 'Saw it fail in CI',
      );
      expect(newEvidence).toBeDefined();
      expect(rec.evidenceIds).toContain(newEvidence.id);
    });

    it('refuses when the recommendation id does not exist', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_evidence_add_refused' });

      const r = await run(
        ['recommendation', 'evidence', 'add', 'rec-99999999-999', '--note', 'irrelevant'],
        active.root,
      );

      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(
        /recommendation evidence add refused: recommendation rec-99999999-999 not found/,
      );
      // AC-4: even with no nearby ids in the (empty) ledger, the refusal still
      // names the exact command to browse and find a valid id.
      expect(r.stderr).toMatch(/Run `cadence recommendation list` to browse\./);
    });

    it('AC-4: not-found suggests the nearest-ID match from the loaded ledger', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_evidence_add_nearest' });
      const added = await run(
        ['recommendation', 'add', '--title', 'A', '--summary', 's'],
        active.root,
      );
      const recId = added.stdout.match(/Added (rec-\d{8}-\d{3})/)?.[1] as string;
      expect(recId).toBeDefined();
      // Same date prefix, wrong sequence number — a plausible typo of recId.
      const nearMiss = recId.replace(/-(\d{3})$/, '-002');
      expect(nearMiss).not.toBe(recId);

      const r = await run(
        ['recommendation', 'evidence', 'add', nearMiss, '--note', 'irrelevant'],
        active.root,
      );

      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(
        new RegExp(
          `recommendation evidence add refused: recommendation ${nearMiss} not found\\. Did you mean ${recId}\\? Run \`cadence recommendation list\` to browse\\.`,
        ),
      );
    });
  });

  describe('T4: not-found and refusal message enrichment (AC-4/AC-5)', () => {
    it('AC-4: recommendation convert routes not-found through the shared message + nearest match', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_t4_convert_notfound' });
      const added = await run(
        ['recommendation', 'add', '--title', 'A', '--summary', 's'],
        active.root,
      );
      const recId = added.stdout.match(/Added (rec-\d{8}-\d{3})/)?.[1] as string;
      const nearMiss = recId.replace(/-(\d{3})$/, '-777');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(active.root, '.cadence/phases/t4-convert-phase'), { recursive: true });

      const r = await run(
        ['recommendation', 'convert', nearMiss, '--to-phase', 't4-convert-phase'],
        active.root,
      );

      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(
        new RegExp(`recommendation ${nearMiss} not found\\. Did you mean ${recId}\\?`),
      );
      expect(r.stderr).toMatch(/Run `cadence recommendation list` to browse\./);
    });

    it('AC-4: recommendation promote routes not-found through the shared message + browse command', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_t4_promote_notfound' });

      const r = await run(
        ['recommendation', 'promote', 'rec-99999999-042', '--status', 'accepted'],
        active.root,
      );

      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/recommendation rec-99999999-042 not found\./);
      expect(r.stderr).toMatch(/Run `cadence recommendation list` to browse\./);
    });

    it('AC-4: recommendation archive not-found names "in active recommendations" + browse command', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_t4_archive_notfound' });

      const r = await run(['recommendation', 'archive', 'rec-99999999-042'], active.root);

      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(
        /recommendation rec-99999999-042 not found in active recommendations\./,
      );
      expect(r.stderr).toMatch(/Run `cadence recommendation list` to browse\./);
    });

    it('AC-4: recommendation unarchive not-found names "in archived recommendations" + browse command', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_t4_unarchive_notfound' });

      const r = await run(['recommendation', 'unarchive', 'rec-99999999-042'], active.root);

      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(
        /recommendation rec-99999999-042 not found in archived recommendations\./,
      );
      expect(r.stderr).toMatch(/Run `cadence recommendation list` to browse\./);
    });

    it('AC-5: convert refusal keeps the concrete-status text and appends the unblocking promote command', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_t4_convert_status' });
      const added = await run(
        ['recommendation', 'add', '--title', 'A', '--summary', 's'],
        active.root,
      );
      const recId = added.stdout.match(/Added (rec-\d{8}-\d{3})/)?.[1] as string;
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(active.root, '.cadence/phases/t4-status-phase'), { recursive: true });
      // Mutate to 'deferred' — an ineligible source status for `convert`.
      const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
      const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
      ledger.recommendations[0].status = 'deferred';
      const { writeFile: wf } = await import('node:fs/promises');
      await wf(ledgerPath, JSON.stringify(ledger, null, 2));

      const r = await run(
        ['recommendation', 'convert', recId, '--to-phase', 't4-status-phase'],
        active.root,
      );

      expect(r.code).not.toBe(0);
      // Existing concrete-status text retained verbatim.
      expect(r.stderr).toMatch(/cannot convert recommendation in status deferred/);
      // New: the exact unblocking command is appended.
      expect(r.stderr).toMatch(
        new RegExp(`cadence recommendation promote ${recId} --status=accepted`),
      );
    });

    it('AC-5: convert refusal (phase FK miss) appends the exact phase-creation command', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_t4_convert_phase_fk' });
      const added = await run(
        ['recommendation', 'add', '--title', 'A', '--summary', 's'],
        active.root,
      );
      const recId = added.stdout.match(/Added (rec-\d{8}-\d{3})/)?.[1] as string;

      const r = await run(
        ['recommendation', 'convert', recId, '--to-phase', 'no-such-phase'],
        active.root,
      );

      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/cannot convert: phase no-such-phase not found/);
      expect(r.stderr).toMatch(/cadence draft new no-such-phase/);
    });

    // AC-5: three of applyRecommendationPromotion's refusals are shadowed by
    // the CLI's own earlier guard clauses (packages/core/src/cli/commands/
    // recommendation.ts) and so are unreachable from the black-box CLI
    // surface this file otherwise tests:
    //   - no --status/--readiness at all → CLI prints its own
    //     'recommendation promote: provide --status and/or --readiness'
    //     before ever calling the store layer.
    //   - `--status converted` / `--status settle-pending` → filtered out of
    //     the CLI's `PROMOTE_STATUSES` allow-list ("invalid --status").
    // Exercise the pure store-layer function directly instead (as the
    // sibling unit test file `tests/intelligence/recommendation-promote.test.ts`
    // already does for this same function) rather than asserting against a
    // CLI-level message that isn't the one this task changed.
    function mkRec(id: string, status: Recommendation['status']): Recommendation {
      return {
        id,
        title: `${id} title`,
        summary: `${id} summary`,
        source: 'manual',
        status,
        readiness: 'raw-idea',
        priority: 'medium',
        leverageScore: 5,
        riskScore: 5,
        confidence: 0.5,
        decayState: 'fresh',
        affectedAreas: [],
        affectedFiles: [],
        evidenceIds: [],
        assumptionIds: [],
        decisionIds: [],
        createdAt: '2026-05-25T00:00:00.000Z',
        updatedAt: '2026-05-25T00:00:00.000Z',
      };
    }
    function mkLedger(recs: Recommendation[]): RecommendationLedger {
      return { schemaVersion: 1, recommendations: recs, archived: [] };
    }

    it('AC-5: "nothing to promote" refusal includes an example command', () => {
      const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
      const res = applyRecommendationPromotion(
        ledger,
        'rec-1',
        {},
        new Date('2026-06-04T12:00:00.000Z'),
      );
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error('expected refusal');
      // Existing concrete text retained verbatim.
      expect(res.error).toMatch(/provide --status and\/or --readiness/);
      // New: an example of the exact command shape.
      expect(res.error).toMatch(/cadence recommendation promote rec-1 --status=accepted/);
    });

    it('AC-5: promote-to-converted refusal appends the full `convert --to-phase` command', () => {
      const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
      const res = applyRecommendationPromotion(
        ledger,
        'rec-1',
        { status: 'converted' },
        new Date('2026-06-04T12:00:00.000Z'),
      );
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error('expected refusal');
      // Existing concrete text retained verbatim.
      expect(res.error).toMatch(/cannot promote to converted/);
      // New: the exact unblocking command (with the real id and --to-phase).
      expect(res.error).toMatch(/cadence recommendation convert rec-1 --to-phase <phaseId>/);
    });

    it('AC-5: promote-to-settle-pending refusal appends the `cadence settle run --auto` hint', () => {
      const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
      const res = applyRecommendationPromotion(
        ledger,
        'rec-1',
        { status: 'settle-pending' },
        new Date('2026-06-04T12:00:00.000Z'),
      );
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error('expected refusal');
      // Existing concrete text retained verbatim.
      expect(res.error).toMatch(/cannot promote to settle-pending/);
      // New: the exact unblocking command.
      expect(res.error).toMatch(/cadence settle run --auto/);
    });

    it('AC-5: shippedRef-without-shipped refusal appends the exact `--status=shipped --ref` command', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_t4_promote_shippedref' });
      const added = await run(
        ['recommendation', 'add', '--title', 'A', '--summary', 's'],
        active.root,
      );
      const recId = added.stdout.match(/Added (rec-\d{8}-\d{3})/)?.[1] as string;

      const r = await run(
        ['recommendation', 'promote', recId, '--status', 'accepted', '--ref', 'PR #1'],
        active.root,
      );

      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/shippedRef \(--ref\) is only valid when promoting to shipped/);
      expect(r.stderr).toMatch(
        new RegExp(`cadence recommendation promote ${recId} --status=shipped --ref`),
      );
    });

    it('AC-5: terminal-status refusal from a sole-exception status (converted) names the shipped escape hatch', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_t4_promote_terminal_conv' });
      const added = await run(
        ['recommendation', 'add', '--title', 'A', '--summary', 's'],
        active.root,
      );
      const recId = added.stdout.match(/Added (rec-\d{8}-\d{3})/)?.[1] as string;
      const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
      const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
      ledger.recommendations[0].status = 'converted';
      ledger.recommendations[0].convertedToPhaseId = 't4-terminal-phase';
      const { writeFile: wf } = await import('node:fs/promises');
      await wf(ledgerPath, JSON.stringify(ledger, null, 2));

      const r = await run(
        ['recommendation', 'promote', recId, '--status', 'accepted'],
        active.root,
      );

      expect(r.code).not.toBe(0);
      // Existing concrete-status text retained verbatim.
      expect(r.stderr).toMatch(/cannot promote recommendation in terminal status converted/);
      // New: the sole sanctioned escape hatch is named explicitly.
      expect(r.stderr).toMatch(
        new RegExp(`cadence recommendation promote ${recId} --status=shipped --ref`),
      );
    });

    it('AC-5: terminal-status refusal from a fully-terminal status (rejected) states no promotion is available', async () => {
      active = await tempRepo({ initialized: true, projectName: 'rec_t4_promote_terminal_rej' });
      const added = await run(
        ['recommendation', 'add', '--title', 'A', '--summary', 's'],
        active.root,
      );
      const recId = added.stdout.match(/Added (rec-\d{8}-\d{3})/)?.[1] as string;
      const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
      const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
      ledger.recommendations[0].status = 'rejected';
      const { writeFile: wf } = await import('node:fs/promises');
      await wf(ledgerPath, JSON.stringify(ledger, null, 2));

      const r = await run(
        ['recommendation', 'promote', recId, '--status', 'accepted'],
        active.root,
      );

      expect(r.code).not.toBe(0);
      expect(r.stderr).toMatch(/cannot promote recommendation in terminal status rejected/);
      expect(r.stderr).toMatch(/no promotion is available from terminal status rejected/);
    });
  });
});
