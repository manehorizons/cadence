// packages/core/tests/config-edit/coverage-scheme-field.test.ts
import { describe, it, expect } from 'vitest';
import { resolveField } from '../../src/config-edit/fields.js';
import { validateCandidate, assembleConfig } from '../../src/config-edit/apply.js';
import { defaultConfig } from '@thomas-powers-jr/cadence-types';

describe('config-edit coverageScheme field', () => {
  // 239-01/AC-5: the field is registered and discoverable exactly like coverageMode.
  it('239-01/AC-5: coverageScheme is editable and current() tracks the config', () => {
    const field = resolveField('coverageScheme');
    expect(field?.dottedKey).toBe('verification.coverageScheme');
    expect(field?.current(defaultConfig)).toBe('bare');

    const qualifiedCfg = {
      ...defaultConfig,
      verification: { ...defaultConfig.verification, coverageScheme: 'phase-qualified' as const },
    };
    expect(field?.current(qualifiedCfg)).toBe('phase-qualified');
  });

  // 239-01/AC-5: both allowed values pass full config-edit validation.
  it('239-01/AC-5: config edit accepts both bare and phase-qualified', () => {
    const field = resolveField('coverageScheme');
    expect(field).not.toBeNull();
    expect(field?.choices.map((c) => c.value).sort()).toEqual(['bare', 'phase-qualified']);

    for (const value of ['bare', 'phase-qualified']) {
      const answers = new Map([[field!.dottedKey, value]]);
      const candidate = assembleConfig(defaultConfig, answers);
      const result = validateCandidate(candidate);
      expect(result.ok, `expected ${value} to validate`).toBe(true);
      if (result.ok) {
        expect(result.config.verification.coverageScheme).toBe(value);
      }
    }
  });

  // 239-01/AC-5: an invalid value is refused with a clear message, nothing is written.
  it('239-01/AC-5: config edit rejects an invalid coverageScheme value', () => {
    const field = resolveField('coverageScheme');
    const answers = new Map([[field!.dottedKey, 'strict']]);
    const candidate = assembleConfig(defaultConfig, answers);
    const result = validateCandidate(candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('verification.coverageScheme');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
