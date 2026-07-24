---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

Adds a `gates.evidenceFloor` gate that refuses `cadence settle run --auto` when any AC's `PASS` verdict rests on evidence ranked below a configured floor on the Phase 140 evidence ladder (`ai-verified` > `executed` > `assertion` > `mention` > `unverified`), closing the enforcement gap left when that ladder shipped visibility-only. Preset defaults: `solo` → `assertion`, `team` / `production` → `executed`; the schema-level default stays `mention` for back-compat. `ai-verified` is reachable only via an explicit config override — no preset defaults to it, since it is structurally unreachable while the active `deep-verify` provider is `mock`, and the refusal now names that specific reason instead of the generic below-floor message.

A named, per-AC, reason-required bypass (`--evidence-floor-bypass <AC-id:reason>` on `settle run`) exempts exactly the named AC and is recorded in `SUMMARY.gateBypasses` — never a blanket, phase-wide bypass.

Closes rec-20260724-001 (re-filed P0 from the 2026-07-24 external audit, enforcement half of the assurance-levels gap first raised in the v1.47.0 audit).
