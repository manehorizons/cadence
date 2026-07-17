---
'@manehorizons/cadence-core': minor
---

Add `cadence onboard`, a one-command setup for the 2nd-Nth teammate cloning a repo that already has `.cadence/` committed: it installs host hooks (reusing `cadence init`'s host-wire logic, now shared via `init/host-wire.ts`), reports the existing project's name and gate profile, and reports provider/API-key readiness — without re-scaffolding `.cadence/config.json` or `state.json`. Refuses cleanly with a pointer to `cadence init` when no `.cadence/` is present. `cadence init` now also seeds a managed `CONTRIBUTING.md` block pointing new contributors at `cadence onboard`, so the path is discoverable. Fulfils rec-20260709-005.
