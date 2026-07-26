---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

`SUMMARY.json` gets a settle-time content hash, closing the "hand-edited
SUMMARY renders faithfully as if it were genuine" gap (rec-20260724-006).

- `Summary` (types) gains an optional, additive `contentHash: { algorithm:
  'sha256'; value: string }` field — existing SUMMARY.json records without
  it keep parsing unchanged.
- `cadence settle run` now computes a sha256 digest over a canonical
  (deep, stable-key-order) stringification of the settled summary and
  attaches it before writing `SUMMARY.json`/`SUMMARY.md`. Both `cadence
  summary render` and the settle-time `SUMMARY.md` sidecar display it.
- New `cadence summary verify <phase> <num>` recomputes the digest and
  reports `MATCH`, `MISMATCH` (non-zero exit — the stored hash doesn't
  match the content, i.e. the file was edited after settle), or `NO_HASH`
  (a pre-phase-223 or refused-settle record, reported cleanly rather than
  a false pass).

This is detection only, not signing — self-signing in the same trust
domain as the artifact's author isn't meaningfully stronger than a hash.
Full cryptographic signing with an external trust root is deferred to
rec-20260726-001, gated on the parked MCP/hooks/host-adapter/verifier/
ledger threat-model rec (mil-rec-rec-20260712-016). See dec-20260726-001
for the full rationale.
