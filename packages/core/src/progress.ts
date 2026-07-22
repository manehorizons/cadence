import type { CadenceState } from '@manehorizons/cadence-types';

export interface NextAction {
  command: string;
  reason: string;
  /**
   * Ranked next moves (1-3 entries), most-recommended first. Phase 206 T1 —
   * strictly additive alongside `command`/`reason` above, which keep their
   * pre-206 meaning and values for existing callers (`status.ts`,
   * `quickstart/build.ts`). `legalMoves[0]` always mirrors `{command,
   * reason}` unless a richer hint (e.g. an in-flight milestone or a
   * promotable recommendation) surfaces a better-ranked alternative ahead of
   * it — see each `nextAction` branch below for the exact ranking per loop
   * position.
   */
  legalMoves: LegalMove[];
}

/**
 * One ranked next move (phase 206 T1). `position` is a short, stable,
 * machine-readable move kind — NOT the loop position (`state.loopPosition`
 * is already reported alongside this by callers that need it) — so a
 * downstream consumer (e.g. the `cadence next` CLI, phase 206 T2+) can
 * switch on *what kind* of move this is even when several ranked
 * alternatives share the same loop position (e.g. IDLE's
 * continue-milestone / promote-recommendation / draft-new alternatives).
 */
export interface LegalMove {
  /**
   * Stable move-kind slug, e.g. `'approve-draft'`, `'approve-spec'`,
   * `'record-task'`, `'settle'`, `'continue-milestone'`,
   * `'promote-recommendation'`, `'draft-new'`.
   */
  position: string;
  /** Exact CLI invocation for this move. */
  command: string;
  /** Short human-readable reason for this move. */
  reason: string;
  /**
   * BUILD-only: task ids (`T-N`) without a terminal DONE/DONE_WITH_CONCERNS
   * outcome yet, in draft order. Empty for every move outside BUILD.
   */
  remainingTasks: string[];
  /**
   * What (if anything) blocks this move from closing out right now — AC ids
   * still lacking coverage, BLOCKED/NEEDS_CONTEXT task ids, or similar.
   * Empty when nothing blocks it.
   */
  blockedOn: string[];
}

/**
 * Optional, occupancy-derived hints the impure service/CLI layer computes and
 * passes in so `nextAction` can stay pure-over-state (no I/O). v1.19 phase 86.
 */
export interface NextActionHints {
  /**
   * The worktree-aware next free phase number (`max(observed)+1` over local +
   * sibling + upstream), resolved best-effort by `resolveNextFreePhase`. When
   * present, the IDLE suggestion substitutes it so the operator's first pick
   * already clears sibling/upstream claims the v1.18 guard would refuse.
   */
  nextPhaseNumber?: number;
  /**
   * Phase 137 — BUILD-state task progress, resolved best-effort by reading
   * the active draft + PROGRESS.json. `firstPendingTaskId` is the first
   * draft task (in file order) with no recorded outcome, or `null` when
   * every task already has one. Absent entirely when it couldn't be
   * computed (e.g. the draft file is unreadable) — the BUILD case then
   * falls back to the pre-137 compound message rather than blocking.
   */
  build?: {
    firstPendingTaskId: string | null;
    /**
     * Phase 206 T1 — all task ids (`T-N`) without a terminal
     * DONE/DONE_WITH_CONCERNS outcome yet, in draft order. Optional: when
     * absent, `legalMoves`'s `remainingTasks` falls back to just
     * `[firstPendingTaskId]` (or `[]` when every task is done).
     */
    remainingTaskIds?: string[];
    /**
     * Phase 206 T1 — AC ids whose linked tasks don't all carry a
     * terminal-pass outcome yet (mirrors `deriveAcResults`'s non-`pass`
     * verdicts in `status.ts`). Optional: absent means "not computed",
     * not "none outstanding" — `legalMoves`'s `blockedOn` falls back to
     * `[]` in that case.
     */
    unresolvedAcs?: string[];
  };
  /**
   * Phase 206 T1 — IDLE-only, best-effort facts about what's available to
   * do next beyond a bare `draft new`, resolved from the milestone /
   * recommendation ledgers. Absent (or both sub-fields absent) falls back
   * to the plain draft-new suggestion as the only legal move — the "empty
   * ledgers" case.
   */
  ledger?: {
    /**
     * The next undrafted phase in a milestone the operator is already
     * mid-executing, if any. Ranks above `topRecommendation` when both are
     * present — continuing in-flight work outranks starting something new.
     */
    milestoneNextPhase?: { phaseNumber: number; title: string };
    /**
     * The highest-ranked unconverted recommendation available to promote,
     * if any (real rec id — never a placeholder).
     */
    topRecommendation?: { id: string; title: string };
  };
}

function singleMove(
  position: string,
  command: string,
  reason: string,
  remainingTasks: string[] = [],
  blockedOn: string[] = [],
): LegalMove[] {
  return [{ position, command, reason, remainingTasks, blockedOn }];
}

export function nextAction(state: CadenceState, hints?: NextActionHints): NextAction {
  switch (state.loopPosition) {
    case 'IDLE': {
      const n = hints?.nextPhaseNumber;
      const command = 'cadence draft new --title "..."';
      const reason =
        n === undefined
          ? 'No active draft. Start the loop by drafting a new unit of work.'
          : `No active draft. Start the loop; draft new will derive phase ${n}-<title-slug> task 1.`;

      // Phase 206 T1 — rank in-flight milestone continuation and promotable
      // recommendations ahead of the bare draft-new fallback when the
      // (best-effort) ledger hints surface them. Absent hints degrade to
      // the pre-206 single draft-new move (the "empty ledgers" case).
      const legalMoves: LegalMove[] = [];
      const milestoneNext = hints?.ledger?.milestoneNextPhase;
      const topRec = hints?.ledger?.topRecommendation;
      if (milestoneNext !== undefined) {
        legalMoves.push({
          position: 'continue-milestone',
          command,
          reason: `Continue the active milestone: phase ${milestoneNext.phaseNumber} — ${milestoneNext.title} is next.`,
          remainingTasks: [],
          blockedOn: [],
        });
      }
      if (topRec !== undefined) {
        legalMoves.push({
          position: 'promote-recommendation',
          command: `cadence recommendation promote ${topRec.id} --status=accepted --readiness=ready-for-milestone`,
          reason: `Promote recommendation ${topRec.id} ("${topRec.title}"), then \`cadence milestone propose\` to scope it.`,
          remainingTasks: [],
          blockedOn: [],
        });
      }
      legalMoves.push({ position: 'draft-new', command, reason, remainingTasks: [], blockedOn: [] });

      return { command, reason, legalMoves: legalMoves.slice(0, 3) };
    }
    case 'DRAFT': {
      const phase = state.activePhase ?? '<phase>';
      const num = state.activeDraft?.split('-')[1] ?? '<num>';
      const command = `cadence draft approve ${phase} ${num}`;
      const reason =
        'DRAFT is open. Fill in objective, ACs, and tasks, run cadence draft check, then approve to enter BUILD.';
      return { command, reason, legalMoves: singleMove('approve-draft', command, reason) };
    }
    case 'SPEC': {
      const phase = state.activePhase ?? '<phase>';
      const num = state.activeSpec?.split('-')[1] ?? '<num>';
      const command = `cadence spec approve ${phase} ${num}`;
      const reason =
        'SPEC is open. Fill objective, ACs, constraints, run cadence spec check, then approve to leave the spec stage.';
      return { command, reason, legalMoves: singleMove('approve-spec', command, reason) };
    }
    case 'BUILD': {
      const pending = hints?.build?.firstPendingTaskId;
      const unresolvedAcs = hints?.build?.unresolvedAcs ?? [];
      if (pending === undefined) {
        const command =
          'cadence build task <id> --status=<DONE|...>  OR  cadence settle run --ac AC-1=pass';
        const reason = 'In BUILD phase. Record task outcomes, then settle.';
        return {
          command,
          reason,
          legalMoves: singleMove(
            'record-task',
            command,
            reason,
            hints?.build?.remainingTaskIds ?? [],
            unresolvedAcs,
          ),
        };
      }
      if (pending === null) {
        const command = 'cadence settle run --auto';
        const reason = 'In BUILD phase. Every task has a recorded outcome — settle to close the loop.';
        return {
          command,
          reason,
          legalMoves: singleMove('settle', command, reason, [], unresolvedAcs),
        };
      }
      const command = `cadence build task ${pending} --status=DONE`;
      const reason = `In BUILD phase. ${pending} is the first task with no recorded outcome.`;
      return {
        command,
        reason,
        legalMoves: singleMove(
          'record-task',
          command,
          reason,
          hints?.build?.remainingTaskIds ?? [pending],
          unresolvedAcs,
        ),
      };
    }
    case 'SETTLE': {
      const command = 'cadence settle run';
      const reason = 'In SETTLE. Run to close.';
      return { command, reason, legalMoves: singleMove('settle', command, reason) };
    }
    default: {
      const _exhaustive: never = state.loopPosition;
      return _exhaustive;
    }
  }
}
