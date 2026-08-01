import { describe, it, expect } from 'vitest';
import { EDITABLE_FIELDS, resolveField, nearestField } from '../../src/config-edit/fields.js';
import { defaultConfig } from '@manehorizons/cadence-types';

describe('config-edit fields', () => {
  // AC-1: the curated registry is exactly the behavior-shaping keys
  // (Phase 102 added `autoArchive`; Phase 108 added `coverageMode`;
  // Phase 242 added `autoRoute` → count 8).
  it('AC-1: registry holds exactly the curated 8 fields', () => {
    expect(EDITABLE_FIELDS.map((f) => f.name)).toEqual([
      'profile', 'loopEnforcement', 'acDiscipline', 'commitCadence', 'verifier', 'autoArchive', 'autoRoute', 'coverageMode',
    ]);
    for (const f of EDITABLE_FIELDS) {
      expect(f.label.length, `${f.name} label`).toBeGreaterThan(0);
      expect(f.help.length, `${f.name} help`).toBeGreaterThan(0);
      expect(f.choices.length, `${f.name} choices`).toBeGreaterThan(1);
    }
  });

  // AC-1: current() reads the active value (incl. the nested verifier.provider).
  it('AC-1: current() reflects defaultConfig', () => {
    const by = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.name, f.current(defaultConfig)]));
    expect(by.profile).toBe('auto');
    expect(by.loopEnforcement).toBe('soft');
    expect(by.acDiscipline).toBe('tier-scaled');
    expect(by.commitCadence).toBe('draft');
    expect(by.verifier).toBe('mock');
    expect(by.autoArchive).toBe('true');
    expect(by.autoRoute).toBe('true');
    // Phase 139: defaultConfig's coverageMode flipped 'mention' → 'assertion'.
    expect(by.coverageMode).toBe('assertion');
  });

  // Phase 108 / AC-1 (discoverability): coverageMode resolves + tracks the config value.
  it('108 AC-1: coverageMode is editable and current() tracks the config', () => {
    expect(resolveField('coverageMode')?.dottedKey).toBe('verification.coverageMode');
    const assertionCfg = {
      ...defaultConfig,
      verification: { ...defaultConfig.verification, coverageMode: 'assertion' as const },
    };
    expect(resolveField('coverageMode')?.current(assertionCfg)).toBe('assertion');
  });

  // Phase 102 / AC-1 (discoverability): autoArchive resolves + reads its config value.
  it('102 AC-1: autoArchive is editable and current() tracks the config', () => {
    expect(resolveField('autoArchive')?.dottedKey).toBe('recommendations.autoArchive');
    const off = { ...defaultConfig, recommendations: { autoArchive: false, autoRoute: true } };
    expect(resolveField('autoArchive')?.current(off)).toBe('false');
  });

  // 242-01/AC-1 (discoverability): autoRoute resolves + reads its config value.
  it('242-01/AC-1: autoRoute is editable and current() tracks the config', () => {
    expect(resolveField('autoRoute')?.dottedKey).toBe('recommendations.autoRoute');
    const off = { ...defaultConfig, recommendations: { autoArchive: true, autoRoute: false } };
    expect(resolveField('autoRoute')?.current(off)).toBe('false');
  });

  // AC-2: resolveField handles the canonical name, the alias, and casing.
  it('AC-2: resolveField resolves names, aliases, and casing', () => {
    expect(resolveField('profile')?.name).toBe('profile');
    expect(resolveField('enforcement')?.name).toBe('loopEnforcement');
    expect(resolveField('VERIFIER')?.name).toBe('verifier');
    expect(resolveField('nope')).toBeNull();
  });

  // AC-2: nearestField nudges a close miss, ignores a far one.
  it('AC-2: nearestField suggests a close match only', () => {
    expect(nearestField('profil')).toBe('profile');
    expect(nearestField('xyzzy')).toBeNull();
  });
});
