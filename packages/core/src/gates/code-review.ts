import type { Draft, Finding } from '@manehorizons/cadence-types';
import { runConvergentReview } from '../verify/converge.js';
import { anchorFindings } from '../verify/criteria-gap.js';
import { attachFindingIdentity } from '../verify/finding-identity.js';
import type { CodeReviewInput, CodeReviewTaskRef } from '../contracts/index.js';
import type { GateImpl, GateResult } from './types.js';

/**
 * Phase 235 (T3) — project `draft`'s acceptance criteria, boundaries[] and
 * task->AC refs onto the additive optional `CodeReviewInput` fields, so the
 * reviewer can see what the phase committed to instead of grading against
 * general good practice alone. Pure and side-effect free; `runCodeReviewGate`
 * is the only caller. Imports the input type through the phase 234 contract
 * surface (`../contracts/index.js`), never a kernel internal.
 */
export function buildCodeReviewInput(draft: Draft, touched: string[], diff: string): CodeReviewInput {
  const taskRefs: CodeReviewTaskRef[] = draft.tasks.map((t) => ({
    id: t.id,
    files: t.files,
    verify: t.verify,
    done: t.done,
    ...(t.status !== undefined ? { status: t.status } : {}),
  }));
  return {
    files: touched,
    diff,
    acceptanceCriteria: draft.acceptanceCriteria,
    boundaries: draft.boundaries,
    taskRefs,
  };
}

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
 * the shared `runConvergentReview` primitive (phase 225) and branches bypass /
 * reloop / escalate. Reaches git, the reviewer, the notifier, and the sidecar
 * only through ctx ports.
 */
export const runCodeReviewGate: GateImpl = async (ctx): Promise<GateResult> => {
  const touched = [...ctx.touchedFiles];
  const diff = ctx.diff();
  try {
    const input = buildCodeReviewInput(ctx.draft, touched, diff);
    const verifyResult = await ctx.verifiers.codeReview.verify(input);
    const codeReviewFindings = verifyResult.findings;
    const highs = collectHighFindings(verifyResult.findings);
    const pass = highs.length === 0;

    // Phase 235 (T4, dec-20260729-005 / D2) — tag every finding with its
    // §7.1 anchor; a finding whose best anchor resolves to `undeclared` is a
    // criteria gap (diff work no criterion or boundary covers). No second
    // refusal primitive: `highs`/`pass` above are computed from the SAME raw
    // `verifyResult.findings`, untouched — a HIGH-severity gap finding was
    // already counted there and refuses through the pre-existing path.
    // Phase 241 (rec-20260729-002) — `ctx.gateProvenance` is the real
    // two-level-frozen provenance snapshot `runSettleGates` has accumulated
    // so far this settle (see `packages/core/src/gates/registry.ts`); since
    // `code-review` runs 9th in `GATE_ORDER` and `build-test-must-pass` runs
    // 5th, the snapshot already carries that gate's real `status` by the
    // time this gate runs. Passing it through (falling back to `[]` when the
    // optional field is absent) means the `executable` tier is now reachable
    // — but only when the ladder's own two-condition check in
    // `verify/anchor.ts` is satisfied: the AC must be cited by a task with a
    // non-empty `verify`, AND a `build-test-must-pass` entry with
    // `status: 'ran'` must be present in the snapshot. A `skipped`,
    // `refused`, or absent test-gate entry still caps the tier below
    // `executable` — this widens what is *reachable*, it does not weaken
    // what must be *earned*.
    const gapResult = anchorFindings(
      codeReviewFindings,
      input.acceptanceCriteria ?? [],
      input.boundaries ?? [],
      ctx.draft.tasks,
      ctx.gateProvenance ?? [],
    );
    // Phase 236 (T4, AC-3, dec-20260730-001) — stamp every anchored finding
    // with its stable content-hash identity (`id`), `target: 'artifact'`, and
    // a default `disposition: 'open'` before it lands in `summaryPatch`. Pure
    // post-processing over the SAME `gapResult.findings` that `highs`/`pass`/
    // `gapCount`/`severityDistribution` below are computed from — it changes
    // only what is persisted, never the gate's refuse/pass/bypass decision.
    const identifiedFindings = attachFindingIdentity(gapResult.findings);
    // D3 — declared unconditionally, regardless of pass/refuse/bypass below:
    // config decides what stops the settle, never what is visible.
    const { gapCount, severityDistribution } = gapResult.summary;
    // D3 binds the declaration to be independent of the FLOOR OUTCOME — a gap
    // is never hidden because the gate happened to pass or a bypass was used.
    // It does not mean printing "0 gaps" on a settle that produced no findings
    // at all: with nothing uncovered there is nothing to declare, and a
    // clean-diff settle is specified to be quiet on stderr (asserted by
    // `settle-code-review.test.ts` AC-4 and `settle-codereview-convergence.test.ts`
    // AC-1, both of which predate this phase and neither of which AC-7 permits
    // loosening). The substance of D3 is preserved unconditionally either way:
    // the anchor-tagged findings and their tiers land in `summaryPatch.codeReview`
    // on EVERY return path below, so gap count and severity distribution stay
    // derivable from the persisted SUMMARY regardless of outcome.
    if (gapCount > 0) {
      ctx.io.err(
        `code-review: criteria-gap — ${gapCount} finding(s) unanchored ` +
          `(critical=${severityDistribution.critical}, high=${severityDistribution.high}, ` +
          `medium=${severityDistribution.medium}, low=${severityDistribution.low}).\n`,
      );
    }

    const { attemptsSoFar, history } = await ctx.codeReviewSidecar.read();
    const maxAttempts = ctx.config?.convergence?.maxAttempts ?? 3;
    // Phase 24.3 contract preserved (NOT narrowed): --force OR
    // --allow-code-review-failure bypasses ANY failing code-review.
    const bypassed =
      !pass && (ctx.opts.allowCodeReviewFailure === true || ctx.opts.force === true);

    const result = runConvergentReview({
      pass,
      findingsCount: highs.length,
      provider: verifyResult.provider,
      ...(verifyResult.model ? { model: verifyResult.model } : {}),
      attemptsSoFar,
      history,
      maxAttempts,
      bypassed,
      idField: 'draftId',
      idValue: ctx.state.activeDraft as string,
    });
    const nv = result.nv;
    await ctx.codeReviewSidecar.write(JSON.stringify(result.sidecarJson, null, 2) + '\n');

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
          await ctx.emit.codeReviewHigh(verifyResult.findings, {
            provider: verifyResult.provider,
            bypassed: true,
          });
        }
        if (nv.verdict === 'escalate') {
          await ctx.emit.codeReviewUnconverged({
            draftId: ctx.state.activeDraft as string,
            attempts: nv.attempt,
            maxAttempts,
            findings: highs.length,
            provider: verifyResult.provider,
            ...(verifyResult.model ? { model: verifyResult.model } : {}),
            bypassed: true,
          });
        }
        // fall through → SUMMARY.codeReview recorded downstream.
      } else if (nv.verdict === 'reloop') {
        if (ctx.gateSet.gates.includes('anomaly-notify')) {
          await ctx.emit.codeReviewHigh(verifyResult.findings, {
            provider: verifyResult.provider,
            bypassed: false,
          });
        }
        {
          const reason =
            `code-review: attempt ${nv.attempt}/${maxAttempts} did not pass — ` +
            'fix the flagged code and re-run `cadence settle run`, ' +
            'or pass --allow-code-review-failure to proceed anyway.';
          ctx.io.err(`${reason}\n`);
          return {
            outcome: 'refuse',
            summaryPatch: { codeReview: identifiedFindings },
            reason,
            flags: {
              verifierIdentity: {
                family: verifyResult.provider,
                ...(verifyResult.model ? { model: verifyResult.model } : {}),
              },
            },
          };
        }
      } else {
        // nv.verdict === 'escalate', no bypass flag → hard refuse.
        if (ctx.gateSet.gates.includes('anomaly-notify')) {
          await ctx.emit.codeReviewHigh(verifyResult.findings, {
            provider: verifyResult.provider,
            bypassed: false,
          });
        }
        await ctx.emit.codeReviewUnconverged({
          draftId: ctx.state.activeDraft as string,
          attempts: nv.attempt,
          maxAttempts,
          findings: highs.length,
          provider: verifyResult.provider,
          ...(verifyResult.model ? { model: verifyResult.model } : {}),
        });
        {
          const reason =
            'settle run refused: code-review did NOT converge after ' +
            `${maxAttempts} attempts — a human decision is required. ` +
            'Fix the flagged code, or pass --allow-code-review-failure ' +
            'to proceed anyway.';
          ctx.io.err(`${reason}\n`);
          return {
            outcome: 'refuse',
            summaryPatch: { codeReview: identifiedFindings },
            reason,
            flags: {
              verifierIdentity: {
                family: verifyResult.provider,
                ...(verifyResult.model ? { model: verifyResult.model } : {}),
              },
            },
          };
        }
      }
    }
    // pass (converged) OR bypass fall-through → record findings, proceed.
    return {
      outcome: 'pass',
      summaryPatch: { codeReview: identifiedFindings },
      flags: {
        verifierIdentity: {
          family: verifyResult.provider,
          ...(verifyResult.model ? { model: verifyResult.model } : {}),
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reason = `code-review: verifier failed — ${message}. Pass --allow-code-review-failure to continue.`;
    ctx.io.err(`${reason}\n`);
    if (ctx.opts.allowCodeReviewFailure !== true && ctx.opts.force !== true) {
      return { outcome: 'refuse', reason };
    }
    // Phase 248 (T2, AC-1/AC-3): the verifier call itself never returned —
    // report the bypass honestly via the distinct reviewVerifierFailure flag
    // (never verifierFailure; see gates/types.ts) and print a loud stderr
    // notice, styled like the findings-bypass notice above (lines 156-161)
    // but NOT the same precedence: that notice names --force first when both
    // flags are set; AC-1 requires this one to name the gate-specific flag
    // first (matching registry.ts's bypass-ladder convention) — do not
    // "harmonize" the two, the inversion is deliberate.
    const flag =
      ctx.opts.allowCodeReviewFailure === true ? '--allow-code-review-failure' : '--force';
    ctx.io.err(
      `code-review: ${flag} set; proceeding past a verifier failure (${message}).\n`,
    );
    return {
      outcome: 'pass',
      flags: {
        reviewVerifierFailure: {
          message,
          provider: ctx.config?.codeReview?.provider ?? 'mock',
        },
      },
    };
  }
};
