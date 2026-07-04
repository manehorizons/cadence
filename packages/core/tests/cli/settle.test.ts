import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { Recommendation, RecommendationLedger } from '@manehorizons/cadence-types';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    p.on('exit', (code) => resolve({ code: code ?? 0 }));
  });
}

function runCapture(args: string[], cwd: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    p.stdout.on('data', (d) => { stdout += d.toString(); });
    p.on('exit', (code) => resolve({ code: code ?? 0, stdout }));
  });
}

function convertedRec(id: string, phaseId: string): Recommendation {
  return {
    id,
    title: `${id} title`,
    summary: 's',
    source: 'manual',
    status: 'converted',
    readiness: 'ready-for-cadence-spec',
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
    convertedToPhaseId: phaseId,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

async function draftApproveAndComplete(root: string): Promise<void> {
  await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], root);
  await run(['draft', 'approve', '01-foundation', '01'], root);
  await run(['build', 'task', 'T1', '--status=DONE'], root);
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence settle run', () => {
  it('writes SUMMARY.md + SUMMARY.json and returns to IDLE', async () => {
    active = await tempRepo({ initialized: true });
    await draftApproveAndComplete(active.root);
    const r = await run(['settle', 'run', '--ac', 'AC-1=pass'], active.root);
    expect(r.code).toBe(0);

    const dir = join(active.root, '.cadence/phases/01-foundation');
    expect(existsSync(join(dir, '01-01-SUMMARY.md'))).toBe(true);
    expect(existsSync(join(dir, '01-01-SUMMARY.json'))).toBe(true);

    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('IDLE');
    expect(state.openDrafts).toHaveLength(0);
  });

  it('records AC failure note in SUMMARY', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE_WITH_CONCERNS'], active.root);
    await run(['settle', 'run', '--ac', 'AC-1=fail:flaky'], active.root);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*FAIL/);
    expect(md).toContain('flaky');
  });

  it('AC-3: --ac-pass records the listed AC as PASS', async () => {
    active = await tempRepo({ initialized: true });
    await draftApproveAndComplete(active.root);
    const r = await run(['settle', 'run', '--ac-pass', 'AC-1'], active.root);
    expect(r.code).toBe(0);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*PASS/);
  });

  it('AC-3: --pass-all records all ACs as PASS', async () => {
    active = await tempRepo({ initialized: true });
    await draftApproveAndComplete(active.root);
    const r = await run(['settle', 'run', '--pass-all'], active.root);
    expect(r.code).toBe(0);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*PASS/);
  });

  it('T1: --help lists the --ship-ref flag (Phase 148)', async () => {
    active = await tempRepo({ initialized: true });
    const r = await runCapture(['settle', 'run', '--help'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('--ship-ref');
  });

  it('AC-1: --ship-ref promotes a converted rec to shipped via the CLI', async () => {
    active = await tempRepo({ initialized: true });
    await draftApproveAndComplete(active.root);
    const intelDir = join(active.root, '.cadence', 'intelligence');
    await mkdir(intelDir, { recursive: true });
    const ledger: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [convertedRec('rec-20260601-002', '01-foundation')],
      archived: [],
    };
    await writeFile(join(intelDir, 'recommendations.json'), JSON.stringify(ledger, null, 2));

    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage', '--ship-ref', 'PR #148'],
      active.root,
    );
    expect(r.code).toBe(0);

    const recs = JSON.parse(
      await readFile(join(intelDir, 'recommendations.json'), 'utf8'),
    ) as RecommendationLedger;
    expect(recs.recommendations).toHaveLength(0);
    expect(recs.archived).toHaveLength(1);
    expect(recs.archived[0]?.status).toBe('shipped');
    expect(recs.archived[0]?.shippedRef).toBe('PR #148');
  });

  it('--ship-ref rejects an empty value', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['settle', 'run', '--ship-ref', ''], active.root);
    expect(r.code).not.toBe(0);
  });
});
