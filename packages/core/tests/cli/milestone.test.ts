import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

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

async function seedRecs(root: string): Promise<void> {
  const dir = join(root, '.cadence', 'intelligence');
  await mkdir(dir, { recursive: true });
  const rec = {
    id: 'rec-1',
    title: 'ship it',
    summary: 'because',
    source: 'manual',
    status: 'accepted',
    readiness: 'ready-for-milestone',
    priority: 'high',
    leverageScore: 5,
    riskScore: 2,
    confidence: 0.8,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
  await writeFile(
    join(dir, 'recommendations.json'),
    JSON.stringify({ schemaVersion: 1, recommendations: [rec] }, null, 2),
  );
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence milestone', () => {
  it('propose writes artifacts and prints the rendered view', async () => {
    active = await tempRepo({ initialized: true, projectName: 'milestone-cli' });
    await seedRecs(active.root);

    const r = await run(['milestone', 'propose'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/# CADENCE Milestone Candidates/);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'milestones.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).milestones[0].id).toBe('mil-rec-rec-1');
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'MILESTONES.md'),
      'utf8',
    );
    expect(md).toMatch(/### mil-rec-rec-1 — ship it/);
  });

  it('accept then illegal re-accept exits 1; defer works; list --json parses', async () => {
    active = await tempRepo({ initialized: true });
    await seedRecs(active.root);
    await run(['milestone', 'propose'], active.root);

    const ok = await run(['milestone', 'accept', 'mil-rec-rec-1'], active.root);
    expect(ok.code).toBe(0);

    const bad = await run(['milestone', 'accept', 'mil-rec-rec-1'], active.root);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toMatch(/cannot accept milestone in status accepted/);

    const def = await run(['milestone', 'defer', 'mil-rec-rec-1'], active.root);
    expect(def.code).toBe(0);

    const list = await run(['milestone', 'list', '--json'], active.root);
    expect(list.code).toBe(0);
    const parsed = JSON.parse(list.stdout);
    expect(parsed.milestones[0].status).toBe('deferred');
  });

  it('propose --json emits a parseable milestone ledger', async () => {
    active = await tempRepo({ initialized: true });
    await seedRecs(active.root);
    const r = await run(['milestone', 'propose', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.milestones[0].id).toBe('mil-rec-rec-1');
  });

  it('propose degrades cleanly with an empty ledger (exit 0)', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['milestone', 'propose'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/## Proposed/);
    expect(r.stdout).toMatch(/None\./);
  });

  it('corrupt milestones.json -> list exits 1 and does not silently reset it', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.cadence', 'intelligence');
    await mkdir(dir, { recursive: true });
    const garbage = '{ this is not valid json';
    await writeFile(join(dir, 'milestones.json'), garbage);

    const r = await run(['milestone', 'list'], active.root);
    expect(r.code).toBe(1);
    // file left untouched (no silent reset to an empty ledger)
    const after = await readFile(join(dir, 'milestones.json'), 'utf8');
    expect(after).toBe(garbage);
  });

  it('premortem refreshes an accepted milestone and --json emits the ledger', async () => {
    const t = await tempRepo({ initialized: true });
    active = t;
    await seedRecs(t.root); // rec-1, accepted, ready-for-milestone
    expect((await run(['milestone', 'propose'], t.root)).code).toBe(0);
    // discover the real id — the propose test proves it is 'mil-rec-rec-1' but we read
    // the live ledger to stay robust against any future id-derivation changes
    const list = JSON.parse((await run(['milestone', 'list', '--json'], t.root)).stdout);
    const mid = list.milestones[0].id;
    expect((await run(['milestone', 'accept', mid], t.root)).code).toBe(0);

    const j = await run(['milestone', 'premortem', mid, '--json'], t.root);
    expect(j.code).toBe(0);
    const ledger = JSON.parse(j.stdout);
    expect(ledger.schemaVersion).toBe(1);
    const m = ledger.milestones.find((x: { id: string }) => x.id === mid);
    expect(m.preMortem).toBeDefined();

    const plain = await run(['milestone', 'premortem', mid], t.root);
    expect(plain.code).toBe(0);
    expect(plain.stdout).toContain(`milestone ${mid} → pre-mortem refreshed`);
  });

  it('premortem refuses an unknown id (exit 1, stderr)', async () => {
    const t = await tempRepo({ initialized: true });
    active = t;
    const miss = await run(['milestone', 'premortem', 'nope'], t.root);
    expect(miss.code).toBe(1);
    expect(miss.stderr).toContain('milestone premortem refused: milestone nope not found');
  });

  it('export --to cadence stages a SPEC for an accepted milestone', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.cadence', 'intelligence');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'recommendations.json'),
      JSON.stringify({ schemaVersion: 1, recommendations: [{
        id: 'rec-1', title: 'Ship it', summary: 's', source: 'manual',
        status: 'accepted', readiness: 'ready-for-milestone', priority: 'high',
        leverageScore: 5, riskScore: 2, confidence: 0.8, decayState: 'fresh',
        affectedAreas: [], affectedFiles: [], evidenceIds: [], assumptionIds: [],
        decisionIds: [], createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z',
      }] }, null, 2),
    );
    await writeFile(
      join(dir, 'milestones.json'),
      JSON.stringify({ schemaVersion: 1, milestones: [{
        id: 'mil-grp-x', name: 'X', objective: 'do it', status: 'accepted',
        recommendationIds: ['rec-1'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [], createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z',
      }] }, null, 2),
    );

    const ok = await run(['milestone', 'export', 'mil-grp-x', '--to', 'cadence'], active.root);
    expect(ok.code).toBe(0);
    expect(ok.stderr).toBe('');
    expect(ok.stdout).toMatch(/milestone mil-grp-x → exported/);
    expect(ok.stdout).toMatch(/staged SPEC: \.cadence\/intelligence\/exports\/mil-grp-x\/SPEC\.md/);
    expect(ok.stdout).toMatch(/cadence spec new/);
    const spec = await readFile(join(active.root, '.cadence', 'intelligence', 'exports', 'mil-grp-x', 'SPEC.md'), 'utf8');
    expect(spec).toMatch(/### AC-1: Ship it/);

    const bogus = await run(['milestone', 'export', 'mil-grp-x', '--to', 'bogus'], active.root);
    expect(bogus.code).toBe(1);
    expect(bogus.stderr).toMatch(/unknown backend "bogus"/);

    const again = await run(['milestone', 'export', 'mil-grp-x', '--to', 'cadence'], active.root);
    expect(again.code).toBe(1);
    expect(again.stderr).toMatch(/cannot export milestone in status exported/);

    const noTo = await run(['milestone', 'export', 'mil-grp-x'], active.root);
    expect(noTo.code).toBe(1);
    expect(noTo.stderr).toMatch(/required option.*--to/);
  });
});
