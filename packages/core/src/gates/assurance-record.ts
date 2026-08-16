import type {
  AcEvidence,
  AssuranceRecord,
  DeepVerdict,
  GateBypass,
  GateProvenance,
  Summary,
} from '@thomas-powers-jr/cadence-types';

/**
 * Phase 233 (T2): the per-AC result shape `deriveAssuranceRecord` consumes —
 * pinned to `Summary['acResults'][number]` (rather than a hand-rolled
 * subset) so this file breaks loudly at typecheck if `SummaryZ.acResults`
 * ever changes shape, instead of silently drifting from it.
 */
export type AssuranceAcResult = Summary['acResults'][number];

/**
 * Phase 283 (283-01, T2): the optional third argument `deriveAssuranceRecord`
 * accepts, carrying the two extra settle-level facts D-S/D-R read (see the
 * function's own doc comment below for the rules). Both fields are optional
 * and independently defaultable — omitting the whole argument, or passing
 * `{}`, is equivalent to passing `{ gateBypasses: [], deepVerify: {} }`
 * (283-01/AC-3: this makes the addition backward-compatible by construction,
 * not by convention). Gate-agnostic like the rest of this file: only
 * `severity` is ever read off `gateBypasses` entries and only `pass`/
 * `provider` off `deepVerify` entries — `.gate` is never read anywhere in
 * this file, on this new argument any more than on the pre-existing `gates`
 * argument (`dec-20260728-001`, reaffirmed as D-T by `dec-20260816-007`).
 */
export interface AssuranceBypassInput {
  readonly gateBypasses?: readonly GateBypass[];
  readonly deepVerify?: Record<string, DeepVerdict>;
}

const EVIDENCE_CLASSES: readonly AcEvidence[] = [
  'ai-verified',
  'executed',
  'assertion',
  'mention',
  'unverified',
];

/**
 * Phase 233 (T2): derive one whole-run `AssuranceRecord` from a settle's
 * per-gate provenance array and per-AC evidence array — "how strongly was
 * this settle actually verified?", composed rather than gated.
 *
 * Pure function of its arguments only — no I/O, no clock, no gate-name
 * special-casing (the AC-3 tripwire this task exists to test; phase 283
 * extended the argument list to three but this remains true of all of
 * them — see below). Every gate
 * entry is treated uniformly by its `provider`/`model` fields alone: this
 * function never inspects `gate.gate`. Gates that carry no verifier
 * identity (everything except `code-review`/`security-audit` as of phase
 * 232) simply contribute nothing to `verifierRollup` — that is a property
 * of the input data, not a branch in this code.
 *
 * `overall` derivation rule (deterministic, documented here since the exact
 * thresholds are this function's own design call, per the phase-233 spec):
 *  - `'unverified'`: no gate entry anywhere carried verifier identity AND
 *    every AC's evidence class is `'unverified'` (nothing stronger, not
 *    even `'mention'`, was ever recorded). Matches the `AssuranceRecordZ`
 *    schema comment verbatim.
 *  - `'strong'`: at least one gate entry carried a *real* (non-`'mock'`)
 *    provider AND at least half of all ACs landed at `'ai-verified'` or
 *    `'executed'` (the two strongest evidence classes). Mock-only
 *    verification never earns `'strong'`, matching the phase-140/213
 *    mock-honesty precedent (a mock verdict is a placeholder, not
 *    verification).
 *  - `'mixed'`: some real verifier signal or some non-zero strong-evidence
 *    ratio was present, but not enough to clear the `'strong'` bar.
 *  - `'weak'`: everything else — e.g. mock-only (or no) verifier identity
 *    with zero ACs at `'ai-verified'`/`'executed'`, but at least one AC
 *    above bare `'unverified'` (otherwise it would already be `'unverified'`
 *    above). Zero ACs with zero verifier identity does NOT land here — it
 *    hits the `'unverified'` branch first (rec-20260801-006: this bullet
 *    used to claim otherwise; the code has always resolved that shape to
 *    `'unverified'`, matching the bullet above's plain reading — "no gate
 *    entry anywhere carried verifier identity" is vacuously true with no
 *    gates, and "every AC's evidence class is `'unverified'`" is vacuously
 *    true with no ACs).
 *
 * Phase 283 (283-01, T2): a third, optional argument — `{ gateBypasses,
 * deepVerify }`, typed as `AssuranceBypassInput` above — lets two more
 * settle-level facts adjust `overall` below, without adding a new `overall`
 * enum value or touching `verifierRollup`/`evidenceTally`'s own shape. Both
 * rules stay gate-agnostic like everything else in this function: only
 * `severity` is read off `gateBypasses` entries and only `pass`/`provider`
 * off `deepVerify` entries — `.gate` is never read anywhere in this file, on
 * this new argument any more than on `gates` (`dec-20260728-001`, D-T /
 * `dec-20260816-007`).
 *
 *  - D-S (`dec-20260816-006`): if `gateBypasses` contains at least one entry
 *    with `severity === 'error'`, `overall` is capped at `'mixed'` — an
 *    otherwise-`'strong'` result is downgraded to `'mixed'`, but a `'weak'`/
 *    `'unverified'` result is left alone (both are already at or below the
 *    cap, so there is nothing to downgrade). A `gateBypasses` array
 *    containing only `'warn'`-severity entries never triggers this cap.
 *  - D-R (`dec-20260816-005`): for each AC id present in `deepVerify` with
 *    `pass: false` from a `provider` that is not `'mock'`, that AC is
 *    excluded from `strongRatio`'s numerator even when its own
 *    `acResults[].evidence` is `'ai-verified'`/`'executed'` — a real
 *    verifier's objection to a `--force`-overridden AC must not read as
 *    strong evidence. `acResults[].pass` itself is never altered by this; it
 *    keeps recording the real settle outcome, exactly as before this phase.
 *    A `deepVerify` entry with `pass: false` from `provider: 'mock'` does
 *    NOT trigger this exclusion — mock is a placeholder, never real
 *    verification (matching this file's existing mock-honesty framing
 *    above), so a mock failure carries no more signal than a mock pass does.
 *
 * When the third argument is omitted, or passed as `{}` / `{ gateBypasses:
 * [], deepVerify: {} }`, both rules are no-ops and this function's output is
 * byte-identical to the pre-283 two-argument call — additive and
 * backward-compatible by construction (283-01/AC-3), not a redesign.
 *
 * Phase 267 (267-01, T3): investigated and deliberately left unchanged.
 * `code-review`/`security-audit` gates that resolve to a mock-identified
 * CLEAN PASS now arrive here as `{ status: 'skipped', provider: 'mock',
 * skipReason: '...' }` (`registry.ts`, T2) instead of the pre-267
 * `{ status: 'ran', provider: 'mock' }` — but this function has never
 * branched on `status` (see "gate-agnostic" above; `'refused'` entries
 * already carried `provider` into `verifierRollup` before this phase, at
 * the `registry.ts` refuse branch that predates T2's diff). A mock-identity
 * entry therefore still contributes to `verifierRollup`/`hasAnyVerifier`
 * whether its status is `'ran'`, `'skipped'`, or `'refused'` — status is
 * not part of this function's contract, only `provider`/`model` are.
 * Deliberate: `hasRealVerifier` (`v.provider !== 'mock'`) is unaffected
 * either way, since an abstained entry never carries anything but
 * `provider: 'mock'` — so this choice can only move the boundary between
 * `'unverified'` and `'weak'`, never manufacture a false `'strong'`/
 * `'mixed'`. Excluding abstained entries would silently downgrade some
 * settles from `'weak'` to `'unverified'` purely because T2 renamed the
 * status of an already-mock-only signal — a second semantic change this
 * phase never authorized on a surface (`assurance`) scoped as "handle
 * correctly," not "change." Concretely: a settle whose only verifier
 * contact anywhere is one abstained mock review gate, with no AC evidence
 * above `'unverified'`, derives `overall: 'weak'` (mock at least engaged
 * and said so honestly) rather than `'unverified'` (nothing happened) —
 * see the `'deriveAssuranceRecord and mock-abstained review gates
 * (267-01/AC-3)'` describe block in `tests/gates/assurance-record.test.ts`.
 */
export function deriveAssuranceRecord(
  gates: readonly GateProvenance[],
  acResults: readonly AssuranceAcResult[],
  bypassInput: AssuranceBypassInput = {},
): AssuranceRecord {
  const { gateBypasses = [], deepVerify = {} } = bypassInput;

  // 1. verifierRollup: group by (provider, model) pairs carried on `gates`
  // entries. Gate-agnostic — only `provider`/`model` are read, never `gate`.
  const rollupByKey = new Map<string, { provider: string; model?: string; gateCount: number }>();
  for (const g of gates) {
    if (g.provider === undefined) continue;
    // rec-20260811-002: an escaped NUL, not a literal one -- provider/model
    // names cannot contain it, and a raw 0x00 byte here made this whole file
    // grep-classify as binary (grep silently suppresses every match).
    const key = `${g.provider}\u0000${g.model ?? ''}`;
    const existing = rollupByKey.get(key);
    if (existing) {
      existing.gateCount += 1;
    } else {
      rollupByKey.set(key, {
        provider: g.provider,
        ...(g.model !== undefined ? { model: g.model } : {}),
        gateCount: 1,
      });
    }
  }
  const verifierRollup = [...rollupByKey.values()];

  // 2. evidenceTally: exhaustive over all 5 AcEvidenceZ buckets, 0 where
  // unobserved. A missing `evidence` field (pre-phase-140 / undeclared ACs)
  // counts as 'unverified' — the weakest rung, matching checkEvidenceFloor's
  // existing `r.evidence ?? 'unverified'` convention in ac-evidence.ts.
  const evidenceTally: Record<AcEvidence, number> = {
    'ai-verified': 0,
    executed: 0,
    assertion: 0,
    mention: 0,
    unverified: 0,
  };
  for (const ac of acResults) {
    const evidence = ac.evidence ?? 'unverified';
    evidenceTally[evidence] += 1;
  }

  // 3. overall: see doc comment above for the rule.
  const totalAcs = acResults.length;
  const hasAnyVerifier = verifierRollup.length > 0;
  const hasRealVerifier = verifierRollup.some((v) => v.provider !== 'mock');

  // D-R (283-01/T2): strongCount mirrors `evidenceTally['ai-verified'] +
  // evidenceTally.executed`, except an AC is skipped when a non-mock
  // `deepVerify` verdict objected to it (`pass: false`) — see the doc
  // comment above. With `deepVerify` empty (the default) no AC is ever
  // excluded, so this reduces to exactly the pre-283 sum (283-01/AC-3).
  // `evidenceTally` itself is untouched by this: it keeps recording each
  // AC's real evidence class regardless of any deepVerify objection.
  let strongCount = 0;
  for (const acr of acResults) {
    const evidence = acr.evidence ?? 'unverified';
    if (evidence !== 'ai-verified' && evidence !== 'executed') continue;
    const verdict = deepVerify[acr.id];
    const excludedByRealVerifierFailure =
      verdict !== undefined && verdict.pass === false && verdict.provider !== 'mock';
    if (excludedByRealVerifierFailure) continue;
    strongCount += 1;
  }
  const strongRatio = totalAcs > 0 ? strongCount / totalAcs : 0;
  const noEvidenceAboveUnverified = EVIDENCE_CLASSES.filter((c) => c !== 'unverified').every(
    (c) => evidenceTally[c] === 0,
  );

  let overall: AssuranceRecord['overall'];
  if (!hasAnyVerifier && noEvidenceAboveUnverified) {
    overall = 'unverified';
  } else if (hasRealVerifier && strongRatio >= 0.5) {
    overall = 'strong';
  } else if (hasRealVerifier || strongRatio > 0) {
    overall = 'mixed';
  } else {
    overall = 'weak';
  }

  // D-S (283-01/T2): an error-severity `gateBypasses` entry caps `overall`
  // at 'mixed' — it can never grade 'strong' regardless of the gates/
  // evidence math above. Only `severity` is read here, never `.gate` (D-T).
  // A 'weak'/'unverified' result is left alone (already at or below the
  // cap); an all-'warn' `gateBypasses` array never triggers this, and an
  // empty `gateBypasses` (the default) is a no-op (283-01/AC-3).
  const hasErrorSeverityBypass = gateBypasses.some((b) => b.severity === 'error');
  if (hasErrorSeverityBypass && overall === 'strong') {
    overall = 'mixed';
  }

  return { verifierRollup, evidenceTally, overall };
}
