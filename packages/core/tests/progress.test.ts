import { describe, it, expect } from 'vitest';
import { emptyState } from '@thomas-powers-jr/cadence-types';
import { nextAction } from '../src/progress.js';

describe('nextAction — legacy {command, reason} shape (unchanged)', () => {
  it('IDLE with no hints returns the plain draft-new suggestion', () => {
    const state = { ...emptyState('demo'), loopPosition: 'IDLE' as const };
    const action = nextAction(state);
    expect(action.command).toBe('cadence draft new --title "..."');
    expect(action.reason).toContain('Start the loop');
  });

  it('DRAFT returns the approve command for the active phase/draft', () => {
    const state = {
      ...emptyState('demo'),
      loopPosition: 'DRAFT' as const,
      activePhase: '206-cadence-next',
      activeDraft: '206-01',
    };
    const action = nextAction(state);
    expect(action.command).toBe('cadence draft approve 206-cadence-next 01');
  });
});

describe('nextAction — ranked legalMoves[] (phase 206 T1)', () => {
  // AC-1: empty ledger (IDLE, no hints at all) — draft-new/onboard path is the
  // only legal move; nothing to promote or continue.
  it('AC-1: IDLE with an empty ledger returns exactly one draft-new legal move', () => {
    const state = { ...emptyState('demo'), loopPosition: 'IDLE' as const };
    const action = nextAction(state);
    expect(action.legalMoves).toHaveLength(1);
    expect(action.legalMoves[0]).toMatchObject({
      position: 'draft-new',
      command: 'cadence draft new --title "..."',
      remainingTasks: [],
      blockedOn: [],
    });
  });

  // AC-1 + AC-3: pending DRAFT — legalMoves mirrors the legacy {command, reason}
  // exactly (one entry, the approve invocation), proving the extension is
  // additive and doesn't disturb the existing single-shape output.
  it('AC-1 & AC-3: pending DRAFT — legalMoves has one entry, the approve invocation, matching the legacy command/reason', () => {
    const state = {
      ...emptyState('demo'),
      loopPosition: 'DRAFT' as const,
      activePhase: '206-cadence-next',
      activeDraft: '206-01',
    };
    const action = nextAction(state);
    expect(action.legalMoves).toHaveLength(1);
    const [move] = action.legalMoves;
    expect(move).toMatchObject({
      position: 'approve-draft',
      command: 'cadence draft approve 206-cadence-next 01',
      remainingTasks: [],
      blockedOn: [],
    });
    // AC-3: legacy shape is untouched and matches the ranked move's own command/reason.
    expect(action.command).toBe(move.command);
    expect(action.reason).toBe(move.reason);
  });

  // AC-1: mid-BUILD with remaining tasks — legalMoves carries the full
  // remaining T-id list and the AC ids still lacking coverage.
  it('AC-1: mid-BUILD with remaining tasks reports remainingTasks and blockedOn ACs', () => {
    const state = {
      ...emptyState('demo'),
      loopPosition: 'BUILD' as const,
      activePhase: '206-cadence-next',
      activeDraft: '206-01',
    };
    const action = nextAction(state, {
      build: {
        firstPendingTaskId: 'T2',
        remainingTaskIds: ['T2', 'T3'],
        unresolvedAcs: ['AC-2', 'AC-3'],
      },
    });
    expect(action.command).toBe('cadence build task T2 --status=DONE');
    expect(action.legalMoves).toHaveLength(1);
    const [move] = action.legalMoves;
    expect(move.position).toBe('record-task');
    expect(move.remainingTasks).toEqual(['T2', 'T3']);
    expect(move.blockedOn).toEqual(['AC-2', 'AC-3']);
  });

  // AC-1: all tasks DONE — the settle invocation is the single legal move,
  // with no tasks remaining.
  it('AC-1: BUILD with every task DONE surfaces the settle invocation as the only legal move', () => {
    const state = {
      ...emptyState('demo'),
      loopPosition: 'BUILD' as const,
      activePhase: '206-cadence-next',
      activeDraft: '206-01',
    };
    const action = nextAction(state, { build: { firstPendingTaskId: null } });
    expect(action.command).toBe('cadence settle run --auto');
    expect(action.legalMoves).toHaveLength(1);
    expect(action.legalMoves[0]).toMatchObject({
      position: 'settle',
      command: 'cadence settle run --auto',
      remainingTasks: [],
    });
  });

  // AC-1: settled with an unconverted rec available — the ranked legal move
  // names the real rec id in the promote→propose chain, not a placeholder.
  it('AC-1: settled (IDLE) with an unconverted recommendation ranks the promote→propose chain with the real rec id', () => {
    const state = { ...emptyState('demo'), loopPosition: 'IDLE' as const };
    const action = nextAction(state, {
      ledger: { topRecommendation: { id: 'rec-20260721-042', title: 'Sharper defaults' } },
    });
    expect(action.legalMoves.length).toBeGreaterThanOrEqual(1);
    expect(action.legalMoves.length).toBeLessThanOrEqual(3);
    const top = action.legalMoves[0];
    expect(top?.position).toBe('promote-recommendation');
    expect(top?.command).toContain('rec-20260721-042');
    expect(top?.command).toMatch(/^cadence recommendation promote rec-20260721-042/);
    // draft-new remains available as a fallback ranked move.
    expect(action.legalMoves.some((m) => m.position === 'draft-new')).toBe(true);
  });

  // AC-1: settled (IDLE) with an in-flight milestone's next phase ranks above
  // a promotable recommendation — continuing in-flight work outranks starting
  // something new.
  it('AC-1: settled (IDLE) with a milestone next-phase ranks it above an available recommendation', () => {
    const state = { ...emptyState('demo'), loopPosition: 'IDLE' as const };
    const action = nextAction(state, {
      ledger: {
        milestoneNextPhase: { phaseNumber: 207, title: 'next slice' },
        topRecommendation: { id: 'rec-20260721-042', title: 'Sharper defaults' },
      },
    });
    expect(action.legalMoves[0]?.position).toBe('continue-milestone');
    expect(action.legalMoves.some((m) => m.position === 'promote-recommendation')).toBe(true);
    expect(action.legalMoves.length).toBeLessThanOrEqual(3);
  });

  // AC-1: settled (IDLE) with nothing available in either ledger falls back
  // to the draft-new/onboard path — same as the empty-ledger case above.
  it('AC-1: settled (IDLE) with nothing available in the ledger falls back to draft-new/onboard', () => {
    const state = { ...emptyState('demo'), loopPosition: 'IDLE' as const };
    const action = nextAction(state, { ledger: {} });
    expect(action.legalMoves).toHaveLength(1);
    expect(action.legalMoves[0]?.position).toBe('draft-new');
  });

  // AC-3: SETTLE and SPEC positions also get a non-empty, well-formed
  // legalMoves array so downstream consumers never see an empty array.
  it('AC-3: SETTLE returns a single settle legal move matching the legacy command/reason', () => {
    const state = { ...emptyState('demo'), loopPosition: 'SETTLE' as const };
    const action = nextAction(state);
    expect(action.legalMoves).toHaveLength(1);
    expect(action.legalMoves[0]).toMatchObject({
      position: 'settle',
      command: action.command,
      reason: action.reason,
    });
  });

  // AC-1 & AC-3: SPEC — the one loop position with zero prior coverage
  // anywhere in the suite before this test (not exercised by progress.test.ts,
  // cli/next.test.ts, or any quickstart test). Pins the exact legacy command
  // it derives from activePhase/activeSpec, and proves legalMoves mirrors it
  // as a single ranked move — same non-regression shape as every other
  // position above.
  it('AC-1 & AC-3: SPEC returns the approve-spec command for the active phase/spec, mirrored in legalMoves', () => {
    const state = {
      ...emptyState('demo'),
      loopPosition: 'SPEC' as const,
      activePhase: '206-cadence-next',
      activeSpec: '206-01',
    };
    const action = nextAction(state);
    expect(action.command).toBe('cadence spec approve 206-cadence-next 01');
    expect(action.reason).toContain('SPEC is open');
    expect(action.legalMoves).toHaveLength(1);
    expect(action.legalMoves[0]).toMatchObject({
      position: 'approve-spec',
      command: 'cadence spec approve 206-cadence-next 01',
      reason: action.reason,
      remainingTasks: [],
      blockedOn: [],
    });
  });
});
