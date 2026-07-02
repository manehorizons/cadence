# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

CADENCE is a draft/build/settle framework for AI-assisted development with
configurable quality gates. It is a **meta-tool**: it scaffolds and runs the
DRAFT→BUILD→SETTLE loop on consumer projects, **and uses that same loop on
itself**. The `.cadence/` directory at the repo root is not example data —
it is the live state of CADENCE planning CADENCE.

Authoritative starting points (read these instead of restating them):

- `README.md` — install + quickstart
- `DESIGN.md` — locked decisions, anti-goals, phase history, gate semantics
- `docs/concepts.md` — the loop, profiles × tiers, the full gate matrix
- `docs/reference/commands.md`, `docs/reference/config.md` — CLI + config schemas
- `AGENTS.md` + `docs/agents/` — issue tracker, triage labels, domain docs

## Common commands

This is a pnpm + turbo monorepo. Run everything from the repo root.

```bash
pnpm install              # one-time setup
pnpm build                # turbo build, all packages
pnpm test                 # turbo test, all packages (vitest)
pnpm typecheck            # tsc --noEmit, all packages
pnpm lint                 # eslint, all packages

# Single-package work:
pnpm --filter @manehorizons/cadence-core test
pnpm --filter @manehorizons/cadence-core build
pnpm --filter @manehorizons/cadence-host-claude-code typecheck

# Run a single test file or grep test name:
pnpm --filter @manehorizons/cadence-core test -- path/to/file.test.ts
pnpm --filter @manehorizons/cadence-core test -- -t "name fragment"
```

Node `>=20` is required. `package.json` pins `pnpm@9.12.0`.

### The pre-push gate

`.githooks/pre-push` is wired via `git config core.hooksPath .githooks` and
runs `pnpm turbo run lint typecheck test build` before any push that updates
`refs/heads/main`, aborting on failure — this is the local enforcement layer.
Bypass with `git push --no-verify` only when you mean it. On the GitHub side,
`main` is branch-protected: the `ci-success` status check is required, and
**admin enforcement is on (`enforce_admins`, since 2026-06-06)** — so the check
applies to *everyone, including direct pushes by the repo owner*, not just PR
merges. This closes the gap where a direct push to `main` could bypass
`ci-success` (the hole that let an OS-specific CI red sit undetected for six
phases). Land `main` changes via a branch + PR that goes green; a flaky leg can
block a merge until re-run.

### The doc-sync gate

A second, cheap git hook keeps the release narrative honest. `.githooks/pre-commit`
fires only when a commit changes the canonical version
(`packages/core/package.json`); if it did, **`CLAUDE.md` must mention the new
version** or the commit is aborted (`.githooks/pre-push` re-checks this as a
backstop for direct pushes to `main`). The shared, testable checker is
`.githooks/check-doc-sync.sh` (pure: *(version, doc text) → pass/fail*), covered
by `packages/core/tests/docs/doc-sync-hook.test.ts` — whose live-guard case also
fails CI on every OS if a version bump ever lands with a stale `CLAUDE.md`.
Bypass with `--no-verify` like the CI gate.

The same four-command pipeline runs in `.github/workflows/ci.yml` on every
PR + push, on GitHub-hosted Ubuntu + macOS + Windows runners across Node 20 +
22 — all three OS legs (macOS unblocked in phase 49 by realpath'ing the testkit
temp root; Windows in phase 50 via platform-aware test timeouts in
`vitest.shared.ts` + best-effort temp cleanup).

## Architecture

Two-surface, five-package design. Source of truth for everything below is in
`pnpm-workspace.yaml` + each package's `package.json`.

### Packages

| Package | Role |
|---|---|
| `@manehorizons/cadence-core` | The engine. CLI (`cadence` binary), DRAFT→BUILD→SETTLE state machine, all gates, parsers, renderers. This is where ~all logic lives. |
| `@manehorizons/cadence-types` | Zod schemas + TypeScript types. Pure data layer — no logic, no I/O. Imported by every other package. |
| `@manehorizons/cadence-host-claude-code` | The Claude Code adapter (reference `HostAdapter`). Installs lifecycle hooks + nine slash commands; shims abstract events to the core dispatcher. `cadence-host-claude-code install` writes into a consumer's `.claude/`. |
| `@manehorizons/cadence-host-codex` | The OpenAI Codex CLI adapter (second `HostAdapter`, phase 60 contract). Installs project `.codex/hooks.json` + global `~/.codex/prompts/` slash commands; `cadence-host-codex hook` shims Codex's stdin-JSON lifecycle to the core dispatcher. Added v1.13.0 (phases 65–69). |
| `@manehorizons/cadence-testkit` | `private` (dev-only). Mock host + ephemeral-repo fixture + assertions used by every package's tests. Never published to npm. |

Four packages publish to npm (`access: public`): `core`, `types`,
`host-claude-code`, `host-codex`. `testkit` is intentionally private. The publish path was
proven reversibly via `scripts/publish-proof.mjs` (ephemeral verdaccio), first
shipped to npm on 2026-05-30 at `1.1.1`, then republished as `1.4.0` on
2026-06-02 — the version-hygiene release: a version bump matching `main`, an
annotated `v1.4.0` git tag, and npm provenance via OIDC (v1.4 milestone
DELIVERED). `1.5.0` (2026-06-03, tag `v1.5.0` + provenance) added session
continuity (`cadence handoff`/`resume`) plus a boundary-check fix. The
**`1.5.1`** release (2026-06-03, tag `v1.5.1` + provenance) was
the onboarding-hardening patch (phase 48): a distinct `NotInitializedError`, a
Node `>=20` floor with a fast-fail guard, a loud mock-fallback banner under
`settle --deep`, and two scaffold/doc fixes. `1.6.0` (2026-06-04, commit
`dd3aa93`) bumped the three packages `1.5.1 → 1.6.0` for the `cadence init
--preset` flag rename (phase 52, `--profile` kept as a deprecated alias) and the
`/cadence-scout` host slash command (phase 53), bundling the cross-platform-CI
completion (phases 49/50) and the docs portal (phase 51). Then: `1.6.1`
(2026-06-04) — internal-only patch (intelligence/store god-module split, phase
54; re-export barrel removal, phase 55; behavior-preserving). `1.7.0`
(2026-06-04) — `cadence doctor` (phase 56) + `cadence recommendation promote`
(phase 57) + an `install --local` portability fix. `1.8.0` (2026-06-05) —
`cadence mcp serve`, an MCP server surface (a third drive surface alongside CLI
+ Claude Code hooks; phase 58). `1.9.0` (2026-06-05) — drift-decides brief/full
`cadence resume` (phase 59). `1.10.0` (2026-06-05, tag `v1.10.0` + provenance,
PR #51, merge commit `9b85b5f`) — changesets bumped the three packages
`1.9.0 → 1.10.0` for the explicit, versioned **host-adapter contract** in
`cadence-types` (phase 60: `HostAdapter`, `HostCapabilitiesZ`,
`ADAPTER_CONTRACT_VERSION`, `ExtractedPayload`) + `claudeCodeAdapter`
conformance, folding in the `commander` 13 → 14 bump (#49; commander pinned
`^14` to hold the Node `>=20` floor). Then
**`1.11.0`** (2026-06-05, tag `v1.11.0` + provenance): changesets bumped the
three packages `1.10.0 → 1.11.0` for two adoption-layer features — **phase 61**
first-class **scout-session grouping** (an optional `scoutId` on recommendations
+ `recommendation add --scout-id`, a `recommend --scout-id <id>` cluster filter,
a `- scout:` render line, and `/cadence-scout` auto-minting a session id; PR #53)
and **phase 62** the guided **first-loop nudge** in `cadence init` output (a
numbered "Your first loop" block + `cadence progress` escape hatch; PR #54). Then
**`1.12.0`** (2026-06-05, tag `v1.12.0` +
provenance): changesets bumped the three packages `1.11.0 → 1.12.0` for two more
adoption-layer **`cadence-core`** CLI features — **phase 63** **`cadence
tutorial`** (runs one real DRAFT→BUILD→SETTLE loop in a throwaway sandbox,
printing each step's command + the engine's actual output; the executable
companion to `init`'s "Your first loop" block) and **phase 64** **`cadence
explain [concept]`** (in-CLI, terminal-sized help for loop/gates/tiers/profiles,
with content embedded in the binary so it works from any install — bare lists
the concepts, unknown names get a did-you-mean nudge). `cadence-types` and
`cadence-host-claude-code` carried version-alignment bumps only (no functional
change). The latest version is **`1.37.0`** (2026-07-02, tag `v1.37.0`
pending): the **enforcement-wedge wave 2 (partial)** release (v1.37) — the
first two of the three 2026-07-01 audit "wave 2" recommendations
(rec-20260701-001, rec-20260701-003; rec-20260701-009 "sealed gates" not yet
included — bundling wasn't a foregone conclusion this wave, per the audit's own
framing, so this release ships what's landed rather than waiting). No new
DESIGN.md D-number (deepens the existing coverage-gate and settle/SUMMARY
models). **Phase 139** — **default install enforces what the tutorial
demonstrates**: `verification.coverageMode` now defaults to `assertion` (not
`mention`) for new `cadence init` runs across all three presets, so a
comment-only `AC-N` mention no longer counts as tested (existing
`config.json` files are untouched); `verification.testCommand` is derived
from the target repo's `package.json#scripts.test` + detected package manager
(lockfile sniffing) and wired into both the real init write path and `init
--dry-run`'s preview; and `build-test-must-pass` writes a loud, non-blocking
`NO_TEST_COMMAND_NOTICE` to stderr instead of passing silently when no test
command is configured. Sourced from rec-20260701-001, shipped as **PR #119**
(squash `595a3f9`). **Phase 140** — **SUMMARY gate provenance**: `SUMMARY.json`
now records per-gate `ran`/`skipped` (+ reason) provenance for every
settle-dispatched gate, and each `acResults[]` row carries an optional
`evidence` class (`ai-verified`, `executed`, `assertion`, `mention`, or
`unverified` — the strongest real evidence found for that AC), with a
mock-provider deep-verify never reporting `ai-verified`; `SUMMARY.md` renders
a new "Gate provenance" section plus an evidence tag per AC line; pre-existing
SUMMARY records without these fields still parse/render unchanged. Sourced
from rec-20260701-003, shipped as **PR #120** (squash `13906e9`). Both phases
built TDD and dogfooded through CADENCE's own loop (`settle run --auto`, all
ACs derived PASS). All four published packages bumped `1.36.0 → 1.37.0` in
lockstep (`cadence-core` carries both features; `cadence-types` carries the
new `GateProvenance`/`AcEvidence` schema fields; both host adapters are
version-alignment only); npm publish is the user-triggered manual `Release`
workflow. Prior: **`1.36.0`** (2026-07-02, tag `v1.36.0`
pending): the **onboarding-honesty wave 1** release (v1.36) — six small,
high-trust fixes from the 2026-07-01 onboarding/ease-of-use audit
(rec-20260701-002/004/005/006/007/011; no new DESIGN.md D-number —
legibility/trust fixes, the same lane as `doctor`/`init`/`activate`). **Phase
133** — `cadence doctor`'s git-hooks check now verifies `.githooks/` actually
exists before flagging, and never auto-overwrites a pre-existing custom
`hooksPath` (e.g. Husky). **Phase 134** — `cadence progress --json`, mirroring
`recommend --json`'s pattern. **Phase 135** — `init --demo` no longer prints
the generic "Your first loop"/"Hand it to your AI agent" blocks (both of which
immediately refuse in DRAFT) alongside the correct demo instructions. **Phase
136** — README's real-phase walkthrough gets an inline `--no-approve` pointer
at the approve line. **Phase 137** — the refusal trio: BUILD-state `progress`
names the real first-pending task (or `settle run --auto`) instead of an
unrunnable compound command; `draft approve` on a missing `DRAFT.md` gives a
clean guarded refusal instead of a raw `ENOENT`; out-of-position `settle run`
also prints a `Next:` line. **Phase 138** — the slash-command count
reconciled to the code-true count across README/quickstart/claude-code.md
(fixing a broken TOC anchor), and `cadence start`'s menu gained an `activate`
option. Built across a single dogfooded milestone (`mil-grp-onboarding-honesty`),
each phase real-TDD'd as a two-commit settle, shipped as **PR #117** (squash
`963f222`). All four published packages bumped `1.35.0 → 1.36.0` in lockstep
(`cadence-core` carries the features; the other three are version-alignment
only); npm publish is the user-triggered manual `Release` workflow. Prior:
**`1.35.0`** (2026-06-27, tag `v1.35.0`
pending): the **init-dry-run** release (v1.35) — **`cadence init --dry-run`**, a
non-destructive **fit-check** that resolves everything init would (project name
+ source, preset, gate profile + source, layout, test globs,
verification/provider status, host surface, and the exact files it would create)
and prints a preview **while writing nothing**, so an adopter can run it inside a
populated repo before committing to the scaffold. Sourced from rec-20260619-005
(no new DESIGN.md D-number — onboarding/trust, the same lane as
`doctor`/`init`/`activate`). **Phase 132** added a pure, inspectable
**`planInit(cwd, opts, env, isTTY)` → `InitPlan`** plus a **`renderInitPlan`**
renderer in `init/plan.ts`, with the resolution helpers (`deriveName`,
`detectTestGlobs`, `suggestGateProfile`, `resolveGateProfile`) **relocated** out
of `init.ts` into `plan.ts` as the single source of truth (net −39 lines in
`init.ts`). The init action **short-circuits on `--dry-run` before any write**;
the real write path is byte-for-byte unchanged. The fit-check honors the
resolution flags (`--gate-profile`, `--activate` ±key, `--demo`), takes
precedence over `--claude-md`, and — unlike a real init — **previews rather than
refuses** on an already-initialized repo (exit 0; a real init still exits 2);
`init --json` was left out of scope (the `InitPlan` makes it trivial later).
Built TDD (AC-1..AC-5 PASS; 24 unit + 7 CLI tests) and **dogfooded through
CADENCE's own loop** (phase 132, settled via `settle run --auto`), shipped as
**PR #115** (squash `040e5ae`). All four published packages bumped
`1.34.0 → 1.35.0` in lockstep (`cadence-core` carries the feature;
`cadence-types` and both host adapters are version-alignment only); npm publish
is the user-triggered manual `Release` workflow. Prior: **`1.34.0`**
(2026-06-26, tag `v1.34.0`
pending): the **doctor-fix** release (v1.34) — **`cadence doctor --fix`**, a
mode that applies safe, deterministic repairs for the fixable `cadence doctor`
findings, turning the diagnostic into a one-step onboarding repair. Sourced from
rec-20260619-004 (no new DESIGN.md D-number — onboarding/legibility, the same
lane as `doctor`/`init`/`activate`). **Phase 131** added the repair engine: the
**git-hooks** finding sets `core.hooksPath=.githooks`; a **missing `STATE.md`**
is regenerated from `state.json`; a `--wire-host` opt-in re-runs the Claude Code
host install for host findings; and `--dry-run` previews every planned repair
while writing nothing. Risky findings stay **manual guidance** (never
auto-applied), and the whole path is **non-interactive / agent-non-TTY safe**.
Built TDD (AC-1..AC-5 PASS) and **dogfooded through CADENCE's own loop** (phase
131, settled via `settle run --auto`), shipped as **PR #113** (squash
`e8101b8`). All four published packages bumped `1.33.0 → 1.34.0` in lockstep
(`cadence-core` carries the feature; `cadence-types` and both host adapters are
version-alignment only); npm publish is the user-triggered manual `Release`
workflow. Prior: **`1.33.0`** (2026-06-26, tag `v1.33.0`
pending): the **first-real-phase agent-prompt** release (v1.33) —
**`cadence agent-prompt`**, a command that hands the user a copy-paste prompt
instructing an AI agent to scaffold their first real CADENCE phase (testable
ACs + a task breakdown, with an explicit **stop at the approval gate** so the
human still approves the DRAFT). Sourced from rec-20260619-006 (no new DESIGN.md
D-number — onboarding/legibility, the same lane as `draft new --template` and
`tutorial`/`start`). **Phase 130** added a pure, host-agnostic
**`renderAgentPrompt`** renderer (AC-1, AC-4) shared by two surfaces: the new
`cadence agent-prompt` command (AC-2, whose `--json` `goal` is `null` until a
phase exists) and a **`cadence init`** "hand it to your agent" output block
(AC-3), plus quickstart command-map + `docs/` wiring teaching the command
(AC-5). Built TDD and **dogfooded through CADENCE's own loop** (phase 130-01,
settled via `settle run --auto` with AC-1..AC-5 derived PASS), shipped as
**PR #111** (squash `689249b`). All four published packages bumped
`1.32.0 → 1.33.0` in lockstep (`cadence-core` carries the feature;
`cadence-types` and both host adapters are version-alignment only); npm publish
is the user-triggered manual `Release` workflow. Prior: **`1.32.0`**
(2026-06-23, tag `v1.32.0`
pending): the **tutorial-rebuilt-around-the-catch** release (v1.32) — `cadence
tutorial` now stages a lie and lets settle catch it, making the refusal the
demo's centerpiece (sourced from `docs/tutorial-rebuild-brief.md`; no new
DESIGN.md D-number — it leans on the existing gate model). In a throwaway
sandbox it drives draft → approve → build, marks task `T1` DONE with a real
`sum.mjs` but no test, and runs `cadence settle run --auto` — which **refuses**:
the `test-coverage` gate names `AC-1` and the loop stays in BUILD. The tutorial
then writes a real `sum.test.mjs`; the second `settle run --auto` executes it
through `build-test-must-pass` (`node --test`, real exit code) and the loop
closes with a SUMMARY. The previous `--ac AC-1=pass` manual assertion and
`allowMissingCoverage` bypass are **gone** — the gates decide on real state
alone, so a green close requires a real test that both references `AC-1` and
actually passes (a failing test → build-test exit 1 → refuse). **No engine
changes**: the tutorial scaffolds at `profile: standard` (where the coverage
gate fires) and owns a new `renderSumDraft`, while `renderDemoDraft` /
`cadence init --demo` are untouched (tutorial-only scope). Built TDD and
**dogfooded through CADENCE's own loop** (phase 129-01, settled via `settle run
--auto` with all five ACs derived `pass` from real task state); a CI parallel-load
flake from the new `node --test` subprocess spawns was fixed by consolidating the
full-run tests. All four published packages bumped `1.31.0 → 1.32.0` in lockstep
(`cadence-core` carries the feature; `cadence-types` and both host adapters are
version-alignment only); npm publish is the user-triggered manual `Release`
workflow. Prior: **`1.31.0`** (2026-06-19, tag `v1.31.0`
pending): the **first-real-DRAFT templates + onboarding front door** release
(v1.31). It bundles the post-v1.30 template milestone and follow-on onboarding
UX pass. **Phase 123** added `cadence draft new --template bugfix|feature|refactor`,
with deterministic editable Objective/AC/Task/Boundary scaffolds, validation
for unknown templates, auto-derived and explicit phase/task-id coverage, and
README/quickstart/command-reference teaching that templates are scaffolds, not
proof. The follow-on front-door pass made the no-install
`npx -y @manehorizons/cadence-core tutorial` the README/quickstart first touch,
split quickstart into a 30-second demo path plus first-real-phase template path,
updated `cadence init`'s "Your first loop" block to point at the bugfix
template, and made `cadence start` show a state-aware recommendation before the
full menu (uninitialized → no-install tutorial, initialized+IDLE → template
DRAFT, active loop → `cadence progress`, unreadable state → `cadence doctor`).
All four published packages bumped `1.30.0 → 1.31.0` in lockstep
(`cadence-core` carries the CLI/docs behavior; `cadence-types` and both host
adapters are version-alignment/dependency bumps only); npm publish is the
user-triggered manual `Release` workflow. Prior: **`1.30.0`** (2026-06-19,
tag `v1.30.0` pending): the **adoption onboarding polish + Codex parity**
release (v1.30). It bundles four settled phases from PR #105. **Phase 119** made
`cadence draft new --title "..."` derive the next free phase id and task number,
so the recommended first-loop command no longer requires users or agents to
invent `phase`/`num` positionals up front. **Phase 120** made gate bypasses loud
and durable: settle now prints explicit bypass notices for force, coverage, and
verifier-failure paths and writes `gateBypasses` into SUMMARY JSON/Markdown via
the shared `cadence-types` summary schema. **Phase 121** captured a sourced
competitive-positioning/objection FAQ for the in-loop enforcement wedge.
**Phase 122** closed the Codex host-adapter parity gap: Codex prompts now source
the same `COMMAND_GUIDANCE`/`SCOUT_DIALOGUE` as Claude/MCP, install
`cadence-scout`, and carry local hook roundtrip + prompt-catalog parity tests.
All four published packages bumped `1.29.0 → 1.30.0` in lockstep
(`cadence-core` and `cadence-types` carry the engine/schema changes;
`cadence-host-codex` carries the prompt/test parity change; `host-claude-code`
is version-alignment only); npm publish is the user-triggered manual `Release`
workflow. Prior: **`1.29.0`** (2026-06-18, tag `v1.29.0` pending): the
**non-TTY-gate-bypass** release (v1.29) — make CADENCE's two
interactive loop gates (`approve` at `cadence draft approve`, `interactive-verdict`
at `cadence settle run --interactive`) safe to drive from an AI agent or CI, which
are always non-TTY (sourced from rec-20260617-005, the top backlog item; no new
DESIGN.md D-number — additive legibility over the existing gate model). **Phase
116** — both gates previously hard-failed in a non-TTY with a cryptic
`StdinPrompter: stdin is not a TTY` error, with the fix flags buried; now a single
pure decision seam `resolveInteractivity(env, isTTY) → 'interactive' | 'bypass' |
'require-tty'` drives both. In a non-TTY the `approve` gate **auto-passes** loudly
(`note: non-TTY; approve gate auto-passed …` to stderr — the draft flow has no
SUMMARY, so the notice is the audit trail), and the `interactive-verdict` gate
**skips** its per-AC walker, passes, and records `interactiveVerifySkipped:
"non-tty"` in the SUMMARY — **no human verdicts are fabricated**; the other
verification gates (`test-coverage`, `deep-verify`) still decide. Three env
controls tune it: `CADENCE_REQUIRE_TTY=1` restores the strict pre-1.29 refusal
(wins), `CADENCE_NONINTERACTIVE=1` forces bypass even under a pseudo-TTY (for
pty-allocated agents), and a supplied `CADENCE_PROMPTER_SCRIPT` is always honored
(never bypassed). Env-driven only — **no new config knob**; `init` and the
explicitly-interactive commands (`activate`/`config edit`/`start`) are untouched.
Built TDD (5 ACs), two adversarial reviews PASS; the `approve` gate dogfooded its
own fix when this release phase was approved non-interactively. All four published
packages bumped `1.28.0 → 1.29.0` in lockstep (`cadence-core` carries the feature;
`cadence-types` carries the `interactiveVerifySkipped` summary field; the two host
adapters are version-alignment only); npm publish is the user-triggered manual
`Release` workflow. Prior: **`1.28.0`** (2026-06-18, tag `v1.28.0`
pending): a **coverage-depth + onboarding-completion** release bundling three
phases. **Phase 112** — **coverage-gate assertion mode**: an opt-in
`verification.coverageMode: 'assertion'` that counts an `AC-N` token only when it
sits inside an asserting `it()`/`test()` block (a pure, dependency-free,
string/comment-aware `findTestSpans`), so a comment-only mention is reported as a
*weak link* with a distinct refusal hint — closing the "mentioned-but-not-tested"
false positive. Default `mention` mode is byte-for-byte unchanged (rec-20260611-004).
**Phase 113** — **one onboarding front door + guided Next: rail**: `cadence start`
is now the single front door (README leads with it; `quickstart` reframed as the
post-init map), `cadence doctor` ends with a `Next:` line (pure `doctorNextStep`),
and `docs/quickstart.md` opens with a terminal/Claude Code/MCP driver fork
(rec-20260617-007). **Phase 114** — **onboarding papercuts**: `cadence init` warns
when a young repo's *derived* `auto` gate profile will flip `approve` to interactive
past ~20 commits (rec-20260617-009, scoped), and `cadence handoff` honors a
`CADENCE_NOW` clock override via a pure `resolveNow` seam, closing a UTC-midnight
flake in the clobber-refusal test (rec-20260618-001). With v1.28 the onboarding arc
is **complete** (recs 006/007/008/009 all shipped). No new DESIGN.md D-number
(coverage-mode deepens the existing test-coverage gate; the rest is
onboarding/legibility). All four published packages bumped `1.27.0 → 1.28.0` in
lockstep (`cadence-core` carries the features; `cadence-types` carries the
`coverageMode` schema field; the two host adapters are version-alignment only); npm
publish is the user-triggered manual `Release` workflow. Prior: **`1.27.0`**
(2026-06-17, tag `v1.27.0`
pending): the **onboarding-breeze** milestone (v1.27) — make `cadence init` a
zero-friction front door so a newcomer reaches a working, real-verification-ready
loop with one command and no follow-up steps. Sourced from a 2026-06-17 onboarding
assessment (install → first loop was ~8 typed steps + a hand-edit + a separate
`activate` hop); recs rec-20260617-001/002/004 (the init-hub trio; rec-003
arg-syntax + rec-005 agent/non-TTY mode deferred to v1.28). No new DESIGN.md
D-number (additive onboarding/legibility, same lane as `quickstart`/`start`/`activate`).
**Phase 108** — **zero-prompt init + auto-wire host**: `init` derives the project
name (`package.json#name`, scope-stripped, else dir basename) and gate profile (git
heuristic), asking nothing; when `.claude/` is present, `--wire-host` runs the Claude
Code adapter install in the same step via a subprocess spawn (core never imports host
code — mirrors `start`'s launcher discipline), a TTY offers it, non-TTY skips with a
pointer (`--skip-host-wire` opts out). **Phase 109** — **`init --demo`**: seeds a
ready-to-approve demo phase (objective + AC-1 + T1) into the user's own repo using a
`renderDemoDraft` template now shared with `cadence tutorial` (one source), so the
next commands are `approve → done → settle` with no hand-edit. **Phase 110** —
**`init --activate`**: when `ANTHROPIC_API_KEY` is in the env, writes
`verifier.provider=anthropic` (deep-verify seam) via the shared activate seam
(`planActivation`+`setPath`), the key never persisted and no live ping (that stays in
`cadence activate`); the summary confirms real verification is on and suppresses the
mock-placeholder notice. **Phase 111** — release: README quickstart collapsed to the
new flow, `commands.md` init flags, changeset, lockstep `1.26.0 → 1.27.0` across all
four published packages (`cadence-core` carries the feature; the other three are
version-alignment only). Built TDD, dogfooded through CADENCE's own loop on branch
`feat/v1.27-onboarding-breeze`; npm publish is the user-triggered manual `Release`
workflow. Prior: **`1.26.0`** (2026-06-13, tag `v1.26.0`
pending): the **guided-onboarding** milestone (v1.26) — **`cadence start`**, an
interactive onboarding front door that asks "What are you doing?", takes a
numbered pick, confirms, and runs the matching setup command. It is the
interactive sibling of the read-only `cadence quickstart` (which prints the map
without running anything); no new DESIGN.md D-number (additive onboarding/legibility
over existing commands, same lane as `quickstart`/`activate`). The six routes are
`cadence tutorial`, `cadence init`, `npx @manehorizons/cadence-host-claude-code
install`, `npx @manehorizons/cadence-host-codex install`, `cadence mcp install`,
and `cadence doctor`. **Phase 105** — pure core: a `START_OPTIONS` menu catalog
(→ runner + args) + text/JSON/confirm renderers + `resolvePick`, no I/O
(`packages/core/src/start/`). **Phase 106** — the CLI shell
(`packages/core/src/cli/commands/start.ts`): `runStart` does the TTY-aware
pick/confirm loop and a **uniform subprocess-spawn dispatch** (re-spawns the
`cadence` binary for core routes, `npx` for the two host packages — so core never
imports host code), with `--pick`/`--yes`/`--json` and a non-TTY menu-print that
never hangs; the command is registered and cross-referenced from `quickstart`'s
command map and `init`'s next-steps. **Phase 107** — release. Built TDD,
subagent-driven (implementer + two-stage spec/quality review per phase); the
code-quality review caught a Windows-CI portability bug pre-merge (`npx` via
`child_process.spawn` needs `shell:true` on win32). All four published packages
bumped `1.25.0 → 1.26.0` in lockstep (`cadence-core` carries the feature; the
other three are version-alignment only); npm publish is the user-triggered manual
`Release` workflow. Prior: **`1.25.0`** (2026-06-12, tag `v1.25.0`
pending): the **real-verification-default** milestone (v1.25) — name the `mock`
verifier honestly as a **placeholder** across every surface, closing the gap
between CADENCE's "real verification gate" pitch and its out-of-box mock default
(sourced from rec-20260611-003, the #1 finding of the 2026-06-11 competitive
assessment; no new DESIGN.md D-number — legibility/honesty over the existing
verifier-provider model). **Phase 104** — a single source-of-truth
`MOCK_VERIFIER_NOTICE` constant in `cadence-types` (label + message + activate
hint) now feeds the settle mock-fallback banner, the `cadence doctor`
verification-readiness check, a dedicated `cadence init` "Turn on real
verification" block, the `cadence quickstart` / `config explain` all-mock
warning, and the docs (README, `concepts.md`, `providers.md`, `config.md`) — each
naming mock a placeholder that is **not real verification**. Warning-only: mock
stays the zero-config offline default, nothing is blocked, the gate firing rule
is unchanged, and `deepVerifyMeta` provenance is preserved. Built TDD (5 ACs, 6
tasks). Also folds in the **rec-20260611-002** fix (PR #86): the IDLE `draft new`
next-free hint filled the phase number into the *task-number* slot, mangling ids
for phases ≥ 100 into `NNN-NNN`; the task-num slot now defaults to `1`. All four
published packages bumped `1.24.0 → 1.25.0` in lockstep (`cadence-types` also
carrying the new constant; the two host adapters version-alignment only); npm
publish is the user-triggered manual `Release` workflow. Prior: **`1.24.0`**
(2026-06-11, tag `v1.24.0`
pending): the **recommendation-retention** milestone (v1.24) — manual + automatic
**soft-archival** of recommendations (no new DESIGN.md D-number; additive to the
recommendation-lifecycle model, deepening phase 100's `shipped` status). Terminal recs
already drop out of the active `cadence recommend` surface, but the ledger was
append-only; v1.24 adds recoverable move-aside archival into a new `archived` array.
**Phase 101** — storage + manual surface: `RecommendationLedger.archived`
(`.default([])`, backward-compatible) + optional `archivedAt`/`archiveReason` on a rec;
pure `archiveRecommendation`/`unarchiveRecommendation` + `runRecommendation{Archive,
Unarchive}`; CLI `recommendation archive <id>` / `unarchive <id>` / `list --archived`
(PR #77). **Phase 102** — auto-archive wiring: `recommendations.autoArchive` config
(**default on**, recoverable — unlike `handoff.retain`'s hard-delete), `promote` to
`shipped`/`rejected` auto-archives in the same atomic write, a best-effort settle→rec
hook archives a `converted` rec when its phase settles (`converted-settled`, never
blocks settle), `autoArchive` in the `config edit` catalog, and `recommendation show`
made archive-aware so an auto-archived rec never vanishes from inspection (PR #78).
**Phase 103** — release: docs (`commands.md` archive/unarchive + `--archived`;
`config.md` `recommendations` section) + changeset + lockstep `1.23.0 → 1.24.0` across
all four published packages; npm publish is the user-triggered manual `Release`
workflow. Prior: **`1.23.0`** (2026-06-11, tag `v1.23.0`): the
**rec-lifecycle-terminal-status** release publishing **phase 100**
— a `shipped` terminal status for recommendations (sourced from rec-20260611-001;
no new DESIGN.md D-number, an additive lifecycle state). A rec whose work has
landed (directly via a PR, or after a formal `convert`) can now reach a truthful
positive-terminal state via `cadence recommendation promote <id>
--status=shipped [--ref "PR #70 / v1.22.1"]` instead of being stuck at
`candidate`; `shipped` recs drop out of the active `cadence recommend` surface
(like `converted`/`rejected`), the optional freeform `shippedRef` renders as a
`- shipped:` provenance line, and the one sanctioned transition out of an
otherwise-terminal status is `converted → shipped`. Built TDD (7 ACs, PR #73),
then dogfooded (PR #74: 20 shipped recs retro-marked, clearing the active
surface). All four published packages bumped `1.22.1 → 1.23.0` in lockstep; npm
publish is the user-triggered manual `Release` workflow. Prior: **`1.22.1`** (2026-06-11, tag `v1.22.1`
pending): a **patch** release publishing the phase-id ceiling fix
(rec-20260610-001, merged to `main` via PR #70, merge `b350630`) — the id schema
was widened `^\d{2}-\d{2}$ → ^\d{2,}-\d{2,}$` and all id derivation routed through
a shared `derivePhaseTaskId` helper, so phases ≥ 100 are representable end-to-end
(previously mangled into `10-100`); existing 01–99 ids unchanged. All four
published packages bumped `1.22.0 → 1.22.1` in lockstep; no new milestone, no
DESIGN.md D-number (a correctness fix to the existing phase-id schema). npm
publish is the user-triggered manual `Release` workflow. Prior: **`1.22.0`** (2026-06-10, tag `v1.22.0`
pending): the **verification-activation** milestone (v1.22) — `cadence activate`,
the guided on-ramp from the default all-`mock` verifiers to one real-verification
loop (no new DESIGN.md D-number; additive activation/legibility over the existing
verifier-provider model). **Slice 1 (phase 98)** — **`cadence activate`**: picks a
provider and writes `verifier.provider` (deep-verify seam by default; `--all` for
every seam), validates the key with a minimal live anthropic ping (`--no-check` to
skip; `local`/`mock` skip the ping), and **never persists the key** — only the
provider name is written; key-missing still records the selection + prints the exact
`export …` line, a failed live check exits non-zero without losing the selection,
`--print` previews without writing, non-interactive runs require `--provider`. Built
as a pure flag-driven core (`activate/{assess,plan,render,ping}.ts`) + a thin shell.
**Slice 2 (phase 99)** — a `cadence doctor` **`verification-readiness`** check
(reusing the same pure `assessReadiness` — one source of truth: `warning` on
all-mock → `cadence activate`, or a real provider missing its key; `ok` otherwise;
best-effort) + discoverability pointers from `quickstart` / `config explain` (a new
`all-mock` warning) / `init`. **Slice 3** = release. All four published packages
bumped `1.21.0 → 1.22.0` in lockstep (`cadence-host-claude-code` /
`cadence-host-codex` version-alignment only); npm publish is the user-triggered
manual `Release` workflow. (Dogfooding note: this milestone's release phase exposed
that CADENCE's own phase-id schema `^\d{2}-\d{2}$` caps phases at 99 — phase 100
can't be represented, so this release was cut outside the loop; tracked for a fix.)
Prior: **`1.21.0`** (2026-06-10, tag `v1.21.0`
pending): the **quickstart-onboarding** milestone (v1.21) — a four-slice arc
that lowers the barrier to a first CADENCE loop and makes config
self-explanatory (no new DESIGN.md D-number; additive CLI-only). **Slice A
(#63)** — **`cadence config explain [field]`**: a terminal-sized, in-CLI
explanation of the *active* config in plain language (resolved gates, providers,
warnings) so operators don't cross-reference `docs/reference/config.md`. **Slice
B (#64)** — deepened `config explain`: richer per-field guidance and an optional
`[field]` focus, content embedded in the binary so it works from any install.
**Slice C (#65)** — **`cadence config edit [field]`**: a guided, interactive
wizard that writes schema-validated changes back to `.cadence/config.json`
without hand-editing JSON. **Slice D (#66)** — **`cadence quickstart`**: a
read-only, state-aware onboarding front door that orients a user from any loop
position (uninitialized, IDLE, mid-phase) by reusing `nextAction`; never throws,
with a corrupt-state fallback and `--json`. All four published packages bumped
`1.20.0 → 1.21.0` in lockstep (`cadence-host-claude-code`/`cadence-host-codex`
version-alignment only); npm publish is the user-triggered manual `Release`
workflow. Prior: **`1.20.0`** (2026-06-08, tag `v1.20.0`
pending): the **handoff-retention** milestone (v1.20) — opt-in, count-based
pruning of dated `SESSION-*.md` handoff docs that previously accumulated
indefinitely (30 had piled up by v1.19). Sourced from rec-20260608-001; deepens
session-continuity additively (**no new DESIGN.md D-number**). **Phase 88 —
core + wiring:** a `handoff.retain` config field in `cadence-types`
(`int >= 1`, **unset = pruning disabled** — the safe, non-destructive default);
a pure `selectPrunable(filenames, keep, current)` keeping the newest N by
lexicographic-descending order (ISO date prefix ⇒ chronological; deterministic,
offline, no git introspection) and **always** force-retaining the current
`lastHandoff`; impure `pruneHandoffDir` wired into `runHandoff` **at
handoff-write time** (not settle — settle fires per-phase and would race the
`lastHandoff` pointer), **best-effort** (any failure leaves the handoff intact,
`pruned` empty) and **reported** (`handoff: pruned N stale doc(s): …` on CLI +
`handoffService`); `HandoffResult` gains `pruned: string[]`. Hard-delete (not
archive — archiving just relocates the pile-up); never silently destructive
because it is opt-in, keeps the newest N that `resume` relies on, and reports.
**Phase 89 — visibility:** a read-only, best-effort `cadence doctor`
`handoff-retention` check — `ok` within the retain budget (or set-and-over,
since the next write self-heals), `warning` only when retention is **unset** and
≥ 10 docs have accumulated (suggesting a `handoff.retain` value); degrades to
`ok` on any error, never throws. **Phase 90 = release** (config.md `handoff`
section + changeset). All four published packages bumped `1.19.0 → 1.20.0` in
lockstep (`cadence-host-claude-code`/`cadence-host-codex` version-alignment
only). A manual `cadence handoff prune` command, age-based/merged-to-main
retention, and archive-instead-of-delete were all judged out of scope (YAGNI).
Prior: **`1.19.0`** (2026-06-08, tag `v1.19.0`
pending): the **worktree-safety-polish** milestone (v1.19) — two pure additions
on the v1.18 collision primitive (`gatherOccupancy` + `detectPhaseCollision`),
making cross-worktree phase usage **visible and proactive** instead of only
guarded reactively (DESIGN.md **§13**). **Phase 85** — a read-only `cadence
doctor` `worktree-phases` check: `ok` when no sibling worktree holds a colliding
number (inventorying any non-colliding sibling/upstream claims), `warning`
naming the conflict + next free number when a **sibling** collides with a local
phase. Collisions are **sibling-vs-local only** — upstream (`origin/<ref>`) is
the merged baseline, so a local phase also on it is normal, not a warning (it
still feeds next-free); best-effort, degrades to `ok` offline. **Phase 86** —
proactive next-free allocation: the IDLE `cadence draft new …` suggestion (in
both `progress` and the recommend/Praxis backend) fills in `max(observed)+1`
over local + sibling + upstream instead of a bare `<num>` placeholder, so the
first pick already clears claims the guard would refuse. Pure `nextAction` takes
the number as a hint; the impure service layer resolves it best-effort
(`resolveNextFreePhase`) and falls back to the placeholder on any failure —
never blocks `progress`. **Lowest-gap numbering was evaluated and DROPPED** (not
deferred): it would reverse §13's locked monotonic `max+1` decision for no
demonstrated need (even an opt-in knob judged YAGNI); `nextFree` stays
`max(observed)+1`. **Phase 87 = release** (docs + DESIGN.md §13 + changeset).
All four published packages bumped `1.18.0 → 1.19.0` in lockstep
(`cadence-host-claude-code`/`cadence-host-codex` version-alignment only); no new
DESIGN.md D-number (deepens §13). Prior: **`1.18.0`** (2026-06-07, tag `v1.18.0`):
the **worktree-safety** milestone (v1.18) — a **phase-collision
guard** that stops two git worktrees from silently scaffolding the same phase
number (DESIGN.md **§13**). CADENCE's loop state lives in the working tree and
each worktree holds a private `.cadence/`, so two worktrees branched from one
commit both conclude "phase N is next"; with different slugs (`30-auth` vs
`30-cache`) git **silently merges both in** — two phase Ns, no conflict marker.
The guard observes ground truth (`git worktree list` + `origin/<integrationRef>`
— Approach A, *not* a reservation registry) and **refuses** to scaffold a number
already claimed by a sibling worktree or upstream, naming the conflict and the
next free number. **Phase 83 — the guard:** pure `detectPhaseCollision` +
`phaseNumber` (leading-token key — `30-auth`/`30-cache` both → `30`) +
best-effort `gatherOccupancy` (local + sibling + upstream; never throws) + shared
`assertNoPhaseCollision` wired into `spec new`/`draft new` (local excluded — dir
being created) and a `settleService` backstop (excludes the `local` source =
self; self-exclusion is by **source**, not number, else a same-number sibling
would be hidden) + `--allow-phase-collision` bypass (never bypasses the local
same-dir `existsSync` refusal) + `phaseGuard { enabled (default true),
integrationRef (default "main") }` config in `cadence-types`. **Phase 84 =
release** (docs + DESIGN.md §13 + changeset). All four published packages bumped
`1.17.0 → 1.18.0` in lockstep (`cadence-host-claude-code`/`cadence-host-codex`
version-alignment only); a `cadence doctor` cross-worktree line, proactive
next-free allocation, and lowest-gap numbering were left deferred (v1.19 then
shipped the first two and dropped lowest-gap). Prior:
**`1.17.0`** (2026-06-07, tag `v1.17.0`):
the **observability** milestone (v1.17) — a zero-dependency, additive,
**default-off** structured operator-debugging logger for diagnosing CADENCE
itself (the Post-v1.0 "structured logging" vector; DESIGN.md **§12**). Writes
**only to stderr** (never stdout — safe for `--json` and the `cadence mcp serve`
protocol channel), gated by `CADENCE_LOG_LEVEL`/`CADENCE_LOG_FORMAT` env +
optional `config.logging { level, format }` (precedence env > config > default
`silent`). **Phase 80 — foundation:** `LogLevel`/`LogFormat`/`LogRecord` types in
`cadence-types`; pure formatters + level-gating `Logger` (`.child({ seam })`,
stderr-only sink) + env/config resolution in `cadence-core`. **Phase 81 —
instrumentation:** three seams emit via `getLogger().child({ seam })` — `gate`
(settle gate skipped/passed/refused), `hook` (lifecycle event dispatch), `verify`
(anthropic/local request/response/error + token usage; auth headers/keys never
logged); `configureLoggerFromConfig` wires `config.logging` at CLI settle, hook
dispatch, and MCP serve. No diagnostic `console.*` existed at the seams to
migrate; the hook context-payload `console.log` stays the stdout contract. **Phase
82 = release** (docs + DESIGN.md §12 + changeset). All four published packages
bumped `1.16.0 → 1.17.0` in lockstep; OTel/OTLP export + state-transition logging
remain deferred (the logger leaves a clean extension point). Prior:
**`1.16.0`** (2026-06-07, tag `v1.16.0`):
the **MCP-surface-deepening** milestone (v1.16) — grow the `cadence mcp serve`
surface from a thin tools-only slice into a full MCP integration along four
dimensions. **Phase 75 — Resources:** `.cadence/` artifacts exposed read-on-demand
under a `cadence://` scheme (`state`, `state.json`, `roadmap`, `project`,
`recommendations`, + templated `phase/{phase}/draft|summary`); no
subscriptions/file-watching. **Phase 76 — tool parity:** five proven-out commands
join the set (`cadence_handoff`, `cadence_resume`, `cadence_recommendation_add`,
`cadence_recommendation_promote`, `cadence_doctor`) → 15 tools, enabling session
continuity + the scout→rec→promote path over MCP. **Phase 77 — Prompts + shared
guidance:** the canonical command prose + the `cadence-scout` dialogue move into a
shared **`cadence-types`** module (`COMMAND_GUIDANCE` + `SCOUT_DIALOGUE`) — one
source of truth for both the Claude Code slash commands (rendered output
**byte-identical**, golden-fixture–guarded) and the new MCP prompts
(`cadence_scout`/`cadence_next`/`cadence_draft`/`cadence_settle`). **Phase 78 —
zero-config:** `cadence mcp install [--print] [--client <c>]` non-destructively
writes/merges a project `.mcp.json` (idempotent; refuses to clobber a malformed
file; `--print` snippet for other hosts). Phase 79 = release. All four published
packages bumped `1.15.0 → 1.16.0` in lockstep; DESIGN.md **D11** deepened
additively (no new D-number; stdio-only + imperative-surface-only still hold).
Then **`1.15.0`** (2026-06-06, tag `v1.15.0` +
provenance): the **verifier-robustness** milestone (v1.15) — make the real
verifier providers dependable in a settle gate, let the operator pick one at the
command line, and make every run's token usage auditable; provider hardening +
ergonomics around **unchanged** verdict logic, not a verifier rewrite (no new
DESIGN.md D-number). Phase 72 (provider hardening): `anthropic` gains
configurable `verifier.timeoutMs` + `verifier.maxRetries` (via the pure
`buildAnthropicClientConfig` seam) so a transient 429/5xx/network blip retries
before failing loud; `local` gains a bearer `Authorization` from
`CADENCE_LOCAL_API_KEY` plus arbitrary `verifier.localHeaders` for token-gated
OpenAI-compatible proxies (header values never logged). Phase 73 (selection +
cost): `cadence settle run --verifier <mock|anthropic|local>` overrides the
config-only provider selection (precedence **flag > config > default `mock`**,
invalid values rejected at parse time, honest interaction with the v1.14
mock-fallback banner), and optional token usage `{ inputTokens, outputTokens }`
is captured on `VerifyResult` (Anthropic `.usage`; `local` when returned) and
surfaced on `deepVerifyMeta`/SUMMARY — dollar cost intentionally not derived (no
price table). Phase 74 = release (docs + changeset + lockstep bump). All four
published packages bumped `1.14.0 → 1.15.0` in lockstep. Prior: **`1.14.0`**
(2026-06-06, tag `v1.14.0`
+ provenance): the **verifier-correctness** milestone (v1.14) — the `deep-verify`
gate now sends the AI verifier the **actual phase diff** (`git diff HEAD`, capped
by the new `verifier.diffCapBytes` config, default 256KB, truncated with an
explicit marker) instead of `diff: ''`, so deep verification judges the
implementation rather than test-linkage alone (DESIGN.md **D12**). Run-level
`deepVerifyMeta` provenance (`diffProvided`/`diffBytes`/`truncated`/`filesCount`/
`provider`/`model`) lands in the SUMMARY, and the mock-fallback banner now fires
on the gate's real firing condition (`--deep` **or** gate-set membership), not
just `--deep`, so a `standard × complex` settle never runs mock verification
silently. Phases 70 (keystone diff wiring + `capDiff` + provenance) → 71 (banner
honesty + docs + changeset); all four published packages bumped `1.13.0 → 1.14.0`
in lockstep. Prior: **`1.13.0`** (2026-06-05, tag `v1.13.0`
+ provenance): the **multi-host reach** milestone (v1.13) — a **fourth** published
package, **`@manehorizons/cadence-host-codex`**, the second consumer of the
phase-60 host-adapter contract (`ADAPTER_CONTRACT_VERSION = 1`, **unchanged** — a
differently-shaped host conformed without a contract bump). Built across phases
65–69 (spike → adapter core → install surface → hook shim → docs): `codexAdapter
satisfies HostAdapter` with `mapEvent` over Codex's near-1:1 lifecycle and
`extractPayload` parsing Codex's multi-file `apply_patch` envelope into
`ExtractedPayload.files`; `cadence-host-codex install` (project `.codex/hooks.json`
+ **global** `~/.codex/prompts/` slash commands) and `cadence-host-codex hook`
(the runtime shim → core dispatcher). The other three packages carried
version-alignment bumps only. Codex chosen over OpenCode for reach; Aider ruled
out (no hook system). Releases are cut with
[changesets](https://github.com/changesets/changesets) and the manual `Release`
workflow (`.github/workflows/release.yml`, `workflow_dispatch`).

### Two-surface model

One engine, two ways to drive it:

1. **CLI**: `node packages/core/bin/cadence.cjs <subcommand>` — terminal use,
   host-agnostic. Entrypoint: `packages/core/src/cli/index.ts` registering
   commands from `packages/core/src/cli/commands/`.
2. **Claude Code adapter**: `cadence-host-claude-code install` writes hooks
   into `.claude/settings.json` and slash-command files into
   `.claude/commands/`. Hooks call back into the same `cadence` CLI;
   slash commands like `/cadence-progress` shell out to it.

The adapter never duplicates engine logic — it translates Claude Code
lifecycle events (`SessionStart`, `PreToolUse`, `Stop`, etc.) into abstract
event names the core dispatcher understands. See
`packages/host-claude-code/src/event-map.ts` and `shim.ts`.

### The loop and its artifacts

`IDLE → SPEC → DRAFT → BUILD → SETTLE → IDLE` (SPEC is optional). Per-phase artifacts live in
`.cadence/phases/<phase>/<id>-{DRAFT,PROGRESS,SUMMARY,PLAN-REVIEW,...}.{md,json}`.
Two state files are regenerated on every state write:

- `.cadence/state.json` — machine-readable
- `.cadence/STATE.md` — derived human view, **do not edit by hand**

### Gates

The gate universe (13 gates, 3 always-fire + 10 deltas) is defined in
`packages/core/src/gates/engine.ts`. The full matrix and bypass flags are
documented in `docs/concepts.md` — do not duplicate that table here when
making changes; update `engine.ts` and `docs/concepts.md` together.

Three AI verifier providers (`mock`, `anthropic`, `local`) live under
`packages/core/src/verify/`. `mock` is the default and is deterministic +
offline; tests must never depend on `anthropic` or `local`.

## Conventions specific to this repo

### Two-commit settle convention

A completed phase produces exactly two commits in order:

1. **Feature commit** (`feat:` / `fix:` / `docs:` etc.) — source + tests + docs
2. **Settle commit** (`chore: settle`) — `.cadence/phases/<phase>/*` artifacts
   plus `.cadence/state.json` + `.cadence/STATE.md`

Reason: keeps `git log --no-merges` readable and blame on source files
uncontaminated by mechanical state writes. The split is owned by the
operator; CADENCE does not enforce it via hook.

### TDD is the house style

`CONTRIBUTING.md` is explicit: every new feature starts with a failing test.
Tests live in `packages/<pkg>/tests/` (mirrors `src/` structure). Use
`@manehorizons/cadence-testkit` for ephemeral-repo fixtures rather than rolling your own.

### Test ↔ AC linkage

When working on the engine's settle path, remember the test-coverage gate
contract: each AC must be referenced by token (`AC-N`) somewhere in a test
file's text. Scanner walks `verification.testGlobs` from `.cadence/config.json`
(default: `packages/**/*.test.ts(x)`). Tests that exercise this gate live in
`packages/core/tests/verify/`.

### TypeScript strictness

`tsconfig.base.json` turns on `strict`, `noUncheckedIndexedAccess`, and
`exactOptionalPropertyTypes`. Indexed access is `T | undefined`; optional
fields cannot be set to `undefined` explicitly. ESLint enforces
`consistent-type-imports` — use `import type { ... }` for type-only imports.

### Vitest workers are capped

`vitest.shared.ts` is the single source of truth for test timeouts (20s) and
caps `maxForks: 12`. This is the root-cause fix for a recurring parallel-load
flake; do not re-add per-test timeout band-aids. Each package's
`vitest.config.ts` `mergeConfig`s the shared base and adds only `include`.

### Historical naming

Pre-Phase-12 artifacts under `.keel/` are intentionally preserved as a
transition narrative. The project was renamed KEEL → CADENCE in Phase 12
(`v0.2.0-rc.1`, 2026-05-14). Don't "clean up" `.keel/` references in design
docs — they're load-bearing context. `DESIGN.md §8.3` lists rejected names.

### `.cadence/` is live state, not example data

When changing the engine, you are also operating on the planning records of
the project itself. `.cadence/ROADMAP.md`, `.cadence/PROJECT.md`,
`.cadence/MILESTONES.md`, and `.cadence/phases/*` reflect actual work and
should be edited only when the work requires it. Don't regenerate or
"freshen" these files for cosmetic reasons.
