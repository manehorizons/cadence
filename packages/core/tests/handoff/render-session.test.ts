// packages/core/tests/handoff/render-session.test.ts
import { describe, it, expect } from 'vitest';
import type { ContextPacket, GitFacts } from '@manehorizons/cadence-types';
import { renderSession } from '../../src/handoff/render-session.js';

const PACKET: ContextPacket = {
  schemaVersion: 1,
  scope: 'handoff',
  generatedAt: '2026-06-03T14:02:00.000Z',
  loop: { present: true, loopPosition: 'BUILD', activePhase: '46-handoff', activeDraft: null, tier: 'standard' },
  recommendations: [],
  assumptions: [],
  decisions: [],
  files: [],
  totals: { recommendations: 0, assumptions: 0, decisions: 0, files: 0, recommendationsOmitted: 0 },
};

const GIT: GitFacts = {
  available: true, branch: 'main', dirty: true, ahead: 0, behind: 0,
  head: 'abc1234', recentCommits: 'abc1234 feat: x', diffStat: ' 1 file changed', fetched: true,
};

describe('renderSession', () => {
  it('AC-6: emits flat frontmatter keys parseable by a one-line regex', () => {
    const md = renderSession({
      generatedAt: '2026-06-03T14:02:00.000Z', label: 'demo',
      packet: PACKET, git: GIT, contextPacketPath: '.cadence/intelligence/context/handoff.json',
    });
    expect(md).toMatch(/^generated_at: 2026-06-03T14:02:00\.000Z$/m);
    expect(md).toMatch(/^loop_position: BUILD$/m);
    expect(md).toMatch(/^git_branch: main$/m);
    expect(md).toMatch(/^git_dirty: true$/m);
  });

  it('AC-7: includes empty narrative section headers with FILL IN prompts', () => {
    const md = renderSession({
      generatedAt: '2026-06-03T14:02:00.000Z', label: null,
      packet: PACKET, git: GIT, contextPacketPath: '.cadence/intelligence/context/handoff.json',
    });
    expect(md).toMatch(/## TL;DR for the next session/);
    expect(md).toMatch(/## What landed this session/);
    expect(md).toMatch(/FILL IN/);
  });

  it('AC-8: renders git as unavailable without throwing when git is absent', () => {
    const md = renderSession({
      generatedAt: '2026-06-03T14:02:00.000Z', label: null,
      packet: PACKET, git: { available: false }, contextPacketPath: 'x.json',
    });
    expect(md).toMatch(/^git_branch: unavailable$/m);
    expect(md).toMatch(/git: unavailable/);
  });
});
