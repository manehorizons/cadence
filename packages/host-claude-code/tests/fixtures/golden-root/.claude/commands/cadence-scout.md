---
description: Divergent→convergent ideation dialogue that lands survivors as Praxis recommendations
argument-hint: [topic]
allowed-tools: Bash(cadence:*), Read
---

<!-- managed-by: cadence -->

!cadence recommend

You are running **CADENCE scout** — a divergent→convergent ideation
dialogue that turns a fuzzy problem into ranked Praxis recommendations.
Scout never drives the loop: it generates candidate directions and lands
them in the recommendation ledger. It allocates no loop id, runs no gate,
and never changes loop state.

**Topic:** $ARGUMENTS — if empty, ask the user what space to scout.

The ranked recommendations above (`!cadence recommend`) are your
orientation: don't re-propose work already captured or in flight.

Before landing anything, mint **one** scout-session id for this run in the
form `scout-YYYYMMDD-HHMM` (use the current date + time). Pass it as
`--scout-id` on every rec you land so the whole session is queryable as a
cluster later via `cadence recommend --scout-id <id>`.

1. **Diverge.** Generate many candidate directions for the topic —
   breadth first, no commitment, no filtering yet. Aim wide.
2. **Converge.** Triage *with the user* down to the few worth keeping;
   drop duplicates of existing recs and merge near-duplicates.
3. **Land.** For each survivor run:
   `cadence recommendation add --title "<title>" --readiness raw-idea
   --scout-id <scout-YYYYMMDD-HHMM>
   --evidence "Generated in /cadence-scout session on <topic>, <date>;
   siblings: <other rec ids>"` — use `--readiness needs-evidence` when the
   candidate is already well-formed.
4. **Hand back.** Point the user at `cadence recommend` to re-rank, then
   the existing rec → milestone → SPEC export path. Scout stops here.
