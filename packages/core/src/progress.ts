import type { KeelState } from '@keel/types';

export interface NextAction {
  command: string;
  reason: string;
}

export function nextAction(state: KeelState): NextAction {
  switch (state.loopPosition) {
    case 'IDLE':
      return {
        command: 'keel draft new <phase> <num> --title=…',
        reason: 'No active draft. Start the loop by drafting a new unit of work.',
      };
    case 'DRAFT': {
      const phase = state.activePhase ?? '<phase>';
      const num = state.activeDraft?.split('-')[1] ?? '<num>';
      return {
        command: `keel draft approve ${phase} ${num}`,
        reason:
          'DRAFT is open. Fill in objective, ACs, and tasks, run keel draft check, then approve to enter BUILD.',
      };
    }
    case 'BUILD':
      return {
        command: 'keel build task <id> --status=<DONE|...>  OR  keel settle run --ac AC-1=pass',
        reason: 'In BUILD phase. Record task outcomes, then settle.',
      };
    case 'SETTLE':
      return { command: 'keel settle run', reason: 'In SETTLE. Run to close.' };
  }
}
