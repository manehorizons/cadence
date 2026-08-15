---
"@thomas-powers-jr/cadence-core": minor
"@thomas-powers-jr/cadence-types": minor
---

`cadence dispatch plan` now computes an advisory execution verdict per task — `{ execution: 'inline'|'dispatch', modelClass, model, reasons[] }` — giving `config.subagentPolicy` and `config.modelPerClass` their first consumer. A new optional `class:` DRAFT task field (`TaskZ.class`) lets an operator declare a task's execution class; a pure heuristic cross-checks it and a mismatch surfaces as a `cadence draft check` coherence warning. `--json` output gains the new per-task fields plus a top-level `signals.contextUtilization` (always `null` for now — no real context-utilization signal is wired in yet). The rendered dispatch packet gains an `**Execution:**` line (and a `**Model:**` line when dispatched). Fully additive: no `schemaVersion` bump, no change to existing fields, and `dispatch plan` remains read-only/advisory only — it does not spawn, schedule, or supervise agents.
