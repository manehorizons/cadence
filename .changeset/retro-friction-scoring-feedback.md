---
'@manehorizons/cadence-core': minor
---

Adds `cadence retro feedback`: matches recurring cross-phase retro friction (gate bypasses, rough task statuses, finding categories — from the phase 174/186 retro artifacts and rollup) to recommendations by `affectedAreas`/`affectedFiles` overlap, and records each match as an auditable, idempotent evidence entry. `cadence recommend`, `cadence context`, and `cadence next` all now factor linked friction evidence into a new transparent `frictionPts` scoring term (capped, weighted, additive — a recommendation with zero friction evidence scores identically to before), so recommendations tied to real recurring pain rank consistently higher across every command that ranks recommendations. Closes rec-20260712-003.
