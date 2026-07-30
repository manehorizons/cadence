---
'@manehorizons/cadence-core': patch
---

Fixes #331: `cadence doctor`'s `verification-readiness` check inspected only the
deep-verify seam despite its seven-seam name, so a seam configured to a real
provider whose credentials were absent was classified as real and never
credential-checked — `doctor` printed `✓ ok` while that gate was guaranteed to
silently fall back to `mock` at call time. `cadence config explain` already
caught this via its `provider-no-key` warning, and its remedy line says "Run
`cadence doctor` to confirm provider health" — pointing the operator at the
command that reported the green tick.

`assessReadiness` gains `seamsDowngraded`: the seams whose configured provider
is real but whose credentials are missing, in `VERIFIER_SEAMS` order. It never
includes a `mock` seam (not a downgrade — it announces itself) nor a `host-cli`
seam (no required credential by design). The existing `seamsReal`/`seamsMock`
partition, which classifies by configured provider name, is unchanged — the new
field expresses what that partition structurally cannot.

`checkVerificationReadiness` now warns when any non-deep-verify seam will
downgrade, naming each offending seam and its provider, and reusing the
Claude-Code-login confusion wording when an affected seam is `anthropic` inside
a live Claude Code session. The deep-verify branches are evaluated first so
their more specific wording still wins when deep-verify is itself the problem.
No check changes from `warning` to `error`, and no previously-warning
configuration now passes.

Found downstream: a project had `specReview` on `anthropic` with no key, so
`cadence spec approve` downgraded to mock and wrote a SPEC-REVIEW artifact
reading `pass: true, converged: true, findings: 0, attempts: 0, provider:
"mock"` — a spec no model had read, recorded as a clean convergent pass, with
`doctor` reporting `ok` throughout.
