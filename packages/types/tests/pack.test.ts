import { describe, it, expect } from 'vitest';
import { PackManifestZ, isValidPackId } from '../src/pack.js';

describe('PackManifestZ (290-01/AC-1)', () => {
  it('parses a well-formed manifest with every optional field populated (290-01/AC-1)', () => {
    const result = PackManifestZ.safeParse({
      id: 'cadence/core-skills',
      version: '1.2.3',
      integrity: 'sha256-abc123',
      skillAudit: { required: ['skill-a', 'skill-b'] },
      gates: [
        { profile: 'standard', tier: 'complex', add: ['deep-verify', 'security-audit'] },
      ],
      commands: ['cadence-foo', 'cadence-bar'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a manifest missing id (290-01/AC-1)', () => {
    const result = PackManifestZ.safeParse({
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a manifest missing version (290-01/AC-1)', () => {
    const result = PackManifestZ.safeParse({
      id: 'cadence/core-skills',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an id that does not match the <scope>/<name> grammar (290-01/AC-1)', () => {
    const bare = PackManifestZ.safeParse({ id: 'core', version: '1.0.0' });
    expect(bare.success).toBe(false);

    const uppercase = PackManifestZ.safeParse({ id: 'Cadence/Name', version: '1.0.0' });
    expect(uppercase.success).toBe(false);
  });

  it('rejects an unknown top-level key via .strict() (290-01/AC-1)', () => {
    const result = PackManifestZ.safeParse({
      id: 'cadence/core-skills',
      version: '1.0.0',
      remove: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown key nested inside gates[] and skillAudit entries via nested .strict() (290-01/AC-1)', () => {
    const gateEntry = PackManifestZ.safeParse({
      id: 'cadence/core-skills',
      version: '1.0.0',
      gates: [{ profile: 'standard', tier: 'complex', add: ['deep-verify'], remove: true }],
    });
    expect(gateEntry.success).toBe(false);

    const skillAudit = PackManifestZ.safeParse({
      id: 'cadence/core-skills',
      version: '1.0.0',
      skillAudit: { required: ['skill-a'], override: true },
    });
    expect(skillAudit.success).toBe(false);
  });
});

describe('isValidPackId (290-01/AC-1)', () => {
  it('accepts a bare cadence-scoped id and a reserved @scope/name third-party shape (290-01/AC-1)', () => {
    expect(isValidPackId('cadence/core-skills')).toBe(true);
    expect(isValidPackId('@foo/bar')).toBe(true);
  });

  it('rejects the same malformed shapes PackManifestZ rejects for id, directly (290-01/AC-1)', () => {
    expect(isValidPackId('core')).toBe(false);
    expect(isValidPackId('Cadence/Name')).toBe(false);
    expect(isValidPackId('../../etc')).toBe(false);
    expect(isValidPackId('')).toBe(false);
  });
});
