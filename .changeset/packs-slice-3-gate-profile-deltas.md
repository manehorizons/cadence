---
"@thomas-powers-jr/cadence-core": minor
---

Add: a pack's `gates[].add` is now a **real behavioral contributor** to gate computation. This is slice 3 of the packs arc (`docs/packs-design.md`) — the slice that finally makes a manifest's gate-profile deltas do something.

`effectiveGateSet` (`packages/core/src/gates/engine.ts`) now takes a required `resolvedPacks: ResolvedPack[]` parameter (no default, so a missed call site is a compile error, not a silent no-op) and unions each successfully-resolved enabled pack's `gates[].add` entries into its output whenever that entry's `(profile, tier)` matches the active cell, deduped the same way `gatesFor` already dedups. All nine real call sites were updated to pass it: `draft-check`, `draft-approve`, `build-task` (twice), `settle`, `hooks/handlers.ts` (three call sites), and `notify/loop-violation.ts`. `gatesFor` itself is untouched — still the raw, packs-free two-argument `(tier, profile)` matrix builder, and still the function `doctor/run.ts`'s reachability scan and `config-explain/build.ts`'s whole-matrix table correctly keep calling directly, because both of those answer a matrix-wide question ("what's reachable/configured at any tier") rather than "what applies to my phase right now."

`cadence config explain`'s current-tier row now reflects enabled packs' gate contributions: when a pack's `gates[].add` matches the active `(profile, tier)` cell and actually adds a gate not already present in the raw `gatesFor()` output for that cell, the row includes it and a new `packs-augment-current-tier` warning names which pack added which gate. Every other row in the tier × profile matrix table stays raw, unconditionally — only the current-tier row can diverge from `gatesFor`. `gatherExplainContext` now takes the already-loaded config as a parameter (rather than reloading it) so it resolves packs from the exact same `config.packs` the rest of the command run is using.

A pack manifest's `gates[]` shape stays additive-only — there is still no `remove`/`override`/`set` key anywhere in `PackGateDeltaZ` (`.strict()`, unchanged from slice 1) — and a non-additive shape (an unrecognized key alongside a valid `add` array) is regression-tested as rejected at parse time, not silently ignored or silently dropped.

No `@thomas-powers-jr/cadence-types` change in this release — the manifest schema (`PackGateDeltaZ`, `PackManifestZ`) was already additive-only as of slice 1; slice 3 only wires the existing schema's `gates[].add` field into gate computation, in `@thomas-powers-jr/cadence-core`.

Closes `rec-20260822-011`.
