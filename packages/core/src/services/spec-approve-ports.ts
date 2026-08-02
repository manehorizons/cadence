import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';
import type {
  SpecReviewInput,
  SpecReviewResult,
  UiSpecReviewInput,
  UiSpecReviewResult,
  VerifierPort,
} from '../contracts/index.js';
import { selectSpecReviewVerifier } from '../verify/spec-review-factory.js';
import { selectUiSpecReviewVerifier } from '../verify/ui-spec-review-factory.js';

/**
 * spec-approve's verifier port pair (Phase 234 T3). `spec-review` and
 * `ui-spec-review` were the last two verifier-backed gates with no injection
 * seam — `services/spec-approve.ts` called `selectSpecReviewVerifier` /
 * `selectUiSpecReviewVerifier` straight from `verify/*-factory.ts`, the exact
 * boundary violation `contracts/index.ts` exists to close. Both fields are
 * bare `VerifierPort`s against the published contract, never a `verify/`
 * concrete type — matching the shape of `VerifierPorts` (`gates/types.ts`),
 * `DraftVerifierPorts` (`gates/draft-types.ts`), and `BuildVerifierPorts`
 * (`gates/build-types.ts`).
 */
export interface SpecApproveVerifierPorts {
  readonly specReview: VerifierPort<SpecReviewInput, SpecReviewResult>;
  readonly uiSpecReview: VerifierPort<UiSpecReviewInput, UiSpecReviewResult>;
}

/**
 * Resolve the spec-review port: the injected port if the caller supplied
 * one, else today's default — `selectSpecReviewVerifier(cfg, { cwd })`,
 * identical arguments to the pre-injection call. The caller must invoke this
 * at the same point in `specApproveService` that the direct factory call
 * used to happen (unconditionally, once per invocation) so default
 * resolution stays eager exactly where it always was.
 */
export function resolveSpecReviewPort(
  injected: VerifierPort<SpecReviewInput, SpecReviewResult> | undefined,
  cfg: CadenceConfig | null,
  cwd: string,
): VerifierPort<SpecReviewInput, SpecReviewResult> {
  return injected ?? selectSpecReviewVerifier(cfg, { cwd });
}

/**
 * Resolve the ui-spec-review port: the injected port if the caller supplied
 * one, else today's default — `selectUiSpecReviewVerifier(cfg, { cwd })`.
 * `specApproveService` only calls this from inside the `UI-SPEC.md`-present
 * branch, same as the direct factory call it replaces — that call site is
 * what keeps default resolution lazy (no verifier is selected, and no
 * provider-selection warning can fire, unless a UI-SPEC actually exists),
 * not anything in this function.
 */
export function resolveUiSpecReviewPort(
  injected: VerifierPort<UiSpecReviewInput, UiSpecReviewResult> | undefined,
  cfg: CadenceConfig | null,
  cwd: string,
): VerifierPort<UiSpecReviewInput, UiSpecReviewResult> {
  return injected ?? selectUiSpecReviewVerifier(cfg, { cwd });
}
