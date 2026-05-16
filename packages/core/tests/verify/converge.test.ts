import { describe, it, expect } from 'vitest';
import { nextConvergence } from '../../src/verify/converge.js';

describe('nextConvergence (AC-1)', () => {
  it('AC-1: pass short-circuits regardless of attempts', () => {
    expect(nextConvergence(true, 0, 3)).toEqual({ verdict: 'pass', attempt: 0 });
    expect(nextConvergence(true, 9, 3)).toEqual({ verdict: 'pass', attempt: 9 });
  });
  it('AC-1: fail reloops while attemptsSoFar+1 < max (max 3)', () => {
    expect(nextConvergence(false, 0, 3)).toEqual({ verdict: 'reloop', attempt: 1 });
    expect(nextConvergence(false, 1, 3)).toEqual({ verdict: 'reloop', attempt: 2 });
  });
  it('AC-1: fail escalates when attemptsSoFar+1 >= max (max 3 → 3rd)', () => {
    expect(nextConvergence(false, 2, 3)).toEqual({ verdict: 'escalate', attempt: 3 });
  });
  it('AC-1: maxAttempts=1 → first fail escalates immediately', () => {
    expect(nextConvergence(false, 0, 1)).toEqual({ verdict: 'escalate', attempt: 1 });
  });
});
