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
  /**
   * Phase 137 — BUILD-state task progress, resolved best-effort by reading
   * the active draft + PROGRESS.json. `firstPendingTaskId` is the first
   * draft task (in file order) with no recorded outcome, or `null` when
   * every task already has one. Absent entirely when it couldn't be
   * computed (e.g. the draft file is unreadable) — the BUILD case then
   * falls back to the pre-137 compound message rather than blocking.
   */
  build?: { firstPendingTaskId: string | null };
}

export function nextAction(state: CadenceState, hints?: NextActionHints): NextAction {
  switch (state.loopPosition) {
    case 'IDLE': {
      const n = hints?.nextPhaseNumber;
      return {
        command: 'cadence draft new --title "..."',
        reason:
          n === undefined
            ? 'No active draft. Start the loop by drafting a new unit of work.'
            : `No active draft. Start the loop; draft new will derive phase ${n}-<title-slug> task 1.`,
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
    case 'BUILD': {
      const pending = hints?.build?.firstPendingTaskId;
      if (pending === undefined) {
        return {
          command: 'cadence build task <id> --status=<DONE|...>  OR  cadence settle run --ac AC-1=pass',
          reason: 'In BUILD phase. Record task outcomes, then settle.',
        };
      }
      if (pending === null) {
        return {
          command: 'cadence settle run --auto',
          reason: 'In BUILD phase. Every task has a recorded outcome — settle to close the loop.',
        };
      }
      return {
        command: `cadence build task ${pending} --status=DONE`,
        reason: `In BUILD phase. ${pending} is the first task with no recorded outcome.`,
      };
    }
    case 'SETTLE':
      return { command: 'cadence settle run', reason: 'In SETTLE. Run to close.' };
    default: {
      const _exhaustive: never = state.loopPosition;
      return _exhaustive;
    }
  }
}
