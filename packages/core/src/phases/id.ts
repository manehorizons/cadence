// packages/core/src/phases/id.ts
//
// Canonical phase-task id derivation (`PP-TT`). One source of truth, replacing
// six copies of `phase.slice(0,2)` + `num.padStart(2,'0')` — a positional
// truncation that turned `100-foo` into `10` (rec-20260610-001). Mirrors the
// leading-numeric-token rule of `phaseNumber()` in `collision.ts`, but keeps the
// digits as a width-preserving string (so `00-demo` stays `00`, not `0`) and pads
// each half to a MINIMUM of 2 — the min-2 invariant the id schema enforces.

/**
 * Build a canonical `PP-TT` phase-task id from a phase arg (slug or number) and
 * a task-number arg. Each half is zero-padded to a minimum of two digits and
 * grows wider as needed (phase 100 → `100`). Throws if `phaseArg` has no leading
 * numeric token.
 */
export function derivePhaseTaskId(phaseArg: string, numArg: string): string {
  const m = /^(\d+)/.exec(phaseArg);
  if (!m) throw new Error(`invalid phase (no leading number): ${phaseArg}`);
  const lead = m[1] ?? '';
  const phase = lead.padStart(2, '0');
  const num = numArg.padStart(2, '0');
  return `${phase}-${num}`;
}
