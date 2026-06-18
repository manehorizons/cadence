import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

describe('cadence spec new --from-rec (Slice 34.3)', () => {
  it('happy path: scaffolds SPEC.md AND converts rec in one operation', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_spec' });
    const recId = await seedRec(active.root);

    const r = await run(
      ['spec', 'new', '34.3-demo', '01', '--title=Demo', '--from-rec', recId],
      active.root,
    );

    expect(r.code).toBe(0);
    // Scaffold happened
    const specPath = join(active.root, '.cadence/phases/34.3-demo/34-01-SPEC.md');
    expect(existsSync(specPath)).toBe(true);
    // Convert succeeded
    const ledger = await readRecommendationLedger(active.root);
    const rec = ledger.recommendations.find((r) => r.id === recId)!;
    expect(rec.status).toBe('converted');
    expect(rec.convertedToPhaseId).toBe('34.3-demo');
    // Stdout includes both confirmations
    expect(r.stdout).toContain(`Created ${specPath}`);
    expect(r.stdout).toContain(`recommendation ${recId} → converted (to 34.3-demo)`);
  });

  it('rec not found: refuses before any fs write', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_spec_nf' });

    const r = await run(
      ['spec', 'new', '34.3-x', '01', '--from-rec', 'rec-bogus'],
      active.root,
    );

    expect(r.code).toBe(1);
    expect(r.stderr).toContain('spec new refused: recommendation rec-bogus not found');
    expect(existsSync(join(active.root, '.cadence/phases/34.3-x'))).toBe(false);
    const state = JSON.parse(
      await readFile(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.loopPosition).toBe('IDLE');
  });

  it('AC-3 (phase 119): invalid config fails closed before scaffolding', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_spec_bad_config' });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(active.root, '.cadence/config.json'), JSON.stringify({ loopEnforcement: 'nope' }));

    const r = await run(['spec', 'new', '34.3-bad-config', '01'], active.root);

    expect(r.code).toBe(1);
    expect(r.stderr).toContain('config.json failed schema validation');
    expect(existsSync(join(active.root, '.cadence/phases/34.3-bad-config'))).toBe(false);
  });

  it('rec status deferred: refuses before any fs write', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_spec_dfr' });
    const recId = await seedRec(active.root);
    // Manually flip status to deferred via direct ledger write — there is no
    // public CLI verb to defer yet; this mimics an operator-edited ledger.
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].status = 'deferred';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['spec', 'new', '34.3-d', '01', '--from-rec', recId],
      active.root,
    );

    expect(r.code).toBe(1);
    expect(r.stderr).toContain(
      'spec new refused: cannot convert recommendation in status deferred',
    );
    expect(existsSync(join(active.root, '.cadence/phases/34.3-d'))).toBe(false);
  });

  it('SPEC path already exists: refuses with exit 2, rec NOT converted', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_spec_dup' });
    const recId = await seedRec(active.root);
    // Pre-create the SPEC file the new command would write to.
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(active.root, '.cadence/phases/34.3-dup'), { recursive: true });
    await writeFile(
      join(active.root, '.cadence/phases/34.3-dup/34-01-SPEC.md'),
      'pre-existing',
    );

    const r = await run(
      ['spec', 'new', '34.3-dup', '01', '--from-rec', recId],
      active.root,
    );

    expect(r.code).toBe(2);
    expect(r.stderr).toContain('SPEC already exists');
    // Rec must NOT have been converted (no scaffold = no convert)
    const ledger = await readRecommendationLedger(active.root);
    expect(ledger.recommendations[0]!.status).toBe('candidate');
    expect(ledger.recommendations[0]!.convertedToPhaseId).toBeUndefined();
  });

  it('loopPosition not IDLE: refuses without converting', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_3_spec_busy' });
    const recId = await seedRec(active.root);
    // Put the loop into DRAFT first
    await run(['draft', 'new', '00-prior', '01', '--title=Prior'], active.root);

    const r = await run(
      ['spec', 'new', '34.3-busy', '01', '--from-rec', recId],
      active.root,
    );

    expect(r.code).toBe(1);
    expect(r.stderr).toContain('spec new refused: loopPosition is DRAFT');
    const ledger = await readRecommendationLedger(active.root);
    expect(ledger.recommendations[0]!.status).toBe('candidate');
  });
});
