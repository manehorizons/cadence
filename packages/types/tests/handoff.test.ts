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

describe('ResumeResultZ — brief/full mode', () => {
  it('AC-33: accepts a brief result with null context', () => {
    const parsed = ResumeResultZ.safeParse({
      found: true,
      handoffPath: '.cadence/handoff/SESSION-2026-06-05.md',
      generatedAt: '2026-06-05T00:00:00.000Z',
      doc: '## Next action\n**Action:** go',
      context: null,
      drift: null,
      mode: 'brief',
    });
    expect(parsed.success).toBe(true);
  });

  it('AC-33: rejects a found result missing mode', () => {
    const parsed = ResumeResultZ.safeParse({
      found: true,
      handoffPath: 'p',
      generatedAt: null,
      doc: 'd',
      context: null,
      drift: null,
    });
    expect(parsed.success).toBe(false);
  });
});
