import type { CadenceState } from '@manehorizons/cadence-types';

export interface NextAction {
  command: string;
  reason: string;
}

/**
 * Optional, occupancy-derived hints the impure service/CLI layer computes and
 * passes in so `nextAction` can stay pure-over-state (no I/O). v1.19 phase 86.
 */
export interface NextActionHints {
  /**
   * The worktree-aware next free phase number (`max(observed)+1` over local +
   * sibling + upstream), resolved best-effort by `resolveNextFreePhase`. When
   * present, the IDLE suggestion substitutes it so the operator's first pick
   * already clears sibling/upstream claims the v1.18 guard would refuse.
   */
  nextPhaseNumber?: number;
}

export function nextAction(state: CadenceState, hints?: NextActionHints): NextAction {
  switch (state.loopPosition) {
    case 'IDLE': {
      void hints;
      const command = 'cadence draft new --title "New work"';
      return {
        command,
        reason: 'No active draft. Start the loop by drafting a new unit of work.',
      };
    }
    case 'DRAFT': {
      const phase = state.activePhase ?? '<phase>';
      const num = state.activeDraft?.split('-')[1] ?? '<num>';
      return {
        command: `cadence draft approve ${phase} ${num}`,
        reason:
          'DRAFT is open. Fill in objective, ACs, and tasks, run cadence draft check, then approve to enter BUILD.',
      };
    }
    case 'SPEC': {
      const phase = state.activePhase ?? '<phase>';
      const num = state.activeSpec?.split('-')[1] ?? '<num>';
      return {
        command: `cadence spec approve ${phase} ${num}`,
        reason:
          'SPEC is open. Fill objective, ACs, constraints, run cadence spec check, then approve to leave the spec stage.',
      };
    }
    case 'BUILD':
      return {
        command: 'cadence build task <id> --status=<DONE|...>  OR  cadence settle run --ac AC-1=pass',
        reason: 'In BUILD phase. Record task outcomes, then settle.',
      };
    case 'SETTLE':
      return { command: 'cadence settle run', reason: 'In SETTLE. Run to close.' };
    default: {
      const _exhaustive: never = state.loopPosition;
      return _exhaustive;
    }
  }
}
