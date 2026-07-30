import { describe, it, expect, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { loadConfig } from '../../src/config/loader.js';
import { defaultConfig } from '@manehorizons/cadence-types';

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

// Phase 239 back-compat, proven END-TO-END through the real loadConfig, not
// the Zod schema in isolation. loadConfig merges the user's config.json OVER
// defaultConfig before parsing, so the field-level Zod `.default('bare')`
// never fires on this path — defaultConfig itself must hold 'bare' or every
// consumer of published 1.51.1 silently flips to the strict scheme on
// upgrade. The absence of exactly this assertion is what let that bug ship.
describe('verification.coverageScheme through loadConfig (phase 239)', () => {
  it('239-01/AC-5: a config.json with a verification block lacking coverageScheme resolves to "bare" through loadConfig', async () => {
    active = await tempRepo({ initialized: true });
    // The most common real upgrade shape: a config written by a pre-239
    // `cadence init` has a verification block (testGlobs/coverageMode have
    // always been written explicitly) but no coverageScheme key.
    const { coverageScheme: _drop, ...legacyVerification } = defaultConfig.verification;
    await writeFile(
      join(active.root, '.cadence/config.json'),
      JSON.stringify({ ...defaultConfig, verification: legacyVerification }),
    );
    const cfg = await loadConfig(active.root);
    expect(cfg.verification.coverageScheme).toBe('bare');
  });

  it('239-01/AC-5: a repo with no .cadence/config.json at all resolves to "bare" through loadConfig', async () => {
    active = await tempRepo();
    const cfg = await loadConfig(active.root);
    expect(cfg.verification.coverageScheme).toBe('bare');
  });

  it('239-01/AC-5: a config.json explicitly opting in to "phase-qualified" resolves to "phase-qualified" through loadConfig', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(
      join(active.root, '.cadence/config.json'),
      JSON.stringify({
        ...defaultConfig,
        verification: { ...defaultConfig.verification, coverageScheme: 'phase-qualified' },
      }),
    );
    const cfg = await loadConfig(active.root);
    expect(cfg.verification.coverageScheme).toBe('phase-qualified');
  });
});
