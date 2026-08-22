import { isAbsolute, join, relative, resolve } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import type {
  AnomalyEvent,
  AssuranceRecord,
  CadenceConfig,
  CadenceState,
  Draft,
  GateBypass,
  GateProvenance,
  Summary,
} from '@thomas-powers-jr/cadence-types';
import { TaskStatusZ, defaultConfig } from '@thomas-powers-jr/cadence-types';
import { nextAction } from '../progress.js';
import { phaseNumber } from '../phases/collision.js';
import { assertSafePhaseSlug } from '../phases/id.js';
import { assertNoPhaseCollision } from '../phases/guard.js';
import { parseDraftMd } from '../parse/draft-parser.js';
import { renderSummaryMd } from '../parse/summary-writer.js';
import { computeSummaryContentHash } from './summary-hash.js';
import { buildRetroDigest, writeRetroArtifacts, runRetroOffer } from './retro.js';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { LoopViolationError } from '../errors.js';
import { deriveAcResults, type ProgressFile } from '../status.js';
import { loadConfig } from '../config/loader.js';
import { effectiveGateSet } from '../gates/engine.js';
import { resolveInteractivity } from '../gates/interactivity.js';
import { selectVerifier } from '../verify/factory.js';
import { scanTestCoverage } from '../verify/coverage.js';
import { runTestCommand } from '../verify/test-runner.js';
import {
  resolveEffectiveProvider,
  MOCK_FALLBACK_BANNER,
  buildForeignBinaryBanner,
  type VerifierProvider,
} from '../verify/verifier-factory.js';
import type { VerifyTestRef } from '../contracts/index.js';
import { runSettleGates } from '../gates/registry.js';
import { deriveAcEvidence, checkEvidenceFloor, isUnobservableAc } from '../gates/ac-evidence.js';
import { classifyAcObservability } from '../verify/criteria-observability.js';
import {
  deriveAssuranceRecord,
  type AssuranceAcResult,
  type AssuranceBypassInput,
} from '../gates/assurance-record.js';
import { effectiveEvidenceFloor, evidenceFloorRefusalReason } from '../gates/engine.js';
import { runSkillAuditCheck } from '../checks/skill-audit.js';
import {
  addRecommendation,
  runAdvanceConvertedToSettlePendingForPhase,
  runRecommendationPromotion,
} from '../intelligence/store/recommendations.js';
import { readRecommendationLedger } from '../intelligence/store/io.js';
import {
  deriveRoutingCandidates,
  type RoutingSettlePointer,
} from '../intelligence/finding-routing.js';
import {
  type SettleContext,
  type ProgressJson,
  type AcResult,
  type SettleAccumulator,
} from '../gates/types.js';
import type { PerTaskVerifyRecord } from '../build/record.js';
import { createDefaultPrompter } from '../verify/prompter.js';
import { collectGitDiff } from '../git/diff.js';
import { selectNotifier } from '../notify/factory.js';
import { collectAnomalies } from '../notify/collect.js';
import { emitLoopViolation } from '../notify/loop-violation.js';
import { selectCodeReviewVerifier } from '../verify/code-review-factory.js';
import { emitCodeReviewHigh, emitCodeReviewUnconverged } from '../notify/code-review.js';
import { emitSkillAuditMiss } from '../notify/skill-audit.js';
import { selectSecurityAuditVerifier } from '../verify/security-audit-factory.js';
import { formatCommandError } from './format-command-error.js';
import type { CommandIO, CommandResult } from './io.js';

export interface SettleArgs {
  ac?: string[];
  acPass?: string[];
  passAll?: boolean;
  auto?: boolean;
  force?: boolean;
  allowMissingCoverage?: boolean;
  deep?: boolean;
  allowAutoComplex?: boolean;
  allowStaleDraft?: boolean;
  allowOpenTasks?: boolean;
  allowFailingBuild?: boolean;
  allowVerifierFailure?: boolean;
  allowCodeReviewFailure?: boolean;
  allowSecurityAuditFailure?: boolean;
  allowSkillAuditMiss?: boolean;
  /** Phase 156: do not refuse on a boundary-scan violation; record the
   *  offenders into SUMMARY and settle anyway. */
  allowBoundaryScanFailure?: boolean;
  /** Phase 83: bypass the worktree phase-collision backstop. */
  allowPhaseCollision?: boolean;
  interactive?: boolean;
  /** Phase 73: override config.verifier.provider for the deep-verify gate
   *  (precedence flag > config > default mock). */
  verifier?: VerifierProvider;
  /** Phase 148: when set, any `converted` recommendation targeting the
   *  settling phase is promoted straight to `shipped` (with this text as
   *  `shippedRef`) instead of the default `settle-pending` advance. */
  shipRef?: string;
  /** Phase 214 (T4): per-AC evidence-floor bypass, `AC-id:reason` pairs
   *  (repeatable). Exempts exactly the named AC from the `gates.evidenceFloor`
   *  refusal — never a blanket "skip the floor for everything" flag. A
   *  non-empty reason is required for every entry. */
  evidenceFloorBypass?: string[];
  /** Phase 247 (T2): injectable clock for `completedAt`, mirroring
   *  `verify/converge.ts`'s `now?: () => string` seam — lets a test inject a
   *  fixed timestamp instead of depending on real wall-clock spacing.
   *  Defaults to `() => new Date().toISOString()` when absent. Used for
   *  `completedAt` on BOTH the success path (`finalizeAndCloseSettle`) and
   *  the refused-settle path (`writeRefusedSettleSummary`) — the two stay
   *  symmetric so a later phase (T3) can build N-sibling-SUMMARY support on
   *  top of a clock seam that already covers both call sites. */
  now?: () => string;
}

function parseAcArg(arg: string): AcResult {
  const eqIdx = arg.indexOf('=');
  if (eqIdx === -1) throw new Error(`bad --ac syntax: ${arg}`);
  const id = arg.slice(0, eqIdx);
  const rest = arg.slice(eqIdx + 1);
  const colonIdx = rest.indexOf(':');
  const verdict = colonIdx === -1 ? rest : rest.slice(0, colonIdx);
  const note = colonIdx === -1 ? undefined : rest.slice(colonIdx + 1).trim();
  return { id, pass: verdict === 'pass', ...(note ? { note } : {}) };
}

/**
 * Phase 214 (T4): parse one `--evidence-floor-bypass AC-id:reason` entry.
 * Mirrors `parseAcArg`'s plain-`Error`-on-malformed-input style (caught by
 * `settleService`'s outer try/catch and formatted via `formatCommandError`,
 * same as every other hand-parsed settle option). A non-empty reason is
 * required — `AC-1:` or `AC-1` alone are both refused — so a bypass can
 * never be recorded without an auditable justification.
 */
function parseEvidenceFloorBypassArg(arg: string): { id: string; reason: string } {
  const colonIdx = arg.indexOf(':');
  if (colonIdx === -1) {
    throw new Error(`bad --evidence-floor-bypass syntax (expected AC-id:reason): ${arg}`);
  }
  const id = arg.slice(0, colonIdx).trim();
  const reason = arg.slice(colonIdx + 1).trim();
  if (id.length === 0 || reason.length === 0) {
    throw new Error(
      `bad --evidence-floor-bypass syntax: both AC-id and a non-empty reason are required: ${arg}`,
    );
  }
  return { id, reason };
}

function mergePassShorthands(draftAcIds: string[], explicit: AcResult[], opts: SettleArgs): AcResult[] {
  const explicitIds = new Set(explicit.map((a) => a.id));
  const shorthand: AcResult[] = [];
  for (const id of opts.acPass ?? []) {
    if (!explicitIds.has(id)) shorthand.push({ id, pass: true });
  }
  if (opts.passAll) {
    const seen = new Set([...explicitIds, ...shorthand.map((a) => a.id)]);
    for (const id of draftAcIds) {
      if (!seen.has(id)) shorthand.push({ id, pass: true });
    }
  }
  return [...explicit, ...shorthand];
}

function anomalyToGateBypass(event: AnomalyEvent): GateBypass | null {
  if (event.severity === 'info') return null;
  if (event.type === 'coverage-bypassed') {
    return {
      gate: 'test-coverage',
      flag: '--allow-missing-coverage',
      reason: event.message,
      severity: event.severity,
    };
  }
  if (event.type === 'force-used') {
    return {
      gate: 'settle',
      flag: '--force',
      reason: event.message,
      severity: event.severity,
    };
  }
  if (event.type === 'verifier-failure') {
    return {
      gate: 'deep-verify',
      flag: '--allow-verifier-failure',
      reason: event.message,
      severity: event.severity,
    };
  }
  if (event.type === 'auto-complex-override') {
    return {
      gate: 'soft-cap',
      flag: '--allow-auto-complex',
      reason: event.message,
      severity: event.severity,
    };
  }
  return null;
}

function gateBypassesFromAnomalies(events: AnomalyEvent[]): GateBypass[] {
  return events.flatMap((event) => {
    const bypass = anomalyToGateBypass(event);
    return bypass ? [bypass] : [];
  });
}

/**
 * Phase 170 (T4): `taskResults` derivation shared by both the normal settle
 * path and the refused-settle path — a BLOCKED-task falls back to 'BLOCKED'
 * for any task the PROGRESS file doesn't recognize as a valid TaskStatus.
 * Extracted so the refusal path can persist a SUMMARY with byte-identical
 * task-status logic instead of duplicating it.
 */
function buildTaskResults(
  draft: { tasks: { id: string }[] },
  progress: ProgressJson,
): Summary['taskResults'] {
  return draft.tasks.map((t) => {
    const row = progress.tasks[t.id];
    return {
      id: t.id,
      status: (TaskStatusZ.safeParse(row?.status).success
        ? (row!.status as Summary['taskResults'][number]['status'])
        : 'BLOCKED'),
      notes: row?.notes ?? '',
      // Phase 280 (280-01, T14): dispatch-contract provenance — spread
      // straight from PROGRESS.json when T8/T11/T12 populated it. Additive
      // only: absent on every pre-phase-280 record, so this never injects a
      // key (and thus never perturbs computeSummaryContentHash) for a
      // historical PROGRESS row that predates these fields.
      ...(row?.execution ? { execution: row.execution } : {}),
      ...(row?.isolation ? { isolation: row.isolation } : {}),
      ...(row?.modelClass ? { modelClass: row.modelClass } : {}),
    };
  });
}

/**
 * Concern 0 (phase 233 T3): derive the `assurance` field attached to
 * SUMMARY — a thin, independently-named wrapper around T2's pure
 * `deriveAssuranceRecord`, kept as its own step (matching the phase 228
 * "named step function" convention used throughout this file) rather than
 * inlined at each of the two SUMMARY-construction call sites below. Takes
 * only the gate provenance array and per-AC results already computed
 * earlier in the pipeline — no new I/O, no clock, no gate-name special-
 * casing. Purely reported: its result is attached to `summary.assurance`
 * strictly after each call site's PASS/REFUSE outcome is already decided,
 * and is never read back by any gate-outcome or refusal logic (AC-4).
 *
 * Phase 283 (283-01, T3): an optional third argument, `AssuranceBypassInput`
 * (same shape `deriveAssuranceRecord` itself now accepts — see that file's
 * doc comment for the D-S/D-R rules), is threaded straight through to it.
 * Only `finalizeAndCloseSettle` (the success path) supplies a populated one,
 * built from `gateBypasses`/`deepVerify` already in scope there.
 * `writeRefusedSettleSummary` (the refused path) keeps calling with two
 * arguments — it already passes `acResults: []`, so bypass/deepVerify data
 * would be a no-op there regardless (283-01 Boundaries).
 */
// deja:new pre-existing thin wrapper (phase 233 T3), being extended in place
// with the same optional third argument `deriveAssuranceRecord` (T2, phase
// 283) now takes — a pass-through, not a new utility; see the doc comment
// above.
function deriveSettleAssuranceRecord(
  gates: readonly GateProvenance[],
  acResults: readonly AssuranceAcResult[],
  bypassInput: AssuranceBypassInput = {},
): AssuranceRecord {
  return deriveAssuranceRecord(gates, acResults, bypassInput);
}

/**
 * Concern 1 (phase 228 T1): precondition + load. Reads state, refuses with a
 * `LoopViolationError` unless `loopPosition==='BUILD'` with an active
 * draft/phase, then parses the active phase, the DRAFT.md, and the
 * PROGRESS.json (defaulting to `{ draftId, tasks: {} }` when absent).
 * Verbatim extraction of the former `settleService` preamble — logic moved,
 * not rewritten.
 */
interface SettlePreconditionData {
  backend: SimpleStateBackend;
  state: CadenceState;
  activePhase: string;
  draftPath: string;
  draft: Draft;
  progress: ProgressJson;
}

type SettlePreconditionResult =
  | { ok: true; data: SettlePreconditionData }
  | { ok: false; result: CommandResult };

async function loadSettlePreconditions(
  cwd: string,
  io: CommandIO,
): Promise<SettlePreconditionResult> {
  const backend = new SimpleStateBackend(cwd);
  const state = await backend.readState();
  if (state.loopPosition !== 'BUILD' || !state.activeDraft || !state.activePhase) {
    const violation = new LoopViolationError(
      'settle run requires loopPosition=BUILD with an active draft',
      { expected: 'BUILD', actual: state.loopPosition },
    );
    const action = nextAction(state);
    io.err(`settle run failed: ${violation.message} Next: ${action.command}\n`);
    await emitLoopViolation(cwd, violation, 'settle.run');
    return { ok: false, result: { exitCode: 1 } };
  }
  const activePhase = assertSafePhaseSlug(state.activePhase);
  const draftPath = join(cwd, '.cadence/phases', activePhase, `${state.activeDraft}-DRAFT.md`);
  const draft = parseDraftMd(await readFile(draftPath, 'utf8'));

  const progPath = join(cwd, '.cadence/phases', activePhase, `${state.activeDraft}-PROGRESS.json`);
  const progress: ProgressJson = existsSync(progPath)
    ? (JSON.parse(await readFile(progPath, 'utf8')) as ProgressJson)
    : { draftId: state.activeDraft, tasks: {} };

  return { ok: true, data: { backend, state, activePhase, draftPath, draft, progress } };
}

/**
 * Concern 2 (phase 228 T1): the Phase 83 worktree-collision backstop —
 * re-check the active phase number against sibling worktrees + upstream only
 * (the `local` source is self: the active phase dir lives in this worktree),
 * catching the rare scaffold-race. A `settleService` precondition, NOT a
 * gate-matrix gate. `--allow-phase-collision` bypasses. Returns the refusal
 * `CommandResult` on collision, else `null` to continue.
 */
async function checkPhaseCollisionBackstop(
  cwd: string,
  activePhase: string,
  cadenceConfig: CadenceConfig,
  opts: SettleArgs,
  io: CommandIO,
): Promise<CommandResult | null> {
  const verdict = await assertNoPhaseCollision(cwd, phaseNumber(activePhase), {
    config: cadenceConfig ?? defaultConfig,
    excludeSources: ['local'],
    ...(opts.allowPhaseCollision !== undefined ? { allow: opts.allowPhaseCollision } : {}),
  });
  if (!verdict.ok) {
    io.err(verdict.message);
    return { exitCode: 1 };
  }
  return null;
}

/**
 * Phase 244 (T1): pure detector for rec-20260729-001 — `cadence settle run`
 * silently writing a downgraded SUMMARY (`schemaVersion: 1`, no `assurance`
 * record) when the process actually executing it is a globally-installed
 * `cadence` binary that predates this repo's own build, rather than this
 * checkout's `packages/core/bin/cadence.cjs` (confirmed on phases 233/234).
 * The two binaries report an IDENTICAL `--version` string on an unreleased
 * branch (unbumped `package.json` matches whatever is currently published),
 * so version comparison cannot detect the mismatch — DO NOT key detection on
 * it. This checks instead whether the binary that is actually executing
 * lives inside this repo's own git worktree.
 *
 * Deliberately pure: takes already-resolved facts as plain string/boolean
 * arguments — no `process`/filesystem access inside the function itself, per
 * this repo's pure-core/impure-shell convention (CLAUDE.md) — so it is
 * directly unit-testable without fixtures. Both `runningBinaryRealpath` and
 * `repoToplevel` are expected CANONICAL (symlink-resolved), not merely
 * absolute — `isPathInside` below only normalizes via `path.resolve`, which
 * does not follow symlinks, so a symlinked `repoToplevel` passed in
 * unresolved can produce a false mismatch against an already-realpath'd
 * binary. `resolveForeignBinaryFacts` (the wired caller, T2) realpaths both.
 * `repoHasOwnCadenceBuild` (does `repoToplevel` have both
 * `packages/core/bin/cadence.cjs` and `.cadence/` at its root — i.e. is this
 * recognizably the CADENCE monorepo itself, not a consumer project) is the
 * caller's other responsibility before calling in.
 *
 * Reports a mismatch ONLY when BOTH are true: the running binary sits
 * outside `repoToplevel`, AND the repo is recognizably CADENCE's own
 * monorepo. An ordinary consumer repo settling via a globally-installed
 * `cadence` is never a mismatch — `repoHasOwnCadenceBuild` gates that off
 * (244-01's first acceptance criterion's false-positive-avoidance case). A
 * binary resolved from inside `repoToplevel` is never a mismatch either,
 * regardless of `repoHasOwnCadenceBuild` (the true-positive case only fires
 * on the conjunction, not on either condition alone).
 *
 * Wired into `resolveSettleGateSet` below (T2) via `resolveForeignBinaryFacts`.
 */
export function detectForeignCadenceBinary(
  runningBinaryRealpath: string,
  repoToplevel: string,
  repoHasOwnCadenceBuild: boolean,
): boolean {
  if (!repoHasOwnCadenceBuild) {
    return false;
  }
  return !isPathInside(runningBinaryRealpath, repoToplevel);
}

/**
 * True when `candidate` resolves to a path at or under `root`. Both inputs
 * are expected already-absolute AND canonical/symlink-resolved (a realpath
 * and a realpath'd repo toplevel, per this module's callers) — `resolve()`
 * here only normalizes a trailing-slash difference between two already-
 * canonical paths; it does not follow symlinks, so feeding it an unresolved
 * symlinked path can produce a false result. It is not a promise to handle
 * relative inputs either (that would read `process.cwd()`, breaking this
 * function's purity). Containment is checked via `path.relative` (not a
 * naive `startsWith` string compare) so a sibling directory whose name
 * happens to share `root`'s prefix — e.g. candidate
 * `/repo-other/bin/cadence.cjs` against root `/repo` — is correctly reported
 * as outside rather than as a false "inside" match.
 */
function isPathInside(candidate: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Phase 244 (T2): resolves the two facts `detectForeignCadenceBinary` needs
 * beyond `repoToplevel` (already available to callers as `cwd`) — whether
 * `cwd` is recognizably CADENCE's own monorepo checkout (both
 * `packages/core/bin/cadence.cjs` and `.cadence/` present at its root), and
 * the running binary's realpath. Takes `argv1` as an explicit parameter
 * (never reads `process.argv` itself) so a test can pass any string —
 * including an unresolvable one — without needing to mutate global state.
 * The one caller that reads `process.argv` for real,
 * `resolveSettleGateSet` below, does so via its own `argv1` parameter's
 * default value, keeping that read in one place and overridable. Mirrors
 * `settleService` itself taking `repoRoot` instead of reading `process.cwd()`
 * (CLAUDE.md's pure-core/impure-shell split).
 *
 * Returns `null` whenever there is no mismatch to report — `argv1` is
 * missing/unresolvable (best-effort: an unresolvable path degrades to "no
 * mismatch", never a false alarm — CLAUDE.md's "Throwing Observer" convention
 * for introspection code), `cwd` doesn't look like CADENCE's own build, or
 * the running binary genuinely is inside `cwd` — so callers can use
 * `foreignBinaryMismatch ? { foreignBinaryMismatch } : {}` directly for the
 * `exactOptionalPropertyTypes`-safe SUMMARY spread, with no separate boolean
 * to keep in sync.
 *
 * `cwd` is best-effort realpath'd before the containment check (never
 * before the `repoHasOwnCadenceBuild` check — `existsSync` already follows
 * symlinks fine there): `detectForeignCadenceBinary` requires both its path
 * arguments canonical, and `argv1` already is (via `realpathSync` below), so
 * a symlinked `cwd` — e.g. `cadence mcp serve --repo` pointed through a
 * symlink — would otherwise compare a canonical binary path against a
 * non-canonical repo path and report a false mismatch for a settle that is
 * genuinely running this repo's own build. The *returned* `repoToplevel`
 * stays the original `cwd` (what the operator/caller actually passed), not
 * the realpath — this field is for a human/audit trail, and resolving fails
 * closed (falls back to the original `cwd`) rather than throwing, matching
 * this function's existing best-effort-degrade shape.
 */
export function resolveForeignBinaryFacts(
  cwd: string,
  argv1: string | undefined,
): { runningBinaryPath: string; repoToplevel: string } | null {
  const repoHasOwnCadenceBuild =
    existsSync(join(cwd, 'packages/core/bin/cadence.cjs')) && existsSync(join(cwd, '.cadence'));

  if (!argv1) return null;
  let runningBinaryRealpath: string;
  try {
    runningBinaryRealpath = realpathSync(argv1);
  } catch {
    return null;
  }

  let cwdCanonical = cwd;
  try {
    cwdCanonical = realpathSync(cwd);
  } catch {
    // Best-effort: fall back to the unresolved cwd rather than throwing.
  }

  if (!detectForeignCadenceBinary(runningBinaryRealpath, cwdCanonical, repoHasOwnCadenceBuild)) {
    return null;
  }
  return { runningBinaryPath: runningBinaryRealpath, repoToplevel: cwd };
}

type GateSetResolutionResult =
  | {
      ok: true;
      gateSet: ReturnType<typeof effectiveGateSet>;
      verifierOverride: { override: VerifierProvider } | Record<string, never>;
      foreignBinaryMismatch: { runningBinaryPath: string; repoToplevel: string } | null;
    }
  | { ok: false; result: CommandResult };

/**
 * Concern 3 (phase 228 T1): gate-set resolution + mock-verifier banner +
 * soft-cap precondition. Derives `effectiveGateSet`, warns via
 * `MOCK_FALLBACK_BANNER` whenever deep-verify will actually run under the
 * mock provider, and refuses (DESIGN.md §4 M2) on the auto×complex soft cap
 * unless `--allow-auto-complex` is set (in which case it warns instead).
 * Also returns `verifierOverride` — computed here from `opts.verifier` but
 * still needed by the (not-yet-extracted) `SettleContext` construction below
 * it in `settleService`.
 *
 * Phase 244 (T2): also resolves and reports the foreign-binary mismatch
 * (rec-20260729-001) here, right alongside `MOCK_FALLBACK_BANNER` — both are
 * settle-time "loud notice, never a refusal" banners keyed off facts
 * available at this exact point in the pipeline. Never refuses: matches this
 * repo's Quiet Fallback convention (a loud stderr banner + recorded SUMMARY
 * provenance, settle still completes) rather than a new refuse-and-suggest
 * gate — see 244-01's Boundaries.
 */
function resolveSettleGateSet(
  cwd: string,
  state: CadenceState,
  cadenceConfig: CadenceConfig,
  draft: Draft,
  opts: SettleArgs,
  io: CommandIO,
  argv1: string | undefined = process.argv[1],
): GateSetResolutionResult {
  const gateSet = effectiveGateSet(state, cadenceConfig, draft);

  // Phase 71: warn whenever the deep-verify gate will actually run in mock —
  // i.e. on the gate's real firing condition, not just explicit --deep. A
  // standard×complex settle runs deep-verify by membership; without this it
  // would run mock verification silently.
  const deepWillRun =
    (opts.deep === true || gateSet.gates.includes('deep-verify')) &&
    opts.auto !== false;
  // Phase 73: the `--verifier` override must reach the banner decision so it
  // reflects the *effective* provider (explicit `mock` still warns).
  const verifierOverride = opts.verifier ? { override: opts.verifier } : {};
  if (
    deepWillRun &&
    resolveEffectiveProvider(cadenceConfig?.verifier, verifierOverride)
      .provider === 'mock'
  ) {
    io.err(MOCK_FALLBACK_BANNER + '\n');
  }

  // Phase 244 (T2): rec-20260729-001 — settle is executing through a
  // `cadence` binary that resolves outside this repo's own checkout despite
  // the repo having its own local build.
  const foreignBinaryMismatch = resolveForeignBinaryFacts(cwd, argv1);
  if (foreignBinaryMismatch) {
    io.err(
      buildForeignBinaryBanner(
        foreignBinaryMismatch.runningBinaryPath,
        foreignBinaryMismatch.repoToplevel,
      ) + '\n',
    );
  }

  // DESIGN.md §4 M2 — soft cap on auto × complex.
  if (gateSet.softCap && !opts.allowAutoComplex) {
    io.err(
      'settle run refused: auto × complex is soft-capped (DESIGN.md §4 M2). Pass --allow-auto-complex to override.\n',
    );
    return { ok: false, result: { exitCode: 1 } };
  }
  if (gateSet.softCap && opts.allowAutoComplex) {
    io.err('settle: --allow-auto-complex set; proceeding past soft cap (auto × complex).\n');
  }

  return { ok: true, gateSet, verifierOverride, foreignBinaryMismatch };
}

/**
 * Concern 4 (phase 228 T2): `SettleContext` construction — the memoized
 * coverage/draft-mtime/diff closures, the deep/codeReview/securityAudit
 * verifier ports, and the emit/runner/prompter/codeReviewSidecar/io seams.
 * Verbatim extraction of the former `settleService` `ctx` object literal —
 * logic moved, not rewritten. `interactivity`, `explicitIds`, and
 * `touchedFiles` are computed by the caller and threaded in here rather than
 * recomputed; `interactivity` and `explicitIds` are also read outside `ctx`
 * elsewhere in `settleService`.
 */
function buildSettleContext(
  cwd: string,
  activePhase: string,
  state: CadenceState,
  draft: Draft,
  progress: ProgressJson,
  cadenceConfig: CadenceConfig,
  gateSet: ReturnType<typeof effectiveGateSet>,
  opts: SettleArgs,
  interactivity: ReturnType<typeof resolveInteractivity>,
  explicitIds: Set<string>,
  touchedFiles: string[],
  draftPath: string,
  verifierOverride: { override: VerifierProvider } | Record<string, never>,
  io: CommandIO,
): SettleContext {
  let coverageMemo: Promise<Map<string, VerifyTestRef[]>> | undefined;
  let draftMtimeMemo: Promise<number | null> | undefined;
  let deepVerifierMemo: ReturnType<typeof selectVerifier> | undefined;
  let codeReviewVerifierMemo: ReturnType<typeof selectCodeReviewVerifier> | undefined;
  let securityAuditVerifierMemo: ReturnType<typeof selectSecurityAuditVerifier> | undefined;
  let diffMemo: string | undefined;
  const codeReviewSidecarPath = join(
    cwd, '.cadence/phases', activePhase, `${state.activeDraft}-CODE-REVIEW.json`,
  );
  return {
    cwd,
    state,
    draft,
    progress,
    config: cadenceConfig,
    gateSet,
    opts: {
      ...(opts.force !== undefined ? { force: opts.force } : {}),
      ...(opts.auto !== undefined ? { auto: opts.auto } : {}),
      ...(opts.deep !== undefined ? { deep: opts.deep } : {}),
      ...(opts.allowMissingCoverage !== undefined ? { allowMissingCoverage: opts.allowMissingCoverage } : {}),
      ...(opts.allowVerifierFailure !== undefined ? { allowVerifierFailure: opts.allowVerifierFailure } : {}),
      ...(opts.allowStaleDraft !== undefined ? { allowStaleDraft: opts.allowStaleDraft } : {}),
      ...(opts.allowOpenTasks !== undefined ? { allowOpenTasks: opts.allowOpenTasks } : {}),
      ...(opts.allowFailingBuild !== undefined ? { allowFailingBuild: opts.allowFailingBuild } : {}),
      ...(opts.interactive !== undefined ? { interactive: opts.interactive } : {}),
      ...(opts.allowCodeReviewFailure !== undefined ? { allowCodeReviewFailure: opts.allowCodeReviewFailure } : {}),
      ...(opts.allowSecurityAuditFailure !== undefined ? { allowSecurityAuditFailure: opts.allowSecurityAuditFailure } : {}),
      ...(opts.allowSkillAuditMiss !== undefined ? { allowSkillAuditMiss: opts.allowSkillAuditMiss } : {}),
      ...(opts.allowBoundaryScanFailure !== undefined ? { allowBoundaryScanFailure: opts.allowBoundaryScanFailure } : {}),
    },
    interactivity,
    explicitIds,
    touchedFiles,
    coverage: () => {
      if (!coverageMemo) {
        const globs = cadenceConfig?.verification?.testGlobs;
        const mode = cadenceConfig?.verification?.coverageMode;
        // Phase 239 (T6): the shared scan is SCHEME-AWARE. Every consumer of
        // this thunk — the evidence derivation below, `gates/deep-verify.ts`,
        // `gates/interactive.ts` — must see the same AC↔test linkage the
        // test-coverage gate enforced. Before this, the thunk always scanned
        // bare, so under `phase-qualified` a settle could refuse an AC on
        // qualified matching while still crediting it `assertion` evidence
        // from a cross-phase bare token, and record that contradiction into
        // SUMMARY. The qualifier is the active draft id, matching
        // `gates/coverage.ts`. Map keys stay the bare `AC-N` id either way, so
        // no consumer's lookup changes.
        //
        // On an unusable draft id this contributes NO qualifier, which looks
        // like the silent bare fallback the gate explicitly refuses to make.
        // It is not, because it is unreachable: `settleService` refuses before
        // any gate runs when `state.activeDraft` is falsy, and
        // `derivePhaseTaskId` only ever mints `\d+-\d+`, which always matches
        // the regex below. Reaching this branch requires a hand-corrupted
        // `state.json`, and in that case `gates/coverage.ts` refuses loudly
        // first. If that precondition is ever weakened, this branch must gain
        // its own loud notice rather than quietly scanning bare — the two
        // branches resolving the same condition differently is the hazard.
        const scheme = cadenceConfig?.verification?.coverageScheme ?? 'bare';
        const activeDraft = state.activeDraft;
        const qualifier =
          scheme === 'phase-qualified' &&
          typeof activeDraft === 'string' &&
          /^[A-Za-z0-9._-]+$/.test(activeDraft)
            ? activeDraft
            : undefined;
        coverageMemo = scanTestCoverage(cwd, {
          ...(globs ? { globs } : {}),
          ...(mode ? { mode } : {}),
          ...(qualifier !== undefined ? { expectedQualifier: qualifier } : {}),
        });
      }
      return coverageMemo;
    },
    draftMtimeMs: () => {
      if (!draftMtimeMemo) {
        draftMtimeMemo = stat(draftPath)
          .then((s) => s.mtime.getTime())
          .catch(() => null);
      }
      return draftMtimeMemo;
    },
    diff: () => {
      if (diffMemo === undefined) {
        diffMemo = collectDiffForCodeReview(cwd, touchedFiles);
      }
      return diffMemo;
    },
    verifiers: {
      deep: {
        verify: (input) => {
          if (!deepVerifierMemo) {
            deepVerifierMemo = selectVerifier(cadenceConfig, { ...verifierOverride, cwd });
          }
          return deepVerifierMemo.verify(input);
        },
      },
      codeReview: {
        verify: (input) => {
          if (!codeReviewVerifierMemo) {
            codeReviewVerifierMemo = selectCodeReviewVerifier(cadenceConfig, { cwd });
          }
          return codeReviewVerifierMemo.verify(input);
        },
      },
      securityAudit: {
        verify: (input, opts) => {
          if (!securityAuditVerifierMemo) {
            securityAuditVerifierMemo = selectSecurityAuditVerifier(cadenceConfig, { cwd });
          }
          return securityAuditVerifierMemo.verify(input, opts);
        },
      },
    },
    emit: {
      anomalies: async (events) => {
        void events;
      },
      codeReviewHigh: (findings, info) =>
        emitCodeReviewHigh(selectNotifier(cadenceConfig), findings, info),
      codeReviewUnconverged: (info) =>
        emitCodeReviewUnconverged(selectNotifier(cadenceConfig), info),
      skillAuditMiss: (payload) =>
        emitSkillAuditMiss(selectNotifier(cadenceConfig), payload),
    },
    runner: {
      test: () => runTestCommand(cwd, cadenceConfig?.verification?.testCommand),
    },
    prompter: {
      create: () => createDefaultPrompter(),
    },
    codeReviewSidecar: {
      read: async () => {
        if (!existsSync(codeReviewSidecarPath)) {
          return { attemptsSoFar: 0, history: [] };
        }
        try {
          const prior = JSON.parse(await readFile(codeReviewSidecarPath, 'utf8'));
          return {
            attemptsSoFar: typeof prior.attempts === 'number' ? prior.attempts : 0,
            history: Array.isArray(prior.history) ? prior.history : [],
          };
        } catch {
          return { attemptsSoFar: 0, history: [] };
        }
      },
      write: (text) => atomicWriteText(codeReviewSidecarPath, text),
    },
    io: { err: (s) => io.err(s) },
  };
}

/**
 * Concern 5 (phase 228 T3): refusal-path SUMMARY, shared by four callers. A
 * refusing gate previously left zero durable evidence besides its own
 * ephemeral stderr line — `gates` was discarded and no SUMMARY was written.
 * Persist one now, to the same path the success path uses, with
 * `acResults: []` and no loop-state mutation: `state.loopPosition`/
 * `activeDraft` stay exactly where they were so a human can fix the refusal
 * cause and retry `settle run`. Verbatim extraction of the former
 * `settleService` gate-loop refusal branch — logic moved, not rewritten —
 * later reused unchanged by three more callers (phase 249):
 *
 * - **Gate-loop refusal** (`runSettleGates`): `gates` already correctly ends
 *   in the refused entry; `acResults: []` because nothing was ever
 *   evaluated before the halt; `collectAnomalies`/`runSkillAuditCheck`/
 *   recommendation-promotion are skipped because none of those has run yet
 *   at this point in `settleService`.
 * - **AC-derivation, anomaly/skill-audit, and evidence-floor refusals**
 *   (phase 249): all three fire *after* the gate loop completes, so here
 *   `gates` holds every gate's final `ran`/`skipped` entry (never a
 *   `refused` one — no gate itself refused). `collectAnomalies` has already
 *   run by the time the anomaly/skill-audit and evidence-floor refusals can
 *   fire. `acResults: []` on these three is a **deliberate discard**, not
 *   "never evaluated" — the AC-derivation/evidence-floor refusals compute
 *   real `acResults` internally before deciding to refuse, and this
 *   function intentionally does not receive or persist that work, matching
 *   the gate-loop refusal's shape exactly rather than inventing a richer
 *   record for only some refusal families.
 *
 * Phase 244 (T2): `foreignBinaryMismatch` is threaded in from the caller
 * (already computed by `resolveSettleGateSet`, which runs before every
 * refusal point that can reach this function) rather than re-resolved here
 * — a refused settle still writes a SUMMARY, and the same provenance
 * applies to it: if the running binary was foreign, that is just as true of
 * the refused attempt as it would be of a successful one.
 */
/**
 * Phase 239 (T6, AC-7): the coverage scheme/mode in force at settle, as a
 * spreadable fragment for both SUMMARY assembly sites. Emitted unconditionally
 * (both keys always present on new records) so a reader never has to guess
 * whether an absent field means "bare" or "written before phase 239" — absent
 * means pre-239, full stop. NOT read back out of a parsed SUMMARY anywhere
 * in this file — it is provenance at emission time here, not an input to
 * settle. It IS read back as an input elsewhere: `verify/phase-replay.ts`
 * branches its coverage-scan scoping on `summary.coverageScheme` (phase 239
 * T7). Don't simplify this emission on the assumption nothing reads it back.
 */
function coverageProvenance(cadenceConfig: CadenceConfig): {
  coverageScheme: 'bare' | 'phase-qualified';
  coverageMode: 'mention' | 'assertion';
} {
  return {
    coverageScheme: cadenceConfig?.verification?.coverageScheme ?? 'bare',
    coverageMode: cadenceConfig?.verification?.coverageMode ?? 'mention',
  };
}

/**
 * Phase 247 (T3/T4): the base filename (no extension) for a refused
 * settle's per-attempt sibling snapshot. Exported so tests can derive the
 * exact name settle.ts produces rather than hardcoding a copy that could
 * silently drift from the real naming scheme — a review of this phase
 * flagged that risk (two consumer-invisibility tests asserted against a
 * literal, not this function). Deliberately does NOT end in
 * `-SUMMARY.json`/`-SUMMARY.md`: `mcp/resources.ts`'s readdir+endsWith
 * SUMMARY discovery and `git/diff-strict.ts`'s `-SUMMARY\.json$` regex/
 * pathspec must never pick it up.
 */
export function refusedSnapshotArtifactBase(draftId: string, completedAt: string): string {
  const slug = completedAt.replace(/[:.]/g, '-');
  return `${draftId}-refused-${slug}-SUMMARY-snapshot`;
}

async function writeRefusedSettleSummary(
  cwd: string,
  activePhase: string,
  state: CadenceState,
  draft: Draft,
  progress: ProgressJson,
  gates: GateProvenance[],
  codeReviewFindings: SettleAccumulator['codeReview'],
  securityAuditFindings: SettleAccumulator['securityAudit'],
  cadenceConfig: CadenceConfig,
  foreignBinaryMismatch: { runningBinaryPath: string; repoToplevel: string } | null,
  now: () => string,
  io: CommandIO,
): Promise<CommandResult> {
  const refusedSummary: Summary = {
    schemaVersion: 2,
    draftId: state.activeDraft!,
    completedAt: now(),
    acResults: [],
    gates,
    taskResults: buildTaskResults(draft, progress),
    decisions: [],
    deferred: [],
    skillAudit: state.skillAudit,
    // Phase 239 (T6, AC-7): a refused settle writes a SUMMARY too, and the
    // scheme is exactly the context needed to interpret WHY a coverage gate
    // refused — so record it here as well, not only on the success path.
    ...coverageProvenance(cadenceConfig),
    // Phase 247 (T1, AC-1): `runSettleGates` merges each gate's
    // `summaryPatch` into `acc` BEFORE checking for a refusal
    // (`registry.ts`'s `mergeInto(acc, res)` runs ahead of the
    // `outcome === 'refuse'` short-circuit), so whatever code-review/
    // security-audit findings accumulated before the refusing gate halted
    // the loop are already sitting in `acc` by the time this function is
    // called — mirrors the success path's exact conditional-spread shape
    // (settle.ts's `finalizeAndCloseSettle`, `~1132`) instead of silently
    // dropping them as before this phase.
    ...(codeReviewFindings ? { codeReview: codeReviewFindings } : {}),
    ...(securityAuditFindings ? { securityAudit: securityAuditFindings } : {}),
    assurance: deriveSettleAssuranceRecord(gates, []),
    ...(foreignBinaryMismatch ? { foreignBinaryMismatch } : {}),
  };
  // Phase 247 (T1, AC-1): a contentHash is attached only when there is
  // something worth being tamper-evident about — at least one NON-EMPTY
  // findings collection. Deliberately NOT plain truthiness on the two
  // params above: `codeReviewFindings` can be `{}` (code-review ran, zero
  // findings) and `securityAuditFindings` can be `[]` (security-audit ran,
  // zero findings) — both truthy, neither worth hashing, and both reachable
  // on a refused settle (e.g. strict×complex: code-review passes clean,
  // security-audit is what refuses). A refusal where NEITHER gate recorded
  // any findings at all (both params `undefined` — e.g. a bare
  // build-test-must-pass refusal) keeps producing the exact same output as
  // before this phase: no `codeReview`/`securityAudit`/`contentHash` keys
  // at all. A refusal where one gate ran clean and a LATER gate refused
  // (e.g. `codeReview: {}` present, `securityAudit` is what refused) is new
  // relative to pre-phase-247 output, but per spec (AC-1 mirrors the
  // success path's conditional spread exactly) — only the "zero findings
  // anywhere" case is held byte-identical, not "no gate present."
  const hasCodeReviewFindings =
    codeReviewFindings !== undefined &&
    Object.values(codeReviewFindings).some((findings) => findings.length > 0);
  const hasSecurityAuditFindings =
    securityAuditFindings !== undefined && securityAuditFindings.length > 0;
  if (hasCodeReviewFindings || hasSecurityAuditFindings) {
    refusedSummary.contentHash = computeSummaryContentHash(refusedSummary);
  }
  const refusedSummaryBase = join(
    cwd, '.cadence/phases', activePhase, `${state.activeDraft}-SUMMARY`,
  );
  await atomicWriteJSON(`${refusedSummaryBase}.json`, refusedSummary);
  await atomicWriteText(`${refusedSummaryBase}.md`, renderSummaryMd(refusedSummary));

  // Phase 247 (T3, AC-2): an additive, best-effort per-attempt sibling —
  // written only when there is something worth being tamper-evident about
  // (identical condition to the contentHash attach above; a findings-free
  // refusal writes no sibling at all). Named so it deliberately does NOT end
  // in `-SUMMARY.json`/`-SUMMARY.md`: `mcp/resources.ts`'s readdir+endsWith
  // SUMMARY discovery and `git/diff-strict.ts`'s `-SUMMARY\.json$` regex/
  // pathspec must never pick it up (it's a `-SUMMARY-snapshot.json`/`.md`
  // pair, not a `-SUMMARY.json`/`.md` one). Reuses `refusedSummary.
  // completedAt` for the slug rather than calling `now()` a second time —
  // a second call could drift under the real clock and disagree with the
  // in-file timestamp. Written strictly AFTER the canonical write above has
  // already completed, and wrapped in try/catch matching the retro-digest
  // precedent (~1200) and the phase-242 finding-routing precedent (~1216):
  // a sibling-write failure can never affect the canonical record already on
  // disk, and never changes settle's exit code.
  if (hasCodeReviewFindings || hasSecurityAuditFindings) {
    try {
      const snapshotBase = join(
        cwd, '.cadence/phases', activePhase,
        refusedSnapshotArtifactBase(state.activeDraft!, refusedSummary.completedAt),
      );
      await atomicWriteJSON(`${snapshotBase}.json`, refusedSummary);
      await atomicWriteText(`${snapshotBase}.md`, renderSummaryMd(refusedSummary));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      io.err(`note: refused-settle sibling snapshot failed to write — ${msg}\n`);
    }
  }

  return { exitCode: 1 };
}

/** Data threaded out of {@link deriveSettleAcResults} into the concerns below. */
interface AcDerivationData {
  acResults: AcResult[];
  coverageBypassed: boolean;
  interactiveVerify: SettleAccumulator['interactiveVerify'];
  interactiveVerifySkipped: SettleAccumulator['interactiveVerifySkipped'];
  deepVerify: SettleAccumulator['deepVerify'];
  deepVerifyMeta: SettleAccumulator['deepVerifyMeta'];
  verifierFailure: SettleAccumulator['flags']['verifierFailure'];
  codeReviewFindings: SettleAccumulator['codeReview'];
  securityAuditFindings: SettleAccumulator['securityAudit'];
  boundaryScan: SettleAccumulator['boundaryScan'];
}

type AcDerivationResult =
  | { ok: true; data: AcDerivationData }
  | { ok: false; result: CommandResult };

/**
 * Concern 6 (phase 228 T3): AC-result derivation — the `--auto`/interactive
 * merge logic. Pulls `deepVerify`/`interactiveVerify`/etc. off `acc`, builds
 * `acResults` from the explicit verdicts plus any interactive verdicts, then
 * (when `opts.auto || interactiveRequested`) calls `deriveAcResults`, refuses
 * on any offender lacking `--force`, and merges the auto-derived verdicts
 * into the final `acResults`. Verbatim extraction of the former
 * `settleService` body between the gate loop and anomaly collection — logic
 * moved, not rewritten.
 */
function deriveSettleAcResults(
  acc: SettleAccumulator,
  draft: Draft,
  progress: ProgressJson,
  explicit: AcResult[],
  explicitIds: Set<string>,
  gateSet: ReturnType<typeof effectiveGateSet>,
  opts: SettleArgs,
  io: CommandIO,
): AcDerivationResult {
  const coverageBypassed = acc.flags.coverageBypassed === true;

  // Deliberately NOT the same predicate as gates/interactive.ts's
  // isInteractiveRequested (Phase 140) — this omits the `auto !== false`
  // clause because it's `||`'d with `opts.auto` at the call site below.
  // Do not "DRY" these together; they answer different questions.
  const interactiveRequested =
    opts.interactive === true ||
    (opts.interactive !== false && gateSet.gates.includes('interactive-verdict'));
  const interactiveVerify = acc.interactiveVerify;
  const interactiveVerifySkipped = acc.interactiveVerifySkipped;
  const deepVerify = acc.deepVerify;
  const deepVerifyMeta = acc.deepVerifyMeta;
  const verifierFailure = acc.flags.verifierFailure;
  const codeReviewFindings = acc.codeReview;
  const securityAuditFindings = acc.securityAudit;
  const boundaryScan = acc.boundaryScan;

  const interactiveIds = new Set(interactiveVerify ? Object.keys(interactiveVerify) : []);
  const userVerdictedIds = new Set([...explicitIds, ...interactiveIds]);

  let acResults: AcResult[] = [...explicit];
  if (interactiveVerify) {
    for (const [id, v] of Object.entries(interactiveVerify)) {
      if (explicitIds.has(id)) continue;
      acResults.push({
        id,
        pass: v.verdict === 'pass',
        ...(v.note ? { note: v.note } : {}),
      });
    }
  }
  if (opts.auto || interactiveRequested) {
    const derived = deriveAcResults(draft, progress as ProgressFile);
    const offenders = derived.filter(
      (d) => d.verdict !== 'pass' && !userVerdictedIds.has(d.id),
    );
    if (offenders.length > 0 && !opts.force) {
      for (const o of offenders) {
        const tasks = o.blockers.length > 0 ? ` (tasks: ${o.blockers.join(', ')})` : '';
        io.err(`auto: ${o.id} ${o.verdict}${tasks}\n`);
      }
      io.err('settle run --auto refused: complete the blocking tasks or rerun with --force.\n');
      return { ok: false, result: { exitCode: 1 } };
    }
    const merged: AcResult[] = [...acResults];
    for (const d of derived) {
      if (userVerdictedIds.has(d.id)) continue;
      if (d.verdict === 'pass') {
        merged.push({ id: d.id, pass: true });
      } else if (d.verdict === 'blocked') {
        merged.push({ id: d.id, pass: false, note: `auto: ${d.blockers.join(', ')} blocked` });
      } else if (d.verdict === 'needs-context') {
        merged.push({ id: d.id, pass: false, note: `auto: ${d.blockers.join(', ')} needs context` });
      } else {
        merged.push({
          id: d.id,
          pass: false,
          note: d.blockers.length > 0 ? `auto: ${d.blockers.join(', ')} incomplete` : 'auto: no linked tasks',
        });
      }
    }
    acResults = merged;
  }

  return {
    ok: true,
    data: {
      acResults,
      coverageBypassed,
      interactiveVerify,
      interactiveVerifySkipped,
      deepVerify,
      deepVerifyMeta,
      verifierFailure,
      codeReviewFindings,
      securityAuditFindings,
      boundaryScan,
    },
  };
}

type AnomalyAndSkillAuditResult =
  | { ok: true; anomalies: AnomalyEvent[]; gateBypasses: GateBypass[] }
  | { ok: false; result: CommandResult };

/**
 * Concern 7 (phase 228 T3): anomaly collection + notify + skill-audit check.
 * Runs `collectAnomalies`, derives `gateBypasses` from them (with the stderr
 * bypass lines), dispatches the `anomaly-notify` gate's `notifier.notify`
 * (best-effort, logged on failure), and runs `runSkillAuditCheck`, refusing
 * on its `refuse` outcome or else recording `state.skillAudit.required`.
 * Verbatim extraction of the former `settleService` body between AC-result
 * derivation and evidence derivation — logic moved, not rewritten.
 */
async function runAnomalyAndSkillAuditChecks(
  ctx: SettleContext,
  draft: Draft,
  progress: ProgressJson,
  cwd: string,
  cadenceConfig: CadenceConfig,
  gateSet: ReturnType<typeof effectiveGateSet>,
  opts: SettleArgs,
  state: CadenceState,
  coverageBypassed: boolean,
  deepVerify: SettleAccumulator['deepVerify'],
  interactiveVerify: SettleAccumulator['interactiveVerify'],
  verifierFailure: SettleAccumulator['flags']['verifierFailure'],
  io: CommandIO,
): Promise<AnomalyAndSkillAuditResult> {
  const anomalies = collectAnomalies({
    draft,
    progress,
    coverageBypassed,
    force: opts.force === true,
    root: cwd,
    autoComplexOverride: gateSet.softCap && opts.allowAutoComplex === true,
    ...(deepVerify ? { deepVerify } : {}),
    ...(interactiveVerify ? { interactiveVerify } : {}),
    ...(verifierFailure ? { verifierFailure } : {}),
  });
  const gateBypasses = gateBypassesFromAnomalies(anomalies);
  for (const bypass of gateBypasses) {
    io.err(`settle bypass [${bypass.severity}] ${bypass.gate}: ${bypass.reason} (${bypass.flag})\n`);
  }

  if (gateSet.gates.includes('anomaly-notify')) {
    if (anomalies.length > 0) {
      const notifier = selectNotifier(cadenceConfig);
      try {
        await notifier.notify(anomalies);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        io.err(`notify: ${notifier.name} transport failed — ${msg} (continuing)\n`);
      }
    }
  }

  {
    const res = await runSkillAuditCheck(ctx);
    if (res.outcome === 'refuse') {
      return { ok: false, result: { exitCode: 1 } };
    }
    state.skillAudit.required = res.effectiveRequired;
  }

  return { ok: true, anomalies, gateBypasses };
}

interface EvidenceFloorData {
  acResultsWithEvidence: AcResult[];
  evidenceFloorBypassesUsed: GateBypass[];
  /**
   * Phase 274 (code-review finding, gap fix): every AC id excluded from
   * off-ladder reporting — the union of the deep-verify marker
   * (`isUnobservableAc`) and, on a verifier-failure run, direct
   * re-classification (the marker is never set by `deep-verify.ts`'s catch
   * branch). Computed once here over every AC (not just PASS ones —
   * `finalizeAndCloseSettle`'s assurance derivation tallies every AC
   * regardless of pass/fail), so the evidence-floor check below and
   * assurance's `evidenceTally`/`overall` can never drift out of sync again
   * the way they did before this fix (floor correctly excluded a
   * catch-branch-classified AC; assurance still counted it as
   * `'unverified'`).
   */
  offLadderExcludedIds: ReadonlySet<string>;
}

type EvidenceFloorResult =
  | { ok: true; data: EvidenceFloorData }
  | { ok: false; result: CommandResult };

/**
 * Concern 8 (phase 228 T3): evidence derivation + evidence-floor gate.
 * Derives the strongest evidence per AC via `deriveAcEvidence` (Phase 140,
 * no new I/O beyond the already-memoized `ctx.coverage()`), then refuses
 * settle when any AC's PASS verdict rests on evidence weaker than the
 * effective `gates.evidenceFloor` (Phase 214) — unless a per-AC
 * `--evidence-floor-bypass AC-id:reason` exempts it, in which case the
 * exemption is recorded into `evidenceFloorBypassesUsed` for SUMMARY
 * auditability instead of refusing. Verbatim extraction of the former
 * `settleService` body between the skill-audit check and the
 * `stateAtSettle` snapshot — logic moved, not rewritten.
 */
async function deriveEvidenceAndCheckFloor(
  ctx: SettleContext,
  cadenceConfig: CadenceConfig,
  acc: SettleAccumulator,
  acResults: AcResult[],
  deepVerify: SettleAccumulator['deepVerify'],
  evidenceFloorBypassById: Map<string, string>,
  io: CommandIO,
): Promise<EvidenceFloorResult> {
  // Phase 140: strongest evidence per AC, derived from data the gate loop
  // already produced — no new I/O. `ctx.coverage()` is memoized so this is a
  // cache hit when the test-coverage gate already ran (common case), but may be
  // the first scan if that gate was skipped (e.g., --allow-missing-coverage,
  // --auto=false, or a tier×profile without test-coverage in its gate set).
  const coverageForEvidence = await ctx.coverage();
  const coverageModeForEvidence = cadenceConfig?.verification?.coverageMode ?? 'mention';
  const buildTestRan = acc.buildTestRan !== false;
  // Phase 274 (T5, D-H): `deriveAcEvidence` returns `undefined` — off the
  // `AcEvidenceZ` ladder entirely — for a classifier-marked-unobservable AC
  // (`isUnobservableAc`). `exactOptionalPropertyTypes` forbids assigning
  // `evidence: undefined` directly (that's a distinct, disallowed state from
  // "key absent"), so the field is included only when a real ladder value
  // was derived — never explicitly set to `undefined`.
  const acResultsWithEvidence: AcResult[] = acResults.map((r) => {
    const evidence = deriveAcEvidence(r.id, coverageForEvidence, coverageModeForEvidence, buildTestRan, deepVerify);
    return { ...r, ...(evidence !== undefined ? { evidence } : {}) };
  });

  // Phase 214 (T4): the evidence-floor gate — refuses settle when any AC's
  // PASS verdict rests on evidence weaker than the effective
  // `gates.evidenceFloor`. Only PASS verdicts carry an evidentiary claim
  // worth checking; a fail/blocked AC isn't asserting anything the floor
  // needs to back up. `--evidence-floor-bypass AC-id:reason` exempts
  // exactly the named AC (never all of them) — an offender with a bypass
  // is dropped from the refusal, but recorded into SUMMARY.gateBypasses so
  // the exemption is auditable.
  //
  // Phase 274 (T5, D-H): a classifier-marked-unobservable AC is additionally
  // excluded here — never evaluated against the floor at all, regardless of
  // its `pass` verdict. This is load-bearing, not defensive: `acResults[].
  // pass` is derived from task linkage/terminal-status (`deriveAcResults`,
  // `status.ts`) or an explicit/interactive human verdict
  // (`parseAcArg`/`mergePassShorthands`/`interactiveVerify` — all in this
  // file), never from `deepVerify`. An unobservable AC with a task-derived
  // `pass:false` (the common no-linked-task shape, e.g. phase 272's real
  // AC-7) would already be filtered out by `.filter((r) => r.pass)` alone —
  // but an explicit `--ac <id>=pass` / `--ac-pass <id>` / interactive `pass`
  // verdict sets `pass:true` independent of task linkage, and would
  // otherwise reach `checkEvidenceFloor` with zero coverage refs, derive
  // `'unverified'` evidence, and refuse settle under a floor like
  // `'assertion'` — exactly the hazard D-H exists to prevent.
  // `checkEvidenceFloor` also guards this itself (skips any entry with
  // `unobservable: true`), but the exclusion belongs here too rather than
  // relying solely on that inner guard.
  //
  // Gap closed post-T5 (independent review, same phase): the exclusion above
  // only fires when `deepVerify[id].unobservable` was actually set — but
  // `gates/deep-verify.ts`'s catch branch (verifier transport failure +
  // `--allow-verifier-failure`) marks EVERY AC `pass:false` WITHOUT that
  // marker, deliberately: a transport failure means nothing was checked for
  // ANY AC, and selectively exempting some would misrepresent
  // `notify/collect.ts`'s honesty report (left untouched on purpose). So an
  // AC that is both genuinely unobservable and explicitly overridden to pass
  // (`--ac <id>=pass` — the only way `pass:true` reaches here off a
  // catch-branch verdict) still lands with `unobservable` unset. When this
  // run actually hit that branch (`acc.flags.verifierFailure`), classify
  // each surviving PASS AC's text directly instead of trusting the marker —
  // same D-H hazard, reached through the one path the marker can't cover.
  // Unlike the marker-present exclusion above, this path leaves no trace in
  // `deepVerify`/`acResults` at all (both are deliberately untouched here —
  // see the Do NOT list), so it needs its own stderr notice per AC excluded,
  // matching this codebase's "every fallback/auto-bypass is loud" convention
  // (`deep-verify.ts:100-103`'s analogous `not counted as an offender` line).
  const evidenceFloor = effectiveEvidenceFloor(cadenceConfig);
  const verifierFailure = acc.flags.verifierFailure;
  const draftAcById = new Map(ctx.draft.acceptanceCriteria.map((a) => [a.id, a]));
  // Computed once, over every AC (not just PASS ones — see the
  // `EvidenceFloorData.offLadderExcludedIds` doc comment above for why),
  // so the evidence-floor check just below and `finalizeAndCloseSettle`'s
  // later assurance derivation both read from the same exclusion set.
  const offLadderExcludedIds = new Set<string>();
  for (const r of acResultsWithEvidence) {
    if (isUnobservableAc(r.id, deepVerify)) {
      offLadderExcludedIds.add(r.id);
      continue;
    }
    if (!verifierFailure) continue;
    const ac = draftAcById.get(r.id);
    if (!ac) continue;
    const acText = [ac.given, ac.when, ac.then].join('\n');
    const refs = coverageForEvidence.get(r.id) ?? [];
    const verdict = classifyAcObservability({ id: r.id, text: acText }, refs);
    if (!verdict.observable) {
      offLadderExcludedIds.add(r.id);
      io.err(
        `settle: ${r.id} excluded from off-ladder reporting (evidence floor + assurance) — ` +
          `structurally unobservable during a verifier-failure run: ${verdict.reason}\n`,
      );
    }
  }
  const floorInput = acResultsWithEvidence.filter(
    (r) => r.pass && !offLadderExcludedIds.has(r.id),
  );
  const floorCheck = checkEvidenceFloor(floorInput, evidenceFloor);
  const evidenceFloorBypassesUsed: GateBypass[] = [];
  if (floorCheck.outcome === 'refuse') {
    const remaining = floorCheck.offenders.filter((o) => !evidenceFloorBypassById.has(o.id));
    for (const o of floorCheck.offenders) {
      const reason = evidenceFloorBypassById.get(o.id);
      if (reason === undefined) continue;
      evidenceFloorBypassesUsed.push({
        gate: `evidence-floor:${o.id}`,
        flag: '--evidence-floor-bypass',
        reason,
        severity: 'warn',
      });
      io.err(
        `settle bypass [warn] evidence-floor:${o.id}: ${reason} (--evidence-floor-bypass)\n`,
      );
    }
    if (remaining.length > 0) {
      const detail = remaining
        .map((o) => `${o.id} is '${o.actual}', requires '${o.required}'`)
        .join('; ');
      const genericReason =
        `settle run refused: evidence-floor requires at least '${evidenceFloor}' evidence for every AC, but ${detail}. ` +
        'Strengthen the evidence (add/execute a qualifying test, or run a real deep-verify pass) or ' +
        'apply a named, reason-required per-AC bypass (--evidence-floor-bypass AC-id:reason), then re-settle.';
      // Phase 214 (T3): when the floor is 'ai-verified' under the mock
      // provider, that evidence level is structurally unreachable (Phase
      // 140 never counts a mock pass as ai-verified) — name that instead
      // of the generic below-floor message, or every settle refuses
      // forever with no hint why.
      io.err(`${evidenceFloorRefusalReason(evidenceFloor, cadenceConfig, genericReason)}\n`);
      return { ok: false, result: { exitCode: 1 } };
    }
  }

  return { ok: true, data: { acResultsWithEvidence, evidenceFloorBypassesUsed, offLadderExcludedIds } };
}

/**
 * Concerns 9 + 10 (phase 228 T4): summary build + write + retro digest +
 * recommendation ship-promotion, then the state commit to IDLE + post-commit
 * retro offer + final success result. Combined into one function rather than
 * two because `retroDigest` is built partway through concern 9 and consumed
 * again in concern 10 — splitting them would only mean threading it back out
 * through `settleService` and back in. The ordering within is unchanged and
 * load-bearing: the Phase 174 comment below explains why `runRetroOffer` must
 * run strictly *after* `backend.commit(state)`, not before or interleaved.
 * Verbatim extraction of the former `settleService` tail — logic moved, not
 * rewritten.
 *
 * Phase 244 (T2): `foreignBinaryMismatch` (already computed by
 * `resolveSettleGateSet`, before the gate loop) is attached onto `summary`
 * before `computeSummaryContentHash` runs, so a mismatch is covered by the
 * content-hash digest like every other field, not silently excluded from it.
 */
async function finalizeAndCloseSettle(
  cwd: string,
  activePhase: string,
  backend: SimpleStateBackend,
  state: CadenceState,
  draft: Draft,
  progress: ProgressJson,
  gates: GateProvenance[],
  acResultsWithEvidence: AcResult[],
  deepVerify: SettleAccumulator['deepVerify'],
  deepVerifyMeta: SettleAccumulator['deepVerifyMeta'],
  interactiveVerify: SettleAccumulator['interactiveVerify'],
  interactiveVerifySkipped: SettleAccumulator['interactiveVerifySkipped'],
  codeReviewFindings: SettleAccumulator['codeReview'],
  securityAuditFindings: SettleAccumulator['securityAudit'],
  boundaryScan: SettleAccumulator['boundaryScan'],
  gateBypasses: GateBypass[],
  evidenceFloorBypassesUsed: GateBypass[],
  cadenceConfig: CadenceConfig,
  opts: SettleArgs,
  interactivity: ReturnType<typeof resolveInteractivity>,
  io: CommandIO,
  foreignBinaryMismatch: { runningBinaryPath: string; repoToplevel: string } | null,
  now: () => string,
  offLadderExcludedIds: ReadonlySet<string>,
): Promise<CommandResult> {
  // issue #177: snapshot loop state as it stands DURING settle, before the
  // reset-to-IDLE block below mutates it. This is the only place this data
  // is durably recorded now that state.json/STATE.md are gitignored — see
  // the field's doc comment in packages/types/src/summary.ts.
  const stateAtSettle = {
    loopPositionBeforeSettle: state.loopPosition,
    revision: state.revision,
    sessionSubagentSpawns: state.session.subagentSpawns,
  };

  const summary: Summary = {
    schemaVersion: 2,
    draftId: state.activeDraft!,
    completedAt: now(),
    acResults: acResultsWithEvidence,
    gates,
    taskResults: buildTaskResults(draft, progress),
    decisions: [],
    deferred: [],
    skillAudit: state.skillAudit,
    ...coverageProvenance(cadenceConfig),
    ...(deepVerify ? { deepVerify } : {}),
    ...(deepVerifyMeta ? { deepVerifyMeta } : {}),
    ...(interactiveVerify ? { interactiveVerify } : {}),
    ...(interactiveVerifySkipped ? { interactiveVerifySkipped } : {}),
    ...(codeReviewFindings ? { codeReview: codeReviewFindings } : {}),
    ...(securityAuditFindings ? { securityAudit: securityAuditFindings } : {}),
    ...(boundaryScan ? { boundaryScan } : {}),
    ...(gateBypasses.length + evidenceFloorBypassesUsed.length > 0
      ? { gateBypasses: [...gateBypasses, ...evidenceFloorBypassesUsed] }
      : {}),
    stateAtSettle,
    // Phase 274 (T5→T4 gap fix, whole-branch review, then a code-review
    // finding): `acResultsWithEvidence` is `summary.acResults` verbatim
    // above (every AC, unobservable included — that field must stay
    // complete). `deriveAssuranceRecord` itself stays agnostic and correct:
    // it tallies whatever array it's handed. The bug was here, at the call
    // site — the full array was passed in, so an off-ladder AC's absent
    // `evidence` fell into the `?? 'unverified'` default and inflated
    // `evidenceTally`/`overall` exactly like a real failure would.
    // `offLadderExcludedIds` (computed once in `deriveEvidenceAndCheckFloor`,
    // covering BOTH the marker-based exclusion and the verifier-failure
    // catch-branch's direct re-classification — a first version of this fix
    // used only `isUnobservableAc` here and missed the catch-branch case,
    // caught by code-review) filters it out, making `evidenceTally`'s sum
    // mean "total OBSERVABLE ACs," consistent with D-H's off-ladder
    // placement everywhere else.
    // Phase 283 (283-01, T3): `gateBypasses` (this function's own parameter,
    // above) and `deepVerify` (this function's own parameter too) are both
    // already in local scope — threaded through verbatim as the third
    // argument so D-S/D-R can see them. `evidenceFloorBypassesUsed` is
    // deliberately NOT included here: every entry it ever contains is
    // hardcoded `severity: 'warn'` (`~line 1262` above), so it can never
    // trigger D-S's error-severity cap and folding it in would only add a
    // reader's doubt, not a behavior change. `exactOptionalPropertyTypes` is
    // on, so `deepVerify` — typed `Record<string, DeepVerdict> | undefined`
    // — needs the same conditional-spread shape already used a few lines up
    // for the SUMMARY's own `deepVerify` field, rather than a direct
    // assignment.
    assurance: deriveSettleAssuranceRecord(
      gates,
      acResultsWithEvidence.filter((r) => !offLadderExcludedIds.has(r.id)),
      {
        gateBypasses,
        ...(deepVerify ? { deepVerify } : {}),
      },
    ),
    ...(foreignBinaryMismatch ? { foreignBinaryMismatch } : {}),
  };

  // Phase 223 (T2): compute the content hash over `summary` as built above
  // (before this field is attached) and attach it — the digest never
  // includes `contentHash` itself, so it is always computed first.
  summary.contentHash = computeSummaryContentHash(summary);

  const summaryBase = join(cwd, '.cadence/phases', activePhase, `${state.activeDraft}-SUMMARY`);
  await atomicWriteJSON(`${summaryBase}.json`, summary);
  await atomicWriteText(`${summaryBase}.md`, renderSummaryMd(summary));

  // Phase 174: friction digest, purely derived from `summary` above — no
  // extra I/O. Best-effort: never blocks or fails settle. The digest is
  // kept in-memory regardless of whether the write below succeeds, so the
  // post-commit offer (below) can still use it even if the file write failed.
  let retroDigest: ReturnType<typeof buildRetroDigest> | undefined;
  try {
    retroDigest = buildRetroDigest(summary);
    if (cadenceConfig?.retro.enabled !== false) {
      await writeRetroArtifacts(retroDigest, {
        cwd,
        activePhase,
        draftId: state.activeDraft!,
        io,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.err(`note: retro artifact failed to write — ${msg}\n`);
  }

  // Phase 242 (T3, §7.3): route identified code-review findings into the
  // recommendation ledger as `source: 'review'` recs. Best-effort — matches
  // the retro-digest block above exactly: a failure here (e.g. a ledger
  // write error) never blocks or fails settle, and is never silent (AC-5).
  // Config-gated on `recommendations.autoRoute` (default on, same precedent
  // as `autoArchive` below). Skipped entirely when the code-review gate
  // didn't run at all (`codeReviewFindings` is `undefined` — never for the
  // gate having run with zero findings, which is `{}` and derives to no
  // candidates anyway) — no ledger read for a settle that never ran the gate.
  if (cadenceConfig?.recommendations.autoRoute !== false && codeReviewFindings) {
    try {
      const routingLedger = await readRecommendationLedger(cwd);
      // AC-2: a previously-routed finding can already be soft-archived
      // (`autoArchive` defaults on) by the time this phase is re-settled —
      // check BOTH arrays, or a re-settle would silently re-route it.
      const alreadyRoutedIds = new Set<string>();
      for (const rec of routingLedger.recommendations) {
        if (rec.sourceFindingId) alreadyRoutedIds.add(rec.sourceFindingId);
      }
      for (const rec of routingLedger.archived) {
        if (rec.sourceFindingId) alreadyRoutedIds.add(rec.sourceFindingId);
      }
      const pointer: RoutingSettlePointer = {
        phaseId: activePhase,
        draftId: summary.draftId,
        contentHash: summary.contentHash?.value ?? '',
        // Repo-relative, forward-slash artifact path — matches the existing
        // `kind: 'file'` Evidence.path convention elsewhere in the ledger
        // (e.g. `src/foo.ts`), not an absolute filesystem path.
        summaryPath: `.cadence/phases/${activePhase}/${state.activeDraft}-SUMMARY.json`,
      };
      const candidates = deriveRoutingCandidates(
        codeReviewFindings,
        alreadyRoutedIds,
        pointer,
        new Date(),
      );
      // Sequential, not Promise.all: addRecommendation re-reads the ledger
      // and mints the next id from what it read each call — concurrent
      // writes would collide ids and lose writes.
      for (const candidate of candidates) {
        await addRecommendation(cwd, candidate);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      io.err(`note: finding-ledger routing failed — ${msg}\n`);
    }
  }

  // Phase 145: advance any recommendation converted into the phase that just
  // settled to `settle-pending` (visible, not archived — a reminder to confirm
  // shipping). Best-effort + config-gated (`recommendations.autoArchive`,
  // default on, the same flag phase 102 used) — a failure here never blocks or
  // fails the settle. Replaces phase 102's auto-archive-on-settle behavior.
  const settledPhase = state.activePhase!;
  if (cadenceConfig?.recommendations.autoArchive !== false) {
    try {
      if (opts.shipRef) {
        // Phase 148: --ship-ref shortcut. Promote every `converted` rec
        // targeting this phase straight to `shipped` instead of the default
        // settle-pending advance, reusing the existing tested
        // `converted → shipped` transition (no new transition logic).
        const ledger = await readRecommendationLedger(cwd);
        const shipTargets = ledger.recommendations.filter(
          (r) => r.status === 'converted' && r.convertedToPhaseId === settledPhase,
        );
        for (const rec of shipTargets) {
          const res = await runRecommendationPromotion(cwd, rec.id, {
            status: 'shipped',
            shippedRef: opts.shipRef,
          });
          if (res.ok) {
            io.out(`recommendation ${rec.id} moved to shipped (--ship-ref)\n`);
          }
        }
      } else {
        const settlePendingRecIds = await runAdvanceConvertedToSettlePendingForPhase(
          cwd,
          settledPhase,
        );
        for (const rid of settlePendingRecIds) {
          io.out(`recommendation ${rid} moved to settle-pending (converted phase settled)\n`);
        }
      }
    } catch (err) {
      // best-effort: leave the rec untouched, keep settling.
      const msg = err instanceof Error ? err.message : String(err);
      io.err(`note: converted-recommendation advance failed — ${msg}\n`);
    }
  }

  const draftId = state.activeDraft!;
  state.openDrafts = state.openDrafts.filter((d) => d.id !== draftId);
  state.activeDraft = null;
  state.activeTask = null;
  state.loopPosition = 'IDLE';
  state.tier = null;
  await backend.commit(state);
  io.out(`Settled ${draftId}\n`);

  // Phase 174: the interactive GitHub-issue offer runs AFTER the state
  // commit, deliberately — an open prompt sitting between the SUMMARY write
  // and the commit would let a Ctrl-C strand the loop mid-BUILD despite a
  // SUMMARY already existing, and could collide with the optimistic-
  // concurrency revision check (Phase 173) on settle's own final commit.
  // By this point IDLE is already durable; nothing below can undo it.
  if (retroDigest) {
    try {
      await runRetroOffer(retroDigest, {
        cwd,
        activePhase,
        draftId,
        io,
        interactivity,
        isRealTTY: Boolean(process.stdin.isTTY),
        createPrompter: createDefaultPrompter,
        cadenceConfig,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      io.err(`note: retro issue offer failed — ${msg}\n`);
    }
  }

  return { exitCode: 0, data: { settled: draftId, acResults: acResultsWithEvidence } };
}

/**
 * Phase 275 (275-01, T4): surfaces per-task-verify's already-persisted
 * per-task provenance (`progress.tasks[id].perTaskVerify`, populated during
 * BUILD by `recordTaskOutcome`) into `gates[]` — one entry per task
 * execution, keyed by `taskId` so distinct tasks running under different
 * providers are never collapsed into a single row (unlike
 * `verifierRollup`'s distinct-pair fold one layer up). `observedProvider`/
 * `observedModel` are used (not `provider`/`model`) so
 * `deriveAssuranceRecord`'s rollup fold stays structurally blind to these
 * entries (see `dec-20260808-008`/`dec-20260811-002`). `status: 'ran'` is
 * recorded uniformly for `pass`/`concerns`/`refuse`-bypassed verdicts alike
 * — an unbypassed refuse never reaches PROGRESS.json at all, so every
 * refuse-shaped record here already carries `bypassed: true`; the audit
 * trail for the bypass itself lives in `gateBypasses[]`, a distinct
 * mechanism this helper does not touch.
 */
function perTaskVerifyGateEntries(progress: ProgressJson): GateProvenance[] {
  const entries: GateProvenance[] = [];
  for (const [taskId, task] of Object.entries(progress.tasks)) {
    const record: PerTaskVerifyRecord | undefined = task.perTaskVerify;
    if (!record) continue;
    entries.push({
      gate: 'per-task-verify',
      status: 'ran',
      taskId,
      observedProvider: record.provider,
      ...(record.model ? { observedModel: record.model } : {}),
    });
  }
  return entries;
}

/**
 * `cadence settle run` — close the loop: run the settle gate stack, write
 * SUMMARY.{json,md}, and return to IDLE. Faithful extraction of the former CLI
 * action body (process streams + exit code routed through `io`/the result).
 */
export async function settleService(
  repoRoot: string,
  opts: SettleArgs,
  io: CommandIO,
): Promise<CommandResult> {
  const cwd = repoRoot;
  try {
    const preconditionResult = await loadSettlePreconditions(cwd, io);
    if (!preconditionResult.ok) return preconditionResult.result;
    const { backend, state, activePhase, draftPath, draft, progress } = preconditionResult.data;

    // Phase 288 (288-01, T3): a genuinely-empty AC set (parses fine, no
    // malformed heading — that's a separate parse-time failure, T1) is
    // schema-legal (D-AD) and settle must still be able to complete for
    // one. But left unflagged, `acResults: []` sails through
    // structural-verifier / test-coverage / evidence-floor / the
    // completeness check with nothing to check, and `settle run --auto`
    // exits 0 with an `assurance.overall` verdict that reads as an
    // unqualified pass. Fire this as early as `draft` is available — one
    // shared `settleService` handles BOTH `settle run --auto` and
    // interactive settle (there is no separate interactive entry point in
    // this file; `opts.auto` only changes downstream branching), so this
    // single call site covers both. Unconditional on outcome (fires ahead
    // of the collision/gate-set checks below, on both the eventual
    // success and refusal paths) — the fact that nothing here can be
    // verified is true regardless of how this settle attempt resolves.
    // Guarded strictly on `.length === 0`, so a non-empty-AC draft's
    // output is completely unaffected (byte-identical).
    if (draft.acceptanceCriteria.length === 0) {
      io.err(
        'settle: this draft has zero acceptance criteria — nothing here can be verified, ' +
          'regardless of how this settle attempt resolves.\n',
      );
    }

    const explicit = mergePassShorthands(
      draft.acceptanceCriteria.map((ac) => ac.id),
      (opts.ac ?? []).map(parseAcArg),
      opts,
    );
    const explicitIds = new Set(explicit.map((a) => a.id));

    // Phase 214 (T4): parse --evidence-floor-bypass up front — fail fast on
    // malformed syntax before any gate work (deep-verify calls, etc.) runs.
    const evidenceFloorBypasses = (opts.evidenceFloorBypass ?? []).map(parseEvidenceFloorBypassArg);
    const evidenceFloorBypassById = new Map(evidenceFloorBypasses.map((b) => [b.id, b.reason]));

    const cadenceConfig = await loadConfig(cwd);

    const collisionRefusal = await checkPhaseCollisionBackstop(cwd, activePhase, cadenceConfig, opts, io);
    if (collisionRefusal) return collisionRefusal;

    const gateSetResult = resolveSettleGateSet(cwd, state, cadenceConfig, draft, opts, io);
    if (!gateSetResult.ok) return gateSetResult.result;
    const { gateSet, verifierOverride, foreignBinaryMismatch } = gateSetResult;

    const touchedFiles = Array.from(new Set(draft.tasks.flatMap((t) => t.files)));
    // Phase 174: computed once and reused by both the gate-registry ctx below
    // and the post-commit retro offer, rather than recomputing resolveInteractivity
    // twice against process.env/process.stdin.isTTY.
    const interactivity = resolveInteractivity(process.env, Boolean(process.stdin.isTTY));
    const ctx: SettleContext = buildSettleContext(
      cwd,
      activePhase,
      state,
      draft,
      progress,
      cadenceConfig,
      gateSet,
      opts,
      interactivity,
      explicitIds,
      touchedFiles,
      draftPath,
      verifierOverride,
      io,
    );
    // Phase 247 (T2): resolve the clock seam once, here, so both the refused
    // and success paths below share the exact same default-vs-injected
    // resolution rather than each independently re-deriving it.
    const now = opts.now ?? (() => new Date().toISOString());

    const { acc, refused, gates: settleGates } = await runSettleGates(ctx);
    // Phase 275 (275-01, T4; as-built): extended exactly once, before any
    // branch below, so all 5 downstream call sites (4
    // `writeRefusedSettleSummary` + the final `finalizeAndCloseSettle`) see
    // per-task-verify's entries uniformly regardless of how this settle
    // resolves. Prepended, not appended: per-task-verify already ran during
    // BUILD, temporally before this settle's own gate loop even starts, and
    // a widespread existing convention (~15 call sites) treats the LAST
    // entry in `gates[]` as "the gate that most recently ran/refused during
    // this settle's own loop" — appending would silently break that
    // convention for every settle whose draft has any `perTaskVerify`
    // records. Prepending preserves it while still surfacing the data.
    const gates = [...perTaskVerifyGateEntries(progress), ...settleGates];
    if (refused) {
      return await writeRefusedSettleSummary(
        cwd, activePhase, state, draft, progress, gates,
        acc.codeReview, acc.securityAudit, cadenceConfig, foreignBinaryMismatch, now, io,
      );
    }

    const acDerivation = deriveSettleAcResults(acc, draft, progress, explicit, explicitIds, gateSet, opts, io);
    if (!acDerivation.ok) {
      return await writeRefusedSettleSummary(
        cwd, activePhase, state, draft, progress, gates,
        acc.codeReview, acc.securityAudit, cadenceConfig, foreignBinaryMismatch, now, io,
      );
    }
    const {
      acResults,
      coverageBypassed,
      interactiveVerify,
      interactiveVerifySkipped,
      deepVerify,
      deepVerifyMeta,
      verifierFailure,
      codeReviewFindings,
      securityAuditFindings,
      boundaryScan,
    } = acDerivation.data;

    const anomalyResult = await runAnomalyAndSkillAuditChecks(
      ctx,
      draft,
      progress,
      cwd,
      cadenceConfig,
      gateSet,
      opts,
      state,
      coverageBypassed,
      deepVerify,
      interactiveVerify,
      verifierFailure,
      io,
    );
    if (!anomalyResult.ok) {
      return await writeRefusedSettleSummary(
        cwd, activePhase, state, draft, progress, gates,
        acc.codeReview, acc.securityAudit, cadenceConfig, foreignBinaryMismatch, now, io,
      );
    }
    const { gateBypasses } = anomalyResult;

    const evidenceResult = await deriveEvidenceAndCheckFloor(
      ctx,
      cadenceConfig,
      acc,
      acResults,
      deepVerify,
      evidenceFloorBypassById,
      io,
    );
    if (!evidenceResult.ok) {
      return await writeRefusedSettleSummary(
        cwd, activePhase, state, draft, progress, gates,
        acc.codeReview, acc.securityAudit, cadenceConfig, foreignBinaryMismatch, now, io,
      );
    }
    const { acResultsWithEvidence, evidenceFloorBypassesUsed, offLadderExcludedIds } = evidenceResult.data;

    return await finalizeAndCloseSettle(
      cwd,
      activePhase,
      backend,
      state,
      draft,
      progress,
      gates,
      acResultsWithEvidence,
      deepVerify,
      deepVerifyMeta,
      interactiveVerify,
      interactiveVerifySkipped,
      codeReviewFindings,
      securityAuditFindings,
      boundaryScan,
      gateBypasses,
      evidenceFloorBypassesUsed,
      cadenceConfig,
      opts,
      interactivity,
      io,
      foreignBinaryMismatch,
      now,
      offLadderExcludedIds,
    );
  } catch (err) {
    io.err(`${formatCommandError('settle run', err)}\n`);
    if (err instanceof LoopViolationError) {
      await emitLoopViolation(cwd, err, 'settle.run');
    }
    return { exitCode: 1 };
  }
}

/**
 * `git diff --no-color HEAD -- <files>` via execSync. Returns empty
 * string on any error (non-git workdir, no diff, exec failure).
 */
function collectDiffForCodeReview(cwd: string, files: string[]): string {
  return collectGitDiff(cwd, files);
}
