import type { CadenceState } from '@manehorizons/cadence-types';
import { nextAction, type NextActionHints } from '../progress.js';

/** What the CLI gathered about the current repo (impure layer fills this). */
export interface QuickstartContext {
  initialized: boolean;
  /** Present iff initialized and state was readable. */
  state?: CadenceState;
  /** Best-effort next free phase number (IDLE only). */
  nextPhaseHint?: number;
}

/** A suggested command for a newcomer, with a short note. */
export interface QuickstartMove {
  command: string;
  note: string;
}

/** One entry in the onboarding command map. */
export interface QuickstartMapEntry {
  name: string;
  note: string;
}

/** Structured orientation — rendered to text or JSON. */
export interface Quickstart {
  status: 'uninitialized' | 'initialized';
  header: string;
  /** Pre-init moves (init, tutorial). Empty when initialized. */
  nextMoves: QuickstartMove[];
  /**
   * Post-init next move — reused from `nextAction`, never re-derived.
   * Deliberately narrowed to `{command, reason}` (phase 206) rather than the
   * full `NextAction` return: `nextAction()` now also carries a ranked
   * `legalMoves[]` (phase 206 T1), which is `cadence next`'s surface, not
   * quickstart's — mirrors `services/progress.ts`'s identical narrowing, so
   * `quickstart --json`'s public contract doesn't silently grow a field.
   */
  next?: { command: string; reason: string };
  /** Always-present map of the onboarding commands. */
  commandMap: QuickstartMapEntry[];
}

/** The onboarding command map (embedded; authored here, not imported from cli/). */
const COMMAND_MAP: QuickstartMapEntry[] = [
  { name: 'start', note: "interactive onboarding — pick what you're doing, and run it" },
  { name: 'init', note: 'scaffold .cadence/ in this repo' },
  { name: 'tutorial', note: 'watch one real loop run (throwaway sandbox)' },
  { name: 'explain', note: 'learn the model — loop, gates, tiers, profiles, config' },
  { name: 'agent-prompt', note: 'copy-paste prompt to hand the first phase to your AI agent' },
  { name: 'config explain', note: 'see what your config actually does' },
  { name: 'activate', note: 'turn on real verification (pick a provider)' },
  { name: 'doctor', note: 'health-check your setup' },
  { name: 'progress', note: 'the next action, anytime (post-init)' },
];

/**
 * Compute a state-aware orientation. Pure over its context: the impure CLI does
 * the I/O and passes the result in. Post-init, the "Next" is delegated to
 * `nextAction` so it stays identical to `cadence progress`.
 */
export function buildQuickstart(ctx: QuickstartContext): Quickstart {
  if (!ctx.initialized || ctx.state === undefined) {
    return {
      status: 'uninitialized',
      header: "CADENCE — you're not set up in this repo yet.",
      nextMoves: [
        { command: 'cadence init', note: 'scaffold .cadence/ here' },
        { command: 'cadence tutorial', note: 'watch one real loop (throwaway sandbox)' },
      ],
      commandMap: COMMAND_MAP,
    };
  }

  const state = ctx.state;
  const hints: NextActionHints | undefined =
    ctx.nextPhaseHint !== undefined ? { nextPhaseNumber: ctx.nextPhaseHint } : undefined;
  const phaseSuffix = state.activePhase !== null ? ` (phase ${state.activePhase})` : '';
  const { command, reason } = nextAction(state, hints);
  return {
    status: 'initialized',
    header: `CADENCE — initialized · loop: ${state.loopPosition}${phaseSuffix}`,
    nextMoves: [],
    next: { command, reason },
    commandMap: COMMAND_MAP,
  };
}
