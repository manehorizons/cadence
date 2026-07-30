import { describe, it, expect } from 'vitest';
import { CadenceConfigZ, defaultConfig } from '../src/config.js';

describe('verification.coverageScheme (phase 239)', () => {
  it('239-01/AC-5: dropping the whole verification object resolves "bare" via the object-level .default({...}) literal', () => {
    // In Zod 4 the object-level default literal is returned as-is, NOT
    // re-parsed through the inner field defaults — so this exercises the
    // `.default({...})` literal's own `coverageScheme: 'bare'`, not the
    // field-level `.default('bare')`. Both layers must carry 'bare'
    // independently.
    const { verification: _drop, ...withoutVerification } = defaultConfig;
    const cfg = CadenceConfigZ.parse(withoutVerification);
    expect(cfg.verification.coverageScheme).toBe('bare');
  });

  it('239-01/AC-5: a verification block lacking coverageScheme resolves "bare" via the field-level default', () => {
    // The most common real upgrade shape: `verification` exists (init has
    // always written testGlobs/coverageMode) but predates coverageScheme.
    const cfg = CadenceConfigZ.parse({
      ...defaultConfig,
      verification: {
        testGlobs: ['packages/**/*.test.ts'],
        coverageMode: 'assertion',
      },
    });
    expect(cfg.verification.coverageScheme).toBe('bare');
  });

  it('239-01/AC-5: accepts "phase-qualified"', () => {
    const cfg = CadenceConfigZ.parse({ ...defaultConfig, verification: { coverageScheme: 'phase-qualified' } });
    expect(cfg.verification.coverageScheme).toBe('phase-qualified');
  });

  it('239-01/AC-5: rejects an unknown scheme', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, verification: { coverageScheme: 'fuzzy' as never } }),
    ).toThrow();
  });

  it('239-01/AC-5: defaultConfig — the base loadConfig merges user config over — holds "bare"', () => {
    // This is the load-bearing back-compat assertion: loadConfig spreads
    // the user's config.json over defaultConfig, so whatever sits here is
    // injected into every pre-existing config that lacks the key. A
    // 'phase-qualified' value here would silently flip every consumer of
    // published 1.51.1 on upgrade. Fresh-init opt-in lives in core's
    // init.ts verification overlay, not here.
    expect(defaultConfig.verification.coverageScheme).toBe('bare');
  });
});
