import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import type { Recommendation, RecommendationLedger } from '@thomas-powers-jr/cadence-types';

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

/**
 * Phase 214 (T4): these fixtures have no real test coverage matching
 * `verification.testGlobs` and predate `gates.evidenceFloor`
 * (`defaultConfig`'s schema-level floor is `'mention'`) — without this,
 * every settle here would be newly refused by the evidence-floor gate this
 * file isn't testing. Lower the floor to `'unverified'` (no requirement) so
 * pre-existing behavior is preserved; the evidence-floor gate itself is
 * covered by `packages/core/tests/services/settle.test.ts`.
 */
async function relaxEvidenceFloor(root: string): Promise<void> {
  const configPath = join(root, '.cadence', 'config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.gates = { ...(config.gates ?? {}), evidenceFloor: 'unverified' };
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence settle run', () => {
  it('writes SUMMARY.md + SUMMARY.json and returns to IDLE', async () => {
    active = await tempRepo({ initialized: true });
    await relaxEvidenceFloor(active.root);
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
    await relaxEvidenceFloor(active.root);
    await draftApproveAndComplete(active.root);
    const r = await run(['settle', 'run', '--ac-pass', 'AC-1'], active.root);
    expect(r.code).toBe(0);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*PASS/);
  });

  it('AC-3: --pass-all records all ACs as PASS', async () => {
    active = await tempRepo({ initialized: true });
    await relaxEvidenceFloor(active.root);
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
    await relaxEvidenceFloor(active.root);
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

  it('T4 (Phase 214): --help lists --evidence-floor-bypass', async () => {
    active = await tempRepo({ initialized: true });
    const r = await runCapture(['settle', 'run', '--help'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('--evidence-floor-bypass');
  });

  it('AC-4 (Phase 214): settle refuses through the real CLI when the AC evidence floor is not met, and --evidence-floor-bypass lets it through with the reason recorded', async () => {
    active = await tempRepo({ initialized: true });
    // Raise the floor above the fixture's real evidence ('unverified' — no
    // coverage, no deep-verify) so the gate actually fires end-to-end.
    const configPath = join(active.root, '.cadence', 'config.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    config.gates = { ...(config.gates ?? {}), evidenceFloor: 'assertion' };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    await draftApproveAndComplete(active.root);

    const refused = await run(['settle', 'run', '--ac', 'AC-1=pass'], active.root);
    expect(refused.code).not.toBe(0);

    const bypassed = await run(
      [
        'settle', 'run', '--ac', 'AC-1=pass',
        '--evidence-floor-bypass', 'AC-1:reviewed manually via CLI e2e test',
      ],
      active.root,
    );
    expect(bypassed.code).toBe(0);

    const summary = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'), 'utf8'),
    ) as { gateBypasses?: { gate: string; reason: string; flag: string }[] };
    const bypass = summary.gateBypasses?.find((b) => b.gate.includes('AC-1'));
    expect(bypass).toBeDefined();
    expect(bypass?.reason).toContain('reviewed manually via CLI e2e test');
    expect(bypass?.flag).toBe('--evidence-floor-bypass');
  });
});
