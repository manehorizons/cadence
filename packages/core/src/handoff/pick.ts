// packages/core/src/handoff/pick.ts
/**
 * Phase 143 (T1+T2) — the cross-worktree handoff candidate picker.
 *
 * Pure menu render + pick resolution (mirrors `start/menu.ts` +
 * `start/render.ts`'s split), plus an impure TTY prompt for `cadence resume`
 * when 2+ candidates exist and neither `--pick` nor `--path` named one
 * directly.
 *
 * The prompt takes the caller's already-computed `Interactivity` (from the
 * shared `resolveInteractivity(env, isTTY)` seam in `gates/interactivity.ts`)
 * rather than reading `process.stdin.isTTY`/env itself — that keeps this
 * module fully unit-testable without touching real stdin, and matches how
 * `gates/approve.ts` consumes the same seam.
 */
import type { HandoffCandidate } from '@manehorizons/cadence-types';
import type { CommandIO } from '../services/io.js';
import type { Interactivity } from '../gates/interactivity.js';
import { StdinPrompter, type Prompter } from '../verify/prompter.js';

/** Render the numbered candidate menu as terminal text. */
export function renderCandidateMenu(candidates: HandoffCandidate[]): string {
  if (candidates.length === 0) {
    return 'No handoff candidates found.\n';
  }
  const lines: string[] = ['Handoff candidates:', ''];
  candidates.forEach((c, i) => {
    const n = i + 1;
    const tag = c.source === 'local' ? 'local' : 'sibling';
    const branch = c.worktreeBranch ?? '(no branch)';
    const label = c.label ?? c.fileName;
    const loop = c.liveLoopPosition ?? c.loopPosition ?? 'unknown position';
    const generated = c.generatedAt ?? 'unknown time';
    lines.push(`  ${n}. [${tag}] ${branch} — ${label} (${loop}, generated ${generated})`);
    lines.push(`     ${c.worktreePath}`);
  });
  lines.push('');
  return lines.join('\n');
}

/**
 * Resolve a 1-based pick against the candidate list. `undefined` for any
 * non-positive/non-integer/out-of-range index — including any pick against
 * an empty list.
 */
export function resolvePick(
  candidates: HandoffCandidate[],
  n: number,
): HandoffCandidate | undefined {
  if (!Number.isInteger(n) || n < 1) return undefined;
  return candidates[n - 1];
}

export interface PromptForPickDeps {
  /** Prompter factory — defaults to a real `StdinPrompter`. Tests inject a
   *  `ScriptedPrompter`-returning factory instead. */
  createPrompter?: () => Prompter;
}

/**
 * Interactive candidate picker. `interactivity` is the caller's own
 * `resolveInteractivity(env, isTTY)` result:
 *   - `bypass`       — non-TTY (the default off a real terminal): print the
 *                       menu and return `null` without ever touching stdin,
 *                       so `cadence resume` never hangs waiting on input (AC-7).
 *   - `interactive` / `require-tty` — print the menu, then walk a prompt loop
 *                       (mirrors `cli/commands/start.ts`'s `readlinePick`).
 *                       A `require-tty` prompter construction failure (real
 *                       stdin forced but not actually a TTY) is caught and
 *                       reported rather than thrown, so a caller doesn't need
 *                       its own try/catch around this function.
 * Returns the picked candidate, or `null` on an empty list, a bypass, a
 * prompter-construction failure, or the user quitting (`q`/empty answer).
 */
export async function promptForPick(
  candidates: HandoffCandidate[],
  interactivity: Interactivity,
  io: CommandIO,
  deps: PromptForPickDeps = {},
): Promise<HandoffCandidate | null> {
  if (candidates.length === 0) return null;

  io.out(renderCandidateMenu(candidates));
  if (interactivity === 'bypass') return null;

  let prompter: Prompter;
  try {
    prompter = (deps.createPrompter ?? (() => new StdinPrompter()))();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.err(`resume: ${msg}\n`);
    return null;
  }

  try {
    for (;;) {
      const ans = (await prompter.ask('Pick a number (or q to quit): ')).trim().toLowerCase();
      if (ans === 'q' || ans === '') return null;
      const n = Number.parseInt(ans, 10);
      const picked = Number.isNaN(n) ? undefined : resolvePick(candidates, n);
      if (picked) return picked;
      io.err(`Not an option: ${ans}\n`);
    }
  } finally {
    await prompter.close?.();
  }
}
