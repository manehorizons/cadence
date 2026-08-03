---
"@thomas-powers-jr/cadence-core": minor
---

Added a new `cadence doctor` check, `conduction-reachability`, that reports — separately for `code-review` and `security-audit`, since the two gates are asymmetrically gated in this repo — whether the current configuration can produce a real-provider (non-`mock`) finding at all.

Two independent, deliberately-retained blockers make this structurally unreachable in normal, headless-agent-driven operation: the `auto` gate profile excludes both review gates from every tier, and the self-invocation guard forces a `mock` verifier fallback whenever `cadence` is already running inside a headless Claude Code session. A third, ordinary (non-safety-related) blocker can also apply: a gate's own `provider` config being set to `'mock'`.

The check evaluates three axes per gate — profile inclusion (`gatesFor` across all tiers), provider configuration (`seamProvider`), and the self-invocation session guard (conditioned on the gate's own provider being `'host-cli'`, since the guard only applies to that spawn path) — and reports `severity: 'warning'` naming exactly which axis or axes block each gate, with `fixId: null` (no safe auto-repair exists; every remediation is an operator decision). `status: 'ok'` only when both gates are fully reachable.

Neither blocker is modified or bypassed by this change — `isSelfInvocation`, `SELF_INVOCATION_ENV_VAR`, and the `DELTAS` gate matrix are untouched. The check adds visibility only, so an operator can tell "no real finding has been produced yet" apart from "no real finding can currently be produced," and `docs/providers.md` now documents the exact operator procedure (a DRAFT-level `profile:` override, run from a real interactive terminal) to produce one when needed.
