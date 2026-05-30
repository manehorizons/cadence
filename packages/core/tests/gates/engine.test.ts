import { describe, it, expect } from 'vitest';
import type { Profile, Tier } from '@manehorizons/cadence-types';
import { effectiveGateSet, effectiveProfile, gatesFor } from '../../src/gates/engine.js';

const ALWAYS = ['coherence-check', 'structural-verifier', 'build-test-must-pass'] as const;

describe('effectiveProfile', () => {
  it('draft override wins over config default', () => {
    expect(effectiveProfile({ profile: 'auto' }, { profile: 'strict' })).toBe('strict');
  });

  it('config default applies when draft has no override', () => {
    expect(effectiveProfile({ profile: 'standard' }, { profile: undefined })).toBe('standard');
    expect(effectiveProfile({ profile: 'standard' }, null)).toBe('standard');
  });

  it('falls back to "auto" when neither config nor draft set a profile', () => {
    expect(effectiveProfile(null, null)).toBe('auto');
    expect(effectiveProfile({ profile: undefined as never }, null)).toBe('auto');
  });
});

describe('gatesFor — matrix coverage', () => {
  // Always-fire gates appear in every cell.
  for (const profile of ['strict', 'standard', 'auto'] as const) {
    for (const tier of ['quick-fix', 'standard', 'complex'] as const) {
      it(`(${profile}, ${tier}) includes all three always-fire gates`, () => {
        const set = gatesFor(tier, profile);
        for (const g of ALWAYS) expect(set.gates).toContain(g);
      });
    }
  }

  it('strict × quick-fix: draft-read, approve, test-coverage, interactive-verdict', () => {
    const set = gatesFor('quick-fix', 'strict');
    expect(set.gates).toEqual(
      expect.arrayContaining(['draft-read', 'approve', 'test-coverage', 'interactive-verdict']),
    );
    expect(set.softCap).toBe(false);
  });

  it('strict × complex: includes plan-review + security-audit', () => {
    const set = gatesFor('complex', 'strict');
    expect(set.gates).toEqual(expect.arrayContaining(['plan-review', 'security-audit']));
    expect(set.softCap).toBe(false);
  });

  it('standard × complex: includes code-review + deep-verify', () => {
    const set = gatesFor('complex', 'standard');
    expect(set.gates).toEqual(expect.arrayContaining(['code-review', 'deep-verify']));
    expect(set.softCap).toBe(false);
  });

  it('auto × quick-fix: only anomaly-notify on top of free', () => {
    const set = gatesFor('quick-fix', 'auto');
    expect(set.gates).toEqual([...ALWAYS, 'anomaly-notify']);
    expect(set.softCap).toBe(false);
  });

  it('auto × standard: adds test-coverage + anomaly-notify', () => {
    const set = gatesFor('standard', 'auto');
    expect(set.gates).toEqual([...ALWAYS, 'test-coverage', 'anomaly-notify']);
    expect(set.softCap).toBe(false);
  });

  it('auto × complex: softCap=true (the cap)', () => {
    const set = gatesFor('complex', 'auto');
    expect(set.softCap).toBe(true);
    // Gates still computed (caller refuses based on softCap).
    expect(set.gates).toEqual(expect.arrayContaining(['anomaly-notify']));
  });

  it('returns deduplicated gates (no double-counting always-fire vs delta)', () => {
    for (const profile of ['strict', 'standard', 'auto'] as const) {
      for (const tier of ['quick-fix', 'standard', 'complex'] as const) {
        const set = gatesFor(tier, profile);
        expect(new Set(set.gates).size).toBe(set.gates.length);
      }
    }
  });
});

describe('effectiveGateSet', () => {
  it('uses draft tier when present, else state.tier', () => {
    const set1 = effectiveGateSet({ tier: 'quick-fix' }, { profile: 'auto' }, null);
    expect(set1.softCap).toBe(false);
    const set2 = effectiveGateSet({ tier: 'quick-fix' }, { profile: 'auto' }, {
      tier: 'complex',
      profile: undefined,
    });
    expect(set2.softCap).toBe(true);
  });

  it('defaults to standard tier + auto profile when nothing is specified', () => {
    const set = effectiveGateSet({ tier: null }, null, null);
    expect(set.gates).toEqual([...ALWAYS, 'test-coverage', 'anomaly-notify']);
    expect(set.softCap).toBe(false);
  });
});
