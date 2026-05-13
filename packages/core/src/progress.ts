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
    case 'DRAFT':
      return {
        command: `keel draft approve ${state.activePhase ?? '<phase>'} ${state.activeDraft?.split('-')[1] ?? '<num>'}`,
        reason: 'Draft is open. Approve to enter BUILD or run keel draft check.',
      };
    case 'BUILD':
      return {
        command: 'keel build task <id> --status=<DONE|...>  OR  keel settle run --ac AC-1=pass',
        reason: 'In BUILD phase. Record task outcomes, then settle.',
      };
    case 'SETTLE':
      return { command: 'keel settle run', reason: 'In SETTLE. Run to close.' };
  }
}
