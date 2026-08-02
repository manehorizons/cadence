import { describe, expect, it, afterEach } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { RepoScanZ } from '@thomas-powers-jr/cadence-types';
import { scanRepo } from '../../src/intelligence/scan.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('scanRepo', () => {
  it('scans an initialized temp repo (no git) deterministically', async () => {
    active = await tempRepo({ initialized: true, projectName: 'scan-fix' });

    const scan = await scanRepo(active.root);

    // Scanner output must satisfy the shared schema (catches shape drift early).
    expect(() => RepoScanZ.parse(scan)).not.toThrow();
    // tempRepo is not a git work tree → git unavailable, no throw.
    expect(scan.git.available).toBe(false);
    // tempRepo initialized scaffolds .cadence/ROADMAP.md but not README/DESIGN/CHANGELOG.
    expect(scan.docs.roadmap).toBe(true);
    expect(scan.docs.readme).toBe(false);
    expect(scan.docs.design).toBe(false);
    expect(scan.docs.changelog).toBe(false);
    expect(scan.phases.count).toBe(0);
    expect(typeof scan.surfaces.turbo).toBe('boolean');
    expect(scan.pkg.scripts).toBeDefined();
  });
});

describe('scanPhases latest-id ordering (rec-20260610-001)', () => {
  it('ranks 100 above 99 (numeric, not lexicographic)', async () => {
    active = await tempRepo({ initialized: true });
    const phases = join(active.root, '.cadence', 'phases');
    for (const name of ['01-a', '99-b', '100-c']) {
      await mkdir(join(phases, name), { recursive: true });
    }
    const scan = await scanRepo(active.root);
    expect(scan.phases.latestId).toBe('100-c');
    expect(scan.phases.count).toBe(3);
  });
});
