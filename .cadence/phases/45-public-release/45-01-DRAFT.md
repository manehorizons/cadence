---
phase: 45-public-release
id: 45-01
tier: standard
status: PENDING
---

# 45-01 — v1.4.0 public release — version hygiene, changesets, provenance

## Objective

Close the outstanding remainder of the v1.4.0 "Public release" milestone. The
irreversible publish already happened out of band (2026-05-30: repo public +
`@manehorizons/cadence-{core,types,host-claude-code}@1.1.1` on npm), but the
npm `1.1.1` artifact lags the shipped v1.2+v1.3 code and there is no matching
git tag. Fix forward: adopt changesets for future releases, add npm provenance,
publish **1.4.0** with a matching annotated tag, and keep testkit private —
without retroactively churning the existing 1.1.1.

Decisions locked (2026-06-02): target version **1.4.0** (document the zod
`^3 → ^4` public-API dep bump in the changelog rather than going 2.0.0, since
there are ~no external adopters yet); release automation via **changesets**;
**`@manehorizons/cadence-testkit` stays private**.

## Acceptance Criteria

### AC-1: changesets adopted
Given the monorepo publishes three public packages by hand today
When changesets is initialized
Then `.changeset/config.json` exists (baseBranch `main`, `access: public`,
`@manehorizons/cadence-testkit` ignored), `@changesets/cli` is a root devDep,
and `pnpm changeset status` runs clean

### AC-2: versions reconciled to 1.4.0
Given the packages currently read `1.1.1` on `main`
When the version is bumped
Then `core`, `types`, `host-claude-code`, and (internal) `testkit` all read
`1.4.0` with consistent workspace/internal deps, and `pnpm build` plus
`pnpm -r publish --dry-run` both succeed

### AC-3: npm provenance wired
Given `.github/workflows/release.yml` exists but the 05-30 publish carried no provenance
When provenance is enabled
Then `release.yml` declares `permissions: id-token: write`, publishes with
`--provenance`, and remains gated on the `ci-success` context

### AC-4: changelog + docs reflect 1.4.0
Given the `[Unreleased]` changelog accumulates the v1.2+v1.3 work
When the release is cut
Then a dated `## [1.4.0]` section folds that work and **prominently flags the
zod `^3 → ^4` bump as a public-API-affecting (breaking-ish) dependency change**
(cadence-types exports zod schemas), and the README/quickstart install lines are
verified to reference the published packages

### AC-5: 1.4.0 published with a matching tag; testkit stays private
Given the fix-forward plan
When the release runs
Then `@manehorizons/cadence-{core,types,host-claude-code}@1.4.0` is published to
npm with provenance, an annotated git tag `v1.4.0` is cut at the published
commit, and `@manehorizons/cadence-testkit` is confirmed absent from the publish
(tarball/dry-run inspection; still `private`)

## Tasks

### T1: adopt changesets
- files: `.changeset/config.json`, `package.json`
- action: `pnpm add -Dw @changesets/cli`, `pnpm changeset init`; set baseBranch `main`, `access: public`, ignore `@manehorizons/cadence-testkit`; add `release`/`version` scripts
- verify: `pnpm changeset status`
- done: AC-1

### T2: reconcile versions to 1.4.0
- files: `packages/core/package.json`, `packages/types/package.json`, `packages/host-claude-code/package.json`, `packages/testkit/package.json`
- action: bump all four to `1.4.0`; update internal/workspace deps; add a changeset entry describing the 1.4.0 release (note the zod bump)
- verify: `pnpm build && pnpm -r publish --dry-run`
- done: AC-2

### T3: add npm provenance to release.yml
- files: `.github/workflows/release.yml`
- action: add `permissions: { id-token: write, contents: read }` and `--provenance` to the publish step; confirm `needs`/gating on `ci-success`
- verify: workflow YAML parses; provenance flags present
- done: AC-3

### T4: cut the [1.4.0] changelog + verify docs
- files: `CHANGELOG.md`
- action: fold `[Unreleased]` into a dated `## [1.4.0]` section; add a prominent **BREAKING (deps)** note for zod `^3 → ^4`; confirm README/quickstart install lines reference the published packages (already synced — verify only)
- verify: manual review; changelog links resolve
- done: AC-4

### T5: publish 1.4.0 + tag + testkit-private proof
- files: `package.json`
- action: renew/confirm `NPM_TOKEN`; run the changesets release (or `release.yml`) to publish `1.4.0` with provenance; cut annotated `git tag v1.4.0` at the published commit; inspect the publish to prove testkit is excluded
- verify: `npm view @manehorizons/cadence-core version` == `1.4.0` (provenance attached); `git tag` lists `v1.4.0`; `npm view @manehorizons/cadence-testkit` 404s
- done: AC-5

## Boundaries

- DO NOT retroactively churn the existing published `1.1.1` — fix-forward only (decided 2026-06-01).
- DO NOT publish `@manehorizons/cadence-testkit` — it stays `private` (decided 2026-06-02).
- DO NOT bump to `2.0.0` — `1.4.0` is the chosen target; document the zod break in the changelog instead.
- DO NOT start execution until `NPM_TOKEN` is renewed (the prior token is expiring) — T5 is the irreversible step.
