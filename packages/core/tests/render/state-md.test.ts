import { describe, it, expect } from 'vitest';
import { emptyState } from '@cadence/types';
import { renderStateMd } from '../../src/render/state-md.js';

describe('renderStateMd', () => {
  it('renders an IDLE state with the basics', () => {
    const md = renderStateMd(emptyState('demo'));
    expect(md).toContain('# CADENCE State');
    expect(md).toContain('**Project:** demo');
    expect(md).toContain('**Loop position:** IDLE');
  });

  it('renders active draft when present', () => {
    const s = emptyState('demo');
    s.activePhase = '01-foundation';
    s.activeDraft = '01-01';
    s.loopPosition = 'BUILD';
    const md = renderStateMd(s);
    expect(md).toContain('01-foundation');
    expect(md).toContain('01-01');
    expect(md).toContain('BUILD');
  });

  it('renders decisions count', () => {
    const s = emptyState('demo');
    s.decisions = [
      { id: 'D-001', phase: '01', title: 'pick X', decidedAt: '2026-01-01' },
      { id: 'D-002', phase: '01', title: 'pick Y', decidedAt: '2026-01-02' },
    ];
    expect(renderStateMd(s)).toContain('Decisions: 2');
  });
});
