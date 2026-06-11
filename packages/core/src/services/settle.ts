import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Summary } from '@manehorizons/cadence-types';
import { TaskStatusZ, defaultConfig } from '@manehorizons/cadence-types';
import { phaseNumber } from '../phases/collision.js';
import { assertNoPhaseCollision } from '../phases/guard.js';
import { parseDraftMd } from '../parse/draft-parser.js';
import { renderSummaryMd } from '../parse/summary-writer.js';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { LoopViolationError } from '../errors.js';
import { deriveAcResults, type ProgressFile } from '../status.js';
import { loadConfig } from '../config/loader.js';
import { effectiveGateSet } from '../gates/engine.js';
import { selectVerifier } from '../verify/factory.js';
import { scanTestCoverage } from '../verify/coverage.js';
import {
  resolveEffectiveProvider,
  MOCK_FALLBACK_BANNER,
  type VerifierProvider,
} from '../verify/verifier-factory.js';
import type { VerifyTestRef } from '../verify/verifier.js';
import { runSettleGates } from '../gates/registry.js';
import { runSkillAuditCheck } from '../checks/skill-audit.js';
import { runAutoArchiveConvertedForPhase } from '../intelligence/store/recommendations.js';
import {
  type SettleContext,
  type ProgressJson,
  type AcResult,
} from '../gates/types.js';
import { ScriptedPrompter, StdinPrompter } from '../verify/prompter.js';
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
  /** Phase 83: bypass the worktree phase-collision backstop. */
  allowPhaseCollision?: boolean;
  interactive?: boolean;
  /** Phase 73: override config.verifier.provider for the deep-verify gate
   *  (precedence flag > config > default mock). */
  verifier?: VerifierProvider;
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
      throw new LoopViolationError(
        'settle run requires loopPosition=BUILD with an active draft',
        { expected: 'BUILD', actual: state.loopPosition },
      );
    }
    const draftPath = join(cwd, '.cadence/phases', state.activePhase, `${state.activeDraft}-DRAFT.md`);
    const draft = parseDraftMd(await readFile(draftPath, 'utf8'));

    const progPath = join(cwd, '.cadence/phases', state.activePhase, `${state.activeDraft}-PROGRESS.json`);
    const progress: ProgressJson = existsSync(progPath)
      ? (JSON.parse(await readFile(progPath, 'utf8')) as ProgressJson)
      : { draftId: state.activeDraft, tasks: {} };

    const explicit = (opts.ac ?? []).map(parseAcArg);
    const explicitIds = new Set(explicit.map((a) => a.id));

    let cadenceConfig: Awaited<ReturnType<typeof loadConfig>> | null = null;
    try {
      cadenceConfig = await loadConfig(cwd);
    } catch {
      cadenceConfig = null;
    }

    // Phase 83: worktree-collision backstop — re-check the active phase number
    // against sibling worktrees + upstream only (the `local` source is self: the
    // active phase dir lives in this worktree), catching the rare scaffold-race.
    // A `settleService` precondition, NOT a gate-matrix gate.
    // `--allow-phase-collision` bypasses.
    {
      const verdict = await assertNoPhaseCollision(cwd, phaseNumber(state.activePhase), {
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
      cwd, '.cadence/phases', state.activePhase, `${state.activeDraft}-CODE-REVIEW.json`,
    );
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
      },
      explicitIds,
      touchedFiles,
      coverage: () => {
        if (!coverageMemo) {
          const globs = cadenceConfig?.verification?.testGlobs;
          coverageMemo = scanTestCoverage(cwd, globs ? { globs } : {});
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
              deepVerifierMemo = selectVerifier(cadenceConfig, verifierOverride);
            }
            return deepVerifierMemo.verify(input);
          },
        },
        codeReview: {
          verify: (input) => {
            if (!codeReviewVerifierMemo) {
              codeReviewVerifierMemo = selectCodeReviewVerifier(cadenceConfig);
            }
            return codeReviewVerifierMemo.verify(input);
          },
        },
        securityAudit: {
          verify: (input) => {
            if (!securityAuditVerifierMemo) {
              securityAuditVerifierMemo = selectSecurityAuditVerifier(cadenceConfig);
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
        create: () => {
          const scripted = process.env.CADENCE_PROMPTER_SCRIPT;
          if (scripted !== undefined) {
            const answers = scripted.split('\n').filter((s) => s.length > 0 || s === '');
            return new ScriptedPrompter(answers);
          }
          return new StdinPrompter();
        },
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
    const { acc, refused } = await runSettleGates(ctx);
    if (refused) {
      return { exitCode: 1 };
    }
    const coverageBypassed = acc.flags.coverageBypassed === true;

    const interactiveRequested =
      opts.interactive === true ||
      (opts.interactive !== false && gateSet.gates.includes('interactive-verdict'));
    const interactiveVerify = acc.interactiveVerify;
    const deepVerify = acc.deepVerify;
    const deepVerifyMeta = acc.deepVerifyMeta;
    const verifierFailure = acc.flags.verifierFailure;
    const codeReviewFindings = acc.codeReview;
    const securityAuditFindings = acc.securityAudit;

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

    if (gateSet.gates.includes('anomaly-notify')) {
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

    const summary: Summary = {
      schemaVersion: 1,
      draftId: state.activeDraft,
      completedAt: new Date().toISOString(),
      acResults,
      taskResults: draft.tasks.map((t) => ({
        id: t.id,
        status: (TaskStatusZ.safeParse(progress.tasks[t.id]?.status).success
          ? (progress.tasks[t.id]!.status as Summary['taskResults'][number]['status'])
          : 'BLOCKED'),
        notes: progress.tasks[t.id]?.notes ?? '',
      })),
      decisions: [],
      deferred: [],
      skillAudit: state.skillAudit,
      ...(deepVerify ? { deepVerify } : {}),
      ...(deepVerifyMeta ? { deepVerifyMeta } : {}),
      ...(interactiveVerify ? { interactiveVerify } : {}),
      ...(codeReviewFindings ? { codeReview: codeReviewFindings } : {}),
      ...(securityAuditFindings ? { securityAudit: securityAuditFindings } : {}),
    };

    const summaryBase = join(cwd, '.cadence/phases', state.activePhase, `${state.activeDraft}-SUMMARY`);
    await atomicWriteJSON(`${summaryBase}.json`, summary);
    await atomicWriteText(`${summaryBase}.md`, renderSummaryMd(summary));

    // Phase 102 (v1.24): auto-archive any recommendation converted into the phase
    // that just settled. Best-effort + config-gated (`recommendations.autoArchive`,
    // default on) — a failure here never blocks or fails the settle.
    const settledPhase = state.activePhase;
    if (cadenceConfig?.recommendations.autoArchive !== false) {
      try {
        const archivedRecIds = await runAutoArchiveConvertedForPhase(cwd, settledPhase);
        for (const rid of archivedRecIds) {
          io.out(`archived rec ${rid} (converted → settled)\n`);
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
    return { exitCode: 0, data: { settled: draftId, acResults } };
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
  if (files.length === 0) return '';
  try {
    const args = ['diff', '--no-color', 'HEAD', '--', ...files];
    return execSync(`git ${args.map(shellQuote).join(' ')}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9._/=:@+-]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["\\$`])/g, '\\$1')}"`;
}
