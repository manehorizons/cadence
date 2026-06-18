import { describe, it, expect } from 'vitest';
import { renderText, renderJson } from '../../src/quickstart/render.js';
import { buildQuickstart } from '../../src/quickstart/build.js';
import { emptyState } from '@manehorizons/cadence-types';

describe('quickstart render', () => {
  // AC-3: uninitialized text shows header, the numbered moves, and the map.
  it('AC-3: renderText (uninitialized) shows moves + map', () => {
    const out = renderText(buildQuickstart({ initialized: false }));
    expect(out).toMatch(/not set up/i);
    expect(out).toMatch(/cadence init/);
    expect(out).toMatch(/cadence tutorial/);
    expect(out).toMatch(/progress/); // map mentions progress
  });

  // AC-3: initialized text shows the Next line (the progress move).
  it('AC-3: renderText (initialized) shows the Next move', () => {
    const state = { ...emptyState('demo'), loopPosition: 'IDLE' as const };
    const out = renderText(buildQuickstart({ initialized: true, state, nextPhaseHint: 7 }));
    expect(out).toMatch(/Next:.*cadence draft new --title "New work"/);
    expect(out).toMatch(/cadence progress/); // footer pointer
  });

  // AC-3: renderJson returns the structured Quickstart.
  it('AC-3: renderJson returns the structured object', () => {
    const qs = buildQuickstart({ initialized: false });
    expect(renderJson(qs)).toEqual(qs);
  });
});
