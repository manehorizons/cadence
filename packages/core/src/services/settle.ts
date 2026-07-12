import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { AnomalyEvent, GateBypass, Summary } from '@manehorizons/cadence-types';
import { TaskStatusZ, defaultConfig } from '@manehorizons/cadence-types';
import { nextAction } from '../progress.js';
import { phaseNumber } from '../phases/collision.js';
import { assertSafePhaseSlug } from '../phases/id.js';
import { assertNoPhaseCollision } from '../phases/guard.js';
import { parseDraftMd } from '../parse/draft-parser.js';
import { renderSummaryMd } from '../parse/summary-writer.js';
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
import {
  resolveEffectiveProvider,
  MOCK_FALLBACK_BANNER,
  type VerifierProvider,
} from '../verify/verifier-factory.js';
import type { VerifyTestRef } from '../verify/verifier.js';
import { runSettleGates } from '../gates/registry.js';
import { deriveAcEvidence } from '../gates/ac-evidence.js';
import { runSkillAuditCheck } from '../checks/skill-audit.js';
import {
  runAdvanceConvertedToSettlePendingForPhase,
  runRecommendationPromotion,
} from '../intelligence/store/recommendations.js';
import { readRecommendationLedger } from '../intelligence/store/io.js';
import {
  type SettleContext,
  type ProgressJson,
  type AcResult,
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
      return { exitCode: 1 };
    }
    const activePhase = assertSafePhaseSlug(state.activePhase);
    const draftPath = join(cwd, '.cadence/phases', activePhase, `${state.activeDraft}-DRAFT.md`);
    const draft = parseDraftMd(await readFile(draftPath, 'utf8'));

    const progPath = join(cwd, '.cadence/phases', activePhase, `${state.activeDraft}-PROGRESS.json`);
    const progress: ProgressJson = existsSync(progPath)
      ? (JSON.parse(await readFile(progPath, 'utf8')) as ProgressJson)
      : { draftId: state.activeDraft, tasks: {} };

    const explicit = mergePassShorthands(
      draft.acceptanceCriteria.map((ac) => ac.id),
      (opts.ac ?? []).map(parseAcArg),
      opts,
    );
    const explicitIds = new Set(explicit.map((a) => a.id));

    const cadenceConfig = await loadConfig(cwd);

    // Phase 83: worktree-collision backstop — re-check the active phase number
    // against sibling worktrees + upstream only (the `local` source is self: the
    // active phase dir lives in this worktree), catching the rare scaffold-race.
    // A `settleService` precondition, NOT a gate-matrix gate.
    // `--allow-phase-collision` bypasses.
    {
      const verdict = await assertNoPhaseCollision(cwd, phaseNumber(activePhase), {
        config: cadenceConfig ?? defaultConfig,
        excludeSources: ['local'],
        ...(opts.allowPhaseCollision !== undefined ? { allow: opts.allowPhaseCollision } : {}),
      });
      if (!verdict.ok) {
        io.err(verdict.message);
        return { exitCode: 1 };
      }
    }

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

    // DESIGN.md §4 M2 — soft cap on auto × complex.
    if (gateSet.softCap && !opts.allowAutoComplex) {
      io.err(
        'settle run refused: auto × complex is soft-capped (DESIGN.md §4 M2). Pass --allow-auto-complex to override.\n',
      );
      return { exitCode: 1 };
    }
    if (gateSet.softCap && opts.allowAutoComplex) {
      io.err('settle: --allow-auto-complex set; proceeding past soft cap (auto × complex).\n');
    }

    const touchedFiles = Array.from(new Set(draft.tasks.flatMap((t) => t.files)));
    let coverageMemo: Promise<Map<string, VerifyTestRef[]>> | undefined;
    let draftMtimeMemo: Promise<number | null> | undefined;
    let deepVerifierMemo: ReturnType<typeof selectVerifier> | undefined;
    let codeReviewVerifierMemo: ReturnType<typeof selectCodeReviewVerifier> | undefined;
    let securityAuditVerifierMemo: ReturnType<typeof selectSecurityAuditVerifier> | undefined;
    let diffMemo: string | undefined;
    const codeReviewSidecarPath = join(
      cwd, '.cadence/phases', activePhase, `${state.activeDraft}-CODE-REVIEW.json`,
    );
    // Phase 174: computed once and reused by both the gate-registry ctx below
    // and the post-commit retro offer, rather than recomputing resolveInteractivity
    // twice against process.env/process.stdin.isTTY.
    const interactivity = resolveInteractivity(process.env, Boolean(process.stdin.isTTY));
    const ctx: SettleContext = {
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
          coverageMemo = scanTestCoverage(cwd, {
            ...(globs ? { globs } : {}),
            ...(mode ? { mode } : {}),
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
          verify: (input) => {
            if (!securityAuditVerifierMemo) {
              securityAuditVerifierMemo = selectSecurityAuditVerifier(cadenceConfig, { cwd });
            }
            return securityAuditVerifierMemo.verify(input);
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
        test: async () => {
          const command = cadenceConfig?.verification?.testCommand;
          if (!command) return { ran: false, ok: true };
          try {
            execSync(command, { cwd, stdio: 'ignore' });
            return { ran: true, ok: true, exitCode: 0, command };
          } catch (e) {
            const status = (e as { status?: number }).status;
            const exitCode = typeof status === 'number' ? status : 1;
            return { ran: true, ok: false, exitCode, command };
          }
        },
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
    const { acc, refused, gates } = await runSettleGates(ctx);
    if (refused) {
      // Phase 170 (T4): a refusing gate previously left zero durable evidence
      // besides its own ephemeral stderr line — `gates` (already correctly
      // ending in the refused entry, per T3) was discarded and no SUMMARY was
      // written. Persist one now, to the same path the success path uses, with
      // `acResults: []` (nothing was ever evaluated before the halt) and no
      // loop-state mutation: `state.loopPosition`/`activeDraft` stay exactly
      // where they were so a human can fix the refusal cause and retry
      // `settle run`. Deliberately skips `runSkillAuditCheck`,
      // `collectAnomalies`, and recommendation-promotion — none of those apply
      // before gates have actually finished running.
      const refusedSummary: Summary = {
        schemaVersion: 1,
        draftId: state.activeDraft,
        completedAt: new Date().toISOString(),
        acResults: [],
        gates,
        taskResults: buildTaskResults(draft, progress),
        decisions: [],
        deferred: [],
        skillAudit: state.skillAudit,
      };
      const refusedSummaryBase = join(
        cwd, '.cadence/phases', activePhase, `${state.activeDraft}-SUMMARY`,
      );
      await atomicWriteJSON(`${refusedSummaryBase}.json`, refusedSummary);
      await atomicWriteText(`${refusedSummaryBase}.md`, renderSummaryMd(refusedSummary));
      return { exitCode: 1 };
    }
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
        return { exitCode: 1 };
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

    const anomalies = collectAnomalies({
      draft,
      progress,
      coverageBypassed,
      force: opts.force === true,
      root: cwd,
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
        return { exitCode: 1 };
      }
      state.skillAudit.required = res.effectiveRequired;
    }

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

    const summary: Summary = {
      schemaVersion: 1,
      draftId: state.activeDraft,
      completedAt: new Date().toISOString(),
      acResults: acResultsWithEvidence,
      gates,
      taskResults: buildTaskResults(draft, progress),
      decisions: [],
      deferred: [],
      skillAudit: state.skillAudit,
      ...(deepVerify ? { deepVerify } : {}),
      ...(deepVerifyMeta ? { deepVerifyMeta } : {}),
      ...(interactiveVerify ? { interactiveVerify } : {}),
      ...(interactiveVerifySkipped ? { interactiveVerifySkipped } : {}),
      ...(codeReviewFindings ? { codeReview: codeReviewFindings } : {}),
      ...(securityAuditFindings ? { securityAudit: securityAuditFindings } : {}),
      ...(boundaryScan ? { boundaryScan } : {}),
      ...(gateBypasses.length > 0 ? { gateBypasses } : {}),
    };

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
          draftId: state.activeDraft,
          io,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      io.err(`note: retro artifact failed to write — ${msg}\n`);
    }

    // Phase 145: advance any recommendation converted into the phase that just
    // settled to `settle-pending` (visible, not archived — a reminder to confirm
    // shipping). Best-effort + config-gated (`recommendations.autoArchive`,
    // default on, the same flag phase 102 used) — a failure here never blocks or
    // fails the settle. Replaces phase 102's auto-archive-on-settle behavior.
    const settledPhase = state.activePhase;
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

    const draftId = state.activeDraft;
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
  } catch (err) {
    io.err(`settle run failed: ${err instanceof Error ? err.message : String(err)}\n`);
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
