import { describe, it, expect } from 'vitest';
import { START_OPTIONS, resolvePick } from '../../src/start/menu.js';

describe('start menu catalog', () => {
  it('has seven options numbered 1..7 (AC-1)', () => {
    expect(START_OPTIONS.map((o) => o.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('routes core options through the cadence runner (AC-1)', () => {
    expect(resolvePick(2)).toMatchObject({ runner: 'cadence', args: ['init'] });
    expect(resolvePick(5)).toMatchObject({ runner: 'cadence', args: ['mcp', 'install'] });
    expect(resolvePick(6)).toMatchObject({ runner: 'cadence', args: ['doctor'] });
  });

  it('routes host options through npx with install args (AC-1)', () => {
    expect(resolvePick(3)).toMatchObject({
      runner: 'npx',
      args: ['-y', '@thomas-powers-jr/cadence-host-claude-code', 'install'],
    });
    expect(resolvePick(4)?.args).toContain('@thomas-powers-jr/cadence-host-codex');
  });

  it('returns undefined for an out-of-range pick (AC-2)', () => {
    expect(resolvePick(0)).toBeUndefined();
    expect(resolvePick(8)).toBeUndefined();
  });

  // Phase 138 (rec-20260701-011 / audit F10): the mock-verifier banner
  // recommends `cadence activate` by name, but the guided front door never
  // offered it as an option.
  it('138 AC-3: offers cadence activate — the mock-verifier banner\'s own remedy', () => {
    expect(resolvePick(7)).toMatchObject({ runner: 'cadence', args: ['activate'] });
  });
});
