import type { Profile } from '@thomas-powers-jr/cadence-types';
import type { VerifierProvider } from '../verify/verifier-factory.js';

/**
 * Phase 265 (T2, AC-4): plain-language, ACCURATE consequence text for the
 * verifier provider `cadence init` resolves at scaffold time — surfaced both
 * in the interactive prompt and as the rationale on the
 * `addIntelligenceDecision` record T3 writes.
 *
 * Grounded in two pieces of live source, not restated from memory:
 *
 *  - `gates/engine.ts`'s `DELTAS` constant: `code-review` and `security-audit`
 *    never appear in the `auto` row at any tier (`quick-fix`/`standard`/
 *    `complex`). Under `standard`, `code-review` appears only at `complex`
 *    tier and `security-audit` never appears. Under `strict`, `code-review`
 *    appears at `standard` tier and above, `security-audit` only at
 *    `complex`.
 *  - `gates/assurance-record.ts`'s `deriveAssuranceRecord`: only
 *    `code-review`/`security-audit` gate entries ever carry verifier
 *    identity (`provider`/`model`) into `verifierRollup` — every other gate
 *    contributes nothing there. `overall: 'strong'` requires
 *    `hasRealVerifier` (some `verifierRollup` entry with `provider !==
 *    'mock'`) AND at least half of all ACs at `'ai-verified'`/`'executed'`
 *    evidence.
 *
 * Composing those two facts: under `auto` profile, `hasRealVerifier` can
 * never become true at any tier — `'strong'` is structurally unreachable no
 * matter which provider is configured (dec-20260808-004). Under
 * `standard`/`strict`, a real (non-`mock`) provider is a NECESSARY condition
 * for `hasRealVerifier`, but not a SUFFICIENT one on its own: whether
 * `code-review`/`security-audit` ever actually fire — and therefore whether
 * `hasRealVerifier` and the 50% evidence-ratio bar are ever cleared — still
 * depends on which tier a given phase runs at. `mock` forecloses `'strong'`
 * outright under every profile, independent of the profile point above,
 * because a mock-only `verifierRollup` can never satisfy `hasRealVerifier`.
 *
 * Pure: no I/O, no gate-engine re-implementation — just the message text.
 */

const MOCK_FORECLOSURE =
  "the `mock` provider never carries verifier identity in `deriveAssuranceRecord`'s " +
  "`verifierRollup` (only `code-review`/`security-audit` ever do, and only when a " +
  "real provider runs them), so `assurance.overall: 'strong'` is unreachable while " +
  '`mock` is selected — independent of gate profile or tier.';

const AUTO_UNREACHABLE_REGARDLESS_OF_PROVIDER =
  "Under the `auto` gate profile, `assurance.overall: 'strong'` is unreachable no " +
  'matter which provider is selected: the `auto` row in `gates/engine.ts`\'s `DELTAS` ' +
  'never fires `code-review` or `security-audit` at any tier (`quick-fix`, `standard`, ' +
  'or `complex`), and those are the only two gates that ever record verifier identity — ' +
  "so `deriveAssuranceRecord`'s `hasRealVerifier` can never become true under this " +
  'profile. Picking a real provider here changes nothing about that reachability.';

function tierGatingNote(gateProfile: 'standard' | 'strict'): string {
  return gateProfile === 'standard'
    ? '`code-review` fires only at the `complex` tier under `standard` profile, and ' +
        '`security-audit` never fires under `standard` at any tier (per `gates/engine.ts` `DELTAS`)'
    : '`code-review` fires at `standard` tier and above under `strict` profile, and ' +
        '`security-audit` fires only at `complex` tier (per `gates/engine.ts` `DELTAS`)';
}

/**
 * Derive the plain-language consequence message for a resolved
 * (provider, gateProfile) pair. See module doc comment for the grounding.
 */
export function deriveProviderConsequence(
  provider: VerifierProvider,
  gateProfile: Profile,
): string {
  if (gateProfile === 'auto') {
    return provider === 'mock'
      ? `${AUTO_UNREACHABLE_REGARDLESS_OF_PROVIDER} Separately: ${MOCK_FORECLOSURE}`
      : AUTO_UNREACHABLE_REGARDLESS_OF_PROVIDER;
  }

  // gateProfile is 'standard' or 'strict' here.
  if (provider === 'mock') {
    return (
      `Under the \`${gateProfile}\` gate profile, a real (non-mock) provider is a ` +
      "NECESSARY condition for `assurance.overall: 'strong'` to ever be reachable — but " +
      `${MOCK_FORECLOSURE}`
    );
  }

  return (
    `Under the \`${gateProfile}\` gate profile, a real (non-mock) provider like ` +
    `\`${provider}\` is a NECESSARY condition for \`assurance.overall: 'strong'\` to ever ` +
    'be reachable — but it is not automatically SUFFICIENT: ' +
    `${tierGatingNote(gateProfile)}, so whether a given phase actually reaches ` +
    "'strong' still depends on which tier it runs at (and on at least half its ACs " +
    "landing at 'ai-verified'/'executed' evidence). Choosing a real provider does not " +
    "guarantee 'strong'."
  );
}
