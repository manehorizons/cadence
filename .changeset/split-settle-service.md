---
'@manehorizons/cadence-core': patch
---

Refactors `rec-20260725-007`: `settleService` (`packages/core/src/services/settle.ts`)
was a single ~555-line function spanning at least 9 concerns — bypass-arg
parsing, the phase-collision backstop, the mock-verifier banner, gate-loop
handling, per-AC evidence derivation, the evidence-floor gate, the friction
digest, recommendation ship-promotion, and the interactive GitHub-issue
offer — distinguished only by inline `// Phase N` comments, not function
boundaries. It is now decomposed into 9 named, private, top-level step
functions (`loadSettlePreconditions`, `checkPhaseCollisionBackstop`,
`resolveSettleGateSet`, `buildSettleContext`, `writeRefusedSettleSummary`,
`deriveSettleAcResults`, `runAnomalyAndSkillAuditChecks`,
`deriveEvidenceAndCheckFloor`, `finalizeAndCloseSettle`), with
`settleService` itself reduced to a short, top-to-bottom orchestrator that
calls them in sequence. This is a pure, behavior-preserving extraction — no
logic, ordering, message text, or the `settleService`/`SettleArgs`/
`CommandResult` public interface changed, and no test files were edited;
the existing `settle*.test.ts` behavioral suites are unchanged and pass
exactly as before (363/363 files, 3295/3295 tests in `cadence-core`).
