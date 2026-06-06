---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Verifier correctness (v1.14.0): the `deep-verify` gate now sends the AI verifier
the actual phase diff instead of an empty string, so deep verification judges the
implementation rather than test-linkage alone.

- `deep-verify` wires the memoized `git diff HEAD` (shared with `code-review`) into
  the verifier input, bounded by the new `verifier.diffCapBytes` config (default
  256KB) and truncated with an explicit `[diff truncated: N of M bytes]` marker.
- A run-level `deepVerifyMeta` provenance record (`diffProvided`, `diffBytes`,
  `truncated`, `filesCount`, `provider`, `model`) is written to the SUMMARY so a
  verdict is auditable.
- The mock-fallback banner now fires whenever the gate runs in mock — on `--deep`
  **or** gate-set membership (e.g. `standard × complex`) — so a settle never runs
  mock verification silently.

`cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
only (no functional change).
