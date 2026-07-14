import { afterEach, describe, expect, it } from 'vitest';
import { stat } from 'node:fs/promises';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  emptyAssumptionLedger,
  emptyEvidenceLedger,
  emptyIntelligenceDecisionLedger,
  emptyRecommendationLedger,
} from '@manehorizons/cadence-types';
import {
  writeAssumptionLedger,
  writeIntelligenceDecisionLedger,
  writeIntelligenceLedgers,
} from '../../../src/intelligence/store/io.js';
import {
  assumptionsPath,
  decisionsPath,
  evidencePath,
  recommendationsPath,
} from '../../../src/intelligence/store/paths.js';

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
});
