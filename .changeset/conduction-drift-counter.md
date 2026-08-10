---
"@thomas-powers-jr/cadence-core": minor
---

Added a new `cadence doctor` check, `conduction-drift-streak`, that answers the trend question phase 251's `conduction-reachability` couldn't: not just "can this repo conduct a real finding" but "has it, lately." It's a read-only, best-effort utility walking the settled-phase `.cadence/phases/**/*-SUMMARY.json` corpus in chronological order and counting the consecutive most-recent settles that carried no non-mock provider identity in `assurance.verifierRollup` — the same drift that let 263 settles accumulate under `mock` with zero escalation, per the v1.54 audit. Also surfaced (without escalation) in `cadence status`.

`DoctorSeverity` gains a fourth rung, `indeterminate`: a check that could not assess the repo at all (e.g. an unreadable or malformed SUMMARY record whose true chronological position can't be ruled out as the most recent) — distinct from `ok`'s "assessed, no problem found." Every existing consumer (`DoctorReport.ok`'s roll-up, the `fail()` helper, `cadence doctor --fix`'s fix-planner, the CLI/JSON renderer, `doctorNextStep`'s Next-step guidance, and the MCP `doctorService` seam) handles it explicitly — `indeterminate` rolls up like `warning` (never fails the exit code) but is never counted as a problem and never silently folded into "all checks passed."

Once the streak reaches 3 consecutive mock-only settles, the check escalates from `ok` to `warning` — a warning only, never a settle refusal. That threshold is explicitly **provisional** (borrowed from an unrelated decision's `config.convergence.maxAttempts` default as a placeholder, not yet independently measured for this check) and says so in both the code and the rendered output; a follow-up will validate it once enough real-provider settles accumulate under the now-standard profile.

Every pre-existing doctor check's rendered output and exit code is unaffected — a fixture corpus and regression suite cover the counter's chronological-ordering, malformed-data, and pre-existing-schema edge cases.
