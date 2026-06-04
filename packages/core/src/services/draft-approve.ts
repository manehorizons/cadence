import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseDraftMd } from '../parse/draft-parser.js';
import { SimpleStateBackend } from '../state/simple.js';
import { loadConfig } from '../config/loader.js';
import { effectiveGateSet } from '../gates/engine.js';
import { buildDraftContext } from '../gates/draft-context.js';
import { runCoherenceGate, emitCoherenceWarns } from '../gates/coherence.js';
import { runApproveGate } from '../gates/approve.js';
import { runPlanReviewGate } from '../gates/plan-review.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence draft approve <phase> <num>` — run the coherence → soft-cap →
 * approve → plan-review gate ladder, then transition DRAFT→BUILD. Faithful
 * extraction of the former CLI action body.
 */
export async function draftApproveService(
  repoRoot: string,
  args: {
    phase: string;
    num: string;
    allowAutoComplex?: boolean;
    approve?: boolean;
    allowPlanReviewFailure?: boolean;
  },
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const id = `${args.phase.slice(0, 2)}-${args.num.padStart(2, '0')}`;
    const path = join(repoRoot, '.cadence', 'phases', args.phase, `${id}-DRAFT.md`);
    const draft = parseDraftMd(await readFile(path, 'utf8'));
    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    const projectMdPath = join(repoRoot, '.cadence', 'PROJECT.md');
    const projectMd = existsSync(projectMdPath) ? await readFile(projectMdPath, 'utf8') : '';
    const cfg = await loadConfig(repoRoot).catch(() => null);
    const gateSet = effectiveGateSet(state, cfg, draft);
    const ctx = buildDraftContext({
      cwd: repoRoot, state, draft, config: cfg, gateSet, phase: args.phase, id, projectMd,
      opts: {
        ...(args.allowAutoComplex !== undefined ? { allowAutoComplex: args.allowAutoComplex } : {}),
        ...(args.approve !== undefined ? { approve: args.approve } : {}),
        ...(args.allowPlanReviewFailure !== undefined ? { allowPlanReviewFailure: args.allowPlanReviewFailure } : {}),
      },
    });

    // Coherence blockers refuse before any state mutation (exit 2).
    if ((await runCoherenceGate(ctx)).outcome === 'refuse') {
      return { exitCode: 2 };
    }
    // DESIGN.md §4 M2 — soft cap on auto × complex (Phase 21.1).
    if (gateSet.softCap && !args.allowAutoComplex) {
      io.err(
        'draft approve refused: auto × complex is soft-capped (DESIGN.md §4 M2). Pass --allow-auto-complex to override, or bump the draft\'s profile to standard/strict.\n',
      );
      return { exitCode: 1 };
    }
    if (gateSet.softCap && args.allowAutoComplex) {
      io.err('draft approve: --allow-auto-complex set; proceeding past soft cap (auto × complex).\n');
    }
    // Manual approve gate (Phase 24.1) then plan-review gate (25.1 / 35.1).
    if ((await runApproveGate(ctx)).outcome === 'refuse') {
      return { exitCode: 1 };
    }
    if ((await runPlanReviewGate(ctx)).outcome === 'refuse') {
      return { exitCode: 1 };
    }
    // Coherence-warn emission at approve time (before the BUILD transition).
    await emitCoherenceWarns(ctx, 'coherence.approve');

    state.activePhase = args.phase;
    state.activeDraft = id;
    state.loopPosition = 'BUILD';
    state.tier = draft.tier;
    state.draftReadAt = new Date().toISOString();
    if (!state.openDrafts.some((d) => d.id === id)) {
      state.openDrafts.push({ id, since: new Date().toISOString() });
    }
    await backend.commit(state);
    io.out(`Approved ${id}; loopPosition=BUILD\n`);
    return { exitCode: 0, data: { id, loopPosition: 'BUILD' } };
  } catch (err) {
    io.err(`draft approve failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
