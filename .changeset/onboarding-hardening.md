---
"@manehorizons/cadence-core": patch
"@manehorizons/cadence-types": patch
"@manehorizons/cadence-host-claude-code": patch
---

Onboarding hardening (phase 48): clearer first-run experience.

- A distinct `NotInitializedError` — running a command before `cadence init`
  now says "CADENCE not initialized here — run `cadence init`" instead of a
  misleading `StateCorruptError`.
- Enforce the Node ≥20 floor: `engines.node` on the published packages plus a
  runtime guard that fails fast with a readable message instead of a cryptic
  ESM error.
- `cadence settle run --deep` prints a prominent banner when the effective
  verifier provider is `mock` (the shipped default), so deep verification can't
  silently hand back fake verdicts.
- The scaffolded `CLAUDE.md` no longer links to a `DESIGN.md` that consumer
  repos never receive; it points at the published concepts doc instead.
- README explains all three gate profiles' `approve` behavior and the
  commit-count suggestion heuristic.
