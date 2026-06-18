---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Onboarding papercuts (phase 114): two small fixes.

- `cadence init` now prints a one-line heads-up when a young repo gets the
  `auto` gate profile from the git-history suggestion — warning that
  `draft approve` will flip to interactive once the repo passes ~20 commits, and
  that pinning `--gate-profile auto` keeps it hands-off. Only fires for derived
  `auto` (not when pinned explicitly, nor for `standard`/`strict`).
  (rec-20260617-009, scoped down — the preset/profile terminology already
  carries inline clarifiers.)
- `cadence handoff` honors a `CADENCE_NOW` env override (a date string) for the
  SESSION-doc date, via a pure `resolveNow(env)` seam — making handoff runs
  reproducible and closing a UTC-midnight flake in the clobber-refusal test
  (two runs straddling midnight got different dates and never collided). No
  behavior change when unset. (rec-20260618-001.)

`cadence-types` / the two host adapters carry version-alignment bumps only.
