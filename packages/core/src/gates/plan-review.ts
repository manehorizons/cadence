import { runConvergentReview, readProviderSelection } from '../verify/converge.js';
import type { DraftGateImpl } from './draft-types.js';
import type { GateResult } from './types.js';

/**
 * Plan-review gate (Phase 25.1 + 35.1 bounded convergence). Extracted from
 * draft.ts (Phase 39.7). Fires when `'plan-review'` is in the effective gate set
 * (strict×complex). Runs against the parsed DRAFT (no diff/SUMMARY at approve
 * time). Reads prior attempts from the convergence sidecar, delegates the
 * verdict/history/sidecar-shape computation to the shared
 * `runConvergentReview` primitive (phase 225), then on `!pass` reproduces the
 * three arms exactly. Reaches the verifier / sidecar / notifier only through
 * `ctx` ports.
 */
export const runPlanReviewGate: DraftGateImpl = async (ctx): Promise<GateResult> => {
  if (!ctx.gateSet.gates.includes('plan-review')) return { outcome: 'pass' };

  // Phase 35.1 — bounded review-convergence. Prior attempts from the 29.7
  // sidecar; a legacy 29.7-shape file (no `attempts`) or absent/corrupt → 0.
  const { attemptsSoFar, history } = await ctx.planReviewSidecar.read();

  const res = await ctx.verifiers.planReview.verify({ draft: ctx.draft });
  const maxAttempts = ctx.config?.convergence?.maxAttempts ?? 3;
  // `--allow-plan-review-failure` bypasses ANY failing plan-review (reloop OR
  // escalate) and proceeds to BUILD; `bypassed` = a failing review the flag
  // waved through, regardless of verdict.
  const bypassed = !res.pass && ctx.opts.allowPlanReviewFailure === true;

  const providerSelection = readProviderSelection(res);
  // Phase 267 (267-01, T2, dec-20260809-005): plan-review never touches
  // registry.ts/GateProvenance — its only recording surface is this shared
  // sidecar (`*-PLAN-REVIEW.json`). A mock-identified clean pass is not real
  // verification; mark it so on the history entry, mirroring registry.ts's
  // status:'skipped' relabeling for code-review/security-audit. Never set for
  // `!res.pass` — a real finding is never abstained, regardless of provider.
  const mockAbstained = res.provider === 'mock' && res.pass === true;
  const result = runConvergentReview({
    pass: res.pass,
    findingsCount: res.findings.length,
    provider: res.provider,
    ...(res.model ? { model: res.model } : {}),
    ...(providerSelection ? { providerSelection } : {}),
    attemptsSoFar,
    history,
    maxAttempts,
    bypassed,
    mockAbstained,
    idField: 'draftId',
    idValue: ctx.id,
  });
  const nv = result.nv;
  await ctx.planReviewSidecar.write(JSON.stringify(result.sidecarJson, null, 2) + '\n');

  if (!res.pass) {
    for (const f of res.findings) {
      ctx.io.err(`plan-review: ${f.severity} — ${f.message}\n`);
      if (f.suggestedEdit) {
        ctx.io.err(`  ↳ suggested: ${f.suggestedEdit}\n`);
      }
    }

    if (ctx.opts.allowPlanReviewFailure) {
      // Bypass path — flag waves the failing review through (any verdict).
      // Still emit the unconverged anomaly when the loop actually escalated.
      if (nv.verdict === 'escalate') {
        await ctx.emit.planReviewUnconverged({
          draftId: ctx.id,
          attempts: nv.attempt,
          maxAttempts,
          findings: res.findings.length,
          provider: res.provider,
          ...(res.model ? { model: res.model } : {}),
          bypassed: true,
        });
      }
      ctx.io.err(
        `plan-review: --allow-plan-review-failure set; proceeding past ` +
          `${res.findings.length} finding(s).\n`,
      );
      // fall through to pass (BUILD transition).
    } else if (nv.verdict === 'reloop') {
      ctx.io.err(
        `plan-review: attempt ${nv.attempt}/${maxAttempts} did not pass — ` +
          `fix the DRAFT and re-run \`cadence draft approve\`, ` +
          `or pass --allow-plan-review-failure to proceed anyway.\n`,
      );
      return { outcome: 'refuse' };
    } else {
      // escalate, no bypass — hard human-decision stop.
      await ctx.emit.planReviewUnconverged({
        draftId: ctx.id,
        attempts: nv.attempt,
        maxAttempts,
        findings: res.findings.length,
        provider: res.provider,
        ...(res.model ? { model: res.model } : {}),
      });
      ctx.io.err(
        `draft approve refused: plan-review did NOT converge after ` +
          `${maxAttempts} attempts — a human decision is required. ` +
          `Re-scope the plan, or pass --allow-plan-review-failure to proceed anyway.\n`,
      );
      return { outcome: 'refuse' };
    }
  }
  // res.pass (converged) OR bypassed → pass (BUILD transition).
  return { outcome: 'pass' };
};
