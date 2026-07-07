---
description: Compute the next wave-based subagent dispatch plan from the active BUILD draft
allowed-tools: Bash(cadence:*), Read
---

<!-- managed-by: cadence -->

!cadence dispatch plan --json

You are running **CADENCE dispatch** — CADENCE-orchestrated, wave-based
subagent dispatch. The `cadence dispatch plan --json` call above computed
the plan; you (the host agent) do the actual Task-tool spawning.

1. Read the `waves` array from the JSON above.
   - If it reported a dependency cycle (non-zero exit, cycle named in the
     error), stop here and surface that error to the user. Dispatch
     nothing.
   - If `waves` is empty, report "nothing to dispatch" and stop.
2. Take the FIRST entry in `waves`. For every task in it, issue one
   Task-tool call per task, ALL IN THE SAME MESSAGE so they run in
   parallel — seed each subagent with that task's `packet` field verbatim
   as its prompt.
3. Once every subagent in the wave has returned, re-run
   `cadence dispatch plan --json` (a fresh read of PROGRESS.json, not this
   cached plan) and check each dispatched task's resulting status.
4. **Wave-complete rule.** `DONE` and `DONE_WITH_CONCERNS` both count as
   clean completion — move on to the next wave. `NEEDS_CONTEXT`,
   `BLOCKED`, or a task left with no recorded status at all (the subagent
   crashed or never called `cadence build task`) triggers a HALT: stop
   dispatching further waves, report exactly which task(s) did not
   complete and what remains undispatched, and hand control back to the
   user. Every wave-task failure halts the whole run — there is no
   continue-past-failure mode.
5. When the final wave completes cleanly, report "N/N tasks done" and
   name `cadence settle run` as the next step. Never invoke settle
   yourself — settle is a deliberate, separate, human-triggered gate.

Spec 1's redundant-work monitoring (the SubagentStart/SubagentStop hooks
plus the edit-time boundary and redundancy checks) already applies
automatically to every subagent this dispatches — nothing extra to wire
up here.
