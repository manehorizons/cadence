import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { addRecommendation, readRecommendationLedger } from '../../src/intelligence/store.js';

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

async function seedRec(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 'Demo rec',
    summary: 'A test recommendation',
    priority: 'medium',
    readiness: 'ready-for-cadence-spec',
    affectedAreas: [],
    affectedFiles: [],
  });
  return r.id;
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence draft new --from-rec (Slice 34.3)', () => {
  it('happy path: scaffolds DRAFT.md AND converts rec in one operation', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_draft' });
    const recId = await seedRec(active.root);

    const r = await run(
      ['draft', 'new', '34.3-demo', '01', '--title=Demo', '--from-rec', recId],
      active.root,
    );

    expect(r.code).toBe(0);
    const draftPath = join(active.root, '.cadence/phases/34.3-demo/34-01-DRAFT.md');
    expect(existsSync(draftPath)).toBe(true);
    const ledger = await readRecommendationLedger(active.root);
    const rec = ledger.recommendations.find((r) => r.id === recId)!;
    expect(rec.status).toBe('converted');
    expect(rec.convertedToPhaseId).toBe('34.3-demo');
    expect(r.stdout).toContain(`Created ${draftPath}`);
    expect(r.stdout).toContain(`recommendation ${recId} → converted (to 34.3-demo)`);
  });

  it('rec not found: refuses before any fs write', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_draft_nf' });

    const r = await run(
      ['draft', 'new', '34.3-x', '01', '--from-rec', 'rec-bogus'],
      active.root,
    );

    expect(r.code).toBe(1);
    expect(r.stderr).toContain('draft new refused: recommendation rec-bogus not found');
    expect(existsSync(join(active.root, '.cadence/phases/34.3-x'))).toBe(false);
  });

  it('rec status rejected: refuses before any fs write', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_draft_rej' });
    const recId = await seedRec(active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].status = 'rejected';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['draft', 'new', '34.3-r', '01', '--from-rec', recId],
      active.root,
    );

    expect(r.code).toBe(1);
    expect(r.stderr).toContain(
      'draft new refused: cannot convert recommendation in status rejected',
    );
    expect(existsSync(join(active.root, '.cadence/phases/34.3-r'))).toBe(false);
  });

  it('SPEC-seeded path AND --from-rec compose: draft body is SPEC-seeded, rec is converted', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_draft_spec' });
    const recId = await seedRec(active.root);

    // Build an approved SPEC first.
    await run(['spec', 'new', '34.3-c', '01', '--title=ComposeMe'], active.root);
    const specPath = join(active.root, '.cadence/phases/34.3-c/34-01-SPEC.md');
    const raw = await readFile(specPath, 'utf8');
    // Force-flip status to APPROVED and put loop back to IDLE.
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(specPath, raw.replace(/status: PENDING/, 'status: APPROVED').replace(/_\(one sentence\)_/, 'Objective body.').replace(/_\(precondition\)_/, 'pre').replace(/_\(action\)_/, 'act').replace(/_\(outcome\)_/, 'out'));
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.loopPosition = 'IDLE';
    state.activeSpec = null;
    await wf(statePath, JSON.stringify(state, null, 2));

    const r = await run(
      ['draft', 'new', '34.3-c', '01', '--title=ComposeMe', '--from-rec', recId],
      active.root,
    );

    expect(r.code).toBe(0);
    expect(r.stdout).toContain('seeded objective + 1 AC(s) from approved SPEC');
    expect(r.stdout).toContain(`recommendation ${recId} → converted (to 34.3-c)`);
    const ledger = await readRecommendationLedger(active.root);
    expect(ledger.recommendations[0]!.status).toBe('converted');
  });
});
