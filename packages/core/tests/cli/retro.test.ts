import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import type { RetroDigest } from '@thomas-powers-jr/cadence-types';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { readEvidenceLedger, readRecommendationLedger } from '../../src/intelligence/store/io.js';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'dist', 'cli', 'index.js',
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

describe('cadence retro (phase 186)', () => {
  it('AC-3: --format terminal (default) renders the rollup for a repo with real retro artifacts', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-a'), { recursive: true });
    await mkdir(join(phasesDir, '171-b'), { recursive: true });

    const digestA: RetroDigest = {
      bypasses: [{ gate: 'test-coverage', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    const digestB: RetroDigest = {
      bypasses: [{ gate: 'test-coverage', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digestA));
    await writeFile(join(phasesDir, '171-b', '171-01-RETRO.json'), JSON.stringify(digestB));

    const r = await run(['retro'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# Retro Rollup/);
    expect(r.stdout).toMatch(/test-coverage/);
    expect(r.stdout).toMatch(/### Recurring/);
  });

  it('AC-3: --format json produces valid JSON matching the RetroRollup shape', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-a'), { recursive: true });

    const digest: RetroDigest = {
      bypasses: [],
      roughTasks: [{ id: 'T1', status: 'BLOCKED', notes: '' }],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digest));

    const r = await run(['retro', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const rollup = JSON.parse(r.stdout);
    expect(rollup.totalPhases).toBe(1);
    expect(rollup.phasesWithFriction).toBe(1);
    expect(rollup.roughTaskStatuses.oneOff).toEqual([
      { key: 'BLOCKED', count: 1, phaseIds: ['170-a'] },
    ]);
  });

  it('AC-4: no .cadence/phases directory → clear empty-state message, exit 0', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const r = await run(['retro'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No retro artifacts found.\n');
  });

  it('AC-4: --format json empty state → JSON null (never an empty object)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const r = await run(['retro', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('null\n');
    expect(JSON.parse(r.stdout)).toBeNull();
  });

  it('AC-4: phases present but none with a *-RETRO.json → empty-state message, exit 0', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    await mkdir(join(active.root, '.cadence/phases', '170-a'), { recursive: true });
    const r = await run(['retro'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No retro artifacts found.\n');
  });

  it('AC-5: a malformed retro artifact surfaces a stderr notice, and the rollup still computes over remaining valid phases', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-good'), { recursive: true });
    await mkdir(join(phasesDir, '171-bad'), { recursive: true });

    const goodDigest: RetroDigest = {
      bypasses: [{ gate: 'test-coverage', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-good', '170-01-RETRO.json'), JSON.stringify(goodDigest));
    await writeFile(join(phasesDir, '171-bad', '171-01-RETRO.json'), '{ not valid json');

    const r = await run(['retro'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('note: skipping malformed retro artifact');
    expect(r.stderr).toContain('171-01-RETRO.json');
    expect(r.stdout).toMatch(/# Retro Rollup/);
  });

  it('invalid --format → exit 1 + stderr, no stdout output', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const r = await run(['retro', '--format', 'xml'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/retro failed: unsupported format: xml/);
    expect(r.stdout).toBe('');
  });

  it('bare `cadence retro` (no subcommand) still works unchanged now that `feedback` is a sibling subcommand', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli-still-bare' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-a'), { recursive: true });
    const digest: RetroDigest = {
      bypasses: [{ gate: 'test-coverage', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digest));

    const r = await run(['retro'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# Retro Rollup/);
  });
});

describe('cadence retro feedback (phase 212 T3)', () => {
  it('AC-4: no .cadence/phases directory at all → clear "no recurring friction" message, exit 0, no ledger writes', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-cli-empty' });
    const r = await run(['retro', 'feedback'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No recurring friction found.\n');

    const evidenceLedger = await readEvidenceLedger(active.root);
    expect(evidenceLedger.evidence).toEqual([]);
  });

  it('AC-4: retro artifacts present but no friction recurs across ≥2 phases → "no recurring friction found", exit 0, no ledger reads/writes', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-cli-oneoff' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-a'), { recursive: true });
    const digest: RetroDigest = {
      bypasses: [{ gate: 'code-review', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digest));

    const r = await run(['retro', 'feedback'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No recurring friction found.\n');
  });

  it('AC-4: --json empty state emits an empty array, not an object or null', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-cli-empty-json' });
    const r = await run(['retro', 'feedback', '--json'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('[]\n');
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('AC-1/AC-2/AC-4: recurring friction matched to a recommendation writes evidence and prints a "wrote" line; a second run reports "skipped-already-recorded" with no new evidence', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-cli-match' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-a'), { recursive: true });
    await mkdir(join(phasesDir, '171-b'), { recursive: true });
    const digest: RetroDigest = {
      bypasses: [{ gate: 'code-review', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    // Two distinct phases sharing the same gate → lands in the `recurring`
    // bucket (count >= 2), not `oneOff`.
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digest));
    await writeFile(join(phasesDir, '171-b', '171-01-RETRO.json'), JSON.stringify(digest));

    const matching = await addRecommendation(active.root, {
      title: 'harden code-review gate',
      summary: 'the code-review gate keeps getting bypassed',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: ['code-review gate reliability'],
      affectedFiles: [],
    });
    await addRecommendation(active.root, {
      title: 'unrelated docs cleanup',
      summary: 'nothing to do with the friction above',
      priority: 'low',
      readiness: 'raw-idea',
      affectedAreas: ['unrelated docs work'],
      affectedFiles: [],
    });

    // First run: matches + writes new evidence.
    const first = await run(['retro', 'feedback'], active.root);
    expect(first.code).toBe(0);
    expect(first.stdout).toMatch(/wrote evidence:.*\[bypasses\] "code-review".*-> recommendation/);
    expect(first.stdout).toContain(matching.id);

    const evidenceLedgerAfterFirst = await readEvidenceLedger(active.root);
    expect(evidenceLedgerAfterFirst.evidence).toHaveLength(1);
    expect(evidenceLedgerAfterFirst.evidence[0]?.summary).toContain(
      '[retro-friction:bypasses:code-review]',
    );
    expect(evidenceLedgerAfterFirst.evidence[0]?.recommendationId).toBe(matching.id);

    const recLedgerAfterFirst = await readRecommendationLedger(active.root);
    const updatedRec = recLedgerAfterFirst.recommendations.find((r) => r.id === matching.id);
    expect(updatedRec?.evidenceIds).toHaveLength(1);

    // Second run: same friction, same recommendation → idempotent, no new
    // evidence.json entry.
    const second = await run(['retro', 'feedback'], active.root);
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(/already recorded \(skipped, no new evidence\):.*\[bypasses\] "code-review"/);
    expect(second.stdout).toContain(matching.id);

    const evidenceLedgerAfterSecond = await readEvidenceLedger(active.root);
    expect(evidenceLedgerAfterSecond.evidence).toHaveLength(1);
  });

  it('AC-4: a recurring friction entry with zero matching recommendations prints a distinct "no matching recommendation" line and writes no evidence', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-cli-no-match' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-a'), { recursive: true });
    await mkdir(join(phasesDir, '171-b'), { recursive: true });
    const digest: RetroDigest = {
      bypasses: [],
      roughTasks: [{ id: 'T1', status: 'BLOCKED', notes: '' }],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digest));
    await writeFile(join(phasesDir, '171-b', '171-01-RETRO.json'), JSON.stringify(digest));

    // Only an unrelated recommendation exists — no affectedAreas/Files token
    // overlaps "BLOCKED".
    await addRecommendation(active.root, {
      title: 'unrelated docs cleanup',
      summary: 'nothing to do with rough task statuses',
      priority: 'low',
      readiness: 'raw-idea',
      affectedAreas: ['unrelated docs work'],
      affectedFiles: [],
    });

    const r = await run(['retro', 'feedback'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('no matching recommendation: [roughTaskStatuses] "BLOCKED"\n');

    const evidenceLedger = await readEvidenceLedger(active.root);
    expect(evidenceLedger.evidence).toEqual([]);
  });

  it('AC-4: --json variant emits one entry per (friction entry × outcome) with the documented shape', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-cli-json' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-a'), { recursive: true });
    await mkdir(join(phasesDir, '171-b'), { recursive: true });
    const digest: RetroDigest = {
      bypasses: [{ gate: 'code-review', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digest));
    await writeFile(join(phasesDir, '171-b', '171-01-RETRO.json'), JSON.stringify(digest));

    const matching = await addRecommendation(active.root, {
      title: 'harden code-review gate',
      summary: 'the code-review gate keeps getting bypassed',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: ['code-review gate reliability'],
      affectedFiles: [],
    });

    const r = await run(['retro', 'feedback', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toEqual([
      {
        frictionKey: 'code-review',
        frictionBucket: 'bypasses',
        outcome: 'wrote',
        recommendationId: matching.id,
        evidenceId: expect.any(String),
      },
    ]);
  });
});
