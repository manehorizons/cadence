import { describe, it, expect } from 'vitest';
import { buildQuickstart } from '../../src/quickstart/build.js';
import { START_OPTIONS } from '../../src/start/menu.js';

/**
 * 113 AC-4: the locked front-door decision is `start` = the action door,
 * `quickstart` = the read-only map. These guards lock the cross-reference
 * roles so they can't silently drift back into co-equal/circular framing.
 */
describe('onboarding front-door roles (113 AC-4)', () => {
  it("quickstart's map names `start` as the action door (pick + run)", () => {
    const qs = buildQuickstart({ initialized: false });
    const startEntry = qs.commandMap.find((e) => e.name === 'start');
    expect(startEntry, '`start` must appear in the quickstart map').toBeTruthy();
    // The blurb must convey the action role: it RUNS the chosen setup.
    expect(startEntry!.note.toLowerCase()).toContain('run it');
  });

  it('the start menu does not loop back to quickstart (points onward, not in a circle)', () => {
    const displays = START_OPTIONS.map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('quickstart'))).toBe(false);
  });
});
