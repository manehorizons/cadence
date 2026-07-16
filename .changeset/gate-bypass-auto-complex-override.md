---
'@manehorizons/cadence-core': patch
'@manehorizons/cadence-types': patch
---

Fix `--allow-auto-complex` soft-cap overrides being invisible in `SUMMARY.json` and the real-time anomaly-notify transport. Settling a phase under the auto×complex soft cap with `--allow-auto-complex` now records a `{ gate: 'soft-cap', flag: '--allow-auto-complex', severity: 'warn' }` entry in `SUMMARY.json`'s `gateBypasses`, and `cadence draft approve --allow-auto-complex` now emits a new `auto-complex-override` `AnomalyEvent` through the anomaly-notify transport (mirroring `coherence-warn`) when the `anomaly-notify` gate is active. `@manehorizons/cadence-types` gains the additive `'auto-complex-override'` value on `AnomalyTypeZ`.
