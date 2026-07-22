import { describe, it, expect } from 'vitest';
import { emptyState } from '@manehorizons/cadence-types';
import { buildQuickstart } from '../src/quickstart/build.js';
import { renderText } from '../src/quickstart/render.js';

/**
 * Phase 206 T4 — non-regression coverage for the one interaction T1/T2's own
 * tests didn't already close: `cadence quickstart`'s rendered next-step
 * output calls through `buildQuickstart()` -> `nextAction()`, and `nextAction`
 * now also computes `legalMoves[]` (phase 206 T1). `packages/core/tests/
 * quickstart/build.test.ts` and `quickstart/render.test.ts` already cover
 * IDLE/BUILD shape, but neither pins the exact rendered text byte-for-byte,
 * and neither covers DRAFT. These tests do both: assert the printed "Next:"
 * block is exactly what it was pre-206 (same command, same reason, nothing
 * about ranked legal moves leaking into the human-readable render) for IDLE
 * and DRAFT.
 */
describe('cadence quickstart — non-regression after nextAction() legalMoves upgrade', () => {
  // AC-3: IDLE — same command/reason text as before T1, and the text render
  // never mentions the new legalMoves machinery (position slugs, ranked-move
  // framing) that only `next`/`--json` consumers should see.
  it('AC-3: IDLE renders the exact pre-206 Next block, no legalMoves leakage', () => {
    const state = { ...emptyState('demo'), loopPosition: 'IDLE' as const };
    const qs = buildQuickstart({ initialized: true, state, nextPhaseHint: 7 });

    // Legacy shape callers still see: byte-identical command/reason text.
    expect(qs.next?.command).toBe('cadence draft new --title "..."');
    expect(qs.next?.reason).toBe(
      'No active draft. Start the loop; draft new will derive phase 7-<title-slug> task 1.',
    );

    const text = renderText(qs);
    expect(text).toContain('Next: cadence draft new --title "..."');
    expect(text).toContain(
      '      No active draft. Start the loop; draft new will derive phase 7-<title-slug> task 1.',
    );
    // The render is still exactly command + reason + the progress pointer —
    // no ranked-move list, no `position:`/`legalMoves` text has crept in.
    expect(text).not.toMatch(/legalMoves|position:\s*['"]?draft-new/i);
  });

  // AC-3: DRAFT — same non-regression proof, at a second loop position, per
  // the task instructions (IDLE + DRAFT at minimum).
  it('AC-3: DRAFT renders the exact pre-206 Next block, no legalMoves leakage', () => {
    const state = {
      ...emptyState('demo'),
      loopPosition: 'DRAFT' as const,
      activePhase: '206-cadence-next',
      activeDraft: '206-01',
    };
    const qs = buildQuickstart({ initialized: true, state });

    expect(qs.next?.command).toBe('cadence draft approve 206-cadence-next 01');
    expect(qs.next?.reason).toBe(
      'DRAFT is open. Fill in objective, ACs, and tasks, run cadence draft check, then approve to enter BUILD.',
    );

    const text = renderText(qs);
    expect(text).toContain('Next: cadence draft approve 206-cadence-next 01');
    expect(text).toContain(
      '      DRAFT is open. Fill in objective, ACs, and tasks, run cadence draft check, then approve to enter BUILD.',
    );
    expect(text).not.toMatch(/legalMoves|position:\s*['"]?approve-draft/i);
  });

  // AC-3: quickstart --json's `next` field is deliberately narrowed to
  // {command, reason} (see build.ts), mirroring services/progress.ts's
  // identical narrowing — nextAction()'s new legalMoves[] (T1) is `cadence
  // next`'s surface, not quickstart's. Pins the exact JSON shape so this
  // doesn't silently regrow the field.
  it('AC-3: quickstart --json next field is exactly {command, reason}, no legalMoves leak', () => {
    const state = { ...emptyState('demo'), loopPosition: 'DRAFT' as const };
    const qs = buildQuickstart({ initialized: true, state });
    expect(qs.next).toEqual({
      command: 'cadence draft approve <phase> <num>',
      reason:
        'DRAFT is open. Fill in objective, ACs, and tasks, run cadence draft check, then approve to enter BUILD.',
    });
    expect(Object.keys(qs.next as object).sort()).toEqual(['command', 'reason']);
  });
});
