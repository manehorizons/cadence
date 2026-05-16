---
phase: 33-publish-pipeline
id: 33-01
tier: standard
---

# 33-01 — publish pipeline (reversible proof)

## Objective

Prove the four-package publish path end-to-end and reversibly (real `pnpm publish` of the 3 publishable packages to an ephemeral local verdaccio + public `--dry-run`), zero public-registry footprint; implements ROADMAP "Phase 30.1".

## Acceptance Criteria

### AC-1: publishable metadata hardened
Given no package declares license/publishConfig/repository and testkit is publishable
When metadata is hardened
Then `@cadence/{core,types,host-claude-code}` each have `license:"MIT"`, `publishConfig.access:"public"`, a `repository` block with `directory`, a per-package MIT `LICENSE` and minimal `README.md`; root `package.json` has `license:"MIT"`; `@cadence/testkit` has `private:true`.

### AC-2: verdaccio publish + clean-install proof
Given the 3 packages and an ephemeral local verdaccio
When `scripts/publish-proof.mjs` runs clean
Then it publishes the 3 packages, installs `@cadence/core`+`@cadence/host-claude-code` into a fresh dir from that registry, asserts no `workspace:` survives in any installed `@cadence/*` package.json, and runs both published bins — exiting non-zero on any failure.

### AC-3: reversible / no footprint
Given the harness
When it finishes (success OR failure)
Then it tears the verdaccio process tree (Windows-safe `taskkill /T`) + all OS-temp dirs down in `finally`, writes nothing into the repo, fails fast if `:4873` is already serving, and contacts no non-localhost registry for publish.

### AC-4: public dry-run + clean tarballs
Given the hardened packages
When `pnpm -r --filter=!@cadence/testkit publish --dry-run` and `pnpm pack` run
Then the dry-run succeeds for the 3 (testkit skipped) and each tarball contains only dist/bin/package.json/LICENSE/README (no src/tests/.cadence/tsconfig/vitest); file lists recorded in the phase report.

### AC-5: docs + ROADMAP updated
Given the proof is delivered
When docs are updated
Then DESIGN.md (§10 item 34 + publish subsection), README.md (published-install pending note, F1/F6 anchors preserved), CHANGELOG.md (Unreleased/Added), and `.cadence/ROADMAP.md` (Phase 30.1 delivered-via-reversible + named v1.2 public-release deferred milestone) reflect it.

### AC-6: full gate green + dogfood settle
Given all changes staged
When the phase settles
Then `pnpm turbo run lint typecheck test build` is green and the phase is settled via the two-commit dogfood convention.

## Tasks

### T1: package metadata hardening
- files: `packages/core/package.json`, `packages/types/package.json`, `packages/host-claude-code/package.json`, `packages/testkit/package.json`, `package.json`
- action: add license/publishConfig/repository to the 3 publishable; testkit `private:true`; root `license:"MIT"`
- verify: JSON parses for all 5; `pnpm -C packages/{types,core,host-claude-code} build` clean
- done: AC-1

### T2: per-package LICENSE + README
- files: `packages/core/LICENSE`, `packages/core/README.md`, `packages/types/LICENSE`, `packages/types/README.md`, `packages/host-claude-code/LICENSE`, `packages/host-claude-code/README.md`
- action: copy root MIT LICENSE into each of the 3; write a minimal README each
- verify: each LICENSE starts "MIT License"; each README exists
- done: AC-1

### T3: publish-proof harness
- files: `scripts/publish-proof.mjs`
- action: ephemeral verdaccio (anonymous publish, npmjs uplink) → `pnpm publish` ×3 → clean-dir install → assert no `workspace:` leak + both bins run → Windows-safe process-tree teardown + pre-flight port guard
- verify: `node scripts/publish-proof.mjs` ends `PUBLISH-PROOF: PASS`, exit 0, no repo writes, no OS-temp residue, no orphaned verdaccio
- done: AC-2, AC-3

### T4: public dry-run + tarball assertions
- files: `scripts/publish-proof.mjs`
- action: `pnpm -r --filter=!@cadence/testkit publish --dry-run`; `pnpm pack` each + assert tarball file set (evidence captured into phase notes)
- verify: dry-run green ×3 (testkit skipped); tarballs = dist/bin/pkg.json/LICENSE/README only; file lists captured
- done: AC-4

### T5: docs + ROADMAP
- files: `DESIGN.md`, `README.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`
- action: DESIGN §10 item 34 + publish subsection; README pending-install note (preserve F1/F6 anchors); CHANGELOG Unreleased/Added; ROADMAP 30.1 delivered + named v1.2 deferred milestone
- verify: `git diff --stat` shows only the 4 doc files; F1/F6 README anchors intact
- done: AC-5

### T6: full gate + two-commit settle
- files: `DESIGN.md`
- action: full `pnpm turbo run lint typecheck test build`; single substantive commit; `settle run --auto --allow-missing-coverage`; settle commit
- verify: 16/16 gate green; loop IDLE after settle; feat+settle pair
- done: AC-6

## Boundaries

- DO NOT publish to any non-localhost registry; no provenance, no `release.yml`, no changesets, no repo-visibility change — all the named deferred v1.2 milestone.
- DO NOT change `packages/*/src` runtime code; metadata + new LICENSE/README + script + docs only.
- DO NOT remove/reword README readme-shakedown F1/F6 anchor phrases.
- DO NOT `git commit` per task (two-commit convention); DO NOT `git push` (user-gated).
- DO NOT touch `graphify-out/` (pre-existing untracked, not ours).
