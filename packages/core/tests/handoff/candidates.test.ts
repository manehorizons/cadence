// packages/core/tests/handoff/candidates.test.ts
import { describe, expect, it } from 'vitest';
import { parseHandoffMeta } from '../../src/handoff/candidates.js';

const FULL_FRONTMATTER = [
  '---',
  'cadence_handoff: 1',
  'generated_at: 2026-07-02T10:00:00.000Z',
  'label: phase-142',
  'loop_position: BUILD',
  'active_phase: 142-05',
  'active_draft: 01',
  'tier: standard',
  'git_branch: feat/candidates',
  'git_dirty: true',
  'git_head: abc1234',
  'git_ahead: 1',
  'git_behind: 0',
  'context_packet: .cadence/context/handoff.json',
  '---',
  '# Session Handoff — 2026-07-02 (phase-142)',
  '',
].join('\n');

describe('parseHandoffMeta', () => {
  it('AC-3: extracts every field from a realistic full frontmatter block', () => {
    const meta = parseHandoffMeta(FULL_FRONTMATTER);
    expect(meta).toEqual({
      generatedAt: '2026-07-02T10:00:00.000Z',
      label: 'phase-142',
      loopPosition: 'BUILD',
      activePhase: '142-05',
      gitBranch: 'feat/candidates',
      tier: 'standard',
    });
  });

  it('AC-3: returns null for missing keys while still extracting present ones', () => {
    const partial = [
      '---',
      'cadence_handoff: 1',
      'generated_at: 2026-07-02T10:00:00.000Z',
      'loop_position: IDLE',
      '---',
    ].join('\n');
    const meta = parseHandoffMeta(partial);
    expect(meta).toEqual({
      generatedAt: '2026-07-02T10:00:00.000Z',
      label: null,
      loopPosition: 'IDLE',
      activePhase: null,
      gitBranch: null,
      tier: null,
    });
  });

  it('AC-3: returns all-null for an empty string without throwing', () => {
    expect(() => parseHandoffMeta('')).not.toThrow();
    expect(parseHandoffMeta('')).toEqual({
      generatedAt: null,
      label: null,
      loopPosition: null,
      activePhase: null,
      gitBranch: null,
      tier: null,
    });
  });

  it('AC-3: returns all-null for content with no frontmatter at all', () => {
    expect(parseHandoffMeta('# just a heading\n\nsome text\n')).toEqual({
      generatedAt: null,
      label: null,
      loopPosition: null,
      activePhase: null,
      gitBranch: null,
      tier: null,
    });
  });

  it('AC-3: treats a key present with an empty value as null', () => {
    const withEmptyLabel = [
      '---',
      'generated_at: 2026-07-02T10:00:00.000Z',
      'label: ',
      'loop_position: IDLE',
      'active_phase: ',
      'git_branch: main',
      'tier: ',
      '---',
    ].join('\n');
    const meta = parseHandoffMeta(withEmptyLabel);
    expect(meta).toEqual({
      generatedAt: '2026-07-02T10:00:00.000Z',
      label: null,
      loopPosition: 'IDLE',
      activePhase: null,
      gitBranch: 'main',
      tier: null,
    });
  });
});
