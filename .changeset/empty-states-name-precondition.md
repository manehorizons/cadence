---
'@manehorizons/cadence-core': minor
---

Empty-result and refusal messages across the intelligence-layer CLI surface (`cadence recommend`, `cadence milestone propose`, `cadence recommendation promote`/`convert`/`list`, `cadence retro`) now state why the result is empty, the concrete unmet precondition, the nearest-miss candidate from the already-loaded ledger, and the exact command that would change the outcome — closing rec-20260721-001.

Adds a shared `findNearestCandidates` helper (`packages/core/src/intelligence/nearest-candidate.ts`, extracted from `cadence next`'s existing ranking logic with no behavior change) as the preferred mechanism for "nearest eligible candidate" lookups, so a message's suggestion never diverges from `cadence recommend`/`cadence next`'s own ranking. `cadence milestone propose` gets this enrichment on both the CLI and the MCP-tool (`cadence_milestone_propose`) surfaces, keyed on "zero milestones newly proposed this run" rather than "the ledger is empty" so it still fires correctly when older accepted/deferred/exported milestones already exist. `cadence recommendation` not-found errors (5 near-duplicate sites) are consolidated behind one message builder with a nearest-ID suggestion; its 7 promote/convert status-refusal sites now append the exact unblocking command to their existing status text. `cadence retro` now distinguishes "no settled phases yet" from "phases scanned, zero friction found" instead of one ambiguous message for both.

`docs/concepts.md` documents the four-part invariant (why / precondition / nearest candidates / exact command) as the guidance bar for future intelligence-layer commands.
