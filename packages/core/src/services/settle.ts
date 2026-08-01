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
} from '@manehorizons/cadence-types';
import { TaskStatusZ, defaultConfig } from '@manehorizons/cadence-types';
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
import { deriveAcEvidence, checkEvidenceFloor } from '../gates/ac-evidence.js';
import { deriveAssuranceRecord, type AssuranceAcResult } from '../gates/assurance-record.js';
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
  return draft.tasks.map((t) => ({
    id: t.id,
    status: (TaskStatusZ.safeParse(progress.tasks[t.id]?.status).success
      ? (progress.tasks[t.id]!.status as Summary['taskResults'][number]['status'])
      : 'BLOCKED'),
    notes: progress.tasks[t.id]?.notes ?? '',
  }));
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
 */
function deriveSettleAssuranceRecord(
  gates: readonly GateProvenance[],
  acResults: readonly AssuranceAcResult[],
): AssuranceRecord {
  return deriveAssuranceRecord(gates, acResults);
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
 * Concern 5 (phase 228 T3): gate-loop refusal-path SUMMARY. A refusing gate
 * previously left zero durable evidence besides its own ephemeral stderr line
 * — `gates` (already correctly ending in the refused entry) was discarded and
 * no SUMMARY was written. Persist one now, to the same path the success path
 * uses, with `acResults: []` (nothing was ever evaluated before the halt) and
 * no loop-state mutation: `state.loopPosition`/`activeDraft` stay exactly
 * where they were so a human can fix the refusal cause and retry `settle
 * run`. Deliberately skips `runSkillAuditCheck`, `collectAnomalies`, and
 * recommendation-promotion — none of those apply before gates have actually
 * finished running. Verbatim extraction of the former `settleService`
 * refusal branch — logic moved, not rewritten.
 *
 * Phase 244 (T2): `foreignBinaryMismatch` is threaded in from the caller
 * (already computed by `resolveSettleGateSet`, which runs before the gate
 * loop that can produce this refusal) rather than re-resolved here — a
 * refused settle still writes a SUMMARY, and the same provenance applies to
 * it: if the running binary was foreign, that is just as true of the refused
 * attempt as it would be of a successful one.
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

async function writeRefusedSettleSummary(
  cwd: string,
  activePhase: string,
  state: CadenceState,
  draft: Draft,
  progress: ProgressJson,
  gates: GateProvenance[],
  cadenceConfig: CadenceConfig,
  foreignBinaryMismatch: { runningBinaryPath: string; repoToplevel: string } | null,
): Promise<CommandResult> {
  const refusedSummary: Summary = {
    schemaVersion: 2,
    draftId: state.activeDraft!,
    completedAt: new Date().toISOString(),
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
    assurance: deriveSettleAssuranceRecord(gates, []),
    ...(foreignBinaryMismatch ? { foreignBinaryMismatch } : {}),
  };
  const refusedSummaryBase = join(
    cwd, '.cadence/phases', activePhase, `${state.activeDraft}-SUMMARY`,
  );
  await atomicWriteJSON(`${refusedSummaryBase}.json`, refusedSummary);
  await atomicWriteText(`${refusedSummaryBase}.md`, renderSummaryMd(refusedSummary));
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
  const acResultsWithEvidence: AcResult[] = acResults.map((r) => ({
    ...r,
    evidence: deriveAcEvidence(r.id, coverageForEvidence, coverageModeForEvidence, buildTestRan, deepVerify),
  }));

  // Phase 214 (T4): the evidence-floor gate — refuses settle when any AC's
  // PASS verdict rests on evidence weaker than the effective
  // `gates.evidenceFloor`. Only PASS verdicts carry an evidentiary claim
  // worth checking; a fail/blocked AC isn't asserting anything the floor
  // needs to back up. `--evidence-floor-bypass AC-id:reason` exempts
  // exactly the named AC (never all of them) — an offender with a bypass
  // is dropped from the refusal, but recorded into SUMMARY.gateBypasses so
  // the exemption is auditable.
  const evidenceFloor = effectiveEvidenceFloor(cadenceConfig);
  const floorCheck = checkEvidenceFloor(
    acResultsWithEvidence.filter((r) => r.pass),
    evidenceFloor,
  );
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

  return { ok: true, data: { acResultsWithEvidence, evidenceFloorBypassesUsed } };
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
    completedAt: new Date().toISOString(),
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
    assurance: deriveSettleAssuranceRecord(gates, acResultsWithEvidence),
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
    } catch {
      // best-effort: leave the rec untouched, keep settling.
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
    const { acc, refused, gates } = await runSettleGates(ctx);
    if (refused) {
      return await writeRefusedSettleSummary(
        cwd, activePhase, state, draft, progress, gates, cadenceConfig, foreignBinaryMismatch,
      );
    }

    const acDerivation = deriveSettleAcResults(acc, draft, progress, explicit, explicitIds, gateSet, opts, io);
    if (!acDerivation.ok) return acDerivation.result;
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
    if (!anomalyResult.ok) return anomalyResult.result;
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
    if (!evidenceResult.ok) return evidenceResult.result;
    const { acResultsWithEvidence, evidenceFloorBypassesUsed } = evidenceResult.data;

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
