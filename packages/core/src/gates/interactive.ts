import { walkAcsInteractively, type InteractiveVerdict } from '../verify/interactive.js';
import type { Prompter } from '../verify/prompter.js';
import type { VerifyTestRef } from '../verify/verifier.js';
import { SETTLE_BYPASS_NOTICE } from './interactivity.js';
import type { GateImpl, GateResult } from './types.js';

/**
 * Interactive AC-verdict gate (Phase 16). Extracted from settle.ts verbatim
 * (Phase 39.3). Fires on --interactive OR membership('interactive-verdict');
 * skipped under --auto=false. Walks each AC, prompting the user (via the
 * injected prompter port) for pass/fail/skip, and refuses on any non-overridden
 * `fail` verdict unless --force. The walker renders to stdout; refusals go to
 * stderr via ctx.io.err. Produces `interactiveVerify` for the AC-merge finalizer.
 */
export const runInteractiveGate: GateImpl = async (ctx): Promise<GateResult> => {
  const requested =
    ctx.opts.interactive === true ||
    (ctx.opts.interactive !== false && ctx.gateSet.gates.includes('interactive-verdict'));
  if (!requested || ctx.opts.auto === false) {
    return { outcome: 'pass' };
  }

  // Phase 116: in a non-TTY (bypass), skip the per-AC walker and pass — record a
  // skipped marker in the SUMMARY rather than fabricating human verdicts. The
  // other verification gates (test-coverage, deep-verify) still decide.
  if (ctx.interactivity === 'bypass') {
    ctx.io.err(`${SETTLE_BYPASS_NOTICE}\n`);
    return { outcome: 'pass', summaryPatch: { interactiveVerifySkipped: 'non-tty' } };
  }

  let prompter: Prompter;
  try {
    prompter = ctx.prompter.create();
  } catch (err) {
    ctx.io.err(`interactive: ${err instanceof Error ? err.message : String(err)}\n`);
    return { outcome: 'refuse' };
  }

  let interactiveVerify: Record<string, InteractiveVerdict>;
  try {
    const coverageMap = await ctx.coverage();
    const tests: Record<string, VerifyTestRef[]> = {};
    for (const [id, refs] of coverageMap) tests[id] = refs;
    interactiveVerify = await walkAcsInteractively(
      {
        acs: ctx.draft.acceptanceCriteria.map((a) => ({
          id: a.id,
          given: a.given,
          when: a.when,
          then: a.then,
        })),
        tests,
        files: [...ctx.touchedFiles],
      },
      prompter,
    );
  } finally {
    await prompter.close?.();
  }

  // Refuse on any non-overridden 'fail' verdict unless --force.
  const failing = Object.entries(interactiveVerify).filter(
    ([id, v]) => v.verdict === 'fail' && !ctx.explicitIds.has(id),
  );
  if (failing.length > 0 && !ctx.opts.force) {
    for (const [id, v] of failing) {
      ctx.io.err(`interactive: ${id} fail${v.note ? ` — ${v.note}` : ''}\n`);
    }
    ctx.io.err(
      'settle run --interactive refused: one or more ACs verdicted as fail. Pass --force to settle anyway.\n',
    );
    return { outcome: 'refuse', summaryPatch: { interactiveVerify } };
  }
  return { outcome: 'pass', summaryPatch: { interactiveVerify } };
};
