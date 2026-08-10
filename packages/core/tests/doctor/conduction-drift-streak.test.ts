import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { computeConductionDriftStreak } from '../../src/doctor/run.js';

/**
 * Phase 268 (T3, AC-5): static, on-disk fixture corpus — as opposed to the
 * `tempRepo` + `writeSummary`-at-test-time style used by every test above
 * this point (T2's original 10). `computeConductionDriftStreak` only ever
 * reads from `<root>/.cadence/phases/**`, so each fixture scenario directory
 * below IS a valid `root` on its own — no `tempRepo` scaffolding needed, and
 * these files are hand-computed, checked-in, and diffable like any other
 * fixture in this repo (see `tests/lint/fixtures/`, `tests/mcp/fixtures/`).
 */
const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'conduction-drift-streak');

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

// evidenceTally's key schema is AcEvidenceZ (five classes) — a full object
// must enumerate all five keys (z.record over an enum key schema is
// exhaustive under zod v4; see packages/types/tests/summary.test.ts).
const ZERO_EVIDENCE_TALLY = {
  'ai-verified': 0,
  executed: 0,
  assertion: 0,
  mention: 0,
  unverified: 0,
};

interface SummaryOptions {
  completedAt: string;
  verifierRollup?: Array<{ provider: string; model?: string; gateCount: number }>;
  /** Omit the `assurance` object entirely — simulates a pre-phase-233 record. */
  omitAssurance?: boolean;
}

function summaryJson(opts: SummaryOptions): Record<string, unknown> {
  const base: Record<string, unknown> = {
    schemaVersion: 2,
    draftId: 'X-01',
    completedAt: opts.completedAt,
    acResults: [],
    taskResults: [],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
  };
  if (!opts.omitAssurance) {
    base.assurance = {
      verifierRollup: opts.verifierRollup ?? [],
      evidenceTally: ZERO_EVIDENCE_TALLY,
      overall: 'unverified',
    };
  }
  return base;
}

async function writeSummary(
  root: string,
  phase: string,
  id: string,
  opts: SummaryOptions,
): Promise<void> {
  const dir = join(root, '.cadence', 'phases', phase);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}-SUMMARY.json`), JSON.stringify(summaryJson(opts), null, 2));
}

describe('computeConductionDriftStreak', () => {
  it('268-01/AC-1: empty corpus (no settled phases) → determinate streak of 0', async () => {
    active = await tempRepo({ initialized: true });
    const result = await computeConductionDriftStreak(active.root);
    expect(result.determinate).toBe(true);
    expect(result).toMatchObject({ determinate: true, streak: 0 });
  });

  it('268-01/AC-1: no .cadence/phases directory at all → determinate streak of 0, never throws', async () => {
    active = await tempRepo({ initialized: false });
    await expect(computeConductionDriftStreak(active.root)).resolves.toMatchObject({
      determinate: true,
      streak: 0,
    });
  });

  it('268-01/AC-1: three consecutive mock-only/empty-rollup settles → streak of 3', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(active.root, '10-a', '10-01', {
      completedAt: '2026-08-01T00:00:00.000Z',
      verifierRollup: [{ provider: 'mock', gateCount: 1 }],
    });
    await writeSummary(active.root, '11-b', '11-01', {
      completedAt: '2026-08-02T00:00:00.000Z',
      verifierRollup: [],
    });
    await writeSummary(active.root, '12-c', '12-01', {
      completedAt: '2026-08-03T00:00:00.000Z',
      verifierRollup: [{ provider: 'mock', gateCount: 2 }],
    });

    const result = await computeConductionDriftStreak(active.root);
    expect(result).toMatchObject({ determinate: true, streak: 3 });
  });

  it('268-01/AC-1: an empty verifierRollup counts toward the streak (no non-mock identity present)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(active.root, '10-a', '10-01', {
      completedAt: '2026-08-01T00:00:00.000Z',
      verifierRollup: [],
    });

    const result = await computeConductionDriftStreak(active.root);
    expect(result).toMatchObject({ determinate: true, streak: 1 });
  });

  it('268-01/AC-1: a non-mock entry on the most-recent settle → streak of 0', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(active.root, '10-a', '10-01', {
      completedAt: '2026-08-01T00:00:00.000Z',
      verifierRollup: [{ provider: 'mock', gateCount: 1 }],
    });
    await writeSummary(active.root, '11-b', '11-01', {
      completedAt: '2026-08-02T00:00:00.000Z',
      verifierRollup: [{ provider: 'host-cli', gateCount: 1 }],
    });

    const result = await computeConductionDriftStreak(active.root);
    expect(result).toMatchObject({ determinate: true, streak: 0 });
  });

  it('268-01/AC-1: a non-mock entry resets the streak at the point it appears (third-most-recent)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(active.root, '10-a', '10-01', {
      completedAt: '2026-08-01T00:00:00.000Z',
      verifierRollup: [{ provider: 'anthropic', model: 'claude-x', gateCount: 1 }],
    });
    await writeSummary(active.root, '11-b', '11-01', {
      completedAt: '2026-08-02T00:00:00.000Z',
      verifierRollup: [],
    });
    await writeSummary(active.root, '12-c', '12-01', {
      completedAt: '2026-08-03T00:00:00.000Z',
      verifierRollup: [{ provider: 'mock', gateCount: 1 }],
    });

    const result = await computeConductionDriftStreak(active.root);
    expect(result).toMatchObject({ determinate: true, streak: 2 });
  });

  it('268-01/AC-1: assurance absent on the most-recent settle → indeterminate, never throws', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(active.root, '10-a', '10-01', {
      completedAt: '2026-08-01T00:00:00.000Z',
      omitAssurance: true,
    });

    await expect(computeConductionDriftStreak(active.root)).resolves.toMatchObject({
      determinate: false,
    });
  });

  it('268-01/AC-1: unparseable JSON anywhere in the corpus → indeterminate, never throws', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(active.root, '10-a', '10-01', {
      completedAt: '2026-08-01T00:00:00.000Z',
      verifierRollup: [{ provider: 'mock', gateCount: 1 }],
    });
    const dir = join(active.root, '.cadence', 'phases', '11-bad');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '11-01-SUMMARY.json'), '{ not valid json');

    await expect(computeConductionDriftStreak(active.root)).resolves.toMatchObject({
      determinate: false,
    });
  });

  it('268-01/AC-1: a SUMMARY.json failing schema validation → indeterminate, never throws', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.cadence', 'phases', '10-bad');
    await mkdir(dir, { recursive: true });
    // Valid JSON, but missing every required SummaryZ field.
    await writeFile(join(dir, '10-01-SUMMARY.json'), JSON.stringify({ foo: 'bar' }));

    await expect(computeConductionDriftStreak(active.root)).resolves.toMatchObject({
      determinate: false,
    });
  });

  it('every result (determinate or not) carries a human-readable detail string', async () => {
    active = await tempRepo({ initialized: true });
    const result = await computeConductionDriftStreak(active.root);
    expect(typeof result.detail).toBe('string');
    expect(result.detail.length).toBeGreaterThan(0);
  });
});

describe('computeConductionDriftStreak — fixture corpus (rec-20260809-001: the AC token is deliberately kept out of this describe title, and only appears in the it() titles below — a describe-level occurrence positioned ahead of them would eat the per-file dedup slot and silently drop the real qualifying refs)', () => {
  // Phase 268 (T3, AC-5): a hand-computed, on-disk fixture corpus under
  // tests/doctor/fixtures/conduction-drift-streak/. Each `it` below states
  // its hand-computed expectation explicitly in a comment before asserting
  // it, so the fixture's intent is auditable independent of the assertion.

  it('268-01/AC-5: directory/file naming order is the INVERSE of chronological completedAt order, and the counter still returns the chronologically-correct streak — the adversarial case flagged by T2\'s reviewer (a regression that silently drops the `.sort()` by `completedAt` in favor of raw directory/readdir order must be caught here)', async () => {
    // Fixture: tests/doctor/fixtures/conduction-drift-streak/inverse-order/
    //   a-newest             completedAt 2026-05-01 (rank 1, newest)  mock
    //   b-oldest             completedAt 2026-01-01 (rank 4, oldest)  NON-MOCK (breaker)
    //   c-second-newest      completedAt 2026-04-01 (rank 2)          mock
    //   d-third-newest       completedAt 2026-03-01 (rank 3)          mock (empty rollup)
    //
    // Alphabetical/directory-creation order is a, b, c, d — chronologically
    // that is newest, oldest, 2nd-newest, 3rd-newest: NOT monotonic in
    // either direction relative to completedAt, i.e. naming order is
    // deliberately decorrelated from (the inverse of) chronological order.
    // Hand-computed expectation, walking by completedAt DESCENDING (the
    // only chronologically-correct order): a-newest (mock, streak=1) ->
    // c-second-newest (mock, streak=2) -> d-third-newest (mock, streak=3)
    // -> b-oldest (non-mock, BREAK) -> streak=3.
    //
    // Verified adversarial on this platform (Windows/NTFS, where readdir
    // returns entries in alphabetical order) before writing this fixture: a
    // standalone reimplementation of the walk (readdir + naive non-sorted
    // loop, no edits to run.ts) against this exact directory/date/provider
    // layout produces streak=1 (wrong) without run.ts's
    // `records.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))`
    // step, vs. streak=3 (correct) with it. `readdir` order is
    // filesystem-dependent, so the exact wrong value a dropped sort would
    // produce varies by platform (reverse-alphabetical order, d/c/b/a, also
    // yields the wrong streak=2, for instance) — but the fixture is built so
    // alphabetical, reverse-alphabetical, and creation order all diverge
    // from the one order a dropped-sort regression would need to
    // coincidentally reproduce to still pass: completedAt-descending
    // (a-newest, c-second-newest, d-third-newest, b-oldest). Only that
    // single ordering out of 4! = 24 possible walk orders yields streak=3
    // without an explicit sort — any other raw walk order silently drops the
    // regression's cover and this test catches it.
    const result = await computeConductionDriftStreak(join(FIXTURES_ROOT, 'inverse-order'));
    expect(result).toMatchObject({ determinate: true, streak: 3 });
  });

  it('268-01/AC-5: two most-recent mock-only settles keep the streak alive, an older non-mock settle breaks it — exact streak and a detail string naming the breaking record', async () => {
    // Fixture: tests/doctor/fixtures/conduction-drift-streak/mock-streak-then-older-nonmock/
    //   newest         completedAt 2026-07-03  mock
    //   second-newest  completedAt 2026-07-02  mock (empty rollup)
    //   breaker-oldest completedAt 2026-07-01  NON-MOCK ('host-cli')
    // Hand-computed: streak = 2 (the two most-recent), broken by breaker-oldest.
    const result = await computeConductionDriftStreak(
      join(FIXTURES_ROOT, 'mock-streak-then-older-nonmock'),
    );
    expect(result).toMatchObject({ determinate: true, streak: 2 });
    if (result.determinate) {
      expect(result.detail).toContain('broken by');
      expect(result.detail).toContain('breaker-oldest');
      expect(result.detail).toContain('breaker-oldest-01-SUMMARY.json');
      expect(result.detail).toContain('2026-07-01T00:00:00.000Z');
    }
  });

  it('268-01/AC-5: a malformed (invalid-JSON) SUMMARY.json positioned mid-corpus makes the WHOLE result indeterminate, regardless of its chronological position', async () => {
    // Fixture: tests/doctor/fixtures/conduction-drift-streak/malformed-json-mid-corpus/
    //   newest-valid     completedAt 2026-06-03  mock, valid
    //   middle-malformed completedAt (unreadable — the file is not valid JSON at all)
    //   oldest-valid     completedAt 2026-06-01  mock, valid
    // Hand-computed: the corpus is NOT determinable — middle-malformed's
    // true completedAt is unknowable, so it can never be ruled out as the
    // most-recent settle (per computeConductionDriftStreak's documented
    // algorithm, point 1). Two otherwise-clean, streak-eligible records
    // surrounding it must not produce a numeric streak.
    const result = await computeConductionDriftStreak(
      join(FIXTURES_ROOT, 'malformed-json-mid-corpus'),
    );
    expect(result.determinate).toBe(false);
  });

  it('268-01/AC-5: a pre-phase-233-style record (no `assurance` field at all) mixed into an otherwise-clean corpus is indeterminate, never a silently-continued streak', async () => {
    // Fixture: tests/doctor/fixtures/conduction-drift-streak/missing-assurance-mid-corpus/
    //   newest        completedAt 2026-06-03  mock
    //   second-newest completedAt 2026-06-02  mock (empty rollup)
    //   oldest-pre233 completedAt 2026-06-01  NO `assurance` key at all
    // Hand-computed: walking most-recent-first hits two clean mock settles
    // (streak would be 2 if it stopped there), then reaches oldest-pre233
    // whose `assurance` is entirely absent -- per computeConductionDriftStreak's
    // algorithm this must degrade the WHOLE result to indeterminate, not
    // report {determinate: true, streak: 2} (a fabricated streak) nor any
    // other numeric value.
    const result = await computeConductionDriftStreak(
      join(FIXTURES_ROOT, 'missing-assurance-mid-corpus'),
    );
    expect(result.determinate).toBe(false);
    expect(result).not.toMatchObject({ determinate: true, streak: 2 });
    if (!result.determinate) {
      expect(result.detail).toContain('oldest-pre233');
    }
  });
});
