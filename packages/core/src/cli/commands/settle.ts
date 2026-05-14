import type { Command } from 'commander';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Summary } from '@cadence/types';
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
    .action(
      async (opts: {
        ac?: string[];
        auto?: boolean;
        force?: boolean;
        allowMissingCoverage?: boolean;
      }) => {
      try {
        const cwd = process.cwd();
        const backend = new SimpleStateBackend(cwd);
        const state = await backend.readState();
        if (state.loopPosition !== 'BUILD' || !state.activeDraft || !state.activePhase) {
          throw new LoopViolationError('settle run requires loopPosition=BUILD with an active draft');
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

        let acResults: AcResult[] = explicit;
        if (opts.auto) {
          const derived = deriveAcResults(draft, progress as ProgressFile);
          const offenders = derived.filter(
            (d) =>
              d.verdict !== 'pass' && !explicitIds.has(d.id),
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
          const merged: AcResult[] = [...explicit];
          for (const d of derived) {
            if (explicitIds.has(d.id)) continue;
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
        process.exitCode = 1;
      }
    });
}
