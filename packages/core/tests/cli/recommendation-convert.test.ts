import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { readRecommendationLedger } from '../../src/intelligence/store/io.js';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';

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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedRec(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 'T',
    summary: 'S',
    priority: 'medium',
    readiness: 'raw-idea',
    affectedAreas: [],
    affectedFiles: [],
  });
  return r.id;
}

async function makePhaseDir(root: string, phaseId: string): Promise<void> {
  await mkdir(join(root, '.cadence/phases', phaseId), { recursive: true });
}

describe('cadence recommendation convert (Slice 34.1)', () => {
  it('happy path: rec is candidate + phase dir exists → exit 0, success line, JSON reflects new fields', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    const id = await seedRec(active.root);
    await makePhaseDir(active.root, '34.1-rec-phase-linkage');
    const r = await run(
      ['recommendation', 'convert', id, '--to-phase', '34.1-rec-phase-linkage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`recommendation ${id} → converted (to 34.1-rec-phase-linkage)\n`);
    expect(r.stderr).toBe('');
    const ledger = await readRecommendationLedger(active.root);
    expect(ledger.recommendations[0]!.status).toBe('converted');
    expect(ledger.recommendations[0]!.convertedToPhaseId).toBe('34.1-rec-phase-linkage');
  });

  it('FK miss: phase dir missing → exit 1, stderr reason, ledger byte-equal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    const id = await seedRec(active.root);
    const jsonPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const jsonBefore = await readFile(jsonPath, 'utf8');
    const r = await run(
      ['recommendation', 'convert', id, '--to-phase', 'missing-phase'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'recommendation convert refused: cannot convert: phase missing-phase not found — create it first via `cadence draft new missing-phase`, or pass an existing --to-phase\n',
    );
    expect(r.stdout).toBe('');
    expect(await readFile(jsonPath, 'utf8')).toBe(jsonBefore);
  });

  it('rec not found: exit 1, stderr reason', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    await makePhaseDir(active.root, '34.1-x');
    const r = await run(
      ['recommendation', 'convert', 'rec-bogus', '--to-phase', '34.1-x'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'recommendation convert refused: recommendation rec-bogus not found. Run `cadence recommendation list` to browse.\n',
    );
  });

  it('invalid from-status: deferred rec → exit 1, stderr reason', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    const id = await seedRec(active.root);
    await makePhaseDir(active.root, '34.1-x');
    // Flip status to deferred via hand-edit
    const jsonPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(jsonPath, 'utf8'));
    ledger.recommendations[0].status = 'deferred';
    await writeFile(jsonPath, JSON.stringify(ledger, null, 2), 'utf8');
    const r = await run(
      ['recommendation', 'convert', id, '--to-phase', '34.1-x'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      `recommendation convert refused: cannot convert recommendation in status deferred — run \`cadence recommendation promote ${id} --status=accepted\` to reach an eligible status, then retry \`cadence recommendation convert\`\n`,
    );
  });

  it('idempotency-by-refusal: second convert on already-converted rec is refused', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    const id = await seedRec(active.root);
    await makePhaseDir(active.root, '34.1-x');
    const ok = await run(
      ['recommendation', 'convert', id, '--to-phase', '34.1-x'],
      active.root,
    );
    expect(ok.code).toBe(0);
    const refused = await run(
      ['recommendation', 'convert', id, '--to-phase', '34.1-x'],
      active.root,
    );
    expect(refused.code).toBe(1);
    expect(refused.stderr).toBe(
      `recommendation convert refused: cannot convert recommendation in status converted — run \`cadence recommendation promote ${id} --status=accepted\` to reach an eligible status, then retry \`cadence recommendation convert\`\n`,
    );
  });

  it('--to-phase is required: missing flag → exit 1 with commander error', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    const id = await seedRec(active.root);
    const r = await run(['recommendation', 'convert', id], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/required option.*--to-phase/);
  });
});
