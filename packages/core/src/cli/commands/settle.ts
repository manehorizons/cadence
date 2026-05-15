import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
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
import { scanTestCoverage, uncoveredAcs } from '../../verify/coverage.js';
import { selectVerifier } from '../../verify/factory.js';
import type {
  VerifyAc,
  VerifyInput,
  VerifyTestRef,
} from '../../verify/verifier.js';
import type { DeepVerdict } from '@cadence/types';
import { walkAcsInteractively, type InteractiveVerdict } from '../../verify/interactive.js';
import { ScriptedPrompter, StdinPrompter, type Prompter } from '../../verify/prompter.js';
import { selectNotifier } from '../../notify/factory.js';
import { collectAnomalies } from '../../notify/collect.js';
import { emitLoopViolation } from '../../notify/loop-violation.js';
import { selectCodeReviewVerifier } from '../../verify/code-review-factory.js';
import { emitCodeReviewHigh } from '../../notify/code-review.js';
import { selectSecurityAuditVerifier } from '../../verify/security-audit-factory.js';

interface ProgressJson {
  draftId: string;
  tasks: Record<string, { status: string; notes: string; touchedFiles: string[]; updatedAt: string }>;
}

interface AcResult {
  id: string;
  pass: boolean;
  note?: string;
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
      '--allow-code-review-failure',
      'do not refuse on HIGH-severity code-review findings; record them in SUMMARY and emit anomalies anyway (Phase 24.3)',
    )
    .option(
      '--allow-security-audit-failure',
      'do not refuse on CRITICAL security-audit findings; record them in SUMMARY and settle anyway (Phase 25.2)',
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
        allowVerifierFailure?: boolean;
        allowCodeReviewFailure?: boolean;
        allowSecurityAuditFailure?: boolean;
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

        // Phase 23.1 — DRAFT-read mtime gate. Fires when 'draft-read' is in
        // the effective gate set AND state has a draftReadAt baseline AND
        // the DRAFT.md mtime is strictly newer than that baseline.
        if (
          gateSet.gates.includes('draft-read') &&
          state.draftReadAt !== null
        ) {
          const { stat } = await import('node:fs/promises');
          const draftStat = await stat(draftPath);
          const mtimeMs = draftStat.mtime.getTime();
          const baselineMs = Date.parse(state.draftReadAt);
          if (mtimeMs > baselineMs) {
            if (!opts.allowStaleDraft) {
              process.stderr.write(
                `settle run refused: DRAFT.md was edited after approve (mtime ${draftStat.mtime.toISOString()} > draftReadAt ${state.draftReadAt}). Re-read it then re-approve, or pass --allow-stale-draft to override.\n`,
              );
              process.exitCode = 1;
              return;
            }
            process.stderr.write(
              'settle: --allow-stale-draft set; proceeding past draft-read gate (DRAFT.md mtime newer than draftReadAt).\n',
            );
          }
        }

        const coverageBypassed =
          gateSet.gates.includes('test-coverage') === true &&
          opts.allowMissingCoverage === true;
        let verifierFailure: { message: string; provider?: string } | undefined;
        if (
          gateSet.gates.includes('test-coverage') &&
          !opts.allowMissingCoverage &&
          opts.auto !== false // gate applies to --auto path; legacy --ac-only flow unaffected
        ) {
          const globs = cadenceConfig?.verification?.testGlobs;
          const coverage = await scanTestCoverage(
            cwd,
            globs ? { globs } : {},
          );
          const acIds = draft.acceptanceCriteria.map((a) => a.id);
          const unmet = uncoveredAcs(
            acIds.filter((id) => !explicitIds.has(id)),
            coverage,
          );
          if (unmet.length > 0 && !opts.force) {
            const globsLabel =
              cadenceConfig?.verification?.testGlobs?.join(', ') ?? '(defaults)';
            for (const id of unmet) {
              process.stderr.write(
                `coverage: ${id} has no linked test (searched: ${globsLabel})\n`,
              );
            }
            process.stderr.write(
              'settle run refused: each AC needs at least one test that references its id (e.g. AC-1 in a describe/it). ' +
                'Pass --allow-missing-coverage to bypass, or --force to settle anyway.\n',
            );
            process.exitCode = 1;
            return;
          }
        }

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
        let deepVerify: Record<string, DeepVerdict> | undefined;
        const deepRequested =
          opts.deep === true || gateSet.gates.includes('deep-verify');
        if (deepRequested && opts.auto !== false) {
          const verifier = selectVerifier(cadenceConfig);
          const acs: VerifyAc[] = draft.acceptanceCriteria.map((a) => ({
            id: a.id,
            given: a.given,
            when: a.when,
            then: a.then,
          }));
          const coverageGlobs = cadenceConfig?.verification?.testGlobs;
          const coverageForVerifier = await scanTestCoverage(
            cwd,
            coverageGlobs ? { globs: coverageGlobs } : {},
          );
          const testsForVerifier: Record<string, VerifyTestRef[]> = {};
          for (const [id, refs] of coverageForVerifier) {
            testsForVerifier[id] = refs;
          }
          const touchedFiles = Array.from(
            new Set(draft.tasks.flatMap((t) => t.files)),
          );
          const verifyInput: VerifyInput = {
            acs,
            tests: testsForVerifier,
            diff: '',
            files: touchedFiles,
          };
          try {
            const result = await verifier.verify(verifyInput);
            deepVerify = {};
            for (const ac of acs) {
              const v = result.verdicts[ac.id];
              if (v) {
                deepVerify[ac.id] = {
                  pass: v.pass,
                  reason: v.reason,
                  provider: result.provider,
                  ...(result.model ? { model: result.model } : {}),
                };
              }
            }
            const offenders = acs
              .map((a) => a.id)
              .filter(
                (id) =>
                  !explicitIds.has(id) &&
                  deepVerify![id] !== undefined &&
                  deepVerify![id]!.pass === false,
              );
            if (offenders.length > 0 && !opts.force) {
              for (const id of offenders) {
                process.stderr.write(
                  `deep-verify: ${id} failed — ${deepVerify[id]!.reason} (provider: ${result.provider})\n`,
                );
              }
              process.stderr.write(
                'settle run --deep refused: the independent verifier rejected one or more ACs. ' +
                  'Pass --force to settle anyway, or address the gaps.\n',
              );
              process.exitCode = 1;
              return;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (opts.allowVerifierFailure) {
              process.stderr.write(
                `deep-verify: verifier failed (${message}); --allow-verifier-failure set, treating all ACs as pass=false.\n`,
              );
              deepVerify = {};
              for (const ac of acs) {
                deepVerify[ac.id] = {
                  pass: false,
                  reason: `verifier failed: ${message}`,
                  provider: 'unknown',
                };
              }
              verifierFailure = {
                message,
                provider: cadenceConfig?.verifier?.provider ?? 'mock',
              };
            } else {
              process.stderr.write(
                `deep-verify: verifier failed — ${message}. Pass --allow-verifier-failure to continue.\n`,
              );
              process.exitCode = 1;
              return;
            }
          }
        }

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
            const bypassed =
              opts.force === true || opts.allowCodeReviewFailure === true;
            if (highs.length > 0) {
              for (const h of highs) {
                process.stderr.write(
                  `code-review: ${h.file}${h.line !== undefined ? `:${h.line}` : ''} high — ${h.message}\n`,
                );
              }
              if (!bypassed) {
                process.stderr.write(
                  `settle run refused: code-review reported ${highs.length} HIGH finding(s). ` +
                    'Pass --allow-code-review-failure to record them and settle anyway, or --force to bypass.\n',
                );
                process.exitCode = 1;
                return;
              }
              const flag = opts.force === true
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
            }
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
        if (opts.auto) {
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
