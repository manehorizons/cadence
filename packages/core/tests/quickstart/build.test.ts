import { describe, it, expect } from 'vitest';
import { buildQuickstart } from '../../src/quickstart/build.js';
import { emptyState } from '@manehorizons/cadence-types';

describe('buildQuickstart', () => {
  // AC-1: uninitialized → init+tutorial moves, no `next`, map present.
  it('AC-1: uninitialized shows init + tutorial and no next', () => {
    const qs = buildQuickstart({ initialized: false });
    expect(qs.status).toBe('uninitialized');
    expect(qs.next).toBeUndefined();
    const cmds = qs.nextMoves.map((m) => m.command);
    expect(cmds.some((c) => c.startsWith('cadence init'))).toBe(true);
    expect(cmds.some((c) => c.startsWith('cadence tutorial'))).toBe(true);
    expect(qs.commandMap.length).toBeGreaterThan(0);
  });

  // AC-2: initialized IDLE → next equals nextAction (draft new with the phase hint).
  it('AC-2: initialized IDLE reuses nextAction with the phase hint', () => {
    const state = { ...emptyState('demo'), loopPosition: 'IDLE' as const };
    const qs = buildQuickstart({ initialized: true, state, nextPhaseHint: 7 });
    expect(qs.status).toBe('initialized');
    expect(qs.next?.command).toBe('cadence draft new 7-<slug> 1 --title=…');
    expect(qs.nextMoves).toEqual([]);
    expect(qs.commandMap.length).toBeGreaterThan(0);
  });

  // AC-2: initialized BUILD → next equals the BUILD action; header names the position+phase.
  it('AC-2: initialized BUILD reuses the BUILD next-action', () => {
    const state = { ...emptyState('demo'), loopPosition: 'BUILD' as const, activePhase: '94-x' };
    const qs = buildQuickstart({ initialized: true, state });
    expect(qs.next?.command).toMatch(/build task|settle run/);
    expect(qs.header).toMatch(/BUILD/);
    expect(qs.header).toContain('94-x');
  });
});
