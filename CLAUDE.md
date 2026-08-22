# CLAUDE.md

Operating manual for AI agents working in this repository. Read it before
touching anything. Most conventions here are backed by an enforcement layer —
a git hook, a CI job, a doc-content test, or a CADENCE gate — so violating
them doesn't just annoy the operator, it fails the build. Where a rule has no
mechanical enforcement, that is stated, and the operator's review is the
backstop.

## What this repo is

CADENCE is a draft/build/settle framework for AI-assisted development with
configurable quality gates. It is a **meta-tool**: it scaffolds and runs the
DRAFT→BUILD→SETTLE loop on consumer projects, **and uses that same loop on
itself**. The `.cadence/` directory at the repo root is not example data —
it is the live state of CADENCE planning CADENCE.

The project's core thesis: **an AI agent's self-report of "done" is not
proof.** Gates re-derive completion from real state (tests, diffs, task
records) and refuse to settle when the evidence doesn't back the claim. You
are an AI agent working inside the tool built to distrust AI agents — every
rule in this manual follows from that thesis, and most of the failure modes
listed at the bottom are some flavor of violating it.

**Current version: `1.63.0`** across all five published packages (lockstep).
Do not reconstruct release history from memory or from this file — it lives
in `packages/*/CHANGELOG.md`, [GitHub Releases](https://github.com/thomas-powers-jr/cadence/releases),
`git log`, and `.cadence/phases/*/`. When a release bumps
`packages/core/package.json`, the version line above **must** be updated in
the same commit (the doc-sync gate below aborts the commit otherwise, and CI
re-asserts it on every OS).

## Read these before working (in order)

1. `CONTEXT.md` — the canonical vocabulary and its forbidden aliases. Read it
   **before exploring code**; reviews, docs, and doc tests are written
   against this glossary.
2. `DESIGN.md` — locked decisions (D1–D12, §12–§14), anti-goals, and
   deliberately rejected alternatives. LOCKED decisions are not open for
   relitigation; if a task seems to require reversing one, stop and say so
   instead of quietly doing it.
3. `docs/concepts.md` — the loop, profiles × tiers, the full gate matrix.
4. `docs/reference/commands.md`, `docs/reference/config.md` — CLI + config.
5. `AGENTS.md` + `docs/agents/` — issue tracker (GitHub via `gh` CLI), triage
   labels (`needs-triage`, `needs-info`, `ready-for-agent`,
   `ready-for-human`, `wontfix`), domain-doc protocol.

## Common commands

This is a pnpm + turbo monorepo. Run everything from the repo root.

```bash
pnpm install              # one-time setup
pnpm build                # turbo build, all packages
pnpm test                 # turbo test, all packages (vitest)
pnpm typecheck            # tsc --noEmit, all packages
pnpm lint                 # eslint, all packages

# Single-package work:
pnpm --filter @thomas-powers-jr/cadence-core test
pnpm --filter @thomas-powers-jr/cadence-core build
pnpm --filter @thomas-powers-jr/cadence-host-claude-code typecheck

# Run a single test file or grep test name:
pnpm --filter @thomas-powers-jr/cadence-core test -- path/to/file.test.ts
pnpm --filter @thomas-powers-jr/cadence-core test -- -t "name fragment"
```

Node `>=22` is required. `package.json` pins `pnpm@9.12.0`. The local CLI is
`node packages/core/bin/cadence.cjs <subcommand>` (after `pnpm build`).

A developer's PATH `pnpm` may resolve to a newer globally-installed major
(e.g. v11.x); its launcher prints a warning about its own behavior ("The
pnpm field in package.json is no longer read by pnpm...") before
self-switching and delegating to this repo's `packageManager`-pinned
`pnpm@9.12.0`, which reads and applies `pnpm.overrides` correctly — trust
the lockfile, not the launcher's warning.

## Architecture

Six packages, one engine, three surface categories (CLI · host adapters ·
MCP). Source of truth is `pnpm-workspace.yaml` + each package's
`package.json`.

| Package | Role |
|---|---|
| `@thomas-powers-jr/cadence-core` | The engine. CLI (`cadence` binary), DRAFT→BUILD→SETTLE state machine, all gates, parsers, renderers. ~All logic lives here. |
| `@thomas-powers-jr/cadence-types` | Zod schemas + TypeScript types. Pure data layer — no logic, no I/O. Imported by every other package. |
| `@thomas-powers-jr/cadence-host-claude-code` | Claude Code adapter (reference `HostAdapter`). Installs lifecycle hooks + slash commands; shims host events to the core dispatcher. |
| `@thomas-powers-jr/cadence-host-codex` | OpenAI Codex CLI adapter, second `HostAdapter` contract consumer. |
| `@thomas-powers-jr/cadence-host-toolkit` | Shared toolkit for the two host adapters (phase 222): the hook-routing algorithm's shape, the slash-command catalog, install.ts's managed-marker merge logic, and locate-self.ts. Depended on by both adapters as `workspace:*`; never imported by core. |
| `@thomas-powers-jr/cadence-testkit` | `private`, dev-only. Mock host + ephemeral-repo fixtures + assertions used by every package's tests. Never published. |

Five packages publish to npm; `testkit` is intentionally private.
`host-toolkit` had its first npm publish in the `1.51.1` release. Releases are
cut with
[changesets](https://github.com/changesets/changesets) and the manual
`Release` workflow (`.github/workflows/release.yml`, `workflow_dispatch`) —
npm publish is always operator-triggered, never automatic.

Dependency arrows are strict: adapters **translate lifecycle events only**
and never duplicate engine logic (`packages/host-claude-code/src/event-map.ts`
+ `shim.ts`); core **never imports host code** — where core needs a host
action it spawns the host package as a subprocess (the `start` /
`init --wire-host` launcher discipline). MCP (`cadence mcp serve`) exposes
the imperative loop only, over stdio; ambient edit-time gates need host
hooks. `host-toolkit` follows the same direction: both adapters depend on
it, core never does — it holds host-adapter-shared plumbing, not engine
logic.

### The loop and its artifacts

`IDLE → SPEC → DRAFT → BUILD → SETTLE → IDLE` (SPEC optional). Per-phase
artifacts live in `.cadence/phases/<phase>/<id>-{SPEC,DRAFT,PROGRESS,SUMMARY,
PLAN-REVIEW,...}.{md,json}`. Two state files are regenerated on every state
write: `.cadence/state.json` (machine-readable) and `.cadence/STATE.md`
(derived human view — **never hand-edit**).

A DRAFT's body has a fixed shape — keep it when authoring or editing one:
`## Objective` (one paragraph) · `## Acceptance Criteria` (`### AC-N: <name>`
as Given/When/Then prose) · `## Tasks` (`### TN: <name>` with `- files:` /
`- action:` / `- verify:` / `- done: AC-N` lines, optional `- depends:`) ·
`## Boundaries` (an explicit "Do NOT touch / Do NOT add" list). Prefer the
structured writers (`cadence draft new --template …`,
`draft set-objective/add-ac/add-task`) over hand-editing — a hand-typed
heading typo has silently corrupted AC/task sequencing before.

### Gates

The gate universe (14 gates: 3 always-fire + 11 deltas) is defined in
`packages/core/src/gates/engine.ts`. The full matrix and bypass flags are in
`docs/concepts.md` — when changing gates, update `engine.ts` and
`docs/concepts.md` **together**; do not duplicate the table anywhere else.

Three AI verifier providers (`mock`, `anthropic`, `local`) live under
`packages/core/src/verify/`. `mock` is the default: deterministic, offline,
and **a placeholder, not real verification** — operator-facing docs must
keep saying so (a doc test enforces the framing).

Know what `settle run --auto` actually proves: it derives per-AC PASS from
task terminal status + coverage evidence, and `build-test-must-pass` runs the
configured `verification.testCommand`. If no test command is configured it
prints a loud notice and cannot corroborate the suite — that notice is a
signal to fix config or verify manually, not background noise.

## How the operator works — match this workflow

The repo owner drives work through CADENCE's own loop and expects an agent
session to do the same. The shape of a healthy session:

1. **Orient before acting.** `git fetch origin --prune`, `git status
   --short --branch`, `gh pr list`, then `cadence resume` (read-only) to
   replay the freshest `.cadence/handoff/SESSION-*.md`, and `cadence
   progress` / `cadence recommend` for the next suggested action. Handoff
   docs carry explicit "do not" lines and carry-forward gotchas — obey them;
   they override your instincts. Their state blocks say "pre-filled —
   verify, don't retype": check live git/npm/GitHub before trusting any
   replayed fact. Never run two sessions against the same phase/draft at
   once; if resuming after a session that looks stuck or crashed, confirm
   the old one is actually dead first, then resume in place — reattach to
   its worktree/session — rather than spinning up a fresh session or
   worktree against the same draft (see "The Zombie Session" below).
2. **A unit of work is a phase, dogfooded.** New work is usually sourced
   from a Praxis recommendation (`cadence recommend`), converted to a phase,
   and run as SPEC/DRAFT → BUILD → SETTLE with real gates. Do not build
   features "outside the loop" unless the operator says so. The process is
   locked to CADENCE — do not migrate it to GSD or any other framework
   (borrowing a point-tool skill at an irreversible juncture is the only
   sanctioned exception).
3. **TDD is the house style** (`CONTRIBUTING.md`). Every feature and bugfix
   starts with a failing test, then implementation, then commit. Tests live
   in `packages/<pkg>/tests/` mirroring `src/`. Use
   `@thomas-powers-jr/cadence-testkit` ephemeral-repo fixtures rather than
   rolling your own.
4. **Non-trivial phases run subagent-driven in an isolated worktree**
   (`.claude/worktrees/<slug>`; prefer the native worktree tools over manual
   `git worktree add`): one implementer + one independent reviewer per task,
   then a final whole-branch review that must come back clean before merge.
   When deliberately running parallel agents, isolate to a worktree/branch
   from task 1, not reactively after noticing a `files:` conflict.
5. **Every completion claim is re-verified independently.** Subagent (or
   your own) "done" is confirmed by reading the diff and re-running the full
   suite + typecheck + lint yourself — never by accepting the worker's
   report. Releases likewise: after the Release workflow reports success,
   independently confirm `npm view` versions, the git tag, and the GitHub
   release.
6. **Single-commit settle convention.** A completed phase produces exactly
   one commit: source + tests + docs + phase artifacts (`.cadence/phases/**`)
   together, once the loop's own gates have verified the work — no separate
   `chore: settle` commit after it. The moment verification passes, promote
   any recommendation the phase closes to `shipped`
   (`cadence recommendation promote <id> --status=shipped --ref "..."`) in
   that same commit, then push — don't defer the promotion to a later pass.
   `state.json` and `STATE.md` are gitignored by default and never enter the
   commit — the `stateAtSettle` field in `SUMMARY.json`/`SUMMARY.md` is their
   audit-trail replacement. Operator-owned, not hook-enforced. Supersedes
   the prior two-commit split (feature commit, then a separate settle
   commit) as of 2026-07-22.
7. **Land via branch + PR, squash-merged.** `main` is branch-protected: the
   `ci-success` check is required and `enforce_admins` is on, so even the
   owner cannot push a red commit directly. Conventional-commit subjects
   carrying the phase id, e.g. `feat: wave-based subagent dispatch (phase
   159) (#149)`. One logical change per PR. Feature PRs add their own
   `.changeset/*.md` — do not defer changesets to the release PR (that
   slipped once and cost the release phase five retroactive changesets).
8. **End with a handoff.** Before a session closes meaningful work, write a
   `cadence handoff` doc: TL;DR, what landed, carry-forward gotchas, next
   action. Assume the next reader is a fresh session with zero context.

## Model selection

Session default is Sonnet at `xhigh` effort with an Opus advisor available
mid-turn (`~/.claude/settings.json`: `model: sonnet` + `advisorModel: opus` +
`effortLevel: xhigh`, set 2026-07-30). The advisor reads the full conversation
— every tool call, every result, every dead end — and returns judgment, not
edits. General mechanics, escalation heuristics, and its tool-less limitation
live in the global `~/.claude/CLAUDE.md` ("Opus advisor pattern"); this
section covers only what's specific to working in CADENCE.

**Escalate to the advisor** before committing to any of the judgment calls the
gate matrix can't automate for you:

- Authoring or amending a DRAFT's Acceptance Criteria / Task breakdown, or a
  SPEC, before it goes to review
- Interpreting a LOCKED `DESIGN.md` decision, resolving a phase-collision or
  worktree-placement ambiguity, or deciding whether a gate bypass is
  genuinely warranted
- Reconciling conflicting subagent completion claims before trusting a "done"
  report — see "The Self-Report Trust" below, the failure mode this whole
  repo is built to catch
- Two architectural approaches are live and the tiebreaker isn't mechanical
- Before promoting a recommendation to `shipped` or writing a handoff — a
  cheap second look before the record becomes durable

**The advisor does not satisfy CADENCE's own independence requirements** —
the whole-branch review before settle (item 4 above), or a second look on a
subagent's "done" claim. It shares this session's transcript and therefore
its blind spots. Get a real independent look from a fresh-context subagent
(`Agent(..., model: "opus")`) or a separate host (`CADENCE_HOST_CLI_BIN=codex`)
instead — never a self-review, and never an advisor consult standing in for
one. This is the same reason `cadence spec approve`'s built-in review gate
silently falls back to `mock` when run from inside a headless Claude Code
session: it detects it's already nested in a headless `claude` invocation
(`packages/core/src/verify/host-cli-client.ts`, the self-invocation guard)
and refuses to spawn a second one rather than risk unbounded recursion. When
that happens, dispatch a real independent review manually — don't treat the
mock fallback's pass as one.

## Enforcement layers — what will stop you

- **`.githooks/pre-push`** (wired via `git config core.hooksPath .githooks`):
  runs `pnpm turbo run lint typecheck test build` before any push updating
  `refs/heads/main`. Bypass with `--no-verify` only when you mean it.
- **`.githooks/pre-commit` — the doc-sync gate**: if a commit changes the
  canonical version (`packages/core/package.json`), both `CLAUDE.md` (the
  version line near the top) and `CHANGELOG.md` (its newest `## [x.y.z]`
  heading) must mention the new version string or the commit aborts. The
  pure checker is `.githooks/check-doc-sync.sh`;
  `packages/core/tests/docs/doc-sync-hook.test.ts` re-asserts the invariant
  in CI. The pre-push hook re-checks it as a backstop.
- **CI** (`.github/workflows/ci.yml`): the same four-command pipeline on
  Ubuntu + macOS + Windows on Node 22, aggregated into the required
  `ci-success` check.
- **Doc-content tests** (`packages/core/tests/docs/*.test.ts` + host
  packages): executable assertions that named docs match code truth — the
  command reference vs the registered CLI command set, slash-command counts
  vs installed files, config docs vs schema defaults, README claims vs
  behavior, the canonical "one core engine and three surface categories"
  vocabulary. If a behavior or doc change fails one, fix the *pair* — never
  loosen the test.
- **CADENCE's own gates** when working through the loop: coherence check,
  structural verifier, `build-test-must-pass`, per-AC test coverage,
  boundary enforcement, the phase-collision guard, and the rest of the
  matrix.

## Code conventions

- **TypeScript strictness**: `tsconfig.base.json` turns on `strict`,
  `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Indexed
  access is `T | undefined`; optional fields cannot be explicitly set to
  `undefined` (omit the key — conditional spread). ESLint enforces
  `consistent-type-imports` — use `import type { ... }`.
- **Pure core / impure shell.** The house pattern everywhere: a pure,
  dependency-injected function (`planInit`, `detectPhaseCollision`,
  `buildExplanation`, `resolveInteractivity`, …) taking all external facts
  as arguments, plus a thin impure wrapper that gathers those facts. New
  logic follows this split — it is what makes the TDD style cheap.
- **Best-effort introspection never throws.** Git/fs/env observation code
  (occupancy scans, handoff discovery, doctor checks) degrades to "no
  information" on any failure. Only a genuinely detected problem is a hard
  failure.
- **Refuse + suggest, never silently mutate.** On a conflict (phase
  collision, clobbering write) the engine refuses loudly, names the
  conflict, and suggests the fix. It never auto-renumbers, auto-overwrites,
  or silently falls back.
- **stdout is a contract; diagnostics go to stderr.** `--json` output and
  the MCP stdio protocol own stdout. Warnings, banners, notices, and the
  structured logger (`getLogger()`, default-silent) write to stderr only.
- **Zero-runtime-dependency bias.** The logger is homegrown; the MCP SDK is
  lazy-loaded off the CLI hot path. Do not add a runtime dependency without
  the operator's explicit sign-off.
- **Additive, backward-compatible schema changes.** New Zod fields get
  `.default(...)` / `.optional()`; pre-existing artifacts must keep parsing.
  YAGNI is applied deliberately, and rejected scope is *recorded* in
  DESIGN.md ("dropped, not deferred"), not just omitted.
- **Vitest workers are capped.** `vitest.shared.ts` is the single source of
  truth for test timeouts (20s) and `maxWorkers: 12`. Each package's
  `vitest.config.ts` merges it and adds only `include`.
- **Test ↔ AC linkage.** Under the coverage gate each AC must be referenced
  by its `AC-N` token in a test file — and in `assertion` mode (the default
  for new inits) the token must sit inside an asserting `it()`/`test()`
  block. Tests exercising this live in `packages/core/tests/verify/`.
- **Tests never call real providers.** `mock` only (plus the
  `CADENCE_PROMPTER_SCRIPT` seam for interactive flows); nothing in the
  suite may depend on `anthropic` or `local`.

## Named failure modes

Each entry: a mistake a capable-but-unguided model makes in this repo, and
the rule that prevents it — with the enforcement layer where one exists.

### State, artifacts, and history

- **The Freshen Reflex.** Regenerating or tidying `.cadence/ROADMAP.md`,
  `MILESTONES.md`, or `phases/*` because they look stale. → These are live
  planning records of real work; edit only when the work itself requires
  it. When a plan-time assumption proves false, the fix is an inline "As
  built" amendment, not a rewrite. *(Operator review only — which is exactly
  why this is written down.)*
- **The Hand-Edited STATE.md.** Fixing `.cadence/STATE.md` directly. → It is
  a derived render, regenerated on every state write; the edit is discarded
  on the next write. Change state through the CLI. (Gitignored by default —
  the file is still live on disk and still gets clobbered by hand-edits.)
- **The Mid-Loop Sweep.** `git restore`-ing or otherwise discarding
  uncommitted `.cadence/state.json` / `STATE.md` dirt while a loop is
  active. → That dirt is live telemetry — the current loop position. Both
  files are gitignored by default and never committed; leave them alone
  until the loop transitions naturally, don't hand-revert them mid-loop.
- **The Helpful Stage.** `git add -A` sweeping in local-only files:
  `.agents/`, `launch/`, `.claude/scheduled_tasks.lock`, accumulated
  uncommitted `SESSION-*.md` handoffs (swept periodically in deliberate
  housekeeping PRs, not ad hoc), or `.claude/settings.json` after a
  `--local` install (machine-absolute paths). → Stage explicitly; handoff
  docs list what stays local. In particular `launch/COMPETITIVE.md` is
  local-only **by explicit decision** — never commit, force-add, push, or
  PR it.
- **The Stale Handoff Replay.** Acting on a handoff doc's state block or
  recommendation list without checking the live repo. → `cadence resume` is
  read-only *by design* (D10); live `state.json` and `origin` are
  authoritative. Sibling git worktrees each hold a fully private
  `.cadence/` — check `.claude/worktrees/*/.cadence/handoff/` before
  assuming the primary checkout's state is complete.
- **The .keel Cleanup.** "Modernizing" `.keel/` paths or pre-Phase-12 KEEL
  references in design docs. → The KEEL→CADENCE rename (Phase 12,
  `v0.2.0-rc.1`, 2026-05-14) is a load-bearing transition narrative;
  `DESIGN.md §8.3` even preserves rejected names. Leave history alone.

### Language

- **The Bare "standard".** Writing "standard" unqualified. → It is both a
  profile and a tier, and `standard × standard` is a real cell. Always
  "standard profile" or "standard tier" (`CONTEXT.md`, Flagged ambiguities).
- **The Phase/Slice Conflation.** Calling one loop-trip a "phase". → A
  *phase* is the numbered directory/theme; a *slice* is one trip through the
  loop (`17-02`). DESIGN.md's legacy "Phase 17.2" prose means the slice.
- **The Synonym Drift.** Substituting "mode" for profile, "step" for task,
  "the brain" for Praxis, "retry loop" for convergence. → `CONTEXT.md` lists
  the avoided aliases per term; use the canonical word.
- **The Verifier Catch-All.** Calling every AI gate "the verifier". → The
  *verifier* is specifically the `--deep` per-AC agent; the umbrella term is
  *review agent* — and `structural-verifier`, despite its name, does no
  behavioral verification at all.

### Verification honesty (the thesis, applied to you)

- **The Self-Report Trust.** Accepting a subagent's "task complete, all
  tests passing" — or your own recollection of one — as done. → Re-verify
  independently: read the diff, re-run the full suite + typecheck + lint
  yourself. Subagents in this repo have twice claimed all-green over real
  failures, and shipped an ordering bug the independent review caught.
- **The Token Drop.** Satisfying the coverage gate by mentioning `AC-N` in a
  comment. → Write a real test that asserts the behavior; `assertion`
  coverage mode exists precisely to refuse comment-only mentions. Gaming
  the gate defeats the product. *(Enforced: test-coverage gate.)*
- **The Convenient Bypass.** Reaching for `--force`, `--allow-*`, or `git
  push --no-verify` to get green. → Bypasses exist for operators who mean
  it; they are loud and recorded in the SUMMARY (`gateBypasses`). Fix the
  root cause; if a bypass is genuinely right, say so explicitly.
- **The Mock Mirage.** Treating a green `deep-verify` under the `mock`
  provider as real verification. → Mock is a deterministic placeholder;
  `cadence doctor` reports whether real verification is wired.
- **The Speculative Stamp.** Hardcoding a next version number or release
  date into docs mid-feature. → Version strings enter docs in the release
  phase via changesets. A whole-branch review has caught exactly this.
- **The Premature "Done".** Claiming success from memory or a partial run.
  → State what was run and show the outcome; if tests fail, report the
  failure verbatim. In this repo the claim of done *is* the product surface
  under test.
- **The Unlogged Audit Finding.** A strategic-audit session (an agent
  auditing the existing codebase/implementation against prior findings)
  surfacing a critical/P0 finding and then closing without filing it. →
  Before closing an audit session, enumerate every critical/P0 finding it
  identified and check each against
  `.cadence/intelligence/recommendations.json` (matching by title/area/
  evidence keyword — a mechanical `ledger-diff` step); file anything with no
  matching rec via `cadence recommendation add` before the session ends.
  Precedent: the v1.47.0 audit's assurance-levels P0 was partially executed
  from memory and never reached the ledger — half of it later shipped under
  other names before `rec-20260724-002` caught the gap and `dec-20260724-001`
  picked this fix (2026-07-24). *(Operator
  review only — no automated enforcement for the diff step itself; the
  doc-content test only proves the instruction exists, not that a session
  followed it.)*

### Code discipline

- **The Per-Test Band-Aid.** Adding a per-test timeout or retry to quiet a
  flake. → `vitest.shared.ts` is the single source for timeouts/workers;
  the band-aids were tried and reverted (Phase 32.1). Root-cause it.
- **The Undefined Assignment.** `obj.field = maybeUndefined` on an optional
  field. → `exactOptionalPropertyTypes` rejects it; omit the key.
  *(Enforced: typecheck.)*
- **The Unchecked Index.** `arr[i].prop` without narrowing. →
  `noUncheckedIndexedAccess` makes indexed access `T | undefined`.
  *(Enforced: typecheck.)*
- **The Runtime Type Import.** `import { SomeType }` for a type-only use. →
  `import type { ... }`. *(Enforced: lint.)*
- **The stdout Leak.** `console.log` for a diagnostic. → stdout belongs to
  `--json` and the MCP protocol; diagnostics go to stderr or the logger
  seams. (The hook context-payload `console.log` is the one intentional
  stdout contract.)
- **The Engine-in-Adapter.** Implementing gate/loop logic inside a host
  adapter. → Adapters map lifecycle events to abstract events; the engine
  decides. *(Enforced: adapter-contract conformance + prompt-parity golden
  fixtures.)*
- **The Host-in-Core.** `import`-ing host-adapter code from core. → Core
  spawns host packages as subprocesses; the dependency arrow never points
  core→host.
- **The Testkit Leak.** Adding `cadence-testkit` as a runtime dependency or
  publishing it. → Dev-only, `private`, forever.
- **The Live-Provider Test.** A test that needs `ANTHROPIC_API_KEY` or a
  local model. → Tests use `mock`; offline determinism is non-negotiable.
- **The Throwing Observer.** Letting a git/fs introspection helper throw and
  take a command down. → Observation code is best-effort: contribute
  nothing on failure, never block the command.
- **The Quiet Fallback.** Falling back (to mock, to a default, to a skip)
  without telling anyone. → Every fallback and auto-bypass in this codebase
  prints a loud stderr notice and/or records provenance in the SUMMARY.
  Match that pattern.

### Docs

- **The Doc Drift.** Changing gate behavior, CLI flags, or config schema
  without the paired doc edit. → `engine.ts` ↔ `docs/concepts.md`; command
  changes ↔ `docs/reference/commands.md` (a marker-block test diffs it
  against the registered command set); config fields ↔
  `docs/reference/config.md`. *(Enforced: `packages/core/tests/docs/*`.)*
- **The Version-Silent Bump.** Bumping `packages/core/package.json` without
  updating this file's version line. → *(Enforced: doc-sync hook + CI
  test.)*
- **The Hardcoded Count.** Writing "14 slash commands" as a literal from
  memory. → Counts and command lists are asserted against code truth
  (`docs-command-count.test.ts`); derive them, then write.
- **The Untested Version Reference.** Assuming a green `pnpm turbo run test`
  proves every doc is in sync at release time. → The automated doc-content
  tests only assert that `CLAUDE.md`/`README.md` mention the *new* version;
  docs like `DESIGN.md` carry their own version references
  (`DESIGN.md`'s "Current architecture (as of vX.Y.Z)" line slipped once,
  v1.43.0 cut) that no test covers. The `release-cut` skill's **step 3, Doc-
  sync verification**, is the mandatory backstop: run the full doc-content
  test surface explicitly, then grep the repo for the previous version
  string and triage every hit. Run it on every release. *(Operator review
  only — no automated enforcement for the grep sweep.)*

### Git and process

- **The Direct Push.** Pushing to `main` because the change is "trivial". →
  Branch protection requires `ci-success` and applies to admins too; a
  direct-push hole once let an OS-specific CI red sit undetected for six
  phases. Branch + PR, always. *(Enforced: GitHub branch protection.)*
- **The Wrong-Checkout Commit.** Committing to the primary checkout when the
  work belongs to a worktree (or vice versa) — a subagent has done exactly
  this. → Verify `git rev-parse --show-toplevel` and the branch before
  committing; phase worktrees live under `.claude/worktrees/`.
- **The Zombie Session.** Resuming a stuck or crashed session by spinning up
  a fresh session or worktree against the same phase/draft, instead of
  confirming the old one is actually dead first. → Two sessions racing the
  same draft corrupt `PROGRESS.json`/`state.json` non-deterministically.
  Confirm the old session is dead (no live terminal/process still holding
  it), then resume in place — reattach to the existing session/worktree —
  rather than starting fresh elsewhere. `cadence doctor`'s `phase-freshness`
  check flags very recent per-task `PROGRESS.json` activity as a signal to
  go check, not proof either way.
- **The Assumed Consent.** Running destructive git (`git reset --hard`,
  force-push, history rewrite) or self-merging a PR you opened, on the
  strength of a generic "continue" or "use best judgment". → Restate the
  exact command and its blast radius and get explicit operator confirmation
  first. No exceptions.
- **The Stale Status Check.** Trusting a `git status` run minutes earlier
  before a shared-tree git operation (stash, reset, checkout onto `main`)
  that mutates state other work may now depend on. → Re-check `git status`
  immediately before the operation, not from a check done earlier in the
  session — an intervening subagent, background build, or second terminal
  can change the tree in between.
- **The Multi-Phase Commit.** Bundling more than one phase's work into a
  single commit or PR. → Single-commit settle convention means one
  *phase's* source + tests + docs + artifacts land together — not multiple
  phases squashed into one shot. One phase, one commit, one PR.
- **The Deferred Changeset.** Merging a feature PR without a
  `.changeset/*.md`. → The feature PR carries its changeset; the release PR
  only consumes them.
- **The Release Re-Run.** `gh run rerun --failed` on the `Release` workflow
  after a red or ambiguous run. → That re-runs `pnpm -r publish` and fails
  on already-published versions (the red is often an npm-CDN propagation
  race). First verify reality independently — `npm view` all four packages,
  `git ls-remote --tags`, `gh release view` — and only act on what is
  actually missing.
- **The Auto-Renumber.** Resolving a phase-number collision by silently
  picking a new number. → The guard's contract is refuse + suggest
  (`max(observed)+1`); the operator decides. Never bypass the local
  same-directory `existsSync` refusal.
- **The Windows Panic.** Treating a Windows-local test failure as caused by
  your change. → The dev box is Windows but Linux CI is canonical; a few
  Windows-local failures are known environment issues (pnpm/tempRepo/spawn
  races). Check CI before debugging. Related traps: the git hooks are bash;
  `child_process.spawn` of `npx` needs `shell: true` on win32; path
  separators have broken tests before — compare paths with the existing
  helpers (`isSameWorktree`), not string equality.
- **The Flake Reflex (both directions).** Endlessly re-running a genuinely
  red CI leg, or re-investigating a known flake from scratch. → Known
  reference: a macOS/Node22 timeout flake in
  `settle-codereview-convergence.test.ts`. Re-run once *only* when a single
  leg is red and the diff can't plausibly touch it; otherwise investigate.

## Historical naming

Pre-Phase-12 artifacts under `.keel/` are intentionally preserved as a
transition narrative. The project was renamed KEEL → CADENCE in Phase 12
(`v0.2.0-rc.1`, 2026-05-14). `DESIGN.md §8.3` lists rejected names.

<!-- deja:start -->
## deja

ACTION: before writing a new function/component, call `deja_find` (oracle MCP)
to check whether an equivalent already exists in the repo. ACTION: before
adding a new dependency, call `deja_check_dep` to check whether an existing
dependency or project function already covers it. `deja_peek` reads a
candidate's full source.

Note: these are MCP tools — if they only appear by name in a deferred-tools
list, call `ToolSearch` first (e.g. `select:deja_find,deja_check_dep,deja_peek`)
to load them before you can call them.

Edits are also gated automatically against near-duplicates
(PreToolUse/PostToolUse hooks) — a block means reuse the existing function,
or use the `deja:new` override token for a genuine intentional rewrite.
<!-- deja:end -->
