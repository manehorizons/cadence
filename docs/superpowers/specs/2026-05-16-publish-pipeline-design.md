# Design — Publish pipeline (reversible proof: verdaccio scoped-test + public dry-run)

**Date:** 2026-05-16
**Status:** Approved (brainstorming) — pending spec review + implementation plan
**Context:** CADENCE v1.1. Implements ROADMAP "Phase 30.1 — Publish pipeline"
(the deliberate Phase 28.1 boundary). All prerequisites are done: shakedown
29.1–29.3 + remediations, test-infra flake root-fixed (32.1), lint clean
(32.2), 14 commits pushed, origin synced. The repo `manehorizons/cadence` is
**private**, which couples npm provenance and public-from-private to a
separate repo-visibility decision the user has deferred. The user chose the
**reversible** proof path: real publish to a local verdaccio registry + a
public-npm `--dry-run`, deferring the irreversible public publish + provenance
+ `release.yml` + changesets to a named future milestone.

## Problem

CADENCE has never been packaged for distribution. Concrete blockers, all
verified against the four `packages/*/package.json`:

1. **`workspace:*` deps leak under raw npm.** `@cadence/core`,
   `@cadence/testkit`, `@cadence/host-claude-code` all depend on
   `@cadence/types` via `workspace:*` (host-claude-code also dev-deps testkit
   `workspace:*`). `npm publish` does NOT rewrite the workspace protocol;
   `pnpm publish` / `pnpm pack` does (→ the concrete version). The pipeline
   must therefore run through **pnpm**, never raw npm.
2. **Scoped packages default private on npm.** No package sets
   `publishConfig.access`. `@cadence/*` is a scoped name; without
   `"publishConfig":{"access":"public"}` even the dry-run/verdaccio shape
   misrepresents the eventual public path.
3. **No `repository` / `license` field** on root or any package; no per-package
   `LICENSE`/`README`. npm warns; the eventual provenance path *requires*
   `repository`; a public tarball without `LICENSE` is a legal gap. Root
   `LICENSE` is **MIT** (© 2026 Thomas Powers); root has no `license` field.
4. **`@cadence/testkit` is dev-only tooling.** Nothing runtime-depends on it
   (host-claude-code dev-deps it; devDeps are not installed by consumers).
   Publishing it is unrequested scope.

The `files:["dist","bin"]` allowlist is already correct — tarballs will
exclude `src/`, `tests/`, `.cadence/` by construction.

## Goals

- Prove the publish path **end-to-end and reversibly**: a real `pnpm publish`
  to a local **verdaccio** registry, then a clean-dir install that exercises
  the `cadence` bin and proves the `workspace:` rewrite.
- Produce the **public-npm shape** via `pnpm publish --dry-run` + tarball
  inspection, without publishing anything to a public registry.
- Harden the 3 publishable packages' metadata to exactly what the eventual
  public path needs (so the proof is representative, not a toy).
- Leave **zero** public-registry footprint; verdaccio is ephemeral and torn
  down.
- Name the deferred public milestone explicitly in the ROADMAP.

## Non-Goals (YAGNI — all deferred to the named public milestone)

Real public-npm publish; npm provenance; `.github/workflows/release.yml`;
changesets; the repo-visibility (public/private) decision; publishing
`@cadence/testkit`; CI-gated automated release. These are intentionally out of
scope — the user chose the reversible path; building unreachable release
automation now is waste.

## Architecture

### Publishable set

Three packages publish: `@cadence/core`, `@cadence/types`,
`@cadence/host-claude-code`. `@cadence/testkit` gets `"private": true` in its
package.json → `pnpm -r publish` skips it automatically, and the explicit
`--filter=!@cadence/testkit` documents intent. (Deliberate deviation from
ROADMAP AC-1's "all four packages" — recorded in the ROADMAP note; user
approved.)

### 1. Package metadata hardening

For each of `core`, `types`, `host-claude-code` package.json add:

```jsonc
"license": "MIT",
"publishConfig": { "access": "public" },
"repository": {
  "type": "git",
  "url": "git+https://github.com/manehorizons/cadence.git",
  "directory": "packages/<core|types|host-claude-code>"
}
```

Add a per-package `LICENSE` (verbatim copy of root MIT `LICENSE`) and a
minimal per-package `README.md` (package name, one-line purpose, link to the
repo). npm auto-includes a package's own-dir `LICENSE`/`README` in the
tarball; the `files` allowlist need not list them. Set root `package.json`
`"license":"MIT"` too (hygiene; root is `private:true` and not published).

`@cadence/testkit/package.json` → add `"private": true`.

Do **not** bump versions (all stay `1.0.0`; the dogfood loop owns version
ceremonies — memory: pnpm install can revert package.json edits, so re-verify
after any install).

### 2. Verdaccio scoped-test harness

A committed cross-platform Node script `scripts/publish-proof.mjs` (invoked by
a thin `scripts/publish-proof.ps1` + `.sh` if shell ergonomics help, but the
logic lives in the `.mjs` so behavior is identical on the Windows dev box and
any POSIX CI):

1. Start verdaccio via `npx --yes verdaccio@^6 --config <generated-config>
   --listen 4873`, storage pointed at an OS-temp dir (isolated, deleted at
   end). Wait for the port to accept connections (poll, bounded).
2. Authenticate non-interactively (preferred — avoid interactive
   `npm adduser`, which is flaky in CI and on the Windows box): generate a
   verdaccio config that allows unauthenticated publish from localhost, and
   write a temp project `.npmrc` with a dummy
   `//localhost:4873/:_authToken=local` so `pnpm publish` has a token without
   any prompt. Do not use `npm adduser`.
3. `pnpm -r --filter=!@cadence/testkit publish --registry
   http://localhost:4873 --no-git-checks --no-provenance`. `--no-git-checks`
   because the dogfood tree carries phase artifacts and the version is not
   bumped; `--no-provenance` is explicit (provenance is a non-goal).
4. In a fresh OS-temp dir: `npm init -y` then
   `npm i @cadence/core --registry http://localhost:4873`. Assert:
   - the install resolves `@cadence/types` transitively from the local
     registry (proves the `workspace:*`→`1.0.0` rewrite). Assert precisely:
     read the **installed `@cadence/*` package.json files under the temp
     dir's `node_modules/@cadence/`** (not a blanket recursive scan that
     could false-match unrelated transitive-dep fixtures) and require their
     `@cadence/*` dep values are the concrete `1.0.0` (or a real semver
     range), with no `workspace:` substring,
   - `npx cadence --version` (or `--help`) exits 0 from the clean install
     (proves `bin` resolves from a published tarball, not the monorepo).
5. Repeat the bin check for `@cadence/host-claude-code`
   (`cadence-host-claude-code --help`).
6. Always tear down: stop verdaccio, delete its storage + the temp install
   dirs, even on assertion failure (try/finally). Exit non-zero on any failed
   assertion.

The script is idempotent and leaves nothing behind. It does not touch any
non-localhost registry.

### 3. Public dry-run + tarball inspection

`pnpm -r --filter=!@cadence/testkit publish --dry-run` (captured output) and,
per package, `pnpm pack` into a temp dir + list the tarball contents. Assert
each tarball contains only `package/dist/**`, `package/bin/**` (core +
host-claude-code), `package/package.json`, `package/LICENSE`,
`package/README.md` — and nothing under `src/`, `tests/`, `.cadence/`,
`tsconfig`, `vitest`. Record the file lists in the phase report. `pnpm pack`
output dir is cleaned up.

### 4. Docs / ROADMAP

- `DESIGN.md` — new "Publish pipeline" subsection (reversible proof; what was
  verified; what is deferred) + §10 punchlist item 34.
- `README.md` — keep the local-dogfood install instructions; add a short
  "Published install (pending the public-release milestone)" note so readers
  aren't misled into `npx @cadence/core` (not yet public).
- `CHANGELOG.md` `## [Unreleased] → ### Added` — publish-pipeline proof entry.
- `.cadence/ROADMAP.md` — mark "Phase 30.1" delivered via the reversible path;
  **add a named deferred milestone** (e.g. "v1.2 — Public release") whose
  scope is exactly the Non-Goals list (real public publish, provenance,
  release.yml, changesets, repo-visibility decision, testkit-publish
  reconsideration). This is the durable record that the irreversible decision
  was consciously deferred, not missed.

## Error semantics / risk

- Verdaccio is local-only; the script hard-codes `http://localhost:4873` and
  fails closed if the port can't bind. No path publishes to npmjs.org or
  GitHub Packages — there is no code path that can.
- `try/finally` guarantees teardown; a crashed verdaccio leaves only an
  OS-temp dir (self-evidently disposable).
- `--dry-run` performs no network write by definition.
- The metadata additions are forward-compatible with the eventual public path
  (nothing has to be undone later) and reversible in git.
- Blast radius: package.json metadata + new docs + a new script. No
  `packages/*/src` runtime code changes.

## Testing / verification

Verification is the harness itself, not new unit tests (consistent with the
test-infra phase's reasoning — unit-testing a publish script against a real
registry would be re-implementing the script):

- `scripts/publish-proof.mjs` runs green: 3 packages publish to verdaccio,
  clean-dir install resolves with no `workspace:` leak, both bins execute.
- `--dry-run` green for the 3; tarball file-lists captured and asserted
  clean.
- Full pre-push gate (`pnpm turbo run lint typecheck test build`) green —
  the metadata edits must not break typecheck/build/lint (e.g. a malformed
  package.json). This phase's settle and push verify against the **full**
  gate (lesson from Phase 32.2: the pre-push hook is lint+typecheck+test+build,
  not just test).
- The CADENCE `test-coverage` gate is bypassed at settle
  (`--allow-missing-coverage`): this phase adds no `packages/**` test files by
  design (scriptable infra + metadata + docs).

## Acceptance criteria (for the DRAFT)

1. `@cadence/{core,types,host-claude-code}` each carry `license:"MIT"`,
   `publishConfig.access:"public"`, a `repository` block with `directory`,
   a per-package `LICENSE` (MIT, matching root) and a minimal `README.md`;
   root `package.json` has `license:"MIT"`; `@cadence/testkit` has
   `private:true`.
2. `scripts/publish-proof.mjs` exists, is cross-platform, and on a clean run:
   publishes the 3 packages to an ephemeral local verdaccio, installs
   `@cadence/core` (and `@cadence/host-claude-code`) into a fresh dir from
   that registry, asserts no `workspace:` string survives in any installed
   `package.json`, and runs both published bins successfully.
3. The harness tears verdaccio + all temp dirs down unconditionally
   (try/finally) and exits non-zero on any failed assertion; nothing is
   published to any non-localhost registry.
4. `pnpm -r --filter=!@cadence/testkit publish --dry-run` succeeds for the 3
   packages; each `pnpm pack` tarball contains only
   dist/bin/package.json/LICENSE/README — no src/tests/.cadence/config —
   and the file lists are recorded in the phase report.
5. `DESIGN.md` (publish section + §10 item 34), `README.md` (published-install
   pending note), `CHANGELOG.md` (Unreleased/Added), and `.cadence/ROADMAP.md`
   (Phase 30.1 delivered via reversible path + a named deferred public-release
   milestone scoping the Non-Goals) are updated.
6. Full `pnpm turbo run lint typecheck test build` gate green; phase settled
   via the dogfood loop (two-commit) with `--allow-missing-coverage`.

## Affected files

- `packages/core/package.json`, `packages/types/package.json`,
  `packages/host-claude-code/package.json` — license/publishConfig/repository.
- `packages/testkit/package.json` — `private:true`.
- `package.json` (root) — `license:"MIT"`.
- `packages/{core,types,host-claude-code}/LICENSE` — **new** (copy of root).
- `packages/{core,types,host-claude-code}/README.md` — **new** (minimal).
- `scripts/publish-proof.mjs` — **new** (+ optional `.ps1`/`.sh` thin
  wrappers).
- `DESIGN.md`, `README.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` — docs.

## Build sequence (for the plan)

1. Metadata hardening on the 4 package.json files + root `license`.
2. Per-package `LICENSE` + `README.md` for the 3 publishable.
3. `scripts/publish-proof.mjs` (verdaccio up → publish → clean-install assert
   → teardown), iterate until green on the Windows box.
4. Dry-run + `pnpm pack` tarball-content assertions; record file lists.
5. Docs + ROADMAP (incl. the named deferred public milestone).
6. Full gate (`lint typecheck test build`) green; dogfood as CADENCE phase
   `33-publish-pipeline`/`33-01`, tier `standard`, two-commit convention,
   settle with `--allow-missing-coverage`. Push is user-gated (the now-passing
   pre-push hook re-runs). **Dual identifier (carry both, do not drift):**
   ROADMAP "Phase 30.1 — Publish pipeline" ＝ dogfood phase dir
   `33-publish-pipeline`/draft `33-01` — same work, distinct namespaces per
   the project's documented ROADMAP-vs-phase-dir convention. The ROADMAP
   note in step 5 must reference the `33-01` dogfood phase explicitly.
