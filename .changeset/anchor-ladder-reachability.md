---
'@manehorizons/cadence-core': minor
---

The anchor ladder's `executable` tier is now reachable in a real settle (Phase
241, `rec-20260729-002` / `rec-20260729-007`). Phase 235 shipped the full
four-tier ladder as a pure resolver, but its top rung was dead in production:
`SettleContext` exposed no prior-gate provenance to a `GateImpl` — the
accumulator was a local inside `runSettleGates` — so `gates/code-review.ts`
called the resolver with a literal `[]` and every live finding capped at
`structured`/`declared`/`undeclared`. `executable` was exercised only by unit
tests that injected provenance directly.

- `SettleContext` gains an optional, readonly `gateProvenance` — the entries
  recorded so far this settle, in `GATE_ORDER`. `runSettleGates` hands each
  gate a per-gate context carrying a **two-level-frozen** snapshot: the array
  and each entry are frozen, and the entries are copies. The element-level
  freeze is the load-bearing half — a shallow copy would leave entries sharing
  object identity with the live accumulator, so a gate could have rewritten an
  entry that lands in `SUMMARY.json.gates` and feeds the phase-233 assurance
  record. The field is typed `readonly Readonly<GateProvenance>[]`, so the
  compiler refuses element mutation and the runtime copy holds even against a
  gate that casts the guard away. (A plain `readonly T[]` would not suffice: it
  constrains the array's shape, not its elements' fields.)
- The field is optional and additive: every pre-existing `SettleContext`
  literal, in production and in tests, compiles unchanged, and a reader treats
  an absent field the same as an empty array — never as "unknown".
- `gates/code-review.ts` passes that snapshot through. Because `code-review`
  runs 9th in `GATE_ORDER` and `build-test-must-pass` 5th, the corroborating
  status is already recorded by the time anchoring happens.

This widens what is **reachable** without weakening what must be **earned**.
The ladder's two-condition check in `verify/anchor.ts` is untouched:
`executable` still requires both an AC cited by a task with a non-empty
`verify:` **and** a `build-test-must-pass` entry with `status: 'ran'`. A
`skipped`, `refused`, or absent entry still caps the tier — a failing suite
waved through with `--allow-failing-build` records `skipped` and demonstrably
cannot buy a stronger anchor.

Reachability is proven end-to-end rather than asserted: a new test drives the
real CLI over an ephemeral repo at a profile whose gate set includes
`code-review` and reads the tier back out of the persisted `SUMMARY.json`.
Reverting the one-line gate change flips that recorded tier from `executable`
to `structured`, so the test measures the production path and nothing else.

Two limitations disclosed with the ladder in phase 235 remain open and are
still documented: anchoring is resolved per-file rather than per-finding, so an
uncovered defect in an otherwise-covered file can be missed
(`rec-20260729-003`); and a boundary string that merely contains a finding's
filename as a substring can mask a real gap by granting `declared` tier too
broadly (`rec-20260729-005`).
