import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseDraftMd } from '../../parse/draft-parser.js';
import { coherenceCheck } from '../../coherence/check.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';
import { loadConfig } from '../../config/loader.js';
import { effectiveGateSet } from '../../gates/engine.js';
import { buildDraftContext } from '../../gates/draft-context.js';
import {
  runCoherenceGate,
  emitCoherenceWarns,
  printAllCoherenceIssues,
} from '../../gates/coherence.js';
import { runApproveGate } from '../../gates/approve.js';
import { runPlanReviewGate } from '../../gates/plan-review.js';
import { registerDraftNew } from './draft-new.js';

// Re-exported for the `ask-approve-verdict` suite (moved to gates/approve.ts).
export { askApproveVerdict } from '../../gates/approve.js';

export function registerDraftCommand(program: Command): void {
  const cmd = program.command('draft').description('Draft phase workflow');

  registerDraftNew(cmd);

  cmd
    .command('check <path>')
    .description('Coherence-check a DRAFT.md against state.json + PROJECT.md')
    .action(async (path: string) => {
      try {
        const cwd = process.cwd();
        const draft = parseDraftMd(await readFile(path, 'utf8'));
        const state = await new SimpleStateBackend(cwd).readState();
        const projectMdPath = join(cwd, '.cadence', 'PROJECT.md');
        const projectMd = existsSync(projectMdPath) ? await readFile(projectMdPath, 'utf8') : '';
        const issues = coherenceCheck(draft, state, projectMd).issues;
        if (issues.length === 0) {
          console.log('coherence: OK');
          return;
        }
        const blocked = printAllCoherenceIssues(issues, { err: (s) => process.stderr.write(s) });
        // Phase 23.2 — coherence-warn emission (gated on anomaly-notify). Block
        // issues already printed loudly above; warns still emit even when blocked.
        if (issues.some((i) => i.severity === 'warn')) {
          const cfg = await loadConfig(cwd).catch(() => null);
          const ctx = buildDraftContext({
            cwd, state, draft, config: cfg,
            gateSet: effectiveGateSet(state, cfg, draft),
            phase: '', id: '', projectMd, opts: {},
          });
          await emitCoherenceWarns(ctx, 'coherence.check');
        }
        if (blocked) process.exitCode = 2;
      } catch (err) {
        process.stderr.write(`draft check failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });

  cmd
    .command('approve <phase> <num>')
    .description('Approve a draft and enter BUILD phase')
    .option('--allow-auto-complex', 'override DESIGN.md §4 M2 soft cap: approve an auto × complex draft anyway')
    .option('--no-approve', "bypass the manual approve gate (Phase 24.1) per invocation; required for non-TTY runs when the 'approve' gate is in the effective set")
    .option('--allow-plan-review-failure', 'proceed past a failing plan-review gate (Phase 25.1) instead of refusing approve; findings are still printed')
    .action(
      async (
        phase: string,
        num: string,
        opts: { allowAutoComplex?: boolean; approve?: boolean; allowPlanReviewFailure?: boolean },
      ) => {
        try {
          const cwd = process.cwd();
          const id = `${phase.slice(0, 2)}-${num.padStart(2, '0')}`;
          const path = join(cwd, '.cadence', 'phases', phase, `${id}-DRAFT.md`);
          const draft = parseDraftMd(await readFile(path, 'utf8'));
          const backend = new SimpleStateBackend(cwd);
          const state = await backend.readState();
          const projectMdPath = join(cwd, '.cadence', 'PROJECT.md');
          const projectMd = existsSync(projectMdPath) ? await readFile(projectMdPath, 'utf8') : '';
          const cfg = await loadConfig(cwd).catch(() => null);
          const gateSet = effectiveGateSet(state, cfg, draft);
          const ctx = buildDraftContext({
            cwd, state, draft, config: cfg, gateSet, phase, id, projectMd,
            opts: {
              ...(opts.allowAutoComplex !== undefined ? { allowAutoComplex: opts.allowAutoComplex } : {}),
              ...(opts.approve !== undefined ? { approve: opts.approve } : {}),
              ...(opts.allowPlanReviewFailure !== undefined ? { allowPlanReviewFailure: opts.allowPlanReviewFailure } : {}),
            },
          });

          // Coherence blockers refuse before any state mutation (exit 2).
          if ((await runCoherenceGate(ctx)).outcome === 'refuse') {
            process.exitCode = 2;
            return;
          }
          // DESIGN.md §4 M2 — soft cap on auto × complex (Phase 21.1). Not a
          // named gate; router-owned, refused before the BUILD transition.
          if (gateSet.softCap && !opts.allowAutoComplex) {
            process.stderr.write(
              'draft approve refused: auto × complex is soft-capped (DESIGN.md §4 M2). Pass --allow-auto-complex to override, or bump the draft\'s profile to standard/strict.\n',
            );
            process.exitCode = 1;
            return;
          }
          if (gateSet.softCap && opts.allowAutoComplex) {
            process.stderr.write(
              'draft approve: --allow-auto-complex set; proceeding past soft cap (auto × complex).\n',
            );
          }
          // Manual approve gate (Phase 24.1) then plan-review gate (25.1 / 35.1).
          if ((await runApproveGate(ctx)).outcome === 'refuse') {
            process.exitCode = 1;
            return;
          }
          if ((await runPlanReviewGate(ctx)).outcome === 'refuse') {
            process.exitCode = 1;
            return;
          }
          // Coherence-warn emission at approve time (before the BUILD transition
          // so failed dispatches don't leave partial state).
          await emitCoherenceWarns(ctx, 'coherence.approve');

          state.activePhase = phase;
          state.activeDraft = id;
          state.loopPosition = 'BUILD';
          state.tier = draft.tier;
          // Phase 23.1 — stamp the approve timestamp for the DRAFT-read gate.
          state.draftReadAt = new Date().toISOString();
          if (!state.openDrafts.some((d) => d.id === id)) {
            state.openDrafts.push({ id, since: new Date().toISOString() });
          }
          await backend.writeState(state);
          await atomicWriteText(join(cwd, '.cadence', 'STATE.md'), renderStateMd(state));
          console.log(`Approved ${id}; loopPosition=BUILD`);
        } catch (err) {
          process.stderr.write(`draft approve failed: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exitCode = 1;
        }
      },
    );
}
