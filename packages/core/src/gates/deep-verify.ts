import type { DeepVerdict, DeepVerifyMeta } from '@manehorizons/cadence-types';
import type { VerifyAc, VerifyInput, VerifyTestRef } from '../verify/verifier.js';
import { capDiff } from '../verify/cap-diff.js';
import type { GateImpl, GateFlags, GateResult } from './types.js';

/** Schema default for `verifier.diffCapBytes` (256KB); used when config is absent. */
const DEFAULT_DIFF_CAP_BYTES = 262144;

/**
 * Deep verifier gate (Phase 15). Extracted from settle.ts verbatim. Fires on
 * --deep OR membership('deep-verify'); skipped under --auto=false.
 */
export const runDeepVerifyGate: GateImpl = async (ctx): Promise<GateResult> => {
  const deepRequested =
    ctx.opts.deep === true || ctx.gateSet.gates.includes('deep-verify');
  if (!deepRequested || ctx.opts.auto === false) {
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
  const meta = (provider: string, model?: string): DeepVerifyMeta => ({
    ...metaBase,
    provider,
    ...(model ? { model } : {}),
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
      if (v) {
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
          deepVerify[id]!.pass === false,
      );
    if (offenders.length > 0 && !ctx.opts.force) {
      for (const id of offenders) {
        ctx.io.err(
          `deep-verify: ${id} failed — ${deepVerify[id]!.reason} (provider: ${result.provider})\n`,
        );
      }
      ctx.io.err(
        'settle run --deep refused: the independent verifier rejected one or more ACs. ' +
          'Pass --force to settle anyway, or address the gaps.\n',
      );
      return {
        outcome: 'refuse',
        summaryPatch: { deepVerify, deepVerifyMeta: meta(result.provider, result.model) },
      };
    }
    return {
      outcome: 'pass',
      summaryPatch: { deepVerify, deepVerifyMeta: meta(result.provider, result.model) },
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
    ctx.io.err(
      `deep-verify: verifier failed — ${message}. Pass --allow-verifier-failure to continue.\n`,
    );
    return { outcome: 'refuse' };
  }
};
