import type { DeepVerdict, DeepVerifyMeta } from '@thomas-powers-jr/cadence-types';
import type { VerifyAc, VerifyInput, VerifyTestRef } from '../contracts/index.js';
import { capDiff } from '../verify/cap-diff.js';
import { classifyAcObservability } from '../verify/criteria-observability.js';
import type { GateImpl, GateFlags, GateResult, SettleContext } from './types.js';

/** Schema default for `verifier.diffCapBytes` (256KB); used when config is absent. */
const DEFAULT_DIFF_CAP_BYTES = 262144;

/**
 * Phase 140: is deep-verify actually going to do real work this settle?
 * Exported so the registry's gate-provenance collection (Task 7) can
 * classify "invoked but no-op" without duplicating this condition.
 */
export function isDeepVerifyRequested(ctx: SettleContext): boolean {
  const deepRequested = ctx.opts.deep === true || ctx.gateSet.gates.includes('deep-verify');
  return deepRequested && ctx.opts.auto !== false;
}

/**
 * Deep verifier gate (Phase 15). Extracted from settle.ts verbatim. Fires on
 * --deep OR membership('deep-verify'); skipped under --auto=false.
 */
export const runDeepVerifyGate: GateImpl = async (ctx): Promise<GateResult> => {
  if (!isDeepVerifyRequested(ctx)) {
    return { outcome: 'pass' };
  }

  const acs: VerifyAc[] = ctx.draft.acceptanceCriteria.map((a) => ({
    id: a.id,
    given: a.given,
    when: a.when,
    then: a.then,
  }));
  const coverageMap = await ctx.coverage();
  const tests: Record<string, VerifyTestRef[]> = {};
  for (const [id, refs] of coverageMap) tests[id] = refs;

  // Phase 70: feed the verifier the real (capped) diff instead of '' — without
  // it, deep verification judges ACs on test-linkage + filenames alone.
  const capBytes = ctx.config?.verifier?.diffCapBytes ?? DEFAULT_DIFF_CAP_BYTES;
  const cap = capDiff(ctx.diff(), capBytes);
  const metaBase = {
    diffProvided: cap.originalBytes > 0,
    diffBytes: cap.originalBytes,
    truncated: cap.truncated,
    filesCount: ctx.touchedFiles.length,
  };
  const meta = (
    provider: string,
    model?: string,
    usage?: { inputTokens: number; outputTokens: number },
  ): DeepVerifyMeta => ({
    ...metaBase,
    provider,
    ...(model ? { model } : {}),
    ...(usage
      ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
      : {}),
  });

  const verifyInput: VerifyInput = {
    acs,
    tests,
    diff: cap.diff,
    files: [...ctx.touchedFiles],
  };

  try {
    const result = await ctx.verifiers.deep.verify(verifyInput);
    const deepVerify: Record<string, DeepVerdict> = {};
    for (const ac of acs) {
      const v = result.verdicts[ac.id];
      // Phase 274 (T3): classify this AC's observability BEFORE deciding what
      // to record. Production text is the exact `[given, when, then]` join
      // documented by `classifyAcObservability`'s JSDoc — a different
      // separator is untested and could move the classifier's behavior in
      // the unsafe (false-positive) direction. Coverage is whatever this
      // gate already computed for the AC (possibly empty) — the classifier
      // never lets coverage presence flip an otherwise-unobservable verdict.
      const acText = [ac.given, ac.when, ac.then].join('\n');
      const verdict = classifyAcObservability({ id: ac.id, text: acText }, tests[ac.id] ?? []);
      if (!verdict.observable) {
        // Conservative override: `pass` is always `false` here regardless of
        // what the verifier said (it structurally cannot observe this AC's
        // satisfaction condition, so a `pass: true` from it is not
        // trustworthy) — never lets an unobservable-marked verdict
        // accidentally read as a pass to a naive `.pass === true` consumer.
        // `unobservable: true` is the load-bearing signal that excludes this
        // AC from the offenders list below.
        deepVerify[ac.id] = {
          pass: false,
          reason: v
            ? `${v.reason} — reclassified unobservable: ${verdict.reason}`
            : verdict.reason,
          provider: result.provider,
          ...(result.model ? { model: result.model } : {}),
          unobservable: true,
        };
        ctx.io.err(
          `deep-verify: ${ac.id} not counted as an offender — structurally unobservable: ` +
            `${verdict.reason}\n`,
        );
      } else if (v) {
        deepVerify[ac.id] = {
          pass: v.pass,
          reason: v.reason,
          provider: result.provider,
          ...(result.model ? { model: result.model } : {}),
        };
      }
    }
    const offenders = acs
      .map((a) => a.id)
      .filter(
        (id) =>
          !ctx.explicitIds.has(id) &&
          deepVerify[id] !== undefined &&
          deepVerify[id]!.pass === false &&
          deepVerify[id]!.unobservable !== true,
      );
    if (offenders.length > 0 && !ctx.opts.force) {
      for (const id of offenders) {
        ctx.io.err(
          `deep-verify: ${id} failed — ${deepVerify[id]!.reason} (provider: ${result.provider})\n`,
        );
      }
      const reason =
        'settle run --deep refused: the independent verifier rejected one or more ACs. ' +
        'Pass --force to settle anyway, or address the gaps.';
      ctx.io.err(`${reason}\n`);
      return {
        outcome: 'refuse',
        summaryPatch: { deepVerify, deepVerifyMeta: meta(result.provider, result.model, result.usage) },
        reason,
      };
    }
    return {
      outcome: 'pass',
      summaryPatch: { deepVerify, deepVerifyMeta: meta(result.provider, result.model, result.usage) },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (ctx.opts.allowVerifierFailure) {
      ctx.io.err(
        `deep-verify: verifier failed (${message}); --allow-verifier-failure set, treating all ACs as pass=false.\n`,
      );
      const failedProvider = ctx.config?.verifier?.provider ?? 'mock';
      const failedModel = ctx.config?.verifier?.model;
      const deepVerify: Record<string, DeepVerdict> = {};
      for (const ac of acs) {
        deepVerify[ac.id] = {
          pass: false,
          reason: `verifier failed: ${message}`,
          provider: failedProvider,
          ...(failedModel ? { model: failedModel } : {}),
        };
      }
      const flags: GateFlags = { verifierFailure: { message, provider: failedProvider } };
      return {
        outcome: 'pass',
        summaryPatch: { deepVerify, deepVerifyMeta: meta(failedProvider, failedModel) },
        flags,
      };
    }
    const reason = `deep-verify: verifier failed — ${message}. Pass --allow-verifier-failure to continue.`;
    ctx.io.err(`${reason}\n`);
    return { outcome: 'refuse', reason };
  }
};
