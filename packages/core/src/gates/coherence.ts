import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import type { CoherenceIssue } from '../coherence/check.js';
import type { DraftGateContext, DraftGateImpl } from './draft-types.js';
import type { GateResult, IoPort } from './types.js';

/**
 * Coherence gate (Phase 23.2). Extracted from draft.ts (Phase 39.7).
 * `coherence-check` is an ALWAYS_FIRE gate but is never membership-consulted —
 * coherence runs UNCONDITIONALLY (bit-identical; deliberately NOT wired to its
 * gate-set membership, unlike 39.2's two gates). The result is read from
 * `ctx.coherence()` (memoized) so the approve blocker-refuse and the later
 * warn-emit share one computation.
 */

/** Approve-time blocker step: refuse (router → `exitCode = 2`) on any block. */
export const runCoherenceGate: DraftGateImpl = async (ctx): Promise<GateResult> => {
  const blockers = ctx.coherence().issues.filter((i) => i.severity === 'block');
  if (blockers.length > 0) {
    for (const b of blockers) ctx.io.err(`[BLOCK] ${b.code}: ${b.message}\n`);
    return { outcome: 'refuse' };
  }
  return { outcome: 'pass' };
};

/**
 * Emit `coherence-warn` anomalies for warn-severity issues, gated on
 * `anomaly-notify` membership. `source` distinguishes the call site
 * (`'coherence.check'` for `draft check`, `'coherence.approve'` for approve).
 */
export async function emitCoherenceWarns(
  ctx: DraftGateContext,
  source: 'coherence.check' | 'coherence.approve',
): Promise<void> {
  const warns = ctx.coherence().issues.filter((i) => i.severity === 'warn');
  if (warns.length === 0) return;
  if (!ctx.gateSet.gates.includes('anomaly-notify')) return;
  const now = new Date().toISOString();
  const events: AnomalyEvent[] = warns.map((w) => ({
    type: 'coherence-warn' as const,
    severity: 'warn' as const,
    message: w.message,
    context: { code: w.code, source },
    ts: now,
  }));
  await ctx.emit.coherenceWarn(events);
}

/**
 * `draft check` presentation: print every issue — `[BLOCK] code: msg` for
 * blocks, `[WARN] [WARN] code: msg` for warns (the existing double-`[WARN]` is
 * preserved, bit-identical). Returns whether any block-severity issue was seen.
 */
export function printAllCoherenceIssues(
  issues: CoherenceIssue[],
  io: IoPort,
): boolean {
  let blocked = false;
  for (const i of issues) {
    const line = `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}`;
    if (i.severity === 'block') {
      io.err(line + '\n');
      blocked = true;
    } else {
      io.err('[WARN] ' + line + '\n');
    }
  }
  return blocked;
}
