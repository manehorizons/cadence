import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Summary, Finding } from '@cadence/types';
import { TaskStatusZ } from '@cadence/types';
import { parseDraftMd } from '../../parse/draft-parser.js';
import { renderSummaryMd } from '../../parse/summary-writer.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { atomicWriteJSON, atomicWriteText } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';
import { LoopViolationError } from '../../errors.js';
import { deriveAcResults, type ProgressFile } from '../../status.js';
import { loadConfig } from '../../config/loader.js';
import { effectiveGateSet } from '../../gates/engine.js';
import { scanTestCoverage } from '../../verify/coverage.js';
import { selectVerifier } from '../../verify/factory.js';
import type { VerifyTestRef } from '../../verify/verifier.js';
import { runCoverageGate } from '../../gates/coverage.js';
import { runDeepVerifyGate } from '../../gates/deep-verify.js';
import { runDraftReadGate } from '../../gates/draft-read.js';
import { runStructuralVerifierGate } from '../../gates/structural-verifier.js';
import { runBuildTestGate } from '../../gates/build-test-must-pass.js';
import {
  mergeInto,
  type SettleContext,
  type SettleAccumulator,
  type ProgressJson,
  type AcResult,
} from '../../gates/types.js';
import { walkAcsInteractively, type InteractiveVerdict } from '../../verify/interactive.js';
import { ScriptedPrompter, StdinPrompter, type Prompter } from '../../verify/prompter.js';
import { selectNotifier } from '../../notify/factory.js';
import { collectAnomalies } from '../../notify/collect.js';
import { emitLoopViolation } from '../../notify/loop-violation.js';
import { selectCodeReviewVerifier } from '../../verify/code-review-factory.js';
import { emitCodeReviewHigh, emitCodeReviewUnconverged } from '../../notify/code-review.js';
import { nextConvergence } from '../../verify/converge.js';
import { emitSkillAuditMiss } from '../../notify/skill-audit.js';
import { missingSkills } from '../../verify/skill-match.js';
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
          verifiers: {
            deep: {
              verify: (input) => {
                if (!deepVerifierMemo) {
                  deepVerifierMemo = selectVerifier(cadenceConfig);
                }
                return deepVerifierMemo.verify(input);
              },
            },
          },
          emit: {
            anomalies: async (events) => {
              void events;
            },
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
          io: { err: (s) => process.stderr.write(s) },
        };
        const acc: SettleAccumulator = { flags: {} };

        // Phase 39.2 — three enum gates routed through the contract, in
        // execution order: draft-read (cheap, was inline) → structural-verifier
        // (always-fire) → build-test-must-pass (always-fire), all before the
        // coverage gate. Each is membership-guarded (registry-ready for 44.1)
        // and follows the 39.1 refuse-and-halt keystone.
        if (gateSet.gates.includes('draft-read')) {
          const res = await runDraftReadGate(ctx);
          mergeInto(acc, res);
          if (res.outcome === 'refuse') {
            process.exitCode = 1;
            return;
          }
        }
        if (gateSet.gates.includes('structural-verifier')) {
          const res = await runStructuralVerifierGate(ctx);
          mergeInto(acc, res);
          if (res.outcome === 'refuse') {
            process.exitCode = 1;
            return;
          }
        }
        if (gateSet.gates.includes('build-test-must-pass')) {
          const res = await runBuildTestGate(ctx);
          mergeInto(acc, res);
          if (res.outcome === 'refuse') {
            process.exitCode = 1;
            return;
          }
        }

        if (gateSet.gates.includes('test-coverage')) {
          const res = await runCoverageGate(ctx);
          mergeInto(acc, res);
          if (res.outcome === 'refuse') {
            process.exitCode = 1;
            return;
          }
        }
        const coverageBypassed = acc.flags.coverageBypassed === true;

        // Interactive walker (Phase 16) — fires on --interactive OR when
        // 'interactive-verdict' is in the gate set (strict profile). User verdicts
        // override structural/coverage/deep verdicts for matching ACs.
        // --no-interactive (commander auto-flag) sets `interactive: false` to opt out.
        let interactiveVerify: Record<string, InteractiveVerdict> | undefined;
        const interactiveRequested =
          opts.interactive === true ||
          (opts.interactive !== false &&
            gateSet.gates.includes('interactive-verdict'));
        if (interactiveRequested && opts.auto !== false) {
          // Test seam: CADENCE_PROMPTER_SCRIPT env var (newline-separated answers)
          // lets integration tests drive the walker without a real TTY.
          let prompter: Prompter;
          const scripted = process.env.CADENCE_PROMPTER_SCRIPT;
          if (scripted !== undefined) {
            const answers = scripted.split('\n').filter((s) => s.length > 0 || s === '');
            prompter = new ScriptedPrompter(answers);
          } else {
            try {
              prompter = new StdinPrompter();
            } catch (err) {
              process.stderr.write(
                `interactive: ${err instanceof Error ? err.message : String(err)}\n`,
              );
              process.exitCode = 1;
              return;
            }
          }
          try {
            const coverageGlobs = cadenceConfig?.verification?.testGlobs;
            const coverageForWalker = await scanTestCoverage(
              cwd,
              coverageGlobs ? { globs: coverageGlobs } : {},
            );
            const testsForWalker: Record<string, VerifyTestRef[]> = {};
            for (const [id, refs] of coverageForWalker) {
              testsForWalker[id] = refs;
            }
            const touchedFiles = Array.from(
              new Set(draft.tasks.flatMap((t) => t.files)),
            );
            interactiveVerify = await walkAcsInteractively(
              {
                acs: draft.acceptanceCriteria.map((a) => ({
                  id: a.id,
                  given: a.given,
                  when: a.when,
                  then: a.then,
                })),
                tests: testsForWalker,
                files: touchedFiles,
              },
              prompter,
            );
          } finally {
            await prompter.close?.();
          }
          // Refuse on any non-overridden 'fail' verdict unless --force.
          const failing = Object.entries(interactiveVerify).filter(
            ([id, v]) => v.verdict === 'fail' && !explicitIds.has(id),
          );
          if (failing.length > 0 && !opts.force) {
            for (const [id, v] of failing) {
              process.stderr.write(
                `interactive: ${id} fail${v.note ? ` — ${v.note}` : ''}\n`,
              );
            }
            process.stderr.write(
              'settle run --interactive refused: one or more ACs verdicted as fail. Pass --force to settle anyway.\n',
            );
            process.exitCode = 1;
            return;
          }
        }

        // Deep verifier (Phase 15) — fires on explicit --deep OR when 'deep-verify' is
        // in the gate set (e.g. standard × complex). Records per-AC verdicts; refuses
        // on failed verdicts for non-overridden ACs unless --force is set.
        {
          const res = await runDeepVerifyGate(ctx);
          mergeInto(acc, res);
          if (res.outcome === 'refuse') {
            process.exitCode = 1;
            return;
          }
        }
        const deepVerify = acc.deepVerify;
        const verifierFailure = acc.flags.verifierFailure;

        // Phase 24.3 — code-review verifier gate. Fires when `'code-review'`
        // is in the effective gate set. Runs against `git diff HEAD --
        // <files>` for the union of touched files across all tasks. HIGH
        // findings refuse settle unless `--force` or
        // `--allow-code-review-failure`. All findings (including bypassed
        // HIGHs) land on SUMMARY.codeReview. `code-review-high` anomalies
        // dispatch via the Phase 17 notifier when the anomaly gate is also
        // in the set.
        let codeReviewFindings: Record<string, Finding[]> | undefined;
        if (gateSet.gates.includes('code-review')) {
          const touched = Array.from(
            new Set(draft.tasks.flatMap((t) => t.files)),
          );
          const diff = collectDiffForCodeReview(cwd, touched);
          const reviewer = selectCodeReviewVerifier(cadenceConfig);
          try {
            const result = await reviewer.verify({ files: touched, diff });
            codeReviewFindings = result.findings;
            const highs = collectHighFindings(result.findings);
            // Phase 37.1 — code-review@settle is a bounded convergence loop
            // (Plan→CodeReview port of the shipped Phase 35.1 draft.ts block).
            // pass := no HIGH finding (the gate's existing refuse condition;
            // MEDIUM/LOW never refuse). nextConvergence + sidecar own the loop;
            // the fix between attempts is external (host edits the code).
            const pass = highs.length === 0;
            const sidecarPath = join(
              cwd,
              '.cadence/phases',
              state.activePhase,
              `${state.activeDraft}-CODE-REVIEW.json`,
            );
            // Prior attempts. Absent / corrupt / legacy-without-`attempts`
            // → attemptsSoFar = 0 (identical back-compat rule to plan-review).
            let attemptsSoFar = 0;
            let history: unknown[] = [];
            if (existsSync(sidecarPath)) {
              try {
                const prior = JSON.parse(await readFile(sidecarPath, 'utf8'));
                if (typeof prior.attempts === 'number') {
                  attemptsSoFar = prior.attempts;
                }
                if (Array.isArray(prior.history)) history = prior.history;
              } catch {
                /* corrupt/legacy → treat as fresh (attemptsSoFar 0) */
              }
            }

            const maxAttempts = cadenceConfig?.convergence?.maxAttempts ?? 3;
            const nv = nextConvergence(pass, attemptsSoFar, maxAttempts);
            const now = new Date().toISOString();
            // Phase 24.3 contract preserved (NOT narrowed): --force OR
            // --allow-code-review-failure bypasses ANY failing code-review
            // (reloop OR escalate). The convergence loop is the non-bypass path.
            const bypassed =
              !pass &&
              (opts.allowCodeReviewFailure === true || opts.force === true);

            history.push({
              at: now,
              pass,
              // Conscious HIGH-count semantics (spec): findingsCount / top-level
              // `findings` record highs.length, NOT total findings — because the
              // convergence boolean is HIGH-only. Self-consistent divergence
              // from the 35.1 source (which records total res.findings.length).
              findingsCount: highs.length,
              provider: result.provider,
              ...(result.model ? { model: result.model } : {}),
              verdict: nv.verdict,
              ...(bypassed ? { bypassed: true } : {}),
            });
            await atomicWriteText(
              sidecarPath,
              JSON.stringify(
                {
                  draftId: state.activeDraft,
                  converged: pass,
                  attempts:
                    nv.verdict === 'pass' ? attemptsSoFar : nv.attempt,
                  maxAttempts,
                  history,
                  // legacy-style top-level fields for parity with the other
                  // *-REVIEW.json sidecars:
                  pass,
                  provider: result.provider,
                  ...(result.model ? { model: result.model } : {}),
                  findings: highs.length,
                  at: now,
                },
                null,
                2,
              ) + '\n',
            );

            if (!pass) {
              for (const h of highs) {
                process.stderr.write(
                  `code-review: ${h.file}${h.line !== undefined ? `:${h.line}` : ''} high — ${h.message}\n`,
                );
              }
              if (bypassed) {
                // Phase 24.3 contract — branching proceed-line VERBATIM
                // (`--force` arm kept so the contract is not silently
                // narrowed) + code-review-high(bypassed:true) under the
                // existing `anomaly-notify` guard, exactly as Phase 24.3.
                const flag =
                  opts.force === true
                    ? '--force'
                    : '--allow-code-review-failure';
                process.stderr.write(
                  `code-review: ${flag} set; proceeding past ${highs.length} HIGH finding(s).\n`,
                );
                if (gateSet.gates.includes('anomaly-notify')) {
                  await emitCodeReviewHigh(
                    selectNotifier(cadenceConfig),
                    result.findings,
                    { provider: result.provider, bypassed: true },
                  );
                }
                if (nv.verdict === 'escalate') {
                  await emitCodeReviewUnconverged(
                    selectNotifier(cadenceConfig),
                    {
                      draftId: state.activeDraft,
                      attempts: nv.attempt,
                      maxAttempts,
                      findings: highs.length,
                      provider: result.provider,
                      ...(result.model ? { model: result.model } : {}),
                      bypassed: true,
                    },
                  );
                }
                // fall through → SUMMARY.codeReview recorded downstream
                // (codeReviewFindings already set), exactly as Phase 24.3.
              } else if (nv.verdict === 'reloop') {
                if (gateSet.gates.includes('anomaly-notify')) {
                  await emitCodeReviewHigh(
                    selectNotifier(cadenceConfig),
                    result.findings,
                    { provider: result.provider, bypassed: false },
                  );
                }
                process.stderr.write(
                  `code-review: attempt ${nv.attempt}/${maxAttempts} did not pass — ` +
                    'fix the flagged code and re-run `cadence settle run`, ' +
                    'or pass --allow-code-review-failure to proceed anyway.\n',
                );
                process.exitCode = 1;
                return;
              } else {
                // nv.verdict === 'escalate', no bypass flag → hard refuse.
                if (gateSet.gates.includes('anomaly-notify')) {
                  await emitCodeReviewHigh(
                    selectNotifier(cadenceConfig),
                    result.findings,
                    { provider: result.provider, bypassed: false },
                  );
                }
                await emitCodeReviewUnconverged(
                  selectNotifier(cadenceConfig),
                  {
                    draftId: state.activeDraft,
                    attempts: nv.attempt,
                    maxAttempts,
                    findings: highs.length,
                    provider: result.provider,
                    ...(result.model ? { model: result.model } : {}),
                  },
                );
                process.stderr.write(
                  'settle run refused: code-review did NOT converge after ' +
                    `${maxAttempts} attempts — a human decision is required. ` +
                    'Fix the flagged code, or pass --allow-code-review-failure ' +
                    'to proceed anyway.\n',
                );
                process.exitCode = 1;
                return;
              }
            }
            // pass (converged) → no stderr; codeReviewFindings already set →
            // SUMMARY.codeReview recorded downstream exactly as Phase 24.3.
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(
              `code-review: verifier failed — ${message}. Pass --allow-code-review-failure to continue.\n`,
            );
            if (opts.allowCodeReviewFailure !== true && opts.force !== true) {
              process.exitCode = 1;
              return;
            }
          }
        }

        // Phase 25.2 — security-audit verifier gate. The final, most
        // expensive gate. Fires when `'security-audit'` is in the effective
        // gate set (strict×complex only). Runs an OWASP-aware pass over
        // `git diff HEAD -- <files>` for the union of touched files, after
        // code-review and before SUMMARY assembly. CRITICAL findings refuse
        // settle unless `--force` / `--allow-security-audit-failure`. All
        // findings (any severity) land on SUMMARY.securityAudit.
        let securityAuditFindings: Finding[] | undefined;
        if (gateSet.gates.includes('security-audit')) {
          const touched = Array.from(
            new Set(draft.tasks.flatMap((t) => t.files)),
          );
          const diff = collectDiffForCodeReview(cwd, touched);
          const auditor = selectSecurityAuditVerifier(cadenceConfig);
          try {
            const result = await auditor.verify({ files: touched, diff });
            securityAuditFindings = result.findings;
            const criticals = result.findings.filter(
              (f) => f.severity === 'critical',
            );
            const bypassed =
              opts.force === true ||
              opts.allowSecurityAuditFailure === true;
            if (criticals.length > 0) {
              for (const c of criticals) {
                process.stderr.write(
                  `security-audit: ${c.line !== undefined ? `${c.line} ` : ''}critical — ${c.message}\n`,
                );
              }
              if (!bypassed) {
                process.stderr.write(
                  `settle run refused: security-audit reported ${criticals.length} CRITICAL finding(s). ` +
                    'Pass --allow-security-audit-failure to record them and settle anyway, or --force to bypass.\n',
                );
                process.exitCode = 1;
                return;
              }
              const flag =
                opts.force === true
                  ? '--force'
                  : '--allow-security-audit-failure';
              process.stderr.write(
                `security-audit: ${flag} set; proceeding past ${criticals.length} CRITICAL finding(s).\n`,
              );
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(
              `security-audit: verifier failed — ${message}. Pass --allow-security-audit-failure to continue.\n`,
            );
            if (
              opts.allowSecurityAuditFailure !== true &&
              opts.force !== true
            ) {
              process.exitCode = 1;
              return;
            }
          }
        }

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

        // Required-skill enforcement (Phase 34.1 — ROADMAP 23.4). NOT a
        // gates/engine.ts matrix cell: declaring skills IS the opt-in.
        // cadenceConfig is `… | null` (null when loadConfig failed) — every
        // deref is optional-chained, mirroring this file's other cadenceConfig?.
        // sites. Deliberate null-config behavior: still compute+record the
        // effective required (so SUMMARY stays truthful) but SKIP enforcement
        // when config didn't load (cannot read telemetry reliably; never
        // false-refuse on a degraded-config path — same never-false-refuse
        // principle as the telemetry-off case).
        {
          const effectiveRequired = [
            ...new Set([
              ...(cadenceConfig?.skillAudit?.required ?? []),
              ...(draft.requiredSkills ?? []),
            ]),
          ];
          if (effectiveRequired.length > 0 && cadenceConfig) {
            const invoked = state.skillAudit.invoked;
            if (!cadenceConfig.telemetry.skillInvocations) {
              await emitSkillAuditMiss(selectNotifier(cadenceConfig), {
                required: effectiveRequired,
                invoked,
                missing: effectiveRequired,
                severity: 'warn',
                unenforceable: true,
              });
            } else {
              const missing = missingSkills(effectiveRequired, invoked);
              if (missing.length > 0) {
                const bypass = opts.allowSkillAuditMiss === true;
                await emitSkillAuditMiss(selectNotifier(cadenceConfig), {
                  required: effectiveRequired,
                  invoked,
                  missing,
                  severity: bypass ? 'warn' : 'error',
                  ...(bypass ? { bypassed: true } : {}),
                });
                if (!bypass) {
                  process.stderr.write(
                    `settle run refused: required skill(s) not invoked: ${missing.join(', ')}. ` +
                      `Invoke them, or pass --allow-skill-audit-miss to override.\n`,
                  );
                  process.exitCode = 1;
                  return;
                }
                process.stderr.write(
                  `skill-audit: --allow-skill-audit-miss set; proceeding past ${missing.length} missing skill(s).\n`,
                );
              }
            }
          }
          // Make Summary.skillAudit.required truthful (was always []) —
          // recorded even on the null-config skip path.
          state.skillAudit.required = effectiveRequired;
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
        await backend.writeState(state);
        await atomicWriteText(join(cwd, '.cadence', 'STATE.md'), renderStateMd(state));
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

function collectHighFindings(
  findings: Record<string, Finding[]>,
): Array<{ file: string; line?: number; message: string }> {
  const out: Array<{ file: string; line?: number; message: string }> = [];
  for (const [file, list] of Object.entries(findings)) {
    for (const f of list) {
      if (f.severity !== 'high') continue;
      out.push({
        file,
        ...(f.line !== undefined ? { line: f.line } : {}),
        message: f.message,
      });
    }
  }
  return out;
}
