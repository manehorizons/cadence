/**
 * `cadence verify historical-coverage-audit` (phase 261, T3) — a read-only,
 * corpus-wide diagnostic wrapping T2's `auditHistoricalCoverage`. Exercises
 * `runVerifyHistoricalCoverageAudit` directly, the same pattern
 * `verify-phase.test.ts` uses for `runVerifyPhase` — this is a thin service
 * wrapper over an already-tested core function
 * (`packages/core/tests/verify/historical-coverage-audit.test.ts` covers the
 * classification logic itself), so this suite is about the wiring, the
 * rendered human/`--json` shapes, and the exit-code contract.
 *
 * This repo's own `.cadence/config.json` runs `coverageScheme:
 * "phase-qualified"`, so every `it()` name below carries this phase's own
 * qualifier prefix, required by this phase's own coverage gate —
 * deliberately not spelled out as a literal example token in this doc
 * comment (rec-20260730-002: a qualified AC token outside an asserting
 * block silently zeroes that AC's coverage for the whole file, even when
 * real asserting `it()` blocks reference it further down).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo } from '@thomas-powers-jr/cadence-testkit';
import { runVerifyHistoricalCoverageAudit } from '../../src/services/verify.js';

function makeIo() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } };
}

async function writeTestFile(root: string, relPath: string, body: string): Promise<void> {
  const abs = join(root, relPath);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

function draftMdText(id: string, phase: string, files: string[]): string {
  const filesLine = files.map((f) => `\`${f}\``).join(', ');
  return `---
phase: ${phase}
id: ${id}
tier: standard
status: SETTLED
---

# ${id} — fixture phase

## Objective

Fixture objective for the historical-coverage-audit CLI test.

## Acceptance Criteria

### AC-1: fixture ac
Given a
When b
Then c

## Tasks

### T1: fixture task
- files: ${filesLine}
- action: fixture action
- verify: fixture verify
- done: AC-1

## Boundaries

- none
`;
}

/** A pre-phase-239-shaped `SUMMARY.json` — `coverageScheme` deliberately absent. */
function summaryJsonNoScheme(id: string, acIds: string[]): string {
  return JSON.stringify({
    schemaVersion: 1,
    draftId: id,
    completedAt: '2026-01-01T00:00:00.000Z',
    acResults: acIds.map((acId) => ({ id: acId, pass: true, evidence: 'executed' })),
    taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
  });
}

async function seedFixturePhase(root: string): Promise<void> {
  const testFile = 'packages/core/tests/fixtures/261-t3-audit.test.ts';
  await writeTestFile(root, testFile, "it('covers thing (AC-1)', () => { expect(1).toBe(1); });\n");
  const phaseDir = '.cadence/phases/261-t3-fixture-phase';
  await writeTestFile(
    root,
    `${phaseDir}/999-01-DRAFT.md`,
    draftMdText('999-01', '261-t3-fixture-phase', [testFile]),
  );
  await writeTestFile(root, `${phaseDir}/999-01-SUMMARY.json`, summaryJsonNoScheme('999-01', ['AC-1']));
}

describe('runVerifyHistoricalCoverageAudit (phase 261 T3)', () => {
  it('261-01/AC-5: --json emits the HistoricalCoverageAuditReport shape and exits 0', async () => {
    const fx = await tempRepo();
    try {
      await seedFixturePhase(fx.root);
      const { io, out } = makeIo();
      const res = await runVerifyHistoricalCoverageAudit({ cwd: fx.root, json: true }, io);
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(out.join(''));
      expect(Array.isArray(parsed.perPhase)).toBe(true);
      const entry = parsed.perPhase.find((p: { phase: string }) => p.phase === '261-t3-fixture-phase');
      expect(entry).toBeDefined();
      expect(entry.perAc).toEqual([{ id: 'AC-1', bucket: 'self-attested' }]);
      expect(parsed.bucketTotals['self-attested']).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(parsed.unreadableRecords)).toBe(true);
    } finally {
      await fx.cleanup();
    }
  });

  it(
    '261-01/AC-5: human mode prints total phases audited, the four bucket totals, and the ' +
      'unreadable-record count, points to --json for detail, and exits 0',
    async () => {
      const fx = await tempRepo();
      try {
        await seedFixturePhase(fx.root);
        const { io, out } = makeIo();
        const res = await runVerifyHistoricalCoverageAudit({ cwd: fx.root }, io);
        expect(res.exitCode).toBe(0);
        const text = out.join('');
        expect(text).toMatch(/phases audited/i);
        expect(text).toMatch(/self-attested-shared/);
        expect(text).toMatch(/self-attested\b/);
        expect(text).toMatch(/not-found-in-declared-files/);
        expect(text).toMatch(/unreachable/);
        expect(text).toMatch(/unreadable/i);
        expect(text).toMatch(/--json/);
      } finally {
        await fx.cleanup();
      }
    },
  );

  it(
    '261-01/AC-5: a dedicated file with a real AC match classifies self-attested and a ' +
      "dedicated file that doesn't contain the AC token classifies not-found-in-declared-files, " +
      'both correctly aggregated into bucketTotals across two phases',
    async () => {
      const fx = await tempRepo();
      try {
        await seedFixturePhase(fx.root);

        const missingFile = 'packages/core/tests/fixtures/261-t3-audit-missing.test.ts';
        await writeTestFile(fx.root, missingFile, "it('unrelated', () => { expect(1).toBe(1); });\n");
        const phaseDir = '.cadence/phases/261-t3-fixture-phase-2';
        await writeTestFile(
          fx.root,
          `${phaseDir}/998-01-DRAFT.md`,
          draftMdText('998-01', '261-t3-fixture-phase-2', [missingFile]),
        );
        await writeTestFile(
          fx.root,
          `${phaseDir}/998-01-SUMMARY.json`,
          summaryJsonNoScheme('998-01', ['AC-1']),
        );

        const { io, out } = makeIo();
        const res = await runVerifyHistoricalCoverageAudit({ cwd: fx.root, json: true }, io);
        expect(res.exitCode).toBe(0);
        const parsed = JSON.parse(out.join(''));
        const p1 = parsed.perPhase.find((p: { phase: string }) => p.phase === '261-t3-fixture-phase');
        const p2 = parsed.perPhase.find((p: { phase: string }) => p.phase === '261-t3-fixture-phase-2');
        expect(p1.perAc).toEqual([{ id: 'AC-1', bucket: 'self-attested' }]);
        expect(p2.perAc).toEqual([{ id: 'AC-1', bucket: 'not-found-in-declared-files' }]);
        expect(parsed.bucketTotals['self-attested']).toBeGreaterThanOrEqual(1);
        expect(parsed.bucketTotals['not-found-in-declared-files']).toBeGreaterThanOrEqual(1);
      } finally {
        await fx.cleanup();
      }
    },
  );
});

describe('runVerifyHistoricalCoverageAudit error handling (phase 261 T3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it(
    '261-01/AC-5: a thrown error from auditHistoricalCoverage is caught, reported via ' +
      'io.err, and never crashes the process — exit code 1',
    async () => {
      vi.doMock('../../src/verify/historical-coverage-audit.js', () => ({
        auditHistoricalCoverage: vi.fn().mockRejectedValue(new Error('boom')),
      }));
      const { runVerifyHistoricalCoverageAudit: runWithMock } = await import('../../src/services/verify.js');
      const { io, out, err } = makeIo();
      const res = await runWithMock({ cwd: '/nonexistent-fixture-root' }, io);
      expect(res.exitCode).toBe(1);
      expect(err.join('')).toContain('boom');
      expect(out.join('')).toBe('');
      vi.doUnmock('../../src/verify/historical-coverage-audit.js');
      vi.resetModules();
    },
  );
});
