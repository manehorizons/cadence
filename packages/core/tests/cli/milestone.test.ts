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

  it('propose degrades cleanly with an empty ledger (exit 0)', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['milestone', 'propose'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/## Proposed/);
    expect(r.stdout).toMatch(/None\./);
  });
});
