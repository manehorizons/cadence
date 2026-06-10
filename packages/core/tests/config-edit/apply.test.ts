import { describe, it, expect } from 'vitest';
import { setPath, coerce, assembleConfig, diffConfig, validateCandidate } from '../../src/config-edit/apply.js';
import { EDITABLE_FIELDS } from '../../src/config-edit/fields.js';
import { defaultConfig } from '@manehorizons/cadence-types';

describe('config-edit apply', () => {
  // AC-4: lifted setPath writes nested paths; coerce preserves config-set behavior.
  it('AC-4: setPath + coerce behave like the config-set helpers', () => {
    const obj: Record<string, unknown> = {};
    setPath(obj, ['verifier', 'provider'], 'anthropic');
    expect(obj).toEqual({ verifier: { provider: 'anthropic' } });
    expect(coerce('true')).toBe(true);
    expect(coerce('42')).toBe(42);
    expect(coerce('hello')).toBe('hello');
  });

  // AC-5: assembleConfig applies answers onto a clone without mutating the input.
  it('AC-5: assembleConfig is non-mutating and applies dotted answers', () => {
    const answers = new Map([['loopEnforcement', 'strict'], ['verifier.provider', 'anthropic']]);
    const candidate = assembleConfig(defaultConfig, answers) as Record<string, any>;
    expect(candidate.loopEnforcement).toBe('strict');
    expect(candidate.verifier.provider).toBe('anthropic');
    expect(defaultConfig.loopEnforcement).toBe('soft'); // original untouched
  });

  // AC-5: diffConfig reports only changed curated keys, old → new.
  it('AC-5: diffConfig lists only changed curated keys', () => {
    const answers = new Map([['loopEnforcement', 'strict']]);
    const candidate = assembleConfig(defaultConfig, answers);
    const changes = diffConfig(defaultConfig, candidate, EDITABLE_FIELDS);
    expect(changes).toEqual([{ key: 'loopEnforcement', from: 'soft', to: 'strict' }]);
  });

  // AC-6: validateCandidate accepts a good config and names the field on a bad one.
  it('AC-6: validateCandidate succeeds on valid, names the field on invalid', () => {
    const good = assembleConfig(defaultConfig, new Map([['profile', 'strict']]));
    const okRes = validateCandidate(good);
    expect(okRes.ok).toBe(true);

    const bad = assembleConfig(defaultConfig, new Map([['loopEnforcement', 'bogus']]));
    const badRes = validateCandidate(bad);
    expect(badRes.ok).toBe(false);
    if (!badRes.ok) expect(badRes.field).toContain('loopEnforcement');
  });
});
