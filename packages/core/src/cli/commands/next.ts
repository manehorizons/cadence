import type { Command } from 'commander';
import type { LoopPosition } from '@manehorizons/cadence-types';
import { SimpleStateBackend } from '../../state/simple.js';
import { nextAction, type LegalMove, type NextActionHints } from '../../progress.js';
import { loadStatus } from '../../status.js';
import { resolveNextFreePhase } from '../../phases/next-free.js';
import { readMilestoneLedger } from '../../intelligence/store/milestones.js';
import { readRecommendationLedger } from '../../intelligence/store/io.js';
import { findNearestCandidates } from '../../intelligence/nearest-candidate.js';
import { formatCommandError } from '../../services/format-command-error.js';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';

/**
 * `cadence next` — phase 206 T2. schemaVersion:1 JSON contract (AC-2):
 * `{schemaVersion, position, remainingTasks, blockedOn, legalMoves[]}`.
 * `position` is the overall loop position (`state.loopPosition`);
 * `remainingTasks`/`blockedOn` are top-level convenience fields that mirror
 * the top-ranked move's (`legalMoves[0]`) own fields of the same name — per
 * T1's implementer's note these are assembled here, not new fields on
 * `nextAction()`'s return.
 */
export interface NextReport {
  schemaVersion: 1;
  position: LoopPosition;
  remainingTasks: string[];
  blockedOn: string[];
  legalMoves: LegalMove[];
}

const PASS_STATUSES = new Set(['DONE', 'DONE_WITH_CONCERNS']);

/**
 * Best-effort IDLE-only ledger hints (phase 206 T2): the next undrafted phase
 * in a milestone the operator is already mid-executing, and the top-ranked
 * unconverted recommendation available to promote. Reuses the existing
 * ledger readers and the same ranking `cadence recommend` already applies
 * (`partitionLedger` + `scoreRecommendation`) rather than re-deriving it.
 * Never throws — any read/parse failure degrades to `undefined` so `next`
 * falls back to the plain draft-new suggestion (the "empty ledgers" case).
 */
async function resolveIdleLedgerHints(
  repoRoot: string,
  nextPhaseNumber: number | undefined,
): Promise<NextActionHints['ledger'] | undefined> {
  try {
    const [milestoneLedger, recLedger] = await Promise.all([
      readMilestoneLedger(repoRoot),
      readRecommendationLedger(repoRoot),
    ]);
    const recById = new Map(recLedger.recommendations.map((r) => [r.id, r] as const));

    // "In-flight" = accepted or already exported to the backend, i.e. the
    // operator is actively working it — not merely proposed, and not
    // deferred/closed. Most-recently-updated wins when several qualify.
    let milestoneNextPhase: { phaseNumber: number; title: string } | undefined;
    const inFlight = milestoneLedger.milestones
      .filter((m) => m.status === 'accepted' || m.status === 'exported')
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    if (inFlight !== undefined && nextPhaseNumber !== undefined) {
      const nextRecId = inFlight.recommendationIds.find((id) => {
        const rec = recById.get(id);
        return rec !== undefined && rec.convertedToPhaseId === undefined;
      });
      if (nextRecId !== undefined) {
        const rec = recById.get(nextRecId);
        if (rec !== undefined) {
          milestoneNextPhase = { phaseNumber: nextPhaseNumber, title: rec.title };
        }
      }
    }

    // Same ranking `cadence recommend` surfaces as its top pick (raw score
    // desc, then createdAt asc, then id asc) — never re-derived
    // independently, sourced via the shared `findNearestCandidates` helper
    // (phase 207 T1). Its `ranked` partition also includes already-`accepted`
    // recs (partitionLedger only excludes rejected/converted/shipped/
    // settle-pending), but an accepted rec is no longer "available to
    // promote" — the eligibility predicate restricts to `candidate` so an
    // already-promoted top-scorer doesn't get suggested for promotion again.
    let topRecommendation: { id: string; title: string } | undefined;
    const { top } = findNearestCandidates(recLedger.recommendations, {
      isEligible: (rec) => rec.status === 'candidate',
    });
    if (top !== undefined) {
      topRecommendation = { id: top.rec.id, title: top.rec.title };
    }

    if (milestoneNextPhase === undefined && topRecommendation === undefined) return undefined;
    return {
      ...(milestoneNextPhase !== undefined ? { milestoneNextPhase } : {}),
      ...(topRecommendation !== undefined ? { topRecommendation } : {}),
    };
  } catch {
    return undefined;
  }
}

/**
 * Best-effort BUILD-only hints, derived from the same task/AC facts
 * `cadence status` already computes (`loadStatus`) — never re-parses the
 * draft/progress files independently. `undefined` when there's no active
 * draft to read (falls back to `nextAction`'s pre-206 compound message).
 */
async function resolveBuildLedgerHints(
  repoRoot: string,
): Promise<NextActionHints['build'] | undefined> {
  const status = await loadStatus(repoRoot);
  if (status.tasks.length === 0) return undefined;
  const remainingTaskIds = status.tasks
    .filter((t) => !PASS_STATUSES.has(t.status))
    .map((t) => t.id);
  const unresolvedAcs = status.acs.filter((a) => a.state !== 'pass').map((a) => a.id);
  const firstPendingTaskId = status.tasks.find((t) => t.status === 'PENDING')?.id ?? null;
  return { firstPendingTaskId, remainingTaskIds, unresolvedAcs };
}

/**
 * Gather the (best-effort) hints `nextAction` needs at the current loop
 * position — the same live-fact-gathering shell `cadence progress` already
 * runs (`services/progress.ts`), extended with phase 206's new hint fields
 * so `legalMoves` carries real ranked data rather than the single-move
 * fallback. Only IDLE and BUILD need extra reads; every other position
 * returns `undefined` (nothing for `nextAction` to enrich with).
 */
async function resolveHints(
  repoRoot: string,
  loopPosition: LoopPosition,
): Promise<NextActionHints | undefined> {
  if (loopPosition === 'IDLE') {
    const nextPhaseNumber = (await resolveNextFreePhase(repoRoot)) ?? undefined;
    const ledger = await resolveIdleLedgerHints(repoRoot, nextPhaseNumber);
    if (nextPhaseNumber === undefined && ledger === undefined) return undefined;
    return {
      ...(nextPhaseNumber !== undefined ? { nextPhaseNumber } : {}),
      ...(ledger !== undefined ? { ledger } : {}),
    };
  }
  if (loopPosition === 'BUILD') {
    const build = await resolveBuildLedgerHints(repoRoot);
    return build !== undefined ? { build } : undefined;
  }
  return undefined;
}

function renderNext(data: NextReport): string {
  const out: string[] = [];
  out.push(`Position: ${data.position}`);
  out.push('Legal moves:');
  data.legalMoves.forEach((move, i) => {
    out.push(`  ${i + 1}. [${move.position}] ${move.command}`);
    out.push(`     ${move.reason}`);
  });
  return out.join('\n') + '\n';
}

/**
 * `cadence next` — read-only ranked legal moves at the current loop position
 * (phase 206). Sourced entirely from the extended `nextAction()` (T1) via a
 * hint-populated call; never mutates `.cadence/` state.
 */
export async function nextService(
  repoRoot: string,
  io: CommandIO,
  args: { json?: boolean } = {},
): Promise<CommandResult> {
  try {
    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    const hints = await resolveHints(repoRoot, state.loopPosition);
    const action = nextAction(state, hints);
    const top = action.legalMoves[0];
    const data: NextReport = {
      schemaVersion: 1,
      position: state.loopPosition,
      remainingTasks: top?.remainingTasks ?? [],
      blockedOn: top?.blockedOn ?? [],
      legalMoves: action.legalMoves,
    };
    if (args.json) {
      io.out(JSON.stringify(data) + '\n');
    } else {
      io.out(renderNext(data));
    }
    return { exitCode: 0, data };
  } catch (err) {
    io.err(`${formatCommandError('next', err)}\n`);
    return { exitCode: 1 };
  }
}

export function registerNextCommand(program: Command): void {
  program
    .command('next')
    .description('Show ranked legal next moves at the current loop position')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      const args: { json?: boolean } = {};
      if (opts.json) args.json = true;
      const { exitCode } = await nextService(process.cwd(), processIO(), args);
      if (exitCode) process.exitCode = exitCode;
    });
}
