/**
 * `cadence start` — the interactive onboarding menu catalog. Pure data + pick
 * resolution; no I/O. The CLI shell renders this and dispatches the chosen
 * option by spawning its runner. Authored here (the onboarding commands are not
 * in cadence-types COMMAND_GUIDANCE, which covers only the loop slash-commands).
 */

import { ONBOARDING_STAGE_OPERATOR } from '../onboarding/state.js';

/** Which launcher runs an option's args. */
export type StartRunner = 'cadence' | 'npx';

/** One onboarding option in the `cadence start` menu. */
export interface StartOption {
  /** 1-based menu position. */
  number: number;
  /** Short menu label (the intent). */
  label: string;
  /** Human-readable command shown to the user. */
  display: string;
  /** Launcher: re-spawn the cadence binary, or npx for host packages. */
  runner: StartRunner;
  /** Args passed to the runner. */
  args: string[];
  /**
   * Progressive-disclosure floor (phase 278): the onboarding stage
   * (`onboarding/state.ts`) at which this option starts appearing in the
   * *rendered* menu. Omitted means "always visible" — most options have no
   * floor. Display-only: `resolvePick`/`--pick <n>` still resolves a
   * below-floor option directly, so a user who already knows the number
   * loses nothing.
   */
  minStage?: number;
}

/** The static onboarding catalog. */
export const START_OPTIONS: StartOption[] = [
  {
    number: 1,
    label: 'Try Cadence in a throwaway sandbox',
    display: 'cadence tutorial',
    runner: 'cadence',
    args: ['tutorial'],
  },
  {
    number: 2,
    label: 'Set up Cadence in this repo',
    display: 'cadence init',
    runner: 'cadence',
    args: ['init'],
  },
  {
    number: 3,
    label: 'Wire into Claude Code',
    display: 'npx @thomas-powers-jr/cadence-host-claude-code install',
    runner: 'npx',
    args: ['-y', '@thomas-powers-jr/cadence-host-claude-code', 'install'],
  },
  {
    number: 4,
    label: 'Wire into Codex CLI',
    display: 'npx @thomas-powers-jr/cadence-host-codex install',
    runner: 'npx',
    args: ['-y', '@thomas-powers-jr/cadence-host-codex', 'install'],
  },
  {
    number: 5,
    label: 'Drive it over MCP',
    display: 'cadence mcp install',
    runner: 'cadence',
    args: ['mcp', 'install'],
  },
  {
    number: 6,
    label: 'Check my setup is healthy',
    display: 'cadence doctor',
    runner: 'cadence',
    args: ['doctor'],
    minStage: ONBOARDING_STAGE_OPERATOR,
  },
  {
    number: 7,
    label: 'Turn on real verification',
    display: 'cadence activate',
    runner: 'cadence',
    args: ['activate'],
  },
];

/** Resolve a 1-based pick to its option, or undefined if out of range. */
export function resolvePick(n: number): StartOption | undefined {
  return START_OPTIONS.find((o) => o.number === n);
}

/**
 * Filter `START_OPTIONS` down to what the *rendered* menu should show
 * (278-01/AC-11). `advanced === true` or `stage >= ONBOARDING_STAGE_OPERATOR`
 * (2) shows everything; otherwise any option whose `minStage` exceeds the
 * current stage is dropped. Display-only — `resolvePick` above still
 * resolves against the full, unfiltered `START_OPTIONS`, so a direct
 * `--pick <n>` continues to work for a hidden option if the caller already
 * knows its number.
 */
export function visibleOptions(stage: number, advanced: boolean): StartOption[] {
  if (advanced || stage >= ONBOARDING_STAGE_OPERATOR) return START_OPTIONS;
  return START_OPTIONS.filter((o) => o.minStage === undefined || o.minStage <= stage);
}
