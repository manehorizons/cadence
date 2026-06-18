---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Onboarding front door + guided Next: rail (phase 113): make `cadence start` the
single, unambiguous onboarding entry point, with `cadence quickstart` reframed
as the post-init "where am I / what's next" map.

- README leads with `cadence start` alone (the co-equal "or quickstart" framing
  is gone; quickstart is now described as the post-init map).
- `cadence doctor` ends with a `Next:` line — the first problem's remediation
  when any check is non-ok, else `cadence progress` — so doctor joins the same
  guided rail as the other onboarding commands. (`--json` output unchanged.)
- `docs/quickstart.md` opens with a 3-way driver fork (terminal / Claude Code /
  MCP) so host users branch immediately.

Copy/UX only except the small `doctor` Next: line; v1.27's
`init`/`--demo`/`--activate` flows are untouched, and `quickstart` keeps its
never-throw guarantee. `cadence-types` / the two host adapters carry
version-alignment bumps only.
