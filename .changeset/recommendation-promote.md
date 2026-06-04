---
"@manehorizons/cadence-core": minor
"@manehorizons/cadence-types": minor
"@manehorizons/cadence-host-claude-code": minor
---

Add `cadence recommendation promote` — advance a recommendation's status and/or
readiness (phase 57).

Closes the gap where `milestone propose` (which requires `status=accepted` +
`readiness∈{ready-for-milestone,ready-for-cadence-spec}`) was unreachable for
manually-added recommendations: `convert` was the only status transition and
`readiness` was write-once at `add`. `recommendation promote <id>
[--status <s>] [--readiness <r>]` sets either/both, validated against the
status/readiness enums. It is independent of `convert` — it never sets
`convertedToPhaseId` and refuses `--status converted` and terminal
(`converted`/`rejected`) recs. `cadence-types` and `cadence-host-claude-code`
are bumped only to keep the three public packages in lockstep; neither changed.
