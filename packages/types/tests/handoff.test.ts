import { describe, it, expect } from 'vitest';
import { GitFactsZ, ResumeResultZ } from '../src/handoff.js';

describe('handoff types', () => {
  it('AC-1: GitFactsZ accepts the unavailable variant', () => {
    expect(() => GitFactsZ.parse({ available: false })).not.toThrow();
  });

  it('AC-1: GitFactsZ accepts a full available variant', () => {
    expect(() =>
      GitFactsZ.parse({
        available: true,
        branch: 'main',
        dirty: true,
        ahead: 0,
        behind: 0,
        head: 'abc1234',
        recentCommits: 'abc1234 feat: x',
        diffStat: ' 1 file changed',
      }),
    ).not.toThrow();
  });

  it('AC-1: GitFactsZ rejects an available variant missing branch', () => {
    expect(() => GitFactsZ.parse({ available: true, dirty: true })).toThrow();
  });

  it('AC-2: ResumeResultZ accepts the not-found shape', () => {
    expect(() => ResumeResultZ.parse({ found: false })).not.toThrow();
  });
});
