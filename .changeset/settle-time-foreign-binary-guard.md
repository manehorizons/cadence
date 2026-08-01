---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

`cadence settle` now detects when it is actually executing through a
`cadence` binary that resolves OUTSIDE the current repo checkout, despite
that repo having its own local build (`rec-20260729-001`). This is the exact
bug confirmed on phases 233/234: a stale globally-installed `cadence` binary
silently shadowed the checkout's own `packages/core/bin/cadence.cjs`,
producing a downgraded `schemaVersion: 1` SUMMARY with no `assurance`
record — and the two binaries reported an *identical* `--version` string on
the unreleased branch, so version comparison can't catch it.

Detection (`detectForeignCadenceBinary`, `packages/core/src/services/
settle.ts`) is a pure, unit-tested function: is the realpath of the binary
actually executing this settle located inside the repo's own toplevel, given
that the repo is recognizably CADENCE's own monorepo (`packages/core/bin/
cadence.cjs` + `.cadence/` both present at its root). An ordinary consumer
project settling via a globally-installed `cadence` is never a false
positive — that gate is what keeps this narrow.

On a mismatch, settle prints a loud stderr banner ("SETTLING VIA A FOREIGN
CADENCE BINARY", `buildForeignBinaryBanner` — same shape/placement
convention as the existing `MOCK_FALLBACK_BANNER`) naming both paths and
suggesting the fix, and `SummaryZ` gains an optional `foreignBinaryMismatch`
field (`{ runningBinaryPath, repoToplevel }`) recording the same provenance
on the written SUMMARY so the condition is auditable from the artifact alone.
Like `assurance` (phase 233), this is reported only — no gate, no refusal
path, no bypass flag; settle still completes normally either way. The field
is genuinely absent (never `false`/`null`) on a matched invocation, which is
the common/correct case.

This guard only runs in code that contains it, so it could not have caught
233/234 themselves, and it will not catch a settle run through an
already-published `cadence` binary that predates this release — it protects
settles going forward, once operators are actually running a build that
includes this fix.
