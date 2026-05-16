# Publish Pipeline (Reversible Proof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the four-package publish path end-to-end and reversibly — real `pnpm publish` of the 3 publishable packages to an ephemeral local verdaccio registry + a public-npm `--dry-run` — with zero public-registry footprint.

**Architecture:** Harden metadata on `@cadence/{core,types,host-claude-code}` (license/publishConfig/repository + per-package LICENSE/README); mark `@cadence/testkit` `private:true`. A committed cross-platform `scripts/publish-proof.mjs` spins ephemeral verdaccio (anonymous publish, npmjs uplink for transitive deps), runs `pnpm -r publish` to it, installs into a clean temp dir, asserts no `workspace:` leak + both bins run, then tears everything down in `finally`. A separate `--dry-run` + `pnpm pack` proves the public shape. Real public publish / provenance / release.yml / changesets are explicitly deferred to a named v1.2 milestone.

**Tech Stack:** pnpm workspaces (`workspace:*` → concrete version rewrite on `pnpm publish`), verdaccio 6 (ephemeral, localhost), Node ESM script, turbo. Spec: `docs/superpowers/specs/2026-05-16-publish-pipeline-design.md`.

**Execution note (CADENCE dogfood — READ FIRST, overrides per-task git steps):**
Runs as a CADENCE phase on `main` (no worktree — project convention, same override applied in 32.1/32.2) under the **strict two-commit-per-phase convention**: ONE substantive commit (package.json + LICENSE/README + script + docs, NOT `.cadence/*`) then ONE `chore: settle …` commit (`.cadence/phases/33-publish-pipeline/*` + `.cadence/STATE.md` + `.cadence/state.json`). **Never one commit per task.**

This is **infra/metadata, not feature code** — no TDD red-green. Verification = the harness running green + the **full** pre-push gate. **Lesson from Phase 32.2 (do not repeat):** the `main` pre-push hook is `pnpm turbo run lint typecheck test build` — verify the FULL gate before claiming push-ready, not just `test`.

Per-task "Checkpoint" = stage-and-record, NOT commit: run the verification, `git add` the touched files, then `node packages/core/bin/cadence.cjs build task T<n> --status=DONE --notes "…"`. Do **not** `git commit` until Task 6.

Loop sequence: `node packages/core/bin/cadence.cjs draft new 33-publish-pipeline 01 --title="publish pipeline (reversible proof)" --tier=standard` → fill DRAFT (ACs at bottom) → `draft check .cadence/phases/33-publish-pipeline/33-01-DRAFT.md` → `draft approve 33-publish-pipeline 01` → Tasks 1–5 (`build task T<n> --status=DONE` each) → Task 6 (single substantive commit → `settle run --auto --allow-missing-coverage` → settle commit). **Dual identifier:** this implements ROADMAP "Phase 30.1 — Publish pipeline"; dogfood dir/draft = `33-publish-pipeline`/`33-01` (distinct namespaces per project convention — carry both, don't drift). Push is user-gated.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/core/package.json` | + license/publishConfig/repository | Modify |
| `packages/types/package.json` | + license/publishConfig/repository | Modify |
| `packages/host-claude-code/package.json` | + license/publishConfig/repository | Modify |
| `packages/testkit/package.json` | + `private:true` (exclude from publish) | Modify |
| `package.json` (root) | + `license:"MIT"` | Modify |
| `packages/core/LICENSE` · `packages/types/LICENSE` · `packages/host-claude-code/LICENSE` | per-package MIT (copy of root) | **Create** ×3 |
| `packages/core/README.md` · `packages/types/README.md` · `packages/host-claude-code/README.md` | minimal per-package README | **Create** ×3 |
| `scripts/publish-proof.mjs` | ephemeral verdaccio publish+install proof harness | **Create** |
| `DESIGN.md` | §10 item 34 + publish-pipeline subsection | Modify |
| `README.md` | "published install (pending v1.2 public-release)" note | Modify |
| `CHANGELOG.md` | `## [Unreleased] → ### Added` entry | Modify |
| `.cadence/ROADMAP.md` | Phase 30.1 delivered (reversible) + named deferred v1.2 public-release milestone | Modify |

---

## Task 1: package metadata hardening

**Files:** `packages/{core,types,host-claude-code}/package.json`, `packages/testkit/package.json`, root `package.json`

- [ ] **Step 1: `packages/core/package.json`** — add `"license": "MIT"` (after `"version"`), and after the `"files"` line add:

```jsonc
"license": "MIT",
"publishConfig": { "access": "public" },
"repository": {
  "type": "git",
  "url": "git+https://github.com/manehorizons/cadence.git",
  "directory": "packages/core"
},
```

(Place `"license"` near the top by convention; `publishConfig`+`repository` may go anywhere valid — keep JSON well-formed, 2-space indent matching the file.)

- [ ] **Step 2: `packages/types/package.json`** — same three keys, `"directory": "packages/types"`.

- [ ] **Step 3: `packages/host-claude-code/package.json`** — same three keys, `"directory": "packages/host-claude-code"`.

- [ ] **Step 4: `packages/testkit/package.json`** — add `"private": true` (after `"version"`). Do NOT add publishConfig/repository (it is not published).

- [ ] **Step 5: root `package.json`** — add `"license": "MIT"` (after `"version": "0.0.0",`). Root is already `"private": true` — leave that.

- [ ] **Step 6: Verify JSON + build unaffected**

Run: `node -e "for (const p of ['packages/core','packages/types','packages/host-claude-code','packages/testkit','.']) JSON.parse(require('fs').readFileSync(p+'/package.json'))" && echo JSON-OK`
Run: `pnpm -C packages/types build && pnpm -C packages/core build && pnpm -C packages/host-claude-code build`
Expected: `JSON-OK`; all builds clean (metadata-only change must not affect tsc).

- [ ] **Step 7: Checkpoint (stage only — NO commit)**

```bash
git add packages/core/package.json packages/types/package.json packages/host-claude-code/package.json packages/testkit/package.json package.json
```
Then: `node packages/core/bin/cadence.cjs build task T1 --status=DONE --notes "metadata hardening: license/publishConfig/repository x3; testkit private; root license"`

---

## Task 2: per-package LICENSE + README

**Files:** create `LICENSE` + `README.md` in each of `packages/{core,types,host-claude-code}`

- [ ] **Step 1: Copy root LICENSE into the 3 packages** (verbatim — MIT, © 2026 Thomas Powers):

```bash
cp LICENSE packages/core/LICENSE
cp LICENSE packages/types/LICENSE
cp LICENSE packages/host-claude-code/LICENSE
```
(Windows PowerShell equivalent: `Copy-Item LICENSE packages/core/LICENSE` etc. — content must be byte-identical to root `LICENSE`.)

- [ ] **Step 2: Minimal `packages/core/README.md`:**

```markdown
# @cadence/core

The CADENCE CLI engine — the `cadence` command (draft → build → settle loop, gates, telemetry).

Part of the [CADENCE](https://github.com/manehorizons/cadence) monorepo. MIT licensed.
```

- [ ] **Step 3: Minimal `packages/types/README.md`:**

```markdown
# @cadence/types

Shared Zod schemas and TypeScript types for CADENCE (config, state, anomalies, summaries).

Part of the [CADENCE](https://github.com/manehorizons/cadence) monorepo. MIT licensed.
```

- [ ] **Step 4: Minimal `packages/host-claude-code/README.md`:**

```markdown
# @cadence/host-claude-code

CADENCE host adapter for Claude Code — the `cadence-host-claude-code` command (hook install + event mapping).

Part of the [CADENCE](https://github.com/manehorizons/cadence) monorepo. MIT licensed.
```

- [ ] **Step 5: Verify**

Run: `node -e "for (const p of ['core','types','host-claude-code']){const fs=require('fs');if(!fs.readFileSync('packages/'+p+'/LICENSE','utf8').startsWith('MIT License'))throw new Error('LICENSE '+p);if(!fs.existsSync('packages/'+p+'/README.md'))throw new Error('README '+p)}console.log('LIC+README OK')"`
Expected: `LIC+README OK`

- [ ] **Step 6: Checkpoint (stage only — NO commit)**

```bash
git add packages/core/LICENSE packages/core/README.md packages/types/LICENSE packages/types/README.md packages/host-claude-code/LICENSE packages/host-claude-code/README.md
```
Then: `node packages/core/bin/cadence.cjs build task T2 --status=DONE --notes "per-package LICENSE (MIT) + README x3"`

---

## Task 3: `scripts/publish-proof.mjs` harness

**Files:** Create `scripts/publish-proof.mjs`

- [ ] **Step 1: Write `scripts/publish-proof.mjs`** with exactly this content:

```js
#!/usr/bin/env node
// Reversible publish proof: ephemeral verdaccio -> real pnpm publish of the 3
// publishable @cadence/* packages -> clean-dir install -> assert no
// workspace: leak + both bins run -> unconditional teardown. NO non-localhost
// registry is ever contacted for *publish* (transitive deps proxy npmjs for
// *install* only). See docs/superpowers/specs/2026-05-16-publish-pipeline-design.md
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REG = 'http://localhost:4873';
const REPO = process.cwd();
const PKGS = ['types', 'core', 'host-claude-code']; // publish order: types first (dep)
const tmps = [];
function tmp(p) { const d = mkdtempSync(join(tmpdir(), p)); tmps.push(d); return d; }
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', ...opts });
  return r;
}
function must(r, label) {
  if (r.status !== 0) {
    console.error(`FAIL ${label}\n--- stdout ---\n${r.stdout || ''}\n--- stderr ---\n${r.stderr || ''}`);
    throw new Error(label);
  }
}

const storage = tmp('vc-store-');
const vcConfig = join(tmp('vc-conf-'), 'config.yaml');
writeFileSync(vcConfig, `
storage: ${storage.replace(/\\/g, '/')}
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@cadence/*':
    access: $all
    publish: $all
    unpublish: $all
  '@*/*':
    access: $all
    publish: $all
    proxy: npmjs
  '**':
    access: $all
    publish: $all
    proxy: npmjs
log: { type: stdout, format: pretty, level: warn }
`);

let vc;
try {
  // 1. start verdaccio
  vc = spawn('npx', ['--yes', 'verdaccio@^6', '--config', vcConfig, '--listen', '4873'],
    { stdio: 'inherit', shell: process.platform === 'win32' });
  // wait for port (bounded ~30s)
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(REG + '/-/ping'); if (res.ok || res.status === 404) { up = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) throw new Error('verdaccio did not start on :4873');

  // 2. dummy auth so pnpm publish never prompts (server allows $all anyway)
  const npmrc = join(REPO, '.npmrc.publishproof');
  writeFileSync(npmrc, `@cadence:registry=${REG}\n//localhost:4873/:_authToken=publishproof\n`);

  // 3. publish the 3 packages to verdaccio (pnpm rewrites workspace:* -> 1.0.0)
  for (const p of PKGS) {
    must(run('pnpm', ['publish', '--registry', REG, '--no-git-checks', '--no-provenance', '--userconfig', npmrc],
      { cwd: join(REPO, 'packages', p) }), `publish @cadence/${p}`);
  }

  // 4. clean-dir install + assertions
  const proj = tmp('vc-proj-');
  must(run('npm', ['init', '-y'], { cwd: proj }), 'npm init');
  must(run('npm', ['i', '@cadence/core', '@cadence/host-claude-code', '--registry', REG], { cwd: proj }),
    'clean install @cadence/core + host');
  // 4a. no workspace: leak in installed @cadence/* package.json
  const scoped = join(proj, 'node_modules', '@cadence');
  for (const name of readdirSync(scoped)) {
    const pj = JSON.parse(readFileSync(join(scoped, name, 'package.json'), 'utf8'));
    const deps = { ...pj.dependencies };
    for (const [d, v] of Object.entries(deps)) {
      if (d.startsWith('@cadence/') && /workspace:/.test(String(v))) {
        throw new Error(`workspace: leak in @cadence/${name} -> ${d}@${v}`);
      }
    }
  }
  // 4b. both bins run from the clean install
  must(run('npx', ['cadence', '--help'], { cwd: proj }), 'bin: cadence --help');
  must(run('npx', ['cadence-host-claude-code', '--help'], { cwd: proj }), 'bin: cadence-host-claude-code --help');

  console.log('\nPUBLISH-PROOF: PASS — 3 packages published to verdaccio, clean install resolved, no workspace: leak, both bins run.');
} finally {
  if (vc && !vc.killed) { try { process.kill(vc.pid); } catch {} }
  try { rmSync(join(REPO, '.npmrc.publishproof'), { force: true }); } catch {}
  for (const d of tmps) { try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} }
}
```

- [ ] **Step 2: Make it node-runnable** — confirm `package.json` (root) `"type":"module"` (it is) so `.mjs` ESM + top-level `await fetch` work on Node ≥20.

- [ ] **Step 3: Build everything the harness publishes** (publish ships `dist/`):

Run: `pnpm install && pnpm -C packages/types build && pnpm -C packages/core build && pnpm -C packages/host-claude-code build`
(Re-verify package.json metadata survived `pnpm install` — memory: pnpm install can revert package.json edits. If reverted, re-apply Task 1 and re-`git add`.)

- [ ] **Step 4: Run the harness**

Run: `node scripts/publish-proof.mjs`
Expected: ends with `PUBLISH-PROOF: PASS …`; exit 0; no `.npmrc.publishproof` or temp dirs left (`git status --short` clean except intended files); no verdaccio process lingering.

- [ ] **Step 5: Checkpoint (stage only — NO commit)**

```bash
git add scripts/publish-proof.mjs
```
Then: `node packages/core/bin/cadence.cjs build task T3 --status=DONE --notes "publish-proof.mjs: verdaccio publish+clean-install proof PASS"`

---

## Task 4: public dry-run + tarball-content assertions

**Files:** none new — produces the recorded evidence for the phase report.

- [ ] **Step 1: Public-npm dry-run for the 3 packages**

Run: `pnpm -r --filter=!@cadence/testkit publish --dry-run --no-git-checks 2>&1 | tee /tmp/cadence-dryrun.txt` (Windows: redirect to a temp file you can read back).
Expected: success for `@cadence/core`, `@cadence/types`, `@cadence/host-claude-code`; `@cadence/testkit` skipped. No errors.

- [ ] **Step 2: Tarball content assertion** — pack each into a temp dir and assert the file set:

Run:
```bash
node -e "
const {spawnSync}=require('child_process');const {mkdtempSync,readdirSync,rmSync}=require('fs');const {tmpdir}=require('os');const {join}=require('path');
const d=mkdtempSync(join(tmpdir(),'cadpack-'));let ok=true;
for(const p of ['types','core','host-claude-code']){
  const r=spawnSync('pnpm',['pack','--pack-destination',d],{cwd:'packages/'+p,encoding:'utf8',shell:process.platform==='win32'});
  if(r.status!==0){console.error('pack '+p+' failed',r.stderr);ok=false;continue;}
}
for(const f of readdirSync(d).filter(f=>f.endsWith('.tgz'))){
  const t=spawnSync('tar',['-tzf',join(d,f)],{encoding:'utf8',shell:process.platform==='win32'});
  const files=t.stdout.split(/\r?\n/).filter(Boolean);
  const bad=files.filter(x=>/package\/(src|tests|\.cadence)\//.test(x)||/tsconfig|vitest\.config/.test(x));
  console.log('::',f,'::');console.log(files.join('\n'));
  if(bad.length){console.error('STRAY FILES in '+f+': '+bad.join(', '));ok=false;}
}
rmSync(d,{recursive:true,force:true});
if(!ok)process.exit(1);console.log('TARBALL-CLEAN: PASS');
"
```
Expected: each tarball lists only `package/dist/**`, `package/bin/**` (core+host), `package/package.json`, `package/LICENSE`, `package/README.md`; ends `TARBALL-CLEAN: PASS`. Copy the per-package file lists into the task notes (they become the phase SUMMARY evidence for AC-4).

- [ ] **Step 3: Checkpoint (stage only — NO commit; nothing to stage, evidence is in notes)**

`node packages/core/bin/cadence.cjs build task T4 --status=DONE --notes "dry-run green x3 (testkit skipped); tarballs = dist/bin/pkg.json/LICENSE/README only — <paste file lists>"`

---

## Task 5: docs + ROADMAP

**Files:** `DESIGN.md`, `README.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`

- [ ] **Step 1: `DESIGN.md` §10 — add item 34.** After the existing line 231 (`33. ~~Phase 32.1 …~~ ✓`) and before the blank line preceding `Sequencing rationale:`, insert:

```
34. ~~Phase 33.1 (ROADMAP "Phase 30.1") — publish pipeline reversible proof: metadata hardening (license/publishConfig/repository, per-pkg LICENSE/README), `scripts/publish-proof.mjs` (ephemeral verdaccio real publish + clean-install, no workspace: leak, bins run), public `--dry-run` + tarball-clean; testkit `private`; real public publish/provenance/release.yml/changesets deferred to named v1.2 milestone~~ ✓
```

- [ ] **Step 2: `DESIGN.md` — publish-pipeline subsection.** Add a short subsection (near §10 or the existing release/CI discussion) titled "Publish pipeline (v1.1 — reversible proof)": 3 publishable packages (testkit dev-only/private); proven via ephemeral verdaccio + dry-run; what is intentionally deferred (real public publish, npm provenance — needs public repo, release.yml, changesets, repo-visibility decision) and that the deferral is tracked as a named v1.2 milestone in ROADMAP.

- [ ] **Step 3: `README.md` — published-install note.** Locate the install/"Try it" section (keep the existing local-dogfood instructions verbatim — readme-shakedown F1/F6 anchors must stay) and add a short note: published `npx @cadence/core` is **not yet available** — install/run from the monorepo for now; public release is a tracked v1.2 milestone. Do not remove or reword the existing F1/F6 anchor phrases.

- [ ] **Step 4: `CHANGELOG.md` `## [Unreleased] → ### Added`.** After the Phase 31.1 docs bullet (the last `### Added` bullet, line ~10) and before the blank line preceding `### Fixed`, append:

```
- Publish pipeline (reversible proof): `@cadence/{core,types,host-claude-code}` carry `license`/`publishConfig.access:public`/`repository` + per-package `LICENSE`/`README`; `@cadence/testkit` is `private` (dev-only). `scripts/publish-proof.mjs` proves the path end-to-end against an ephemeral local verdaccio (real `pnpm publish` of the 3 packages → clean-dir install → no `workspace:` leak → both bins run → unconditional teardown); `pnpm publish --dry-run` + tarball inspection prove the public-npm shape. No public-registry footprint. Real public publish, npm provenance, `release.yml`, and changesets are deferred to a named v1.2 public-release milestone. (Phase 33.1.)
```

- [ ] **Step 5: `.cadence/ROADMAP.md`.** Two edits:
  (a) In the `### Phase 30.1 — Publish pipeline` section, add a leading status line: `**Status: ✓ Delivered v1.1 via the reversible proof path (dogfood phase `33-publish-pipeline`/`33-01`) — ephemeral verdaccio real publish + public dry-run; AC-1/2/6 met by the reversible variant. The irreversible remainder is the v1.2 milestone below.**`
  (b) Add a new named milestone block (after the v1.1 publish section, before/within "Deferred to v1.2+"): `## v1.2.0 — Public release (deferred, named)` with scope = exactly the Non-Goals: real public-npm publish of the 3 packages (`publishConfig` already set), npm provenance (**requires the repo be made public** — a conscious repo-visibility decision), `.github/workflows/release.yml` gated on `ci-success`, changesets adoption, and a re-decision on whether `@cadence/testkit` ever publishes. Note it depends on the repo-visibility decision.

- [ ] **Step 6: Verify docs hunks only**

Run: `git diff --stat -- DESIGN.md README.md CHANGELOG.md .cadence/ROADMAP.md`
Expected: only the 4 doc files, change counts consistent with the above (no accidental edits; F1/F6 README anchors intact — `git diff README.md` to eyeball).

- [ ] **Step 7: Checkpoint (stage only — NO commit)**

```bash
git add DESIGN.md README.md CHANGELOG.md .cadence/ROADMAP.md
```
Then: `node packages/core/bin/cadence.cjs build task T5 --status=DONE --notes "DESIGN §10 item34 + publish subsection; README pending-note; CHANGELOG Added; ROADMAP 30.1 delivered + named v1.2 deferred"`

---

## Task 6: full gate + two-commit settle

**Files:** none new — consolidates Tasks 1–5.

- [ ] **Step 1: Confirm staging.** `git diff --cached --name-only` must be exactly: 5 package.json, 3 LICENSE, 3 README, `scripts/publish-proof.mjs`, `DESIGN.md`, `README.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`. **Nothing under `.cadence/phases/`, `.cadence/STATE.md`, `.cadence/state.json`, no `.npmrc.publishproof`, no temp/tgz** staged. `git status --short` shows no stray harness leftovers (untracked `graphify-out/` is pre-existing, not ours — leave it).

- [ ] **Step 2: Full pre-push gate** (the Phase 32.2 lesson — verify the WHOLE hook, not just test):

Run: `pnpm install && pnpm turbo run lint typecheck test build`
(Re-check package.json metadata survived `pnpm install`; re-apply + re-stage Task 1 if reverted.)
Expected: all 16 tasks green (lint+typecheck+test+build × 4 packages). If the parallel-load flake is truly gone (Phase 32.1) this is clean; if any spawn test flakes, re-run — but it should not.

- [ ] **Step 3: Single substantive commit:**

```bash
git commit -m "$(cat <<'EOF'
feat(release): publish-pipeline reversible proof (Phase 33.1 / ROADMAP 30.1)

Metadata hardening on the 3 publishable packages (license MIT,
publishConfig.access:public, repository + per-package LICENSE/README);
@cadence/testkit marked private (dev-only). scripts/publish-proof.mjs
proves the path against an ephemeral local verdaccio: real pnpm publish
of the 3 packages, clean-dir install, asserts no workspace: leak and both
bins run, unconditional teardown. pnpm publish --dry-run + tarball
inspection prove the public-npm shape. Zero public-registry footprint.

Real public publish, npm provenance (needs public repo), release.yml and
changesets are deferred to a named v1.2 public-release milestone (ROADMAP).
Full gate (lint+typecheck+test+build) green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Settle:**

Run: `node packages/core/bin/cadence.cjs settle run --auto --allow-missing-coverage`
(`--allow-missing-coverage`: no new `packages/**` test files by design. `--allow-stale-draft` only if the DRAFT was edited post-approve.)
Expected: `Settled 33-01`; loop IDLE.

- [ ] **Step 5: Settle commit:**

```bash
git add .cadence/phases/33-publish-pipeline/ .cadence/STATE.md .cadence/state.json
git commit -m "chore: settle Phase 33.1 — publish pipeline reversible proof"
```

- [ ] **Step 6: Verify + surface push readiness (push USER-GATED — stop and ask).**

Run: `git log --oneline -4` (feat + settle pair on top), `node packages/core/bin/cadence.cjs progress` (IDLE), `git rev-list --count origin/main..HEAD`.
Then **stop** and report: phase settled, full gate green, N commits ahead ready to push (the now-passing pre-push hook re-runs on push). Do **not** push without explicit user confirmation. Note: a real `git push` was blocked earlier by the auto-mode classifier; the user added a `Bash(git push:*)` allow rule — it should now succeed, but the push itself remains the user's explicit call.

---

## Done criteria

- 3 packages carry license/publishConfig/repository + LICENSE/README; testkit `private:true`; root `license:"MIT"`.
- `scripts/publish-proof.mjs` green: real verdaccio publish ×3, clean install resolves, no `workspace:` leak, both bins run, full teardown, exit 0, nothing left behind.
- `pnpm publish --dry-run` green ×3 (testkit skipped); tarballs = dist/bin/package.json/LICENSE/README only; file lists recorded.
- DESIGN §10 item 34 + publish subsection; README pending-note (F1/F6 anchors intact); CHANGELOG Added; ROADMAP 30.1 delivered + named v1.2 deferred milestone.
- Full `pnpm turbo run lint typecheck test build` green; settled via dogfood loop (two-commit). Push user-gated.
- Zero public-registry footprint; provenance/real-publish/release.yml/changesets deferred and named.

## Acceptance Criteria (for the cadence DRAFT)

- **AC-1:** `@cadence/{core,types,host-claude-code}` each have `license:"MIT"`, `publishConfig.access:"public"`, a `repository` block with `directory`, a per-package MIT `LICENSE` and a minimal `README.md`; root `package.json` `license:"MIT"`; `@cadence/testkit` `private:true`.
- **AC-2:** `scripts/publish-proof.mjs` on a clean run publishes the 3 packages to an ephemeral local verdaccio, installs `@cadence/core`+`@cadence/host-claude-code` into a fresh dir from it, asserts no `workspace:` survives in any installed `@cadence/*` package.json, and runs both published bins — exiting non-zero on any failure.
- **AC-3:** The harness tears verdaccio + all temp files (incl. `.npmrc.publishproof`) down unconditionally (`finally`); no non-localhost registry is used for publish.
- **AC-4:** `pnpm -r --filter=!@cadence/testkit publish --dry-run` succeeds for the 3; each `pnpm pack` tarball contains only dist/bin/package.json/LICENSE/README (no src/tests/.cadence/tsconfig/vitest); file lists recorded in the phase report.
- **AC-5:** DESIGN (§10 item 34 + publish subsection), README (pending-install note, F1/F6 anchors preserved), CHANGELOG (Unreleased/Added), ROADMAP (Phase 30.1 delivered-via-reversible + named v1.2 public-release deferred milestone) updated.
- **AC-6:** Full `pnpm turbo run lint typecheck test build` gate green; phase settled via the dogfood loop with the two-commit convention.
