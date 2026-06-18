import type { Prompter } from '../verify/prompter.js';
import type { DraftGateImpl } from './draft-types.js';
import type { GateResult } from './types.js';
import { APPROVE_BYPASS_NOTICE } from './interactivity.js';

/**
 * Phase 24.1 — manual approve gate prompt walker. Accepts y/yes/n/no
 * (case-insensitive); 3 retries before refuse. Mirrors the 3-retry pattern
 * from `verify/interactive.ts` askVerdict. Re-exported from `draft.ts` for the
 * `ask-approve-verdict` suite.
 */
export async function askApproveVerdict(
  prompter: Prompter,
): Promise<'yes' | 'no'> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const question =
      attempt === 1
        ? 'Approve and enter BUILD? [y/n]: '
        : `Please answer y or n (attempt ${attempt}/3): `;
    const raw = (await prompter.ask(question)).trim().toLowerCase();
    if (raw === 'y' || raw === 'yes') return 'yes';
    if (raw === 'n' || raw === 'no') return 'no';
  }
  return 'no';
}

/**
 * Manual approve gate (Phase 24.1). Extracted from draft.ts (Phase 39.7).
 * Fires when `'approve'` is in the effective gate set and `--no-approve`
 * (`opts.approve === false`) was not passed. Builds the prompter via the port
 * (a non-TTY throw → refuse with the `manual-approve: …` line), runs the verdict
 * walker, refuses on `no`. Coherence blockers + soft cap already refused in the
 * router before this gate, so the prompt only appears for otherwise-passable
 * approvals.
 */
export const runApproveGate: DraftGateImpl = async (ctx): Promise<GateResult> => {
  if (!ctx.gateSet.gates.includes('approve') || ctx.opts.approve === false) {
    return { outcome: 'pass' };
  }
  // Phase 116: in a non-TTY (bypass), auto-pass loudly instead of refusing —
  // the draft flow has no SUMMARY, so the stderr notice is the audit trail.
  if (ctx.interactivity === 'bypass') {
    ctx.io.err(`${APPROVE_BYPASS_NOTICE}\n`);
    return { outcome: 'pass' };
  }
  let prompter: Prompter;
  try {
    prompter = ctx.prompter.create();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.io.err(
      `manual-approve: ${msg} Pass --no-approve to bypass the manual approve gate.\n`,
    );
    return { outcome: 'refuse' };
  }
  let verdict: 'yes' | 'no';
  try {
    verdict = await askApproveVerdict(prompter);
  } finally {
    await prompter.close?.();
  }
  if (verdict === 'no') {
    ctx.io.err('draft approve refused: user declined manual approve gate.\n');
    return { outcome: 'refuse' };
  }
  return { outcome: 'pass' };
};
