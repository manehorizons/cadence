import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import {
  emptyAssumptionLedger,
  emptyEvidenceLedger,
  emptyIntelligenceDecisionLedger,
  emptyRecommendationLedger,
  emptyMilestoneLedger,
} from '@thomas-powers-jr/cadence-types';
import {
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  writeAssumptionLedger,
  writeIntelligenceDecisionLedger,
  writeIntelligenceLedgers,
} from '../../../src/intelligence/store/io.js';
import { readMilestoneLedger, writeMilestoneLedger } from '../../../src/intelligence/store/milestones.js';
import {
  assumptionsPath,
  decisionsPath,
  evidencePath,
  milestonesPath,
  recommendationsPath,
} from '../../../src/intelligence/store/paths.js';

// This test file itself lives at packages/core/tests/intelligence/store/,
// five directories below the repo root regardless of which package's
// directory `vitest run` treats as `process.cwd()` (see vitest.shared.ts) —
// resolve the real repo's own `.cadence/intelligence/` off the file's own
// location instead of relying on cwd.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('writeIntelligenceLedgers file permissions', () => {
  it.skipIf(process.platform === 'win32')(
    'AC-4: evidence.json and recommendations.json end up mode 0o600 on POSIX',
    async () => {
      active = await tempRepo();
      await writeIntelligenceLedgers(active.root, emptyRecommendationLedger(), emptyEvidenceLedger());

      const evSt = await stat(evidencePath(active.root));
      const recSt = await stat(recommendationsPath(active.root));
      expect(evSt.mode & 0o777).toBe(0o600);
      expect(recSt.mode & 0o777).toBe(0o600);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'AC-4: assumptions.json ends up mode 0o600 on POSIX',
    async () => {
      active = await tempRepo();
      await writeAssumptionLedger(active.root, emptyAssumptionLedger());

      const asSt = await stat(assumptionsPath(active.root));
      expect(asSt.mode & 0o777).toBe(0o600);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'AC-4: decisions.json ends up mode 0o600 on POSIX',
    async () => {
      active = await tempRepo();
      await writeIntelligenceDecisionLedger(active.root, emptyIntelligenceDecisionLedger());

      const decSt = await stat(decisionsPath(active.root));
      expect(decSt.mode & 0o777).toBe(0o600);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'AC-4: milestones.json ends up mode 0o600 on POSIX',
    async () => {
      active = await tempRepo();
      await writeMilestoneLedger(active.root, emptyMilestoneLedger());

      const milSt = await stat(milestonesPath(active.root));
      expect(milSt.mode & 0o777).toBe(0o600);
    },
  );
});

describe("Phase 220 T8 (AC-5): this repo's real intelligence ledgers parse to a deep-equal value", () => {
  it('recommendations.json, evidence.json, decisions.json, and milestones.json parse identically to their raw on-disk JSON', async () => {
    const [rawRecs, rawEvidence, rawDecisions, rawMilestones] = await Promise.all([
      readFile(recommendationsPath(REPO_ROOT), 'utf8'),
      readFile(evidencePath(REPO_ROOT), 'utf8'),
      readFile(decisionsPath(REPO_ROOT), 'utf8'),
      readFile(milestonesPath(REPO_ROOT), 'utf8'),
    ]);

    const [recs, evidence, decisions, milestones] = await Promise.all([
      readRecommendationLedger(REPO_ROOT),
      readEvidenceLedger(REPO_ROOT),
      readIntelligenceDecisionLedger(REPO_ROOT),
      readMilestoneLedger(REPO_ROOT),
    ]);

    // AC-5's exact claim ("additive-only, no migration step required") means
    // deep-equal to the raw file, not merely "didn't throw".
    expect(recs).toEqual(JSON.parse(rawRecs));
    expect(evidence).toEqual(JSON.parse(rawEvidence));
    expect(decisions).toEqual(JSON.parse(rawDecisions));
    expect(milestones).toEqual(JSON.parse(rawMilestones));

    // This is this project's own live Praxis ledger, not an empty scaffold —
    // assert non-trivial, correctly-shaped content, not just array-ness.
    expect(recs.recommendations.length).toBeGreaterThan(0);
    expect(recs.recommendations.every((r) => r.id.startsWith('rec-'))).toBe(true);
    expect(evidence.evidence.length).toBeGreaterThan(0);
    expect(evidence.evidence.every((e) => e.id.startsWith('ev-'))).toBe(true);
    expect(decisions.decisions.length).toBeGreaterThan(0);
    expect(decisions.decisions.every((d) => d.id.startsWith('dec-'))).toBe(true);
    expect(milestones.milestones.length).toBeGreaterThan(0);
    expect(milestones.milestones.every((m) => m.id.startsWith('mil-'))).toBe(true);
  });

  it('assumptions.json (absent in this repo) falls back to a valid empty ledger rather than throwing', async () => {
    // This repo has never recorded a Praxis assumption on disk (ASSUMPTIONS.md
    // exists from a prior render, but assumptions.json does not) — exercises
    // readLedger's missing-file branch against a real repo layout rather than
    // a synthetic fixture.
    expect(existsSync(assumptionsPath(REPO_ROOT))).toBe(false);
    expect(await readAssumptionLedger(REPO_ROOT)).toEqual(emptyAssumptionLedger());
  });
});

describe('Phase 220 T8 (AC-6): read -> write round-trip on real ledger data is idempotent and deterministic', () => {
  it('recommendations + evidence: round-trip reproduces the read value, and a second write is byte-identical to the first', async () => {
    active = await tempRepo();
    const recs = await readRecommendationLedger(REPO_ROOT);
    const evidence = await readEvidenceLedger(REPO_ROOT);

    await writeIntelligenceLedgers(active.root, recs, evidence);
    const firstRecBytes = await readFile(recommendationsPath(active.root), 'utf8');
    const firstEvBytes = await readFile(evidencePath(active.root), 'utf8');
    expect(await readRecommendationLedger(active.root)).toEqual(recs);
    expect(await readEvidenceLedger(active.root)).toEqual(evidence);

    await writeIntelligenceLedgers(active.root, recs, evidence);
    const secondRecBytes = await readFile(recommendationsPath(active.root), 'utf8');
    const secondEvBytes = await readFile(evidencePath(active.root), 'utf8');
    expect(secondRecBytes).toBe(firstRecBytes);
    expect(secondEvBytes).toBe(firstEvBytes);
  });

  it('decisions: round-trip reproduces the read value, and a second write is byte-identical to the first', async () => {
    active = await tempRepo();
    const decisions = await readIntelligenceDecisionLedger(REPO_ROOT);

    await writeIntelligenceDecisionLedger(active.root, decisions);
    const firstBytes = await readFile(decisionsPath(active.root), 'utf8');
    expect(await readIntelligenceDecisionLedger(active.root)).toEqual(decisions);

    await writeIntelligenceDecisionLedger(active.root, decisions);
    const secondBytes = await readFile(decisionsPath(active.root), 'utf8');
    expect(secondBytes).toBe(firstBytes);
  });

  it('milestones: round-trip reproduces the read value, and a second write is byte-identical to the first', async () => {
    active = await tempRepo();
    const milestones = await readMilestoneLedger(REPO_ROOT);

    await writeMilestoneLedger(active.root, milestones);
    const firstBytes = await readFile(milestonesPath(active.root), 'utf8');
    expect(await readMilestoneLedger(active.root)).toEqual(milestones);

    await writeMilestoneLedger(active.root, milestones);
    const secondBytes = await readFile(milestonesPath(active.root), 'utf8');
    expect(secondBytes).toBe(firstBytes);
  });

  it('assumptions: round-trip reproduces the read value (empty ledger, since this repo has none on disk), and a second write is byte-identical', async () => {
    active = await tempRepo();
    const assumptions = await readAssumptionLedger(REPO_ROOT);

    await writeAssumptionLedger(active.root, assumptions);
    const firstBytes = await readFile(assumptionsPath(active.root), 'utf8');
    expect(await readAssumptionLedger(active.root)).toEqual(assumptions);

    await writeAssumptionLedger(active.root, assumptions);
    const secondBytes = await readFile(assumptionsPath(active.root), 'utf8');
    expect(secondBytes).toBe(firstBytes);
  });
});
