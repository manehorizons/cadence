# Phase 29.1 — Foreign-repo shakedown: continuity-runtime

Observation-only. Every cadence deviation is logged here, not fixed (fixes → Phase 29.4).
Findings tagged exactly one of: `bug` | `docs` | `ux` | `works-as-designed`.

## Target pre-state (snapshot before any cadence contact)

- Path: `~/Documents/Projects/continuity-runtime`
- Package: `@continuity/runtime`, **npm** (`package-lock.json`, no `packageManager` field) — single package, **not a monorepo**
- Git: branch `main`, **75 commits**, working tree clean
- Layout: `src/` (53 files), `tests/` (67 files), `prompts/`, `scripts/`, `dist/`
- Tooling: TypeScript (`tsc --noEmit`), **vitest** (`vitest run`, `vitest.config.ts` + `vitest.workspace.ts`), **biome** (`biome check .` — not eslint/prettier), build via `tsup`
- Pre-existing dirs of interest:
  - `.claude/` — **exists but empty and untracked** (no files at any depth, `git ls-files .claude` empty). Host-install will merge into an existing-but-empty dir, not a virgin path and not one with prior settings.
  - `.planning/` — **full GSD project** (PROJECT.md, ROADMAP.md, STATE.md, config.json, phases/, research/). Harmless to cadence (different dir) but means the repo already runs a competing planning process; `.cadence/` will sit alongside it.
  - No `.cadence/` — clean for `init`.

### Structural predictions (before running — to be confirmed by T2/T3)

- **P1 (predicted `bug` or `docs`):** default `verification.testGlobs = packages/**/*.test.ts(x)` cannot match any of the 67 tests under `tests/`. Test-coverage gate should refuse every AC unless `init` rewrites the glob or the operator passes `--allow-missing-coverage`. Highest-value pre-publish finding — a single-package repo is the common case, not the exception.
- **P2 (predicted `works-as-designed` or `docs`):** repo is npm, cadence docs/dogfood assume pnpm. `init` should be package-manager-agnostic — confirm it neither requires nor assumes pnpm.
- **P3 (predicted `ux`):** `.claude/` exists but empty — confirm host-install creates/merges settings cleanly rather than erroring or skipping.
- **P4 (predicted cosmetic):** `.cadence/` coexisting with an active `.planning/` (GSD) — confirm no collision, note any operator confusion.

## T1 — Build + local host install

Command (run from cadence workspace, targeting the foreign repo):

```
node packages/host-claude-code/bin/cadence-host-claude-code.cjs install \
  --cwd "C:/Users/Thomas/Documents/Projects/continuity-runtime" \
  --local --settings .claude/settings.local.json
```

Output (verbatim, exit 0):

```
Installed CADENCE hooks → C:/Users/Thomas/Documents/Projects/continuity-runtime/.claude/settings.local.json
Installed CADENCE slash commands → C:/Users/Thomas/Documents/Projects/continuity-runtime/.claude/commands/
Start a new Claude Code session to activate.
```

Result:
- Wrote `.claude/settings.local.json` (7 hook groups: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse ×2 [Edit|Write|MultiEdit|NotebookEdit + Skill], Stop, SubagentStop — each `_managedBy: cadence`) + 9 slash-command files into `.claude/commands/`.
- **P3 → `works-as-designed`.** Install onto an existing-but-empty `.claude/` succeeded cleanly — no error, no skip, dir reused.
- `git status` in continuity-runtime shows `?? .claude/` — the whole dir is untracked (not gitignored; would not show if ignored). No tracked files dirtied by the install. Clean.

### Finding F1 — `docs` (settings.local.json carries absolute machine paths, no guardrail)

`settings.local.json` hard-codes `node C:\Users\Thomas\Documents\Projects\cadence\packages\...` absolute paths (correct for `--local`). The README dogfood note says to pair `--local` with `settings.local.json` "so machine-specific paths stay out of git" — but **cadence install neither adds a `.gitignore` entry nor warns** that the file must not be committed. An operator who commits `.claude/` ships unusable absolute paths to every other clone. Tag: `docs` (could also be `ux` — a one-line stderr warning at install would close it). Remediation deferred to 29.4.

## T2 — `cadence init`

Command (cwd = continuity-runtime): `node <cadence>/packages/core/dist/cli/index.js init --name "@continuity/runtime"` — exit 0, non-TTY, no prompt hang.

Post-init summary (verbatim): project `@continuity/runtime`, preset `team`, **gate profile `standard`**, scaffolded config/state/PROJECT/ROADMAP/MILESTONES/SPECIAL-FLOWS/STATE/CLAUDE.md + phases/handoff/research/archive. `.cadence/` scaffolded with zero collision against the pre-existing `.planning/` (GSD).

### Finding F2 — `bug` (init hard-codes monorepo testGlobs; no layout detection) — HEADLINE

`init` wrote, verbatim, into a **single-package** repo whose 67 tests all live in `tests/`:

```json
"verification": { "testGlobs": ["packages/**/*.test.ts", "packages/**/*.test.tsx"] }
```

`init` does **no project-layout detection** — it emits the cadence-monorepo glob unconditionally. Consequence: on continuity-runtime (and *any* single-package repo — the common case, not the exception) the test-coverage gate can match **zero** test files, so every AC is unsatisfiable out of the box. The operator must hand-edit `config.json` or pass `--allow-missing-coverage` on every settle. This directly contradicts the README, which presents test-coverage as the default second verification layer. **This is exactly the "works because the project IS cadence" assumption 29.1 exists to catch — the default is correct only for cadence's own monorepo shape.** Tag: `bug`. Remediation (29.4): detect layout at init (presence of `packages/` vs `src/`+`tests/`) or prompt, and/or ship a smarter default. Confirmed downstream in T3.

### Finding F3 — `works-as-designed` (gate-profile suggestion)

75 commits ≥ 20 → suggested `standard`, exactly as the README documents. Reasonable for this repo. No issue.

### Finding F4 — `ux` (preset vs gate-profile naming overlap)

Init summary labels `team` the "preset" while `config.json` key `profile` holds the *gate* profile (`standard`). Two different "profile"-ish concepts (config preset `solo|team|production` vs gate profile `strict|standard|auto`) surface adjacently with overlapping vocabulary — mild operator confusion. Tag: `ux`. Low severity. Deferred to 29.4 triage.

### F5 — `works-as-designed` (non-TTY init + .planning coexistence)

Non-interactive init with `--name` and defaulted profile/gate-profile ran clean, no hang, exit 0; `.cadence/` coexists with active `.planning/` (GSD) with no collision. P2/P3/P4 closed as designed.

## T3 — Two real phases full-loop on continuity-runtime

Real units of work chosen: bring two drifted files into the project's *own* biome format (genuine, zero-semantic-risk, real git diff).

**Phase 01-lint-format** (`src/index.ts`) — DRAFT → check (`coherence: OK`) → approve → biome format (`Fixed 1 file`, real diff) → `build task T1 DONE` → settle. SUMMARY.json + SUMMARY.md written, loop returned IDLE.

**Phase 02-lint-format** (`src/health/index.ts`) — same flow, clean, SUMMARY written.

### Finding F6 — `docs` (init-suggested `standard` profile silently changes interactive requirements)

`draft approve` on the foreign repo, non-TTY, refused verbatim:

```
manual-approve: StdinPrompter: stdin is not a TTY. Use --no-interactive to bypass or pipe answers via a scripted prompter. Pass --no-approve to bypass the manual approve gate.
```

Cause: `init` suggested `standard` (75 commits), and `standard × standard` puts `approve` in the gate set. **Cadence's own dogfood never hits this — it runs `auto`.** Any operator/agent driving cadence non-interactively (CI, scripts, an AI shell) on a freshly-init'd `standard` repo hits an approve wall on their *first* `draft approve`. The error is clear and names the exact bypass (`--no-approve`), so it's not a bug — but the README "Try it" quickstart never warns that the suggested profile changes interactivity. Tag: `docs`. 29.4: one line in the quickstart + post-init summary.

### Finding F2 — DOWNSTREAM CONFIRMATION (verbatim runtime proof of the headline `bug`)

`settle run --auto` refused, verbatim:

```
coverage: AC-1 has no linked test (searched: packages/**/*.test.ts, packages/**/*.test.tsx)
settle run refused: each AC needs at least one test that references its id (e.g. AC-1 in a describe/it). Pass --allow-missing-coverage to bypass, or --force to settle anyway.
```

The gate searched only `packages/**` — continuity-runtime's 67 tests are all under `tests/`, so the documented default verification layer is **unsatisfiable on this repo no matter what the operator does** short of editing config or bypassing every settle. Confirms F2 is a real defect, not a cosmetic default. `--allow-missing-coverage` then settled cleanly and emitted the expected `cadence anomaly [warn] coverage-bypassed` to stderr (correct behavior).

### Positive result (recorded, not a finding)

Every other loop mechanic worked correctly on a foreign single-package repo: `draft new` / `check` / `approve --no-approve` / `build task` / `settle`, SUMMARY emission (`.json` + `.md`), state transitions, anomaly stderr dispatch, return to IDLE. **The loop core is portable; the only real defect is the monorepo-shaped `testGlobs` default (F2).**

## T4 — Findings (consolidated + tagged)

| ID | Tag | Severity | Summary | 29.4 disposition |
|----|-----|----------|---------|------------------|
| **F2** | `bug` | **HIGH** | `init` hard-codes `testGlobs=packages/**` with no layout detection → test-coverage gate unsatisfiable on any single-package repo (the common case). Confirmed at runtime in T3. | **Must fix** — detect layout (`packages/` vs `src/`+`tests/`) at init, or prompt, or ship a smarter default. |
| **F1** | `docs` | MED | `--local` `settings.local.json` bakes absolute machine paths; cadence neither gitignores it nor warns → committing it ships unusable paths. | Fix docs + add a one-line install warning (or auto-append `.gitignore`). |
| **F6** | `docs` | MED | Init-suggested `standard` profile makes the first `draft approve` require a TTY / `--no-approve`; quickstart never warns. | Add one line to README quickstart + post-init summary. |
| **F4** | `ux` | LOW | Config preset (`team`) vs gate profile (`standard`) — overlapping "profile" vocabulary surfaces adjacently. | Triage; possibly rename or clarify in summary. |
| **F3** | `works-as-designed` | — | Gate-profile suggestion (75 commits → `standard`) behaved exactly as documented. | No action. |
| **F5** | `works-as-designed` | — | Non-TTY init defaulting + `.cadence/`/`.planning/` coexistence — clean, no collision. | No action. |

**Headline for 29.4:** F2 is the publish-blocker — cadence's single most over-fit-to-itself assumption, proven to make the advertised default verification layer unusable on a normal single-package project. F1/F6 are doc/UX hardening. No `bug` finding remains beyond F2.

**Out of scope (per DRAFT boundary):** language-tuning of gates — continuity-runtime is TS+vitest; the "are gates JS-tuned" axis was deliberately not exercised and remains a documented boundary / later phase.
