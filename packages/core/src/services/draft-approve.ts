import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import { parseDraftMd } from '../parse/draft-parser.js';
import { SimpleStateBackend } from '../state/simple.js';
import { loadConfig } from '../config/loader.js';
import { effectiveGateSet } from '../gates/engine.js';
import { resolvePacks, type ResolvedPack } from '../packs/resolve.js';
import { buildDraftContext } from '../gates/draft-context.js';
import type { DraftGateContext } from '../gates/draft-types.js';
import { runCoherenceGate, emitCoherenceWarns } from '../gates/coherence.js';
import { runApproveGate } from '../gates/approve.js';
import { runPlanReviewGate } from '../gates/plan-review.js';
import { assertSafePhaseSlug, derivePhaseTaskId } from '../phases/id.js';
import { formatCommandError } from './format-command-error.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * Emit the `auto-complex-override` anomaly when `--allow-auto-complex`
 * bypasses the draft-approve soft cap (Phase 187 / T3, DESIGN.md §4 M2).
 * Membership-gated on `anomaly-notify`, mirroring `emitCoherenceWarns` —
 * the caller does the gating check, not the emit implementation.
 */
export async function emitAutoComplexOverride(ctx: DraftGateContext): Promise<void> {
  if (!ctx.gateSet.gates.includes('anomaly-notify')) return;
  const event: AnomalyEvent = {
    type: 'auto-complex-override',
    severity: 'warn',
    message: 'auto × complex soft cap bypassed via --allow-auto-complex (DESIGN.md §4 M2)',
    context: {},
    ts: new Date().toISOString(),
  };
  await ctx.emit.autoComplexOverride(event);
}

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
    const phase = assertSafePhaseSlug(args.phase);
    const id = derivePhaseTaskId(phase, args.num);
    const path = join(repoRoot, '.cadence', 'phases', phase, `${id}-DRAFT.md`);
    if (!existsSync(path)) {
      io.err(`draft approve refused: ${path} not found.\n`);
      return { exitCode: 1 };
    }
    const draft = parseDraftMd(await readFile(path, 'utf8'));
    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    const projectMdPath = join(repoRoot, '.cadence', 'PROJECT.md');
    const projectMd = existsSync(projectMdPath) ? await readFile(projectMdPath, 'utf8') : '';
    const cfg = await loadConfig(repoRoot);
    // Phase 292 (Slice 3, T2) — REAL pack resolution. This gate set is a
    // command-boundary enforcement decision, not a narrow membership probe:
    // it drives the coherence gate, the auto×complex soft cap, the manual
    // approve gate, and the plan-review gate. A pack that adds `approve` or
    // `plan-review` to the active cell must actually tighten this checkpoint,
    // so `[]` here would silently no-op the pack's whole reason for existing.
    // Best-effort per the `config-explain/gather.ts` idiom: `resolvePacks`
    // already folds every read/parse/schema failure into a per-pack `{error}`
    // entry rather than throwing, so this catch is unreachable
    // defense-in-depth — it exists only so an unforeseen throw can never take
    // `draft approve` down. Unresolvable packs stay visible where the
    // operator already looks for them (`cadence doctor`, settle's
    // unresolvable-packs check).
    let resolvedPacks: ResolvedPack[] = [];
    try {
      resolvedPacks = await resolvePacks(repoRoot, cfg);
    } catch {
      resolvedPacks = [];
    }
    const gateSet = effectiveGateSet(state, cfg, draft, resolvedPacks);
    const ctx = buildDraftContext({
      cwd: repoRoot, state, draft, config: cfg, gateSet, phase, id, projectMd,
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
      await emitAutoComplexOverride(ctx);
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

    state.activePhase = phase;
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
    io.err(`${formatCommandError('draft approve', err)}\n`);
    return { exitCode: 1 };
  }
}
