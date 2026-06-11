import { describe, it, expect } from 'vitest';
import {
  detectPhaseCollision,
  phaseNumber,
  type Occupancy,
} from '../../src/phases/collision.js';

const occ = (number: number, source: Occupancy['source'], location: string): Occupancy => ({
  number,
  source,
  location,
});

describe('phaseNumber — leading numeric token (AC-1)', () => {
  it('AC-1: extracts the leading numeric token from a phase dir name', () => {
    expect(phaseNumber('30-auth')).toBe(30);
    expect(phaseNumber('30-cache')).toBe(30);
    expect(phaseNumber('83-phase-collision-guard')).toBe(83);
    expect(phaseNumber('07')).toBe(7);
  });

  it('AC-1: returns null for non-numeric / unparseable names', () => {
    expect(phaseNumber('foo')).toBeNull();
    expect(phaseNumber('-30')).toBeNull();
    expect(phaseNumber('')).toBeNull();
  });
});

describe('detectPhaseCollision (AC-1)', () => {
  it('AC-1: no collision when no occupancy matches the target', () => {
    const r = detectPhaseCollision(30, [occ(28, 'sibling', '../a'), occ(29, 'upstream', 'origin/main')]);
    expect(r.collides).toBe(false);
    expect(r.conflicts).toEqual([]);
  });

  it('AC-1: collides when an occupancy shares the target number, listing every conflict', () => {
    const conflicts = [occ(30, 'sibling', '../feature-x'), occ(30, 'upstream', 'origin/main')];
    const r = detectPhaseCollision(30, [occ(28, 'local', '.'), ...conflicts]);
    expect(r.collides).toBe(true);
    expect(r.conflicts).toEqual(conflicts);
  });

  it('AC-1: 30-auth vs 30-cache both normalize to 30 and collide (the silent-dual-merge case)', () => {
    // occupancies are pre-normalized to numbers by the collector; this asserts the
    // numeric-equality semantics that make differently-slugged dirs collide.
    const r = detectPhaseCollision(
      phaseNumber('30-auth')!,
      [occ(phaseNumber('30-cache')!, 'sibling', '../cache-wt')],
    );
    expect(r.collides).toBe(true);
    expect(r.conflicts).toHaveLength(1);
  });

  it('AC-1: excludeSources drops self (local) so the active dir never self-collides', () => {
    const r = detectPhaseCollision(30, [occ(30, 'local', '.')], { excludeSources: ['local'] });
    expect(r.collides).toBe(false);
    expect(r.conflicts).toEqual([]);
  });

  it('AC-1: excludeSources drops ONLY the excluded source — a same-number sibling still collides', () => {
    // This is the backstop's core requirement: self (local) and a genuine
    // sibling share number 30, but excluding by SOURCE keeps the sibling.
    const r = detectPhaseCollision(
      30,
      [occ(30, 'local', '.'), occ(30, 'sibling', '../x')],
      { excludeSources: ['local'] },
    );
    expect(r.collides).toBe(true);
    expect(r.conflicts).toEqual([occ(30, 'sibling', '../x')]);
  });

  it('AC-1: nextFree = max(target, ...occupancy) + 1', () => {
    expect(detectPhaseCollision(30, [occ(28, 'local', '.'), occ(35, 'sibling', '../x')]).nextFree).toBe(36);
    expect(detectPhaseCollision(40, [occ(28, 'local', '.'), occ(35, 'sibling', '../x')]).nextFree).toBe(41);
  });

  it('AC-1: nextFree is max+1 not lowest-gap (gaps are not filled)', () => {
    // occupancy {28, 30}, target 30 → max is 30, nextFree 31 (NOT 29, the gap)
    const r = detectPhaseCollision(30, [occ(28, 'local', '.'), occ(30, 'sibling', '../x')]);
    expect(r.nextFree).toBe(31);
  });

  it('AC-1: nextFree with no occupancy is target + 1', () => {
    expect(detectPhaseCollision(30, []).nextFree).toBe(31);
  });

  it('AC-1: nextFree crosses the 99->100 boundary (rec-20260610-001)', () => {
    expect(detectPhaseCollision(99, [occ(99, 'local', '.')]).nextFree).toBe(100);
    expect(detectPhaseCollision(0, [occ(99, 'sibling', '../x')]).nextFree).toBe(100);
  });
});
