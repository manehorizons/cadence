import type { Finding } from '@manehorizons/cadence-types';
import { nextConvergence } from '../verify/converge.js';
import type { GateImpl, GateResult } from './types.js';

/** HIGH-only finding flattener. The convergence boolean + sidecar findingsCount
 *  are HIGH-only (Phase 37.1 spec) — a conscious divergence from the 35.1
 *  source which counts total findings. Moved from settle.ts verbatim. */
export function collectHighFindings(
  findings: Record<string, Finding[]>,
): Array<{ file: string; line?: number; message: string }> {
  const out: Array<{ file: string; line?: number; message: string }> = [];
  for (const [file, list] of Object.entries(findings)) {
    for (const f of list) {
      if (f.severity !== 'high') continue;
      out.push({
        file,
        ...(f.line !== undefined ? { line: f.line } : {}),
        message: f.message,
      });
    }
  }
  return out;
}

/**
 * Code-review verifier gate (Phase 24.3) + bounded convergence (Phase 37.1).
 * Extracted from settle.ts verbatim (Phase 39.4). Fires on membership
 * ('code-review'). Runs the reviewer over the touched-file diff; "no HIGH
 * finding" is the convergence pass. Advances the CODE-REVIEW.json sidecar via
 * nextConvergence and branches bypass / reloop / escalate. Reaches git, the
 * reviewer, the notifier, and the sidecar only through ctx ports.
 */
export const runCodeReviewGate: GateImpl = async (ctx): Promise<GateResult> => {
  const touched = [...ctx.touchedFiles];
  const diff = ctx.diff();
  try {
    const result = await ctx.verifiers.codeReview.verify({ files: touched, diff });
    const codeReviewFindings = result.findings;
    const highs = collectHighFindings(result.findings);
    const pass = highs.length === 0;

    const { attemptsSoFar, history } = await ctx.codeReviewSidecar.read();
    const maxAttempts = ctx.config?.convergence?.maxAttempts ?? 3;
    const nv = nextConvergence(pass, attemptsSoFar, maxAttempts);
    const now = new Date().toISOString();
    // Phase 24.3 contract preserved (NOT narrowed): --force OR
    // --allow-code-review-failure bypasses ANY failing code-review.
    const bypassed =
      !pass && (ctx.opts.allowCodeReviewFailure === true || ctx.opts.force === true);

    history.push({
      at: now,
      pass,
      findingsCount: highs.length,
      provider: result.provider,
      ...(result.model ? { model: result.model } : {}),
      verdict: nv.verdict,
      ...(bypassed ? { bypassed: true } : {}),
    });
    await ctx.codeReviewSidecar.write(
      JSON.stringify(
        {
          draftId: ctx.state.activeDraft,
          converged: pass,
          attempts: nv.verdict === 'pass' ? attemptsSoFar : nv.attempt,
          maxAttempts,
          history,
          pass,
          provider: result.provider,
          ...(result.model ? { model: result.model } : {}),
          findings: highs.length,
          at: now,
        },
        null,
        2,
      ) + '\n',
    );

    if (!pass) {
      for (const h of highs) {
        ctx.io.err(
          `code-review: ${h.file}${h.line !== undefined ? `:${h.line}` : ''} high — ${h.message}\n`,
        );
      }
      if (bypassed) {
        const flag =
          ctx.opts.force === true ? '--force' : '--allow-code-review-failure';
        ctx.io.err(
          `code-review: ${flag} set; proceeding past ${highs.length} HIGH finding(s).\n`,
        );
        if (ctx.gateSet.gates.includes('anomaly-notify')) {
          await ctx.emit.codeReviewHigh(result.findings, {
            provider: result.provider,
            bypassed: true,
          });
        }
        if (nv.verdict === 'escalate') {
          await ctx.emit.codeReviewUnconverged({
            draftId: ctx.state.activeDraft as string,
            attempts: nv.attempt,
            maxAttempts,
            findings: highs.length,
            provider: result.provider,
            ...(result.model ? { model: result.model } : {}),
            bypassed: true,
          });
        }
        // fall through → SUMMARY.codeReview recorded downstream.
      } else if (nv.verdict === 'reloop') {
        if (ctx.gateSet.gates.includes('anomaly-notify')) {
          await ctx.emit.codeReviewHigh(result.findings, {
            provider: result.provider,
            bypassed: false,
          });
        }
        ctx.io.err(
          `code-review: attempt ${nv.attempt}/${maxAttempts} did not pass — ` +
            'fix the flagged code and re-run `cadence settle run`, ' +
            'or pass --allow-code-review-failure to proceed anyway.\n',
        );
        return { outcome: 'refuse', summaryPatch: { codeReview: codeReviewFindings } };
      } else {
        // nv.verdict === 'escalate', no bypass flag → hard refuse.
        if (ctx.gateSet.gates.includes('anomaly-notify')) {
          await ctx.emit.codeReviewHigh(result.findings, {
            provider: result.provider,
            bypassed: false,
          });
        }
        await ctx.emit.codeReviewUnconverged({
          draftId: ctx.state.activeDraft as string,
          attempts: nv.attempt,
          maxAttempts,
          findings: highs.length,
          provider: result.provider,
          ...(result.model ? { model: result.model } : {}),
        });
        ctx.io.err(
          'settle run refused: code-review did NOT converge after ' +
            `${maxAttempts} attempts — a human decision is required. ` +
            'Fix the flagged code, or pass --allow-code-review-failure ' +
            'to proceed anyway.\n',
        );
        return { outcome: 'refuse', summaryPatch: { codeReview: codeReviewFindings } };
      }
    }
    // pass (converged) OR bypass fall-through → record findings, proceed.
    return { outcome: 'pass', summaryPatch: { codeReview: codeReviewFindings } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.io.err(
      `code-review: verifier failed — ${message}. Pass --allow-code-review-failure to continue.\n`,
    );
    if (ctx.opts.allowCodeReviewFailure !== true && ctx.opts.force !== true) {
      return { outcome: 'refuse' };
    }
    return { outcome: 'pass' };
  }
};
