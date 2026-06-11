---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Add a `shipped` terminal status to the recommendation lifecycle (phase 100,
from rec-20260611-001). A rec whose work has landed — directly via a PR, or
after a formal `convert` — can now reach a truthful positive-terminal state via
`cadence recommendation promote <id> --status=shipped [--ref "PR #70 / v1.22.1"]`,
instead of being stuck at `candidate`. `shipped` recs drop out of the active
`cadence recommend` surface (like `converted`/`rejected`); the optional freeform
`shippedRef` is rendered as a `- shipped:` provenance line. The one sanctioned
transition out of an otherwise-terminal status is `converted → shipped`.
