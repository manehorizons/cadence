---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

Closed the phase-attributable AC coverage collision (phase 239). Nothing in a
settled phase's artifacts previously recorded which phase a test belonged to:
the `test-coverage` gate searched every `packages/**/*.test.ts` for the bare
`AC-N` token, so any past phase's `AC-3` satisfied every future phase's
`AC-3` (AC ids restart at `AC-1` every phase);
meanwhile `cadence verify phase`'s replay scoped its re-scan to only the files
the DRAFT declared, which chronically under-declares and produced false
"drifted" verdicts against phases whose tests genuinely still pass.

A new opt-in `verification.coverageScheme` config field (`"bare"` | `"phase-qualified"`,
schema default `"bare"`) closes both. Under `"phase-qualified"`, an `AC-N`
token must carry its phase-slice prefix (`239-01/AC-3`) to count as coverage
evidence — a bare or foreign-phase token no longer satisfies the gate, and
every refusal names the exact expected token. `cadence verify phase` drops
file-scoping entirely for a phase-qualified SUMMARY and instead matches by
that phase's own qualified token across the configured `verification.testGlobs`,
so an under-declared DRAFT no longer produces false drift. A phase
settled before the scheme existed has no phase-attributable evidence at all;
its replay now reports every AC `indeterminate` with `drift: false` rather
than asserting a verdict it cannot substantiate.

The field defaults to `"bare"` for every existing config (including one that
predates this field) — this is a two-layer default: `defaultConfig` itself
holds `"bare"` so `loadConfig`'s config.json-over-`defaultConfig` merge never
silently flips an upgraded consumer, and only a fresh `cadence init` writes
`"phase-qualified"` explicitly. Existing consumers on `@manehorizons/cadence-core@1.51.1`
are fully unaffected until they opt in via `cadence config edit coverageScheme`.
`SUMMARY.json` gains additive, optional `coverageScheme`/`coverageMode` fields
recording which scheme produced a settle's evidence; `cadence verify coverage
--explain` reports per-occurrence whether a token satisfies the configured
scheme.
