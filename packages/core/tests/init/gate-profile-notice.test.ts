import { describe, it, expect } from 'vitest';
import { autoFlipNotice } from '../../src/init/gate-profile-notice.js';

describe('autoFlipNotice (114 AC-1)', () => {
  // AC-1: auto resolved from the suggestion (no explicit flag) → warn about the flip.
  it('returns a heads-up when auto came from the suggestion', () => {
    const notice = autoFlipNotice(undefined, 'auto');
    expect(notice).not.toBeNull();
    expect(notice!).toMatch(/20 commits/);
    expect(notice!).toMatch(/interactive/);
    expect(notice!).toMatch(/--gate-profile auto/);
  });

  // AC-1: auto pinned explicitly → no warning (the user chose it deliberately).
  it('returns null when auto was pinned explicitly', () => {
    expect(autoFlipNotice('auto', 'auto')).toBeNull();
  });

  // AC-1: standard/strict → no flip warning (it does not apply).
  it('returns null for standard and strict', () => {
    expect(autoFlipNotice(undefined, 'standard')).toBeNull();
    expect(autoFlipNotice(undefined, 'strict')).toBeNull();
    expect(autoFlipNotice('standard', 'standard')).toBeNull();
  });
});
