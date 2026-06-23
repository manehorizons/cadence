---
"@manehorizons/cadence-core": minor
"@manehorizons/cadence-types": minor
"@manehorizons/cadence-host-claude-code": minor
"@manehorizons/cadence-host-codex": minor
---

Rebuild `cadence tutorial` around the catch (refuse → fix → pass)

The tutorial now stages a lie and lets settle catch it. In a throwaway sandbox it
drives draft → approve → build, marks task `T1` DONE with a real `sum.mjs` but no
test, and runs `cadence settle run --auto` — which **refuses**: the `test-coverage`
gate names `AC-1` and the loop stays open. The tutorial then writes a real
`sum.test.mjs`; the second `settle run --auto` executes it through
`build-test-must-pass` (`node --test`, real exit code) and the loop closes with a
SUMMARY. The previous `--ac AC-1=pass` manual assertion and `allowMissingCoverage`
bypass are gone — the gates decide on real state alone, so the refusal a newcomer
needs to see is now the demo's centerpiece. No engine changes; `cadence init --demo`
and `renderDemoDraft` are untouched. `cadence-core` carries the feature; the other
three published packages are version-alignment only.
