---
'@manehorizons/cadence-core': minor
---

Fixed three more silent-refusal gaps in `cadence settle run`: the
AC-derivation refusal (`--auto`/`--interactive` finding a blocked or
incomplete task), the anomaly/skill-audit refusal, and the evidence-floor
refusal each previously exited 1 with zero durable evidence beyond an
ephemeral stderr line — no `SUMMARY.json`/`.md` was written at all. Phase
247 had already fixed this for the gate-loop refusal family (a gate itself
returning `refused`); these three post-gate-loop families were a separate,
undocumented gap in the same mechanism.

All three now route through the existing `writeRefusedSettleSummary`
(unchanged), reusing the `acc`/`gates` already computed earlier in
`settleService` — no new parameters on any helper function, no
reimplementation. A findings-bearing refusal in any of these three
families inherits the identical conditional `contentHash` and per-attempt
snapshot-sibling behavior phase 247 built for the gate-loop family;
`acResults` stays `[]` on all four refusal families alike, matching the
existing invariant. Exit code, stderr messaging, loop-state non-mutation,
and every gate's own outcome are unchanged.

Out of scope, unchanged by design: `loadSettlePreconditions`'s precondition
refusal, `checkPhaseCollisionBackstop`'s worktree-collision backstop, and
`resolveSettleGateSet`'s soft-cap refusal all fire before a `gates`
provenance array exists to attach a SUMMARY to — none of the three writes
one, before or after this change.
