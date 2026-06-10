import { describe, it, expect } from 'vitest';
import { renderPrompt, renderChanges } from '../../src/config-edit/render.js';
import { EDITABLE_FIELDS } from '../../src/config-edit/fields.js';
import { defaultConfig } from '@manehorizons/cadence-types';

describe('config-edit render', () => {
  // AC-7: a prompt shows label, numbered choices, and marks the current value.
  it('AC-7: renderPrompt lists numbered choices and marks current', () => {
    const out = renderPrompt(EDITABLE_FIELDS[0]!, defaultConfig); // profile, current=auto
    expect(out).toContain('Profile (user-involvement)');
    expect(out).toMatch(/1\) strict/);
    expect(out).toMatch(/3\) auto/);
    expect(out).toMatch(/auto.*current/i); // current marker on the active value
  });

  // AC-7: the change summary lists each old → new line.
  it('AC-7: renderChanges shows old → new per change', () => {
    const out = renderChanges([{ key: 'loopEnforcement', from: 'soft', to: 'strict' }]);
    expect(out).toContain('loopEnforcement');
    expect(out).toMatch(/soft.*→.*strict/);
  });
});
