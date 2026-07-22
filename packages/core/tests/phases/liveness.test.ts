import { describe, it, expect } from 'vitest';
import { assessProgressFreshness } from '../../src/phases/liveness.js';

const NOW = new Date('2026-07-22T12:00:00.000Z');
const THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes, matching the doctor check's constant

describe('assessProgressFreshness (AC-1, AC-2)', () => {
  it('AC-2: no tasks → not fresh, no freshest', () => {
    const r = assessProgressFreshness({}, NOW, THRESHOLD_MS);
    expect(r.isFresh).toBe(false);
    expect(r.freshest).toBeNull();
  });

  it('AC-1: a single task updated just now is fresh', () => {
    const r = assessProgressFreshness(
      { T1: '2026-07-22T11:59:00.000Z' }, // 1 minute ago
      NOW,
      THRESHOLD_MS,
    );
    expect(r.isFresh).toBe(true);
    expect(r.freshest).toEqual({
      taskId: 'T1',
      updatedAt: '2026-07-22T11:59:00.000Z',
      ageMs: 60_000,
    });
  });

  it('AC-2: a single task updated well outside the threshold is not fresh', () => {
    const r = assessProgressFreshness(
      { T1: '2026-07-22T11:00:00.000Z' }, // 1 hour ago
      NOW,
      THRESHOLD_MS,
    );
    expect(r.isFresh).toBe(false);
    expect(r.freshest?.taskId).toBe('T1');
    expect(r.freshest?.ageMs).toBe(60 * 60 * 1000);
  });

  it('AC-1: exactly at the threshold boundary counts as fresh (inclusive)', () => {
    const r = assessProgressFreshness(
      { T1: '2026-07-22T11:50:00.000Z' }, // exactly 10 minutes ago
      NOW,
      THRESHOLD_MS,
    );
    expect(r.isFresh).toBe(true);
    expect(r.freshest?.ageMs).toBe(THRESHOLD_MS);
  });

  it('AC-1: one ms past the threshold is not fresh', () => {
    const r = assessProgressFreshness(
      { T1: '2026-07-22T11:49:59.999Z' }, // 10 minutes + 1ms ago
      NOW,
      THRESHOLD_MS,
    );
    expect(r.isFresh).toBe(false);
  });

  it('AC-1: multiple tasks — freshest is the one with the smallest age, and isFresh reflects it', () => {
    const r = assessProgressFreshness(
      {
        T1: '2026-07-22T10:00:00.000Z', // 2 hours ago — stale
        T2: '2026-07-22T11:58:00.000Z', // 2 minutes ago — fresh
        T3: '2026-07-22T09:00:00.000Z', // 3 hours ago — stale
      },
      NOW,
      THRESHOLD_MS,
    );
    expect(r.isFresh).toBe(true);
    expect(r.freshest).toEqual({
      taskId: 'T2',
      updatedAt: '2026-07-22T11:58:00.000Z',
      ageMs: 120_000,
    });
  });

  it('AC-2: multiple tasks all stale → not fresh, freshest is still the least-stale one', () => {
    const r = assessProgressFreshness(
      {
        T1: '2026-07-22T10:00:00.000Z', // 2 hours ago
        T2: '2026-07-22T09:00:00.000Z', // 3 hours ago
      },
      NOW,
      THRESHOLD_MS,
    );
    expect(r.isFresh).toBe(false);
    expect(r.freshest?.taskId).toBe('T1');
  });

  it('AC-2: an unparseable updatedAt is skipped rather than corrupting the result', () => {
    const r = assessProgressFreshness(
      {
        T1: 'not-a-date',
        T2: '2026-07-22T11:58:00.000Z', // 2 minutes ago — fresh
      },
      NOW,
      THRESHOLD_MS,
    );
    expect(r.isFresh).toBe(true);
    expect(r.freshest?.taskId).toBe('T2');
  });

  it('AC-2: every updatedAt unparseable → not fresh, no freshest', () => {
    const r = assessProgressFreshness({ T1: 'garbage' }, NOW, THRESHOLD_MS);
    expect(r.isFresh).toBe(false);
    expect(r.freshest).toBeNull();
  });
});
