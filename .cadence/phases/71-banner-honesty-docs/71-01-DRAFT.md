---
phase: 71-banner-honesty-docs
id: 71-01
tier: standard
status: PENDING
---

# 71-01 — deep-verify banner honesty + diff-aware docs + v1.14.0 changeset

## Objective

Close the silent-mock gap (the mock-fallback banner must fire whenever the
deep-verify gate actually runs in mock, not only on `--deep`), document that
deep-verify now reads the diff, and stage the v1.14.0 release.

## Acceptance Criteria

### AC-1: the banner fires on deep-verify gate-set membership
Given a settle where `deep-verify` is in the effective gate set (e.g.
standard×complex) and the verifier resolves to `mock`
When `settle run` is invoked WITHOUT `--deep`
Then the MOCK-verification fallback banner is printed to stderr (the gate is
about to run mock verification, so the operator must be warned).

### AC-2: the banner stays silent when deep-verify will not run
Given a settle where `deep-verify` is neither requested (`--deep`) nor in the
gate set, OR the deep path is disabled (`--auto=false`), OR a real provider is
configured
When `settle run` is invoked
Then the banner is NOT printed (no false alarm on paths that never run mock
verification).

### AC-3: docs describe diff-aware deep-verify + diffCapBytes
Given the published docs
When a reader consults the deep-verify / config references
Then `docs/concepts.md` states deep-verify sends the (capped) diff to the
verifier, `docs/reference/config.md` documents `verifier.diffCapBytes`
(default 256KB), and `DESIGN.md` carries a dated decision note that deep-verify
reads the diff.

## Tasks

### T1: banner honesty condition
- files: `packages/core/src/services/settle.ts`, `packages/core/tests/cli/settle-mock-banner.test.ts`
- action: Replace the banner guard (`opts.deep && provider==='mock'`) with the gate's real firing condition: `(opts.deep || gateSet.gates.includes('deep-verify')) && opts.auto !== false && provider==='mock'`. Mirrors `runDeepVerifyGate`'s `deepRequested && auto!==false` exactly.
- verify: new tests — banner fires on standard×complex membership without `--deep`; stays silent on `--auto=false`; existing `--deep`/real-provider/no-membership cases still hold (AC-1, AC-2).
- done: AC-1, AC-2

### T2: diff-aware docs
- files: `docs/concepts.md`, `docs/reference/config.md`, `DESIGN.md`, a doc-presence test under `packages/core/tests/docs/`
- action: Document that deep-verify now sends the capped diff to the verifier; add `verifier.diffCapBytes` to the config reference (type, default 256KB, truncation-marker behavior); add a dated DESIGN.md decision note ("deep-verify reads the diff", phase 70). Add a small test asserting the key strings are present in the docs.
- verify: doc-presence test green; `docs/reference/config.md` lists `diffCapBytes` (AC-3).
- done: AC-3

### T3: v1.14.0 changeset
- files: `.changeset/*.md`
- action: Add a changeset bumping the four published packages minor (1.13.0 → 1.14.0) describing the verifier-correctness milestone (phases 70–71). Does NOT run `changeset version` — the version bump + `CLAUDE.md` mention + Release workflow are the operator's release step (mirrors v1.13).
- verify: `.changeset/` contains a new entry naming the four `@manehorizons/cadence-*` packages at `minor`.
- done: AC-3

## Boundaries

- DO NOT run `changeset version` or bump `packages/*/package.json` here — that
  is the release step (keeps the doc-sync gate + version commit operator-owned).
- DO NOT change deep-verify gate logic (shipped in phase 70) — this phase only
  touches the banner guard + docs + changeset.
- DO NOT add the deferred robustness items (retries, timeouts, auth, CLI flag).
- Tests stay offline/deterministic (testkit ephemeral repo + mock provider).
