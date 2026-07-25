---
'@manehorizons/cadence-core': patch
'@manehorizons/cadence-types': patch
'@manehorizons/cadence-host-claude-code': patch
'@manehorizons/cadence-host-codex': patch
---

Unify the five Praxis intelligence ledgers (recommendations, evidence,
assumptions, decisions, milestones) onto one shared read/write/id-minting
module (`intelligence/store/ledger.ts`) instead of five independently
hand-rolled implementations, so a safeguard added for one subject — like
phase 219's cross-ledger id-collision check, previously recommendations-only
— now applies to all four minting subjects (recommendations, evidence,
assumptions, decisions) instead of needing to be re-patched per subject.
Each subject's existing read/write/mint function names and signatures are
unchanged (thin wrappers over the shared primitives); bespoke per-subject
logic (recommendation promotion/archive/unarchive, decision supersession)
stays subject-specific rather than being forced into one generic shape.

Also fixes a real gap this refactor surfaced: `milestones.json` was the only
one of the five ledger files not written with `{ mode: 0o600 }`.

`cadence intelligence audit`/`reconcile`/`stats` now include milestones as a
fifth ledger: a new `orphan-milestone` finding kind catches a milestone
referencing a recommendation id that no longer exists in either the live or
archived recommendation arrays (a reference to a merely-archived, still
`unarchive`-recoverable recommendation is correctly NOT flagged).

`cadence recommendation/decision/assumption list`'s `--sort-by`/
`--filter-regex`/`--filter-regex-flags` validation is now one shared
pipeline instead of three independently maintained copies — behavior and
error wording are unchanged.

`cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
version-alignment bumps only; none of the three changed.
