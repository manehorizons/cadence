---
'@manehorizons/cadence-core': minor
---

Fixed two compounding data-loss gaps in a refused (failed) `cadence settle`:
`writeRefusedSettleSummary` (`packages/core/src/services/settle.ts`) never
recorded the `codeReview`/`securityAudit` findings that caused the refusal
in the first place, even though they were already accumulated into `acc`
by the time the gate loop halted — they were computed, then silently
dropped at the write. Fixed by threading `acc.codeReview`/
`acc.securityAudit` into the refused `SUMMARY.json`, mirroring the
success path's shape exactly, with a `contentHash` attached exactly when
at least one of those collections is non-empty (a findings-free refusal —
e.g. a bare `build-test-must-pass` refusal — keeps producing byte-identical
output to before this change).

Second, even once recorded, a later settle attempt for the same draft
silently overwrote the previous attempt's refused record — a convergence
reloop's attempt-1 findings vanished the moment attempt-2 ran, success or
refusal. Fixed by additively writing an immutable per-attempt sibling pair
(`<id>-refused-<completedAt-slug>-SUMMARY-snapshot.json`/`.md`, exported as
`refusedSnapshotArtifactBase`) whenever a refusal recorded findings — named
so it is invisible to every existing SUMMARY-discovery consumer
(`mcp/resources.ts`, `git/diff-strict.ts`, `verify phase`, `summary
render`/`verify`) by construction, best-effort (a sibling-write failure is
reported on stderr but never affects the canonical write or settle's exit
code), and never written on the success path or for a findings-free
refusal. The canonical `<id>-SUMMARY.json`/`.md` continues to reflect only
the latest attempt, as before — nothing that reads it changes behavior;
prior attempts' siblings simply keep accumulating on disk.

`cadence summary verify`'s `NO_HASH` outcome and `packages/core/src/
services/summary-verify.ts`'s doc comment are updated to reflect the new
conditional truth: `NO_HASH` now means "pre-phase-223 record, or a refused
settle that recorded no findings" rather than "any refused settle."
