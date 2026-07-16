---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

Add `cadence retro`, a read-only cross-phase rollup over every settled phase's post-settle retro artifact (`.cadence/phases/*/*-RETRO.json`). It aggregates gate-bypass names, rough-task statuses, and code-review/security-audit/boundary-scan finding categories across all scanned phases, splitting each dimension into a **recurring** bucket (2+ phases) and a **one-off** bucket (exactly 1 phase) so friction that keeps showing up isn't buried under single-occurrence noise. Supports `--format terminal|json` (default `terminal`), mirroring `cadence intelligence stats`'s format-flag and exit-code conventions; never writes to `state.json`, `STATE.md`, or any phase artifact. `@manehorizons/cadence-types` gains additive `RetroRollupZ`, `PhaseRetroEntryZ`, `RetroFrequencyEntryZ`, and `RetroFrequencyBucketsZ` schemas (and their inferred types) backing the rollup shape. Fulfils rec-20260712-002.
