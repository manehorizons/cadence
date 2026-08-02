import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';

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

  it('Slice 26 AC-1+AC-3: --offset 1 --limit 2 returns entries [1..3]', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice26' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    for (const t of ['D1', 'D2', 'D3', 'D4']) {
      await run(['decision', 'add', '--rec', rec.id, '--title', t, '--rationale', 'r'], active.root);
    }
    const r = await run(
      ['decision', 'list', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    expect(arr[0].title).toBe('D2');
    expect(arr[1].title).toBe('D3');
  });

  it('Slice 26 AC-5: --offset 0 → no-op', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice26' });
    await run(['decision', 'add', '--title', 'D1', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'D2', '--rationale', 'r'], active.root);
    const r = await run(['decision', 'list', '--offset', '0', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(2);
  });

  it('Slice 26 AC-6: invalid --offset → exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice26' });
    const r = await run(['decision', 'list', '--offset', 'abc'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid offset: abc/);
  });

  it('Slice 26 AC-7: --offset > total → empty + message includes offset dim', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice26' });
    await run(['decision', 'add', '--title', 'D', '--rationale', 'r'], active.root);
    const term = await run(['decision', 'list', '--offset', '10'], active.root);
    expect(term.code).toBe(0);
    expect(term.stdout).toBe('No decisions matching offset=10 recorded.\n');
    const json = await run(['decision', 'list', '--offset', '10', '--format', 'json'], active.root);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual([]);
  });

  it('Slice 27 AC-1+AC-2: --reverse reverses entry order', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice27' });
    for (const t of ['D1', 'D2', 'D3']) {
      await run(['decision', 'add', '--title', t, '--rationale', 'r'], active.root);
    }
    const r = await run(['decision', 'list', '--reverse', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['D3', 'D2', 'D1']);
  });

  it('Slice 27 AC-3: --reverse --offset 1 --limit 2 → reverse, then page', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice27' });
    for (const t of ['D1', 'D2', 'D3', 'D4']) {
      await run(['decision', 'add', '--title', t, '--rationale', 'r'], active.root);
    }
    const r = await run(
      ['decision', 'list', '--reverse', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['D3', 'D2']);
  });

  it('Slice 27 AC-4: --filter-status + --reverse → filter, reverse subset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice27' });
    for (const t of ['D1', 'D2', 'D3']) {
      await run(['decision', 'add', '--title', t, '--rationale', 'r'], active.root);
    }
    const r = await run(
      ['decision', 'list', '--filter-status', 'active', '--reverse', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['D3', 'D2', 'D1']);
  });

  it('Slice 28 AC-1: supersede without --by behaves as Slice 13 (no supersededBy field persisted)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice28' });
    const add = await run(['decision', 'add', '--title', 'D1', '--rationale', 'r'], active.root);
    expect(add.code).toBe(0);
    const idMatch = add.stdout.match(/Added (dec-\S+):/);
    if (!idMatch) throw new Error(`no id in: ${add.stdout}`);
    const id = idMatch[1];
    const r = await run(['decision', 'supersede', id!], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`decision ${id} → superseded\n`);
    const show = await run(['decision', 'show', id!, '--format', 'json'], active.root);
    const envelope = JSON.parse(show.stdout);
    expect(envelope.decision.status).toBe('superseded');
    expect('supersededBy' in envelope.decision).toBe(false);
  });

  it('Slice 28 AC-2+AC-9: supersede --by <newId> persists supersededBy + show JSON envelope carries it', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice28' });
    const a1 = await run(['decision', 'add', '--title', 'D1', '--rationale', 'r'], active.root);
    const a2 = await run(['decision', 'add', '--title', 'D2', '--rationale', 'r'], active.root);
    const id1 = a1.stdout.match(/Added (dec-\S+):/)?.[1];
    const id2 = a2.stdout.match(/Added (dec-\S+):/)?.[1];
    if (!id1 || !id2) throw new Error('no ids');
    const r = await run(['decision', 'supersede', id1, '--by', id2], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`decision ${id1} → superseded (by ${id2})\n`);
    const show = await run(['decision', 'show', id1, '--format', 'json'], active.root);
    const envelope = JSON.parse(show.stdout);
    expect(envelope.decision.supersededBy).toBe(id2);
  });

  it('Slice 28 AC-3: --by self-ref refused; no side effects', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice28' });
    const a = await run(['decision', 'add', '--title', 'D', '--rationale', 'r'], active.root);
    const id = a.stdout.match(/Added (dec-\S+):/)?.[1];
    if (!id) throw new Error('no id');
    const r = await run(['decision', 'supersede', id, '--by', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/decision supersede refused: cannot supersede: decision cannot supersede itself/);
    const show = await run(['decision', 'show', id, '--format', 'json'], active.root);
    expect(JSON.parse(show.stdout).decision.status).toBe('active');
  });

  it('Slice 28 AC-4: --by unknown id refused', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice28' });
    const a = await run(['decision', 'add', '--title', 'D', '--rationale', 'r'], active.root);
    const id = a.stdout.match(/Added (dec-\S+):/)?.[1];
    if (!id) throw new Error('no id');
    const r = await run(['decision', 'supersede', id, '--by', 'dec-bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/decision supersede refused: cannot supersede: decision dec-bogus not found/);
  });

  it('Slice 28 AC-5: cycle (dec-A → dec-B, supersede dec-B --by dec-A) refused', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice28' });
    const a1 = await run(['decision', 'add', '--title', 'D1', '--rationale', 'r'], active.root);
    const a2 = await run(['decision', 'add', '--title', 'D2', '--rationale', 'r'], active.root);
    const id1 = a1.stdout.match(/Added (dec-\S+):/)?.[1];
    const id2 = a2.stdout.match(/Added (dec-\S+):/)?.[1];
    if (!id1 || !id2) throw new Error('no ids');
    await run(['decision', 'supersede', id1, '--by', id2], active.root);
    const r = await run(['decision', 'supersede', id2, '--by', id1], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(new RegExp(`would create cycle \\(${id1} → ${id2}\\)`));
  });

  it('Slice 28 AC-7: reactivate clears supersededBy', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice28' });
    const a1 = await run(['decision', 'add', '--title', 'D1', '--rationale', 'r'], active.root);
    const a2 = await run(['decision', 'add', '--title', 'D2', '--rationale', 'r'], active.root);
    const id1 = a1.stdout.match(/Added (dec-\S+):/)?.[1];
    const id2 = a2.stdout.match(/Added (dec-\S+):/)?.[1];
    if (!id1 || !id2) throw new Error('no ids');
    await run(['decision', 'supersede', id1, '--by', id2], active.root);
    const reAct = await run(['decision', 'reactivate', id1], active.root);
    expect(reAct.code).toBe(0);
    const show = await run(['decision', 'show', id1, '--format', 'json'], active.root);
    const envelope = JSON.parse(show.stdout);
    expect(envelope.decision.status).toBe('active');
    expect('supersededBy' in envelope.decision).toBe(false);
  });

  it('Slice 28 AC-12: DECISIONS.md re-render after --by supersede contains the new bullet', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice28' });
    const a1 = await run(['decision', 'add', '--title', 'D1', '--rationale', 'r'], active.root);
    const a2 = await run(['decision', 'add', '--title', 'D2', '--rationale', 'r'], active.root);
    const id1 = a1.stdout.match(/Added (dec-\S+):/)?.[1];
    const id2 = a2.stdout.match(/Added (dec-\S+):/)?.[1];
    if (!id1 || !id2) throw new Error('no ids');
    await run(['decision', 'supersede', id1, '--by', id2], active.root);
    const md = await import('node:fs/promises').then((m) =>
      m.readFile(`${active!.root}/.cadence/intelligence/DECISIONS.md`, 'utf8'),
    );
    expect(md).toMatch(new RegExp(`- superseded-by: ${id2}$`, 'm'));
  });

  describe('Slice 32: --include-untied', () => {
    it('AC-1: --filter-rec X --include-untied returns tied-to-X + untied', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice32' });
      const rec = await addRecommendation(active.root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      await run(['decision', 'add', '--rec', rec.id, '--title', 'tied-X', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'untied-1', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'untied-2', '--rationale', 'r'], active.root);
      const r = await run(
        ['decision', 'list', '--filter-rec', rec.id, '--include-untied'],
        active.root,
      );
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/tied-X/);
      expect(r.stdout).toMatch(/untied-1/);
      expect(r.stdout).toMatch(/untied-2/);
    });

    it('AC-3: --include-untied alone (no --filter-rec) is a no-op — returns all decisions', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice32' });
      const rec = await addRecommendation(active.root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      await run(['decision', 'add', '--rec', rec.id, '--title', 'tied', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'untied', '--rationale', 'r'], active.root);
      const withFlag = await run(['decision', 'list', '--include-untied'], active.root);
      const without = await run(['decision', 'list'], active.root);
      expect(withFlag.code).toBe(0);
      expect(without.code).toBe(0);
      expect(withFlag.stdout).toBe(without.stdout);
    });

    it('AC-4: empty-result with both flags includes `untied=incl` dim', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice32' });
      // No decisions exist at all; filterDims should reflect both flags.
      const r = await run(
        ['decision', 'list', '--filter-rec', 'rec-bogus', '--include-untied'],
        active.root,
      );
      expect(r.code).toBe(0);
      expect(r.stdout).toBe('No decisions matching rec=rec-bogus, untied=incl recorded.\n');
    });

    it('AC-5: --format json composes — both tied and untied entries in JSON', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice32' });
      const rec = await addRecommendation(active.root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      await run(['decision', 'add', '--rec', rec.id, '--title', 'tied', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'untied', '--rationale', 'r'], active.root);
      const r = await run(
        ['decision', 'list', '--filter-rec', rec.id, '--include-untied', '--format', 'json'],
        active.root,
      );
      expect(r.code).toBe(0);
      const arr = JSON.parse(r.stdout);
      expect(arr).toHaveLength(2);
      expect(arr.map((d: { title: string }) => d.title).sort()).toEqual(['tied', 'untied']);
    });

    it('AC-6: composes with --limit (applied after expanded rec filter)', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice32' });
      const rec = await addRecommendation(active.root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      await run(['decision', 'add', '--rec', rec.id, '--title', 'tied', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'untied-1', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'untied-2', '--rationale', 'r'], active.root);
      const r = await run(
        ['decision', 'list', '--filter-rec', rec.id, '--include-untied', '--limit', '2'],
        active.root,
      );
      expect(r.code).toBe(0);
      // 3 entries match the expanded rec filter; --limit 2 caps to 2 (ledger insertion order).
      const lines = r.stdout.trim().split('\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/tied/);
      expect(lines[1]).toMatch(/untied-1/);
    });

    it('AC-7: composes with --filter-status (status narrowing still applies on union)', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice32' });
      const rec = await addRecommendation(active.root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      await run(['decision', 'add', '--rec', rec.id, '--title', 'tied-active', '--rationale', 'r'], active.root);
      const a2 = await run(['decision', 'add', '--title', 'untied-active', '--rationale', 'r'], active.root);
      const id2 = a2.stdout.match(/Added (dec-\S+):/)?.[1];
      if (!id2) throw new Error('no id');
      // Rescind untied-active so its status differs.
      await run(['decision', 'rescind', id2], active.root);
      const r = await run(
        [
          'decision', 'list',
          '--filter-rec', rec.id, '--include-untied',
          '--filter-status', 'active',
        ],
        active.root,
      );
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/tied-active/);
      expect(r.stdout).not.toMatch(/untied-active/);
    });
  });

  describe('Slice 33: --filter-regex', () => {
    it('Slice 33 AC-1: --filter-regex matches anchored pattern case-sensitively', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice33' });
      await run(['decision', 'add', '--title', 'Cycle detection added', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'cycle handling extended', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'Other thing', '--rationale', 'had cycle reference'], active.root);
      const r = await run(
        ['decision', 'list', '--filter-regex', '^Cycle', '--format', 'json'],
        active.root,
      );
      expect(r.code).toBe(0);
      const arr = JSON.parse(r.stdout);
      // Anchored ^Cycle (case-sensitive): matches "Cycle detection added" by title only.
      // "cycle handling extended" excluded (lowercase c at title start).
      // "Other thing" / "had cycle reference" excluded (title doesn't start with Cycle; rationale's "cycle" is lowercase and mid-text).
      expect(arr).toHaveLength(1);
      expect(arr[0].title).toBe('Cycle detection added');
    });

    it('Slice 33 AC-2: character-class workaround for case-insensitive match', async () => {
      // JS regex (V8) does not support inline modifier groups (?i)/(?i:...) today.
      // The documented workaround is character classes — verifying it works.
      active = await tempRepo({ initialized: true, projectName: 'slice33' });
      await run(['decision', 'add', '--title', 'Cycle one', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'cycle two', '--rationale', 'r'], active.root);
      const r = await run(
        ['decision', 'list', '--filter-regex', '[Cc]ycle', '--format', 'json'],
        active.root,
      );
      expect(r.code).toBe(0);
      const arr = JSON.parse(r.stdout);
      expect(arr).toHaveLength(2);
    });

    it('Slice 33 AC-5: --filter-text + --filter-regex → exit 1 + mutual-exclusion error', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice33' });
      await run(['decision', 'add', '--title', 'x', '--rationale', 'r'], active.root);
      const r = await run(
        ['decision', 'list', '--filter-text', 'foo', '--filter-regex', 'bar'],
        active.root,
      );
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('cannot combine --filter-text and --filter-regex');
      expect(r.stdout).toBe('');
    });

    it('AC-1: oversized --filter-regex pattern is rejected before compilation', async () => {
      active = await tempRepo({ initialized: true, projectName: 'issue249_dec' });
      await run(['decision', 'add', '--title', 'use postgres', '--rationale', 'concurrency'], active.root);
      const overlong = 'a'.repeat(5000);
      const r = await run(
        ['decision', 'list', '--filter-regex', overlong, '--format', 'json'],
        active.root,
      );
      // No length guard exists yet: this currently compiles fine and succeeds
      // (exit 0), instead of being refused before new RegExp() is ever called.
      // Once T2 lands, this must become exit 1 with a validation error on stderr.
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/decision list failed:.*(too long|exceeds|maximum length)/i);
      expect(r.stdout).toBe('');
    });

    it('AC-2: boundary-adjacent (< 200 char) --filter-regex pattern still filters correctly', async () => {
      active = await tempRepo({ initialized: true, projectName: 'issue249_dec_ac2' });
      // core is padded out to 197 chars so the anchored pattern below lands at
      // 199 chars total — close to, but comfortably under, the 200-char cap.
      const core = 'Use postgres for concurrency safety '.padEnd(197, 'x');
      expect(core.length).toBe(197);
      await run(['decision', 'add', '--title', core, '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'Other database choice', '--rationale', 'r'], active.root);
      const pattern = `^${core}$`;
      expect(pattern.length).toBe(199);
      const r = await run(
        ['decision', 'list', '--filter-regex', pattern, '--format', 'json'],
        active.root,
      );
      expect(r.code).toBe(0);
      const arr = JSON.parse(r.stdout);
      expect(arr).toHaveLength(1);
      expect(arr[0].title).toBe(core);
    });

    it('AC-3: --filter-regex length boundary is enforced at exactly 200 vs 201 chars', async () => {
      active = await tempRepo({ initialized: true, projectName: 'issue249_dec_ac3' });
      const content = 'a'.repeat(200);
      await run(['decision', 'add', '--title', content, '--rationale', 'r'], active.root);

      const pattern200 = 'a'.repeat(200);
      const r200 = await run(
        ['decision', 'list', '--filter-regex', pattern200, '--format', 'json'],
        active.root,
      );
      expect(r200.code).toBe(0);
      expect(JSON.parse(r200.stdout)).toHaveLength(1);

      const pattern201 = 'a'.repeat(201);
      const r201 = await run(
        ['decision', 'list', '--filter-regex', pattern201, '--format', 'json'],
        active.root,
      );
      expect(r201.code).toBe(1);
      expect(r201.stderr).toMatch(
        /decision list failed:.*201 characters exceeds the maximum length of 200/,
      );
      expect(r201.stdout).toBe('');
    });

    it('Slice 33 AC-6: invalid regex → exit 1 + invalid-regex stderr', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice33' });
      await run(['decision', 'add', '--title', 'x', '--rationale', 'r'], active.root);
      const r = await run(
        ['decision', 'list', '--filter-regex', '['],
        active.root,
      );
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('invalid regex:');
      expect(r.stdout).toBe('');
    });

    it('Slice 33 AC-7+9: --filter-regex composes with --filter-status + --reverse + --limit', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice33' });
      const a1 = await run(['decision', 'add', '--title', 'auth-A', '--rationale', 'r'], active.root);
      const a2 = await run(['decision', 'add', '--title', 'auth-B', '--rationale', 'r'], active.root);
      await run(['decision', 'add', '--title', 'other', '--rationale', 'r'], active.root);
      const id1 = a1.stdout.match(/Added (dec-\S+):/)?.[1];
      const id2 = a2.stdout.match(/Added (dec-\S+):/)?.[1];
      if (!id1 || !id2) throw new Error('no ids');
      await run(['decision', 'rescind', id1], active.root);
      // auth-A is now rescinded; auth-B is active; other is active.
      // Filter active + regex ^auth → auth-B only. Reverse + limit 1 should still give auth-B.
      const r = await run(
        ['decision', 'list',
          '--filter-status', 'active',
          '--filter-regex', '^auth',
          '--reverse',
          '--limit', '1',
          '--format', 'json'],
        active.root,
      );
      expect(r.code).toBe(0);
      const arr = JSON.parse(r.stdout);
      expect(arr).toHaveLength(1);
      expect(arr[0].title).toBe('auth-B');
    });

    it('Slice 33 AC-8: empty result with --filter-regex includes regex="..." dim', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice33' });
      await run(['decision', 'add', '--title', 'x', '--rationale', 'r'], active.root);
      const r = await run(
        ['decision', 'list', '--filter-regex', 'nonexistent'],
        active.root,
      );
      expect(r.code).toBe(0);
      expect(r.stdout).toBe('No decisions matching regex="nonexistent" recorded.\n');
    });
  });

  it('Slice 35 AC-sort-1 (dec): --sort-by decided returns entries by decidedAt ascending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort1' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].decidedAt = '2024-01-03T00:00:00+00:00';
    ledger.decisions[1].decidedAt = '2024-01-01T00:00:00+00:00';
    ledger.decisions[2].decidedAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--sort-by', 'decided', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'C', 'A']);
  });

  it('Slice 35 AC-sort-2 (dec): --sort-by decided:desc returns entries by decidedAt descending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort2' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].decidedAt = '2024-01-03T00:00:00+00:00';
    ledger.decisions[1].decidedAt = '2024-01-01T00:00:00+00:00';
    ledger.decisions[2].decidedAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--sort-by', 'decided:desc', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['A', 'C', 'B']);
  });

  it('Slice 35 AC-sort-3 (dec): --sort-by status orders by Zod enum declaration (active<superseded<rescinded)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort3' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].status = 'rescinded';
    ledger.decisions[1].status = 'active';
    ledger.decisions[2].status = 'superseded';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--sort-by', 'status', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // active < superseded < rescinded → B, C, A.
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'C', 'A']);
  });

  it('Slice 35 AC-sort-4 (dec): stable tie-break preserves insertion order for equal-key entries', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort4' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    // All status=active by default.
    const r = await run(
      ['decision', 'list', '--sort-by', 'status', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['A', 'B', 'C']);
  });

  it('Slice 35 AC-sort-5 (dec): sort applies after --filter-status (filtered subset only)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort5' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].status = 'superseded';
    ledger.decisions[0].decidedAt = '2024-01-02T00:00:00+00:00';
    ledger.decisions[2].status = 'superseded';
    ledger.decisions[2].decidedAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--filter-status', 'superseded', '--sort-by', 'decided', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['C', 'A']);
  });

  it('Slice 35 AC-sort-6 (dec): --sort-by <key> --reverse equals --sort-by <key>:desc', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort6' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].decidedAt = '2024-01-03T00:00:00+00:00';
    ledger.decisions[1].decidedAt = '2024-01-01T00:00:00+00:00';
    ledger.decisions[2].decidedAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const a = await run(
      ['decision', 'list', '--sort-by', 'decided', '--reverse', '--format', 'json'],
      active.root,
    );
    const b = await run(
      ['decision', 'list', '--sort-by', 'decided:desc', '--format', 'json'],
      active.root,
    );
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
  });

  it('Slice 35 AC-sort-7 (dec): --sort-by composes with --offset and --limit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort7' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'D', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].decidedAt = '2024-01-04T00:00:00+00:00';
    ledger.decisions[1].decidedAt = '2024-01-02T00:00:00+00:00';
    ledger.decisions[2].decidedAt = '2024-01-01T00:00:00+00:00';
    ledger.decisions[3].decidedAt = '2024-01-03T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--sort-by', 'decided', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'D']);
  });

  it('Slice 35 AC-sort-8 (dec): --format json emits sorted array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort8' });
    await run(['decision', 'add', '--title', 'banana', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'apple', '--rationale', 'r'], active.root);
    const r = await run(
      ['decision', 'list', '--sort-by', 'title', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr[0].title).toBe('apple');
    expect(arr[1].title).toBe('banana');
  });

  it('Slice 35 AC-sort-9 (dec): invalid key errors with allowed-list message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort9' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    const r = await run(
      ['decision', 'list', '--sort-by', 'foo'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: invalid sort key: foo (allowed: decided, status, title, rec)\n',
    );
  });

  it('Slice 35 AC-sort-10 (dec): malformed direction errors with use-asc-or-desc message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort10' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    const r = await run(
      ['decision', 'list', '--sort-by', 'decided:xyz'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "decision list failed: invalid sort direction: 'xyz' (use 'asc' or 'desc')\n",
    );
  });

  it('Slice 35 AC-sort-dec-1: --sort-by rec sorts defined rec first (asc by id), undefined last; :desc flips', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_rec' });
    // Seed one rec to tie against.
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    // Three decisions: two tied (one to rec, one to a synthetic id sorted earlier), one untied.
    await run(['decision', 'add', '--title', 'tied-z', '--rationale', 'r', '--rec', rec.id], active.root);
    await run(['decision', 'add', '--title', 'untied', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'tied-a', '--rationale', 'r', '--rec', rec.id], active.root);
    // Mutate the second tied entry's recommendationId to a string that sorts BEFORE rec.id.
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    const lowId = 'rec-00000000-000';
    ledger.decisions[2].recommendationId = lowId;
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    // Asc: tied-a (lowId) first, then tied-z (rec.id which is rec-<today>-001), then untied last.
    const asc = await run(
      ['decision', 'list', '--sort-by', 'rec', '--format', 'json'],
      active.root,
    );
    expect(asc.code).toBe(0);
    expect(JSON.parse(asc.stdout).map((x: { title: string }) => x.title)).toEqual([
      'tied-a',
      'tied-z',
      'untied',
    ]);

    // Desc: untied first, then tied-z, then tied-a.
    const desc = await run(
      ['decision', 'list', '--sort-by', 'rec:desc', '--format', 'json'],
      active.root,
    );
    expect(desc.code).toBe(0);
    expect(JSON.parse(desc.stdout).map((x: { title: string }) => x.title)).toEqual([
      'untied',
      'tied-z',
      'tied-a',
    ]);
  });

  it('Slice 36 AC-exact-1 (dec): --filter-text-exact returns only entries whose scoped field equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact1' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Adopt token bucket', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Adopt token bucket strategy', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Token bucket adoption', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'Adopt token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Adopt token bucket');
  });

  it('Slice 36 AC-exact-2 (dec): --filter-text-exact is case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact2' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Adopt token bucket', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'ADOPT TOKEN BUCKET', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Adopt token bucket');
  });

  it('Slice 36 AC-exact-3 (dec): equality not substring', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact3' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Adopt token bucket strategy', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'Adopt token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-4 (dec): empty literal refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact4' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: --filter-text-exact requires a non-empty value\n',
    );
  });

  it('Slice 36 AC-exact-5 (dec): mutex with --filter-text', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact5' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'foo', '--filter-text', 'bar'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: cannot combine --filter-text-exact with --filter-text\n',
    );
  });

  it('Slice 36 AC-exact-6 (dec): mutex with --filter-regex', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact6' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'foo', '--filter-regex', '^bar$'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: cannot combine --filter-text-exact with --filter-regex\n',
    );
  });

  it('Slice 36 AC-exact-7 (dec): no trim — surrounding whitespace significant', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact7' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'foo', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', ' foo ', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-8 (dec): empty result includes text-exact="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'no-such-title'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No decisions matching text-exact="no-such-title" recorded.\n',
    );
  });

  it('Slice 36 AC-exact-9 (dec): composes with --filter-status and --sort-by', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact9' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Same title', '--rationale', 'A'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Same title', '--rationale', 'B'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].status = 'active';
    ledger.decisions[0].decidedAt = '2024-01-02T00:00:00+00:00';
    ledger.decisions[1].status = 'superseded';
    ledger.decisions[1].decidedAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      [
        'decision', 'list',
        '--filter-text-exact', 'Same title',
        '--filter-status', 'active',
        '--sort-by', 'decided',
        '--format', 'json',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].rationale).toBe('A');
  });

  it('Slice 36 AC-exact-10 (dec): --format json emits matched entries as JSON array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact10' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'X', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Y', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'X', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('X');
    expect(Array.isArray(arr)).toBe(true);
  });

  it('Slice 36 AC-exact-dec-1: matches when only rationale (not title) equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_rationale' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'Token bucket'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'B', '--rationale', 'Different rationale'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'Token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('A');
    expect(arr[0].rationale).toBe('Token bucket');
  });

  it('Slice 37 AC-flags-1 (dec): --filter-regex-flags "i" makes --filter-regex case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags1' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Cycle planning', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'cycle review', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Other', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex', '^cycle', '--filter-regex-flags', 'i', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    const titles = arr.map((d: { title: string }) => d.title).sort();
    expect(titles).toEqual(['Cycle planning', 'cycle review']);
  });

  it('Slice 37 AC-flags-2 (dec): --filter-regex-flags "is" applies both case-insensitive AND dotAll', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags2' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Multi', '--rationale', 'placeholder'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].rationale = 'foo\nBAR';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--filter-regex', 'foo.bar', '--filter-regex-flags', 'is', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Multi');
  });

  it('Slice 37 AC-flags-3 (dec): orphan use without --filter-regex refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags3' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: --filter-regex-flags requires --filter-regex to also be set\n',
    );
  });

  it('Slice 37 AC-flags-4 (dec): empty value refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags4' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex', 'foo', '--filter-regex-flags', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: --filter-regex-flags requires a non-empty value\n',
    );
  });

  it('Slice 37 AC-flags-5 (dec): invalid flag letter refuses with exit 1, naming the letter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags5' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex', 'foo', '--filter-regex-flags', 'g'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "decision list failed: invalid flag letter: 'g' (allowed: i, m, s, u)\n",
    );
  });

  it('Slice 37 AC-flags-6 (dec): empty result includes both regex="..." AND regex-flags="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags6' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Cycle planning', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex', '^no-such-prefix', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No decisions matching regex="^no-such-prefix", regex-flags="i" recorded.\n',
    );
  });
});
