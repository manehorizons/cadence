import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GateBypass, PhaseRetroEntry, RetroDigest, RetroTask } from '@thomas-powers-jr/cadence-types';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { bufferIO } from '../../src/services/io.js';
import { computeRetroRollup, scanRetroArtifacts } from '../../src/services/retro-rollup.js';

function mkBypass(gate: string): GateBypass {
  return { gate, flag: '--flag', reason: 'r', severity: 'warn' };
}

function mkTask(id: string, status: RetroTask['status']): RetroTask {
  return { id, status, notes: '' };
}

function entry(phaseId: string, digest: Partial<RetroDigest> = {}): PhaseRetroEntry {
  return {
    phaseId,
    draftId: `${phaseId}-01`,
    digest: { bypasses: [], roughTasks: [], findings: {}, ...digest },
  };
}

describe('computeRetroRollup', () => {
  it('AC-1: totalPhases and phasesWithFriction count across scanned entries, including a clean phase', () => {
    const entries: PhaseRetroEntry[] = [
      entry('170-a', { bypasses: [mkBypass('test-coverage')] }),
      entry('171-b', { roughTasks: [mkTask('T1', 'BLOCKED')] }),
      entry('172-c', {}), // clean settle, no friction
    ];
    const rollup = computeRetroRollup(entries);
    expect(rollup.totalPhases).toBe(3);
    expect(rollup.phasesWithFriction).toBe(2);
  });

  it('AC-1 + AC-2: recurring bypass/status/finding-category items are separated from one-off items, each sorted by descending frequency', () => {
    const entries: PhaseRetroEntry[] = [
      entry('170-a', {
        bypasses: [mkBypass('test-coverage')],
        roughTasks: [mkTask('T1', 'BLOCKED'), mkTask('T2', 'BLOCKED'), mkTask('T3', 'BLOCKED')],
        findings: { codeReview: { 'a.ts': [{ severity: 'high', message: 'x' }] } },
      }),
      entry('171-b', {
        bypasses: [mkBypass('test-coverage'), mkBypass('boundary-scan')],
        roughTasks: [mkTask('T1', 'BLOCKED')],
        findings: { codeReview: { 'b.ts': [{ severity: 'low', message: 'y' }] } },
      }),
      entry('172-c', {
        bypasses: [mkBypass('test-coverage')],
        roughTasks: [mkTask('T1', 'DONE_WITH_CONCERNS')],
        findings: { securityAudit: [{ severity: 'critical', message: 'z' }] },
      }),
      entry('173-d', {}),
    ];
    const rollup = computeRetroRollup(entries);

    expect(rollup.bypasses.recurring).toEqual([
      { key: 'test-coverage', count: 3, phaseIds: ['170-a', '171-b', '172-c'] },
    ]);
    expect(rollup.bypasses.oneOff).toEqual([{ key: 'boundary-scan', count: 1, phaseIds: ['171-b'] }]);

    expect(rollup.roughTaskStatuses.recurring).toEqual([
      { key: 'BLOCKED', count: 2, phaseIds: ['170-a', '171-b'] },
    ]);
    expect(rollup.roughTaskStatuses.oneOff).toEqual([
      { key: 'DONE_WITH_CONCERNS', count: 1, phaseIds: ['172-c'] },
    ]);

    expect(rollup.findingCategories.recurring).toEqual([
      { key: 'codeReview', count: 2, phaseIds: ['170-a', '171-b'] },
    ]);
    expect(rollup.findingCategories.oneOff).toEqual([
      { key: 'securityAudit', count: 1, phaseIds: ['172-c'] },
    ]);
  });

  it('AC-1: a single phase with 3 same-status rough tasks contributes only once to that status count (per-phase dedup)', () => {
    const entries: PhaseRetroEntry[] = [
      entry('170-a', {
        roughTasks: [mkTask('T1', 'BLOCKED'), mkTask('T2', 'BLOCKED'), mkTask('T3', 'BLOCKED')],
      }),
    ];
    const rollup = computeRetroRollup(entries);
    expect(rollup.roughTaskStatuses.oneOff).toEqual([{ key: 'BLOCKED', count: 1, phaseIds: ['170-a'] }]);
    expect(rollup.roughTaskStatuses.recurring).toEqual([]);
  });

  it('AC-1: recurring bucket sorts by descending count, ties broken by key ascending', () => {
    const entries: PhaseRetroEntry[] = [
      entry('170-a', { bypasses: [mkBypass('gate-b'), mkBypass('gate-c'), mkBypass('gate-z')] }),
      entry('171-b', { bypasses: [mkBypass('gate-b'), mkBypass('gate-c')] }),
      entry('172-c', { bypasses: [mkBypass('gate-b'), mkBypass('gate-z')] }),
    ];
    const rollup = computeRetroRollup(entries);
    expect(rollup.bypasses.recurring.map((e) => e.key)).toEqual(['gate-b', 'gate-c', 'gate-z']);
    expect(rollup.bypasses.recurring.map((e) => e.count)).toEqual([3, 2, 2]);
  });

  it('AC-2: one-off bucket is sorted alphabetically by key', () => {
    const entries: PhaseRetroEntry[] = [
      entry('170-a', { bypasses: [mkBypass('zeta'), mkBypass('alpha'), mkBypass('mid')] }),
    ];
    const rollup = computeRetroRollup(entries);
    expect(rollup.bypasses.oneOff.map((e) => e.key)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('a schema-valid-but-empty finding shape (codeReview: {}) is not counted as a present category', () => {
    const entries: PhaseRetroEntry[] = [
      entry('170-a', {
        findings: { codeReview: {}, securityAudit: [], boundaryScan: { offenders: [] } },
      }),
      entry('171-b', {
        findings: { securityAudit: [{ severity: 'critical', message: 'z' }] },
      }),
    ];
    const rollup = computeRetroRollup(entries);
    expect(rollup.findingCategories.recurring).toEqual([]);
    expect(rollup.findingCategories.oneOff).toEqual([
      { key: 'securityAudit', count: 1, phaseIds: ['171-b'] },
    ]);
    expect(rollup.phasesWithFriction).toBe(1);
  });

  it('AC-1: returns an all-zero, empty-bucket rollup for empty input', () => {
    const rollup = computeRetroRollup([]);
    expect(rollup).toEqual({
      totalPhases: 0,
      phasesWithFriction: 0,
      bypasses: { recurring: [], oneOff: [] },
      roughTaskStatuses: { recurring: [], oneOff: [] },
      findingCategories: { recurring: [], oneOff: [] },
    });
  });
});

describe('scanRetroArtifacts', () => {
  let active: Fixture | null = null;
  afterEach(async () => {
    if (active) {
      await active.cleanup();
      active = null;
    }
  });

  it('scans valid artifacts across multiple phase directories, sorted by phaseId', async () => {
    active = await tempRepo({ initialized: true });
    const phasesDir = join(active.root, '.cadence/phases');

    await mkdir(join(phasesDir, '171-b'), { recursive: true });
    await mkdir(join(phasesDir, '170-a'), { recursive: true });

    const digestA: RetroDigest = { bypasses: [mkBypass('test-coverage')], roughTasks: [], findings: {} };
    const digestB: RetroDigest = { bypasses: [], roughTasks: [mkTask('T1', 'BLOCKED')], findings: {} };
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digestA));
    await writeFile(join(phasesDir, '171-b', '171-01-RETRO.json'), JSON.stringify(digestB));

    const io = bufferIO();
    const entries = await scanRetroArtifacts(active.root, io);

    expect(entries).toEqual([
      { phaseId: '170-a', draftId: '170-01', digest: digestA },
      { phaseId: '171-b', draftId: '171-01', digest: digestB },
    ]);
    expect(io.stderr()).toBe('');
  });

  it('AC-5: a malformed retro artifact is skipped with a stderr notice, and the scan still returns the remaining valid phases', async () => {
    active = await tempRepo({ initialized: true });
    const phasesDir = join(active.root, '.cadence/phases');

    await mkdir(join(phasesDir, '170-good'), { recursive: true });
    await mkdir(join(phasesDir, '171-bad-json'), { recursive: true });
    await mkdir(join(phasesDir, '172-bad-schema'), { recursive: true });

    const goodDigest: RetroDigest = { bypasses: [mkBypass('test-coverage')], roughTasks: [], findings: {} };
    await writeFile(join(phasesDir, '170-good', '170-01-RETRO.json'), JSON.stringify(goodDigest));
    await writeFile(join(phasesDir, '171-bad-json', '171-01-RETRO.json'), '{ not valid json');
    await writeFile(
      join(phasesDir, '172-bad-schema', '172-01-RETRO.json'),
      JSON.stringify({ bypasses: 'not-an-array' }),
    );

    const io = bufferIO();
    const entries = await scanRetroArtifacts(active.root, io);

    expect(entries).toEqual([{ phaseId: '170-good', draftId: '170-01', digest: goodDigest }]);
    const stderr = io.stderr();
    expect(stderr).toContain('171-01-RETRO.json');
    expect(stderr).toContain('172-01-RETRO.json');
    expect(stderr.match(/note: skipping malformed retro artifact/g)).toHaveLength(2);
  });

  it('AC-5: an unreadable retro artifact (e.g. a directory in its place) is skipped with a stderr notice, and the scan still returns the remaining valid phases', async () => {
    active = await tempRepo({ initialized: true });
    const phasesDir = join(active.root, '.cadence/phases');

    await mkdir(join(phasesDir, '170-good'), { recursive: true });
    // A directory where a file is expected reliably fails `readFile` with
    // EISDIR across platforms, forcing the "unreadable" catch path.
    await mkdir(join(phasesDir, '171-unreadable', '171-01-RETRO.json'), { recursive: true });

    const goodDigest: RetroDigest = { bypasses: [mkBypass('test-coverage')], roughTasks: [], findings: {} };
    await writeFile(join(phasesDir, '170-good', '170-01-RETRO.json'), JSON.stringify(goodDigest));

    const io = bufferIO();
    const entries = await scanRetroArtifacts(active.root, io);

    expect(entries).toEqual([{ phaseId: '170-good', draftId: '170-01', digest: goodDigest }]);
    const stderr = io.stderr();
    expect(stderr).toContain('171-01-RETRO.json');
    expect(stderr).toContain('unreadable');
    expect(stderr.match(/note: skipping malformed retro artifact/g)).toHaveLength(1);
  });

  it('returns [] silently when .cadence/phases does not exist', async () => {
    active = await tempRepo();
    const io = bufferIO();

    const entries = await scanRetroArtifacts(active.root, io);

    expect(entries).toEqual([]);
    expect(io.stderr()).toBe('');
    expect(io.stdout()).toBe('');
  });
});
