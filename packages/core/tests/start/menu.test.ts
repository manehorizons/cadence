import { describe, it, expect } from 'vitest';
import { START_OPTIONS, resolvePick } from '../../src/start/menu.js';

describe('start menu catalog', () => {
  it('has six options numbered 1..6 (AC-1)', () => {
    expect(START_OPTIONS.map((o) => o.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('routes core options through the cadence runner (AC-1)', () => {
    expect(resolvePick(2)).toMatchObject({ runner: 'cadence', args: ['init'] });
    expect(resolvePick(5)).toMatchObject({ runner: 'cadence', args: ['mcp', 'install'] });
    expect(resolvePick(6)).toMatchObject({ runner: 'cadence', args: ['doctor'] });
  });

  it('routes host options through npx with install args (AC-1)', () => {
    expect(resolvePick(3)).toMatchObject({
      runner: 'npx',
      args: ['-y', '@manehorizons/cadence-host-claude-code', 'install'],
    });
    expect(resolvePick(4)?.args).toContain('@manehorizons/cadence-host-codex');
  });

  it('returns undefined for an out-of-range pick (AC-2)', () => {
    expect(resolvePick(0)).toBeUndefined();
    expect(resolvePick(7)).toBeUndefined();
  });
});
