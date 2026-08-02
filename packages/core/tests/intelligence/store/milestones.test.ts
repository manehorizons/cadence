import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { emptyMilestoneLedger, type MilestoneLedger } from '@thomas-powers-jr/cadence-types';
import {
  readMilestoneLedger,
  writeMilestoneLedger,
} from '../../../src/intelligence/store/milestones.js';
import { milestonesPath } from '../../../src/intelligence/store/paths.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const SEEDED: MilestoneLedger = {
  schemaVersion: 1,
  milestones: [
    {
      id: 'mil-rec-rec-1',
      name: 'X',
      objective: 'o',
      status: 'proposed',
      recommendationIds: ['rec-1'],
      preMortem: {
        likelyFailureModes: [],
        hiddenDependencies: [],
        driftRisks: [],
        outOfScope: [],
      },
      exportTargets: [],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    },
  ],
};

describe('readMilestoneLedger', () => {
  it('returns an empty ledger when milestones.json does not exist', async () => {
    active = await tempRepo({ initialized: true });
    expect(await readMilestoneLedger(active.root)).toEqual(emptyMilestoneLedger());
  });

  it('round-trips a seeded ledger through writeMilestoneLedger', async () => {
    active = await tempRepo({ initialized: true });
    await writeMilestoneLedger(active.root, SEEDED);

    expect(await readMilestoneLedger(active.root)).toEqual(SEEDED);
  });
});

describe('writeMilestoneLedger', () => {
  it('writes milestones.json without an `archived` key (real schema has none)', async () => {
    active = await tempRepo({ initialized: true });
    await writeMilestoneLedger(active.root, SEEDED);

    const raw = JSON.parse(await readFile(milestonesPath(active.root), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(raw).not.toHaveProperty('archived');
    expect(raw.milestones).toHaveLength(1);
  });

  it('also renders MILESTONES.md alongside the JSON write', async () => {
    active = await tempRepo({ initialized: true });
    await writeMilestoneLedger(active.root, SEEDED);

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'MILESTONES.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Milestone Candidates/);
    expect(md).toContain('mil-rec-rec-1');
  });
});
