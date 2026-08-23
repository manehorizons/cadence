import type { ResolvedPack } from '../packs/resolve.js';
import type { CommandIO } from '../services/io.js';

/**
 * Result of the enabled-but-unresolvable-pack check.
 *
 * NOT a `GateResult`: like {@link runSkillAuditCheck}'s `SkillAuditResult`, it
 * carries data the settle adapter records outside the `summaryPatch` contract
 * — here, the `reason` string settle turns into a `SUMMARY.gateBypasses`
 * entry when the refusal is bypassed.
 */
export interface PackResolutionResult {
  readonly outcome: 'pass' | 'refuse';
  /**
   * Present (and always `true`) only when at least one enabled pack failed to
   * resolve AND `--allow-unresolvable-pack` turned that refusal into a pass.
   * Absent on a clean pass — a flag set on a fully-resolving pack set records
   * nothing, because nothing was actually bypassed.
   */
  readonly bypassed?: true;
  /**
   * `<id>: <error>` for every unresolvable pack, joined with `; `. Present iff
   * at least one pack failed to resolve (on both the `refuse` and the bypassed
   * `pass` path). Returned rather than only printed so settle can record the
   * bypass into `SUMMARY.gateBypasses` without re-deriving the message.
   */
  readonly reason?: string;
}

/**
 * Enabled-but-unresolvable-pack refusal (Phase 291, packs Slice 2 — D-AR phase
 * two, `dec-20260822-025`). A sibling of `checks/skill-audit.ts` and dispatched
 * the same way: EXPLICITLY by settle, deliberately OUTSIDE the `Gate`
 * enum/registry and the profile×tier matrix. The reasoning is identical to
 * skill-audit's — declaring/enabling a pack IS the opt-in, so this is an
 * anomaly check, not a gate anyone has to switch on.
 *
 * Slice 1 could only warn about an unresolvable pack (`cadence doctor`'s
 * `packs` check) because a pack did nothing yet. Slice 2 makes a resolved
 * pack's `skillAudit.required` a real contributor to the enforced union, so an
 * enabled pack that never loaded is now a silently-missing enforcement input,
 * not a cosmetic config error — hence a hard refusal, fail-closed.
 *
 * Settle dispatches this BEFORE `runSkillAuditCheck`: if an unresolvable pack
 * were left in `resolvedPacks` while skill-audit ran first, a skill-audit
 * "pass" could be computed from a pack that contributed nothing (its manifest
 * never loaded), i.e. the check would silently reason on incomplete data.
 * Checking resolution first means settle refuses on the right grounds before
 * skill-audit ever sees a partially-broken pack set.
 *
 * Deviation from the DRAFT (291-01, T3), recorded rather than made silently:
 * the DRAFT sketched a two-parameter signature and said to "print to stderr".
 * A third parameter — the `io` seam settle already threads everywhere — is
 * taken instead of writing to `process.stderr` directly, matching how
 * `skill-audit.ts` prints through `ctx.io.err` and keeping the stderr contract
 * (diagnostics never on stdout) injectable and assertable in tests. It is
 * required, not defaulted: a silent default writer would be exactly the
 * "Quiet Fallback" this repo names as a failure mode.
 */
export function checkUnresolvablePacks(
  resolved: ResolvedPack[],
  opts: { readonly allowUnresolvablePack?: boolean | undefined },
  io: Pick<CommandIO, 'err'>,
): PackResolutionResult {
  const broken = resolved.filter((p): p is Extract<ResolvedPack, { error: string }> => 'error' in p);
  if (broken.length === 0) return { outcome: 'pass' };

  const reason = broken.map((p) => `${p.id}: ${p.error}`).join('; ');

  if (opts.allowUnresolvablePack !== true) {
    io.err(
      `settle run refused: ${broken.length} enabled pack(s) could not be resolved: ${reason}. ` +
        `Fix the pack manifest(s) or remove the id(s) from config.packs.enabled, ` +
        `or pass --allow-unresolvable-pack to override.\n`,
    );
    return { outcome: 'refuse', reason };
  }

  io.err(
    `pack-resolution: --allow-unresolvable-pack set; proceeding past ${broken.length} unresolvable pack(s): ${reason}.\n`,
  );
  return { outcome: 'pass', bypassed: true, reason };
}
