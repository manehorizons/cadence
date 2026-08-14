---
"@thomas-powers-jr/cadence-core": minor
---

Added a new `cadence doctor` check, `recommendation-archive-currency`, that warns when a recommendation in the active `recommendations[]` array carries a terminal `shipped`/`rejected` status without being moved into the `archived[]` array — the invariant phase 276 had to hand-backfill for 21 recommendations that predated the auto-archive feature. Warns naming each offending id, title, and status, with remediation pointing at `cadence recommendation archive <id>`.

`converted` and `settle-pending` are deliberately excluded from the flagged-status set: a converted recommendation's only schema-documented successor state is `settle-pending` (reached solely via the settle hook), not `archived`, so flagging it would emit wrong remediation.

Diverging from the two adjacent ledger-reading doctor checks (`recommendation-shipped-drift`, `orphaned-evidence`), a malformed/schema-invalid `recommendations.json` reports `indeterminate`, never a silent best-effort `ok` — a genuinely missing file still reports `ok` (the normal fresh-repo state). `fixId` is always `null`: archiving is evidence-gated per record, not a safe blind auto-repair, so `--fix` never touches it.
