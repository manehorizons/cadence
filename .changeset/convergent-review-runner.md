---
'@manehorizons/cadence-core': patch
---

Extracted a shared `runConvergentReview` primitive (in `packages/core/src/verify/converge.ts`,
alongside `nextConvergence`) that all 4 bounded-convergence call sites
(`plan-review`, `code-review`, `spec-approve`'s spec-review and ui-spec-review)
now delegate to, instead of each independently re-implementing the same
read-sidecar → verify → verdict → history-append → write-sidecar → branch
sequence (rec-20260725-008). Purely internal — no change to the convergence
policy, sidecar JSON on-disk shape, or CLI-visible behavior; a future fifth
convergence call site (e.g. survey #4's settle-gate convergence) can now reuse
this primitive instead of copy-pasting a fifth time.
