import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Summary } from '@manehorizons/cadence-types';
import { TaskStatusZ } from '@manehorizons/cadence-types';
import { parseDraftMd } from '../../parse/draft-parser.js';
import { renderSummaryMd } from '../../parse/summary-writer.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { atomicWriteJSON, atomicWriteText } from '../../state/atomic-write.js';
import { LoopViolationError } from '../../errors.js';
import { deriveAcResults, type ProgressFile } from '../../status.js';
import { loadConfig } from '../../config/loader.js';
import { effectiveGateSet } from '../../gates/engine.js';
import { scanTestCoverage } from '../../verify/coverage.js';
import { selectVerifier } from '../../verify/factory.js';
import {
  resolveEffectiveProvider,
  MOCK_FALLBACK_BANNER,
} from '../../verify/verifier-factory.js';
import type { VerifyTestRef } from '../../verify/verifier.js';
import { runSettleGates } from '../../gates/registry.js';
import { runSkillAuditCheck } from '../../checks/skill-audit.js';
import {
  type SettleContext,
  type ProgressJson,
  type AcResult,
} from '../../gates/types.js';
import { ScriptedPrompter, StdinPrompter } from '../../verify/prompter.js';
import { selectNotifier } from '../../notify/factory.js';
import { collectAnomalies } from '../../notify/collect.js';
import { emitLoopViolation } from '../../notify/loop-violation.js';
import { selectCodeReviewVerifier } from '../../verify/code-review-factory.js';
import { emitCodeReviewHigh, emitCodeReviewUnconverged } from '../../notify/code-review.js';
import { emitSkillAuditMiss } from '../../notify/skill-audit.js';
import { selectSecurityAuditVerifier } from '../../verify/security-audit-factory.js';

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

export function registerSettleCommand(program: Command): void {
  const cmd = program.command('settle').description('Close the loop');

  cmd
    .command('run')
    .description('Generate SUMMARY.md + JSON and return to IDLE')
    .option('--ac <pair...>', 'AC verdicts: AC-1=pass  or  AC-1=fail:reason')
    .option('--auto', 'derive AC verdicts from task statuses (blocks on incomplete ACs)')
    .option('--force', 'settle even when --auto detects blocked or pending ACs')
    .option(
      '--allow-missing-coverage',
      "skip the test-coverage gate even if the active profile would enforce it",
    )
    .option(
      '--deep',
      'run the independent verifier agent against each AC (provider from config.verifier)',
    )
    .option(
      '--allow-verifier-failure',
      'do not refuse on verifier transport failures; record failure into SUMMARY and treat as pass=false',
    )
    .option(
      '--interactive',
      'walk each AC and prompt the user for a pass/fail/skip verdict (Phase 16)',
    )
    .option(
      '--no-interactive',
      'bypass the interactive-verdict gate even if the active profile would enforce it',
    )
    .option(
      '--allow-auto-complex',
      "override DESIGN.md §4 M2 soft cap: settle an auto × complex draft anyway",
    )
    .option(
      '--allow-stale-draft',
      "skip the DRAFT-read mtime gate even if the DRAFT.md was edited after approve",
    )
    .option(
      '--allow-open-tasks',
      'skip the structural-verifier gate even if a task is still PENDING / IN_PROGRESS (Phase 39.2)',
    )
    .option(
      '--allow-failing-build',
      'do not refuse on a non-zero verification.testCommand exit; settle anyway (Phase 39.2)',
    )
    .option(
      '--allow-code-review-failure',
      'do not refuse on HIGH-severity code-review findings; record them in SUMMARY and emit anomalies anyway (Phase 24.3)',
    )
    .option(
      '--allow-security-audit-failure',
      'do not refuse on CRITICAL security-audit findings; record them in SUMMARY and settle anyway (Phase 25.2)',
    )
    .option(
      '--allow-skill-audit-miss',
      'do not refuse when required skills were not invoked; emit a warn anomaly (bypassed:true) and settle anyway (Phase 34.1)',
    )
    .action(
      async (opts: {
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
        interactive?: boolean;
      }) => {
      try {
        const cwd = process.cwd();
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

        // Test-coverage gate: fires when the effective gate set includes
        // 'test-coverage'. Skipped for explicitly-overridden ACs. The flag
        // --allow-missing-coverage is a per-invocation bypass.
        let cadenceConfig: Awaited<ReturnType<typeof loadConfig>> | null = null;
        try {
          cadenceConfig = await loadConfig(cwd);
        } catch {
          cadenceConfig = null;
        }
        const gateSet = effectiveGateSet(state, cadenceConfig, draft);

        // Onboarding hardening (phase 48): --deep asks for real verification.
        // If the effective verifier provider is `mock` (the shipped default —
        // `cadence init` writes verifier.provider='mock'), the verdicts are
        // deterministic fakes. Warn loudly so the operator isn't handed false
        // confidence. A configured real provider that downgrades to mock for a
        // missing key already prints the factory's own "falling back to mock"
        // warning, so that path is left to the factory.
        if (
          opts.deep &&
          resolveEffectiveProvider(cadenceConfig?.verifier).provider === 'mock'
        ) {
          process.stderr.write(MOCK_FALLBACK_BANNER + '\n');
        }

        // DESIGN.md §4 M2 — soft cap on auto × complex. Refuse here, before
        // any coverage / interactive / deep work, so wasted effort is avoided.
        // Phase 21.1 wires the locked decision into a live check.
        if (gateSet.softCap && !opts.allowAutoComplex) {
          process.stderr.write(
            'settle run refused: auto × complex is soft-capped (DESIGN.md §4 M2). Pass --allow-auto-complex to override.\n',
          );
          process.exitCode = 1;
          return;
        }
        if (gateSet.softCap && opts.allowAutoComplex) {
          process.stderr.write(
            'settle: --allow-auto-complex set; proceeding past soft cap (auto × complex).\n',
          );
        }

        const touchedFiles = Array.from(
          new Set(draft.tasks.flatMap((t) => t.files)),
        );
        let coverageMemo: Promise<Map<string, VerifyTestRef[]>> | undefined;
        let draftMtimeMemo: Promise<number | null> | undefined;
        // Lazily select the deep verifier on first use. selectVerifier emits a
        // stderr fallback warning when a non-mock provider lacks credentials;
        // the pre-extraction code only ran it inside the deep-verify block, so
        // selecting eagerly here would surface that warning on runs where
        // deep-verify never fires. Defer it to keep settle bit-identical.
        let deepVerifierMemo: ReturnType<typeof selectVerifier> | undefined;
        let codeReviewVerifierMemo: ReturnType<typeof selectCodeReviewVerifier> | undefined;
        let securityAuditVerifierMemo: ReturnType<typeof selectSecurityAuditVerifier> | undefined;
        let diffMemo: string | undefined;
        const codeReviewSidecarPath = join(
          cwd,
          '.cadence/phases',
          state.activePhase,
          `${state.activeDraft}-CODE-REVIEW.json`,
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
            ...(opts.allowMissingCoverage !== undefined
              ? { allowMissingCoverage: opts.allowMissingCoverage }
              : {}),
            ...(opts.allowVerifierFailure !== undefined
              ? { allowVerifierFailure: opts.allowVerifierFailure }
              : {}),
            ...(opts.allowStaleDraft !== undefined
              ? { allowStaleDraft: opts.allowStaleDraft }
              : {}),
            ...(opts.allowOpenTasks !== undefined
              ? { allowOpenTasks: opts.allowOpenTasks }
              : {}),
            ...(opts.allowFailingBuild !== undefined
              ? { allowFailingBuild: opts.allowFailingBuild }
              : {}),
            ...(opts.interactive !== undefined
              ? { interactive: opts.interactive }
              : {}),
            ...(opts.allowCodeReviewFailure !== undefined
              ? { allowCodeReviewFailure: opts.allowCodeReviewFailure }
              : {}),
            ...(opts.allowSecurityAuditFailure !== undefined
              ? { allowSecurityAuditFailure: opts.allowSecurityAuditFailure }
              : {}),
            ...(opts.allowSkillAuditMiss !== undefined
              ? { allowSkillAuditMiss: opts.allowSkillAuditMiss }
              : {}),
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
                  deepVerifierMemo = selectVerifier(cadenceConfig);
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
              // Test seam: CADENCE_PROMPTER_SCRIPT (newline-separated answers)
              // drives the walker without a real TTY. Else StdinPrompter, which
              // throws on a non-TTY (the gate turns that into a refusal).
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
              // Absent / corrupt / legacy-without-`attempts` → {0, []}.
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
          io: { err: (s) => process.stderr.write(s) },
        };
        // Phase 44.1 — the settle gate sequence is now engine-driven: the
        // registry's GATE_ORDER (≠ matrix order) drives dispatch, each gate
        // membership-guarded (or self-guarded for deep-verify/interactive-verdict),
        // first-refuse halts. Replaces the former hand-wired if-includes ladder;
        // bit-identical. checks/ modules (skill-audit, boundary) + anomaly-notify
        // stay explicitly dispatched below, outside the registry.
        const { acc, refused } = await runSettleGates(ctx);
        if (refused) {
          process.exitCode = 1;
          return;
        }
        const coverageBypassed = acc.flags.coverageBypassed === true;

        // `interactiveRequested` is read by the AC-merge finalizer below (not by
        // gate dispatch), so it stays a settle local — the documented seam
        // between the interactive gate and the finalizer. Mirrors the gate's own
        // --interactive OR membership('interactive-verdict') trigger.
        const interactiveRequested =
          opts.interactive === true ||
          (opts.interactive !== false &&
            gateSet.gates.includes('interactive-verdict'));
        const interactiveVerify = acc.interactiveVerify;
        const deepVerify = acc.deepVerify;
        const verifierFailure = acc.flags.verifierFailure;
        const codeReviewFindings = acc.codeReview;
        const securityAuditFindings = acc.securityAudit;

        // ACs covered by an explicit `--ac` OR an interactive verdict are
        // excluded from auto-derivation refusal (the user verdicted them).
        const interactiveIds = new Set(
          interactiveVerify ? Object.keys(interactiveVerify) : [],
        );
        const userVerdictedIds = new Set([...explicitIds, ...interactiveIds]);

        let acResults: AcResult[] = [...explicit];
        // Merge interactive verdicts into acResults (override structural derivation).
        if (interactiveVerify) {
          for (const [id, v] of Object.entries(interactiveVerify)) {
            if (explicitIds.has(id)) continue; // explicit --ac wins over interactive
            acResults.push({
              id,
              pass: v.verdict === 'pass',
              ...(v.note ? { note: v.note } : {}),
            });
          }
        }
        // Phase 29.8 T4 — when the interactive walker ran, ACs the user
        // skipped or never verdicted must still fall through to structural
        // derivation (the walker promises "Skip falls through to other
        // gates"). Previously this only happened under `--auto`, so
        // `settle run --interactive` alone silently settled incomplete ACs.
        if (opts.auto || interactiveRequested) {
          const derived = deriveAcResults(draft, progress as ProgressFile);
          const offenders = derived.filter(
            (d) =>
              d.verdict !== 'pass' && !userVerdictedIds.has(d.id),
          );
          if (offenders.length > 0 && !opts.force) {
            for (const o of offenders) {
              const tasks = o.blockers.length > 0 ? ` (tasks: ${o.blockers.join(', ')})` : '';
              process.stderr.write(`auto: ${o.id} ${o.verdict}${tasks}\n`);
            }
            process.stderr.write(
              'settle run --auto refused: complete the blocking tasks or rerun with --force.\n',
            );
            process.exitCode = 1;
            return;
          }
          const merged: AcResult[] = [...acResults];
          for (const d of derived) {
            if (userVerdictedIds.has(d.id)) continue;
            if (d.verdict === 'pass') {
              merged.push({ id: d.id, pass: true });
            } else if (d.verdict === 'blocked') {
              merged.push({
                id: d.id,
                pass: false,
                note: `auto: ${d.blockers.join(', ')} blocked`,
              });
            } else if (d.verdict === 'needs-context') {
              merged.push({
                id: d.id,
                pass: false,
                note: `auto: ${d.blockers.join(', ')} needs context`,
              });
            } else {
              merged.push({
                id: d.id,
                pass: false,
                note:
                  d.blockers.length > 0
                    ? `auto: ${d.blockers.join(', ')} incomplete`
                    : 'auto: no linked tasks',
              });
            }
          }
          acResults = merged;
        }

        // Anomaly notify (Phase 17) — fires only when 'anomaly-notify' is in
        // the gate set. Notifier failures degrade to a stderr warning; they
        // never block settle.
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
              process.stderr.write(
                `notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
              );
            }
          }
        }

        // Required-skill enforcement (Phase 34.1 — ROADMAP 23.4). A checks/
        // anomaly check, NOT a gates/engine.ts matrix cell (declaring skills IS
        // the opt-in) — dispatched explicitly here, OUTSIDE the Phase 44.1
        // registry. The check returns the effective required set; settle records
        // it on state.skillAudit.required (truthful SUMMARY) on every non-refuse
        // path — including the null-config / empty / telemetry-off skips. A
        // refuse halts settle before SUMMARY, unchanged.
        {
          const res = await runSkillAuditCheck(ctx);
          if (res.outcome === 'refuse') {
            process.exitCode = 1;
            return;
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
          ...(interactiveVerify ? { interactiveVerify } : {}),
          ...(codeReviewFindings ? { codeReview: codeReviewFindings } : {}),
          ...(securityAuditFindings
            ? { securityAudit: securityAuditFindings }
            : {}),
        };

        const summaryBase = join(cwd, '.cadence/phases', state.activePhase, `${state.activeDraft}-SUMMARY`);
        await atomicWriteJSON(`${summaryBase}.json`, summary);
        await atomicWriteText(`${summaryBase}.md`, renderSummaryMd(summary));

        const draftId = state.activeDraft;
        state.openDrafts = state.openDrafts.filter((d) => d.id !== draftId);
        state.activeDraft = null;
        state.activeTask = null;
        state.loopPosition = 'IDLE';
        state.tier = null;
        await backend.commit(state);
        console.log(`Settled ${draftId}`);
      } catch (err) {
        process.stderr.write(`settle run failed: ${err instanceof Error ? err.message : String(err)}\n`);
        if (err instanceof LoopViolationError) {
          await emitLoopViolation(process.cwd(), err, 'settle.run');
        }
        process.exitCode = 1;
      }
    },
  );
}

/**
 * `git diff --no-color HEAD -- <files>` via execSync. Returns empty
 * string on any error (non-git workdir, no diff, exec failure).
 * Mirrors the Phase 24.2 build.ts diff collector.
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
