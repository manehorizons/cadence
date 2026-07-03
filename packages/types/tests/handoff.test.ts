import { describe, it, expect } from 'vitest';
import { GitFactsZ, ResumeResultZ, HandoffCandidateZ } from '../src/handoff.js';

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

describe('HandoffCandidateZ', () => {
  it('AC-3: parses a full valid candidate', () => {
    const parsed = HandoffCandidateZ.safeParse({
      path: '.cadence/handoff/SESSION-2026-07-03.md',
      fileName: 'SESSION-2026-07-03.md',
      source: 'sibling',
      worktreePath: '/home/thomas/projects/cadence-worktrees/feat-x',
      worktreeBranch: 'feat/x',
      generatedAt: '2026-07-03T00:00:00.000Z',
      label: 'phase 142 wrap-up',
      loopPosition: 'BUILD',
      activePhase: '142',
      liveLoopPosition: 'SETTLE',
    });
    expect(parsed.success).toBe(true);
  });

  it('AC-3: rejects a candidate missing a non-nullable field (path)', () => {
    const parsed = HandoffCandidateZ.safeParse({
      fileName: 'SESSION-2026-07-03.md',
      source: 'local',
      worktreePath: '/home/thomas/projects/cadence',
      worktreeBranch: null,
      generatedAt: null,
      label: null,
      loopPosition: null,
      activePhase: null,
      liveLoopPosition: null,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('ResumeResultZ — additive candidate fields (AC-3 backward compatibility)', () => {
  it('AC-3: a pre-existing found:true value with none of the new fields still parses', () => {
    const preExistingShape = {
      found: true,
      handoffPath: '.cadence/handoff/SESSION-2026-06-05.md',
      generatedAt: '2026-06-05T00:00:00.000Z',
      doc: '## Next action\n**Action:** go',
      context: null,
      drift: { docLoopPosition: 'BUILD', liveLoopPosition: 'SETTLE' },
      mode: 'full',
    };
    const parsed = ResumeResultZ.safeParse(preExistingShape);
    expect(parsed.success).toBe(true);
  });

  it('AC-3: a pre-existing found:false value still parses', () => {
    expect(ResumeResultZ.safeParse({ found: false }).success).toBe(true);
  });

  it('AC-3: accepts a found:true value with candidates/pickedSource/pickedWorktree', () => {
    const candidate = {
      path: '.cadence/handoff/SESSION-2026-07-03.md',
      fileName: 'SESSION-2026-07-03.md',
      source: 'local',
      worktreePath: '/home/thomas/projects/cadence',
      worktreeBranch: 'main',
      generatedAt: '2026-07-03T00:00:00.000Z',
      label: null,
      loopPosition: 'BUILD',
      activePhase: '142',
      liveLoopPosition: 'BUILD',
    };
    const parsed = ResumeResultZ.safeParse({
      found: true,
      handoffPath: '.cadence/handoff/SESSION-2026-07-03.md',
      generatedAt: '2026-07-03T00:00:00.000Z',
      doc: 'doc',
      context: null,
      drift: null,
      mode: 'full',
      candidates: [candidate],
      pickedSource: 'local',
      pickedWorktree: '/home/thomas/projects/cadence',
    });
    expect(parsed.success).toBe(true);
  });

  it('AC-3: accepts a found:false value with candidates', () => {
    const candidate = {
      path: '.cadence/handoff/SESSION-2026-07-03.md',
      fileName: 'SESSION-2026-07-03.md',
      source: 'sibling',
      worktreePath: '/home/thomas/projects/cadence-worktrees/feat-x',
      worktreeBranch: 'feat/x',
      generatedAt: null,
      label: null,
      loopPosition: null,
      activePhase: null,
      liveLoopPosition: null,
    };
    const parsed = ResumeResultZ.safeParse({ found: false, candidates: [candidate] });
    expect(parsed.success).toBe(true);
  });
});
