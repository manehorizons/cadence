---
'@manehorizons/cadence-core': minor
---

Adds a `phase-freshness` check to `cadence doctor`: warns when the active phase/draft's `PROGRESS.json` has a task `updatedAt` within the last 10 minutes, naming the task and its age, with remediation to confirm no other session is actively working on the same phase/draft before continuing — closing rec-20260722-001.

The freshness math lives in a new pure `assessProgressFreshness` (`packages/core/src/phases/liveness.ts`), following the existing `collision.ts` pure/impure split. Read-only and best-effort like the rest of `doctor`: no active phase/draft, or no `PROGRESS.json` yet, both degrade to `ok` rather than being treated as a problem.
