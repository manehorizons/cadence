# CADENCE User-Guide Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a navigable plain-markdown `docs/` user guide for CADENCE adopters covering both usage surfaces (the `cadence` CLI engine + the Claude Code host adapter), ground-truthed to source, with one drift-guard test and a slimmed README.

**Architecture:** 8 new markdown pages under `docs/` (Diátaxis-lite: tutorial / explanation / how-to / reference) + one vitest drift-guard so the command reference can't silently rot. Content authored from live `--help` and the Zod schemas, not memory. README slimmed to a pointer.

**Tech Stack:** Markdown; vitest (drift guard); the existing `cadence` / `cadence-host-claude-code` CLIs as ground-truth sources. Spec: `docs/superpowers/specs/2026-05-15-cadence-user-docs-design.md` (authoritative — read it).

**Execution note (CADENCE dogfood — READ FIRST):** Runs as a CADENCE phase on `main` under the strict **two-commit-per-phase convention**: ONE `docs(...)` commit (all `docs/**` + README/DESIGN/CHANGELOG + the test, NOT `.cadence/*`) then ONE `chore: settle …` commit (`.cadence/phases/31-user-docs/*` + STATE + state.json). The per-task "Checkpoint" steps are **stage-and-verify only — NOT commits**: `git add` + `cadence build task T<n> --status=DONE`. Do NOT `git commit` until Task 9. Loop: `cadence draft new 31-user-docs 01 --title="user-guide docs" --tier=complex` → fill DRAFT (ACs at end) → `draft check` → `draft approve --allow-auto-complex` → Tasks 1–8 → Task 9 (single docs commit → `settle run --auto` → settle commit). Push user-gated. (Phase dir `31-user-docs` chosen to avoid the `30-*` dirs already used for local-provider/test-fix and the paused ROADMAP "30.1" publish name.)

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `docs/concepts.md` | The spine: loop, two-commit, profiles×tiers, the 13-gate universe, providers, state/artifact files | Create |
| `docs/reference/config.md` | Every `CadenceConfigZ` field + the 3 presets | Create |
| `docs/reference/commands.md` | Per-command reference + the pinned drift-guard marker block | Create |
| `packages/core/tests/docs/cli-reference.test.ts` | Drift guard: documented command set == CLI's real set | Create |
| `docs/cli.md` | How-to: the `cadence` engine surface | Create |
| `docs/claude-code.md` | How-to: the host adapter (hooks + slash commands) | Create |
| `docs/providers.md` | How-to: mock / anthropic / local | Create |
| `docs/quickstart.md` | Tutorial: one phase end-to-end, both surfaces | Create |
| `docs/README.md` | Index + nav + the two-surface model | Create |
| `README.md` (repo root) | Slimmed to intro + two-surface + pointer | Modify |
| `DESIGN.md` | §10 punchlist entry | Modify |
| `CHANGELOG.md` | `### Added` user-docs entry | Modify |

**Ground-truth sources (read these; author from them, never memory):**
- `packages/types/src/profile.ts` — `GateZ` (13 gates: 3 always-fire `coherence-check`/`structural-verifier`/`build-test-must-pass`; cheap `draft-read`/`test-coverage`/`anomaly-notify`; medium `approve`/`per-task-verify`/`code-review`; expensive `deep-verify`/`interactive-verdict`/`plan-review`/`security-audit`), `ProfileZ`.
- `packages/core/src/gates/engine.ts` — the profile×tier → gate-set matrix + `softCap` (auto×complex).
- `packages/types/src/config.ts` — `CadenceConfigZ` every field + `defaultConfig` + `presets` (solo/team/production).
- `cadence --help` and each subcommand `--help` (`config`, `init`, `draft new|check|approve`, `build task`, `done`, `block`, `needs-context`, `settle run`, `progress`, `status`, `hook`); `cadence-host-claude-code --help` + `install --help`.
- `packages/host-claude-code/src/` (esp. install-commands + the hook/capabilities source) — the exact slash-command list (9) and hook-group set/count. Do NOT hardcode a hook-group count from memory; derive it here.
- Carry-forwards to state honestly: `block`/`needs-context` lack the Phase 29.8 `build task` id-validation; `npx @cadence/*` is NOT published (404) — quickstart/README use the local-dogfood install with a one-line "not yet published" note.

---

## Task 1: concepts.md (the spine)

**Files:** Create `docs/concepts.md`

- [ ] **Step 1: Read ground truth** — `packages/types/src/profile.ts`, `packages/core/src/gates/engine.ts`, `packages/types/src/config.ts` (presets), and DESIGN.md §3–§4 for intent.
- [ ] **Step 2: Author `docs/concepts.md`** with sections:
  - *The loop* — DRAFT → BUILD → SETTLE; what each phase is; the per-phase artifacts (`<id>-DRAFT.md`, `-PROGRESS.json`, `-SUMMARY.{json,md}`, `-PLAN-REVIEW.json`), `.cadence/STATE.md`, `.cadence/state.json`, `.cadence/shakedown/`.
  - *Two-commit convention* — one feat/docs commit (source/tests/docs) + one `chore: settle` commit (phase artifacts + state). Why.
  - *Profiles × tiers* — profiles `strict`/`standard`/`auto`; tiers `quick-fix`/`standard`/`complex`; a matrix table (from `engine.ts`) of which of the 10 delta gates fire per cell; the `auto×complex` soft cap (`--allow-auto-complex`).
  - *The gate universe* — all **13** gates. A table: gate · cost band (free/cheap/medium/expensive) · when it fires · how to bypass (e.g. `--allow-missing-coverage`, `--no-approve`, `--allow-per-task-failure`, `--allow-code-review-failure`, `--allow-plan-review-failure`, `--allow-security-audit-failure`, `--allow-verifier-failure`, `--force`, `--no-interactive`). The 3 free ones always fire.
  - *Providers (concept)* — `mock` (offline default), `anthropic`, `local`; per-gate; depth deferred to providers.md.
- [ ] **Step 3: Accuracy check** — every gate name in the doc appears verbatim in `GateZ`; the matrix matches `engine.ts`; bypass flags exist in the CLI (`grep` the `--allow-*`/`--no-*` flags in `packages/core/src/cli/commands/`).
- [ ] **Step 4: Checkpoint (stage only — NO commit)** — `git add docs/concepts.md`; `node packages/core/bin/cadence.cjs build task T1 --status=DONE --notes "concepts spine"`.

---

## Task 2: reference/config.md

**Files:** Create `docs/reference/config.md`

- [ ] **Step 1: Read** `packages/types/src/config.ts` in full (`CadenceConfigZ`, `defaultConfig`, `presets`).
- [ ] **Step 2: Author** a table of every field: path · type · default · meaning. Cover nested objects (`subagentPolicy`, `modelPerClass`, `tier`, `verification`, `verifier`/`perTaskVerifier`/`codeReview`/`planReview`/`securityAudit` `{provider,model?}`, `notify`). Document the 3 presets (`solo`/`team`/`production`) and what differs. Note `init` writes `profile` + layout-detected `verification.testGlobs` (Phase 29.4: `packages/**` if a `packages/` dir, else `**/*.test.ts(x)`).
- [ ] **Step 3: Accuracy check** — every documented field/default matches `config.ts` exactly (diff field-by-field).
- [ ] **Step 4: Checkpoint** — `git add docs/reference/config.md`; `build task T2 --status=DONE`.

---

## Task 3: reference/commands.md (+ drift marker)

**Files:** Create `docs/reference/commands.md`

- [ ] **Step 1: Capture ground truth** — run and read `cadence --help`, every subcommand `--help`, `cadence-host-claude-code --help`, `install --help`.
- [ ] **Step 2: Author** per-command sections: synopsis, arguments, options (with defaults), exit codes, gate interactions/bypasses. Include `config`, `init`, `draft new|check|approve`, `build task`, `done`, `block`, `needs-context`, `settle run`, `progress`, `status`, `hook`; host `install`, `hook`. State the `block`/`needs-context` no-id-validation carry-forward.
- [ ] **Step 3: Add the pinned drift-guard marker block** (exact, literal) listing every top-level `cadence` command name, one per line, no backticks/prose, **excluding** Commander's auto `help`:

```
<!-- cadence:commands:start -->
config
init
draft
hook
build
done
block
needs-context
settle
progress
status
<!-- cadence:commands:end -->
```
- [ ] **Step 4: Checkpoint** — `git add docs/reference/commands.md`; `build task T3 --status=DONE`.

---

## Task 4: drift-guard test (TDD)

**Files:** Create `packages/core/tests/docs/cli-reference.test.ts`

- [ ] **Step 1: Write the test** (red first — it will fail until the marker block + parsing align). Pinned contract from the spec:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerAllCommands } from '../../src/cli/register.js'; // see Step 3 note

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function documentedCommands(): Set<string> {
  const md = readFileSync(join(REPO_ROOT, 'docs/reference/commands.md'), 'utf8');
  const m = md.match(
    /<!-- cadence:commands:start -->\s*([\s\S]*?)\s*<!-- cadence:commands:end -->/,
  );
  if (!m) throw new Error('commands.md: drift-guard marker block missing');
  return new Set(
    m[1]!
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('<!--')),
  );
}

function cliCommands(): Set<string> {
  const program = new Command();
  registerAllCommands(program); // registrar import — no built dist needed
  return new Set(
    program.commands
      .map((c) => c.name())
      .filter((n) => n !== 'help'), // exclude Commander auto-help
  );
}

describe('docs/reference/commands.md drift guard', () => {
  it('documents exactly the CLI top-level command set', () => {
    const documented = documentedCommands();
    const actual = cliCommands();
    expect([...documented].sort()).toEqual([...actual].sort());
  });
});
```

- [ ] **Step 2: Resolve the registrar import** — find how `packages/core/src/cli/index.ts` builds its `Command` (it registers `config`/`init`/`draft`/`build`/`settle`/etc.). If a single `registerAllCommands(program)`-style entry exists, import it. If not, **extract one**: create/expose a `registerAllCommands(program: Command)` in `packages/core/src/cli/` that `index.ts` also calls (pure refactor, no behavior change), so the test shares the exact registry without spawning a process or depending on built `dist`. (Spec-review advisory: prefer registrar import over `dist/--help` to avoid build-order flakiness.)
- [ ] **Step 3: Run — expect FAIL** `pnpm -C packages/core test -- run docs/cli-reference` (red: registrar not yet extracted or marker mismatch).
- [ ] **Step 4: Make it pass** — complete the registrar extraction; ensure `commands.md`'s marker block exactly equals the registered set minus `help`. Re-run → PASS.
- [ ] **Step 5: Checkpoint** — `git add packages/core/tests/docs/cli-reference.test.ts packages/core/src/cli/ docs/reference/commands.md`; `build task T4 --status=DONE`.

---

## Task 5: cli.md + claude-code.md + providers.md (how-to)

**Files:** Create `docs/cli.md`, `docs/claude-code.md`, `docs/providers.md`

- [ ] **Step 1: cli.md** — worked invocations for the engine: `init`, `draft new`→fill→`check`→`approve`, `build task` (+ `done`/`block`/`needs-context` shortcuts), `settle run` (`--auto`/`--deep`/`--interactive`/`--force` + the `--allow-*` bypasses), `status`, `progress`, `config`. Show the two-commit convention in practice. Link to `reference/commands.md`. Note the `block`/`needs-context` id-validation carry-forward.
- [ ] **Step 2: claude-code.md** — read `packages/host-claude-code/src/` first. Document `cadence-host-claude-code install` ([--cwd] [--local] [--settings] [--no-hooks] [--no-commands] [--cadence] [--command]); the exact hook-group set + count (derived from source, not memory); the 9 slash commands (verbatim from the installer's command list); how the agent drives the same engine via hooks/slash-commands; the `--local` machine-absolute-paths warning + gitignore guidance.
- [ ] **Step 3: providers.md** — `mock` (offline deterministic default), `anthropic` (`ANTHROPIC_API_KEY`, `messages.parse` structured output), `local` (`CADENCE_LOCAL_BASE_URL` + `CADENCE_LOCAL_MODEL`, OpenAI-compatible `/v1/chat/completions` e.g. Ollama; per-gate `model` override; warn+mock fallback when unset; the deep-verify prompt id-binding note from Phase 29.7). Per-gate provider config (`config.<gate>.provider`); which gate fires in which cell (link concepts.md).
- [ ] **Step 4: Accuracy check** — all flags/commands cross-checked vs `--help`; hook-group claim cross-checked vs host source; provider env names vs `factory.ts`/`local-client.ts`.
- [ ] **Step 5: Checkpoint** — `git add docs/cli.md docs/claude-code.md docs/providers.md`; `build task T5 --status=DONE`.

---

## Task 6: quickstart.md (tutorial)

**Files:** Create `docs/quickstart.md`

- [ ] **Step 1: Author** an end-to-end tutorial on a throwaway toy repo: install (local-dogfood — `pnpm build` then `node …/dist/cli/index.js`; explicit one-line "`npx @cadence/*` not yet published"), then one full phase: `init` → `draft new` → fill a tiny DRAFT (1–2 ACs/tasks) → `draft check` → `draft approve` → implement → `build task --status=DONE` → `settle run --auto`. Then the same via Claude Code: `cadence-host-claude-code install` + the slash-command flow. Keep commands copy-pasteable and verified.
- [ ] **Step 2: Dry-run the tutorial** — actually run the CLI sequence in a scratch dir to confirm every command + output is real; fix any drift.
- [ ] **Step 3: Checkpoint** — `git add docs/quickstart.md`; `build task T6 --status=DONE`.

---

## Task 7: docs/README.md (index/nav)

**Files:** Create `docs/README.md`

- [ ] **Step 1: Author** a short index: one-line what-CADENCE-is; the two-surface model (engine CLI + Claude Code host adapter) in ~3 sentences; a nav list linking quickstart → concepts → cli → claude-code → providers → reference/commands → reference/config.
- [ ] **Step 2: Checkpoint** — `git add docs/README.md`; `build task T7 --status=DONE`.

---

## Task 8: slim README + DESIGN + CHANGELOG

**Files:** Modify `README.md`, `DESIGN.md`, `CHANGELOG.md`

- [ ] **Step 1: Slim repo `README.md`** — replace the status/version-history wall with: one-line description; the two-surface model; a ~6-line quickstart teaser using the **same local-dogfood install as quickstart.md** (remove the aspirational `npx @cadence/*` lines; add a one-line "not yet published — local install" note); a prominent link to `docs/`. Keep the CI/`.githooks/pre-push` enforcement note. Do not duplicate CHANGELOG history.
- [ ] **Step 2: DESIGN.md** — add §10 punchlist line: `~~Phase 31.1 — user-guide docs/ tree (quickstart/concepts/cli/claude-code/providers + reference) + command-drift guard + slimmed README~~ ✓`.
- [ ] **Step 3: CHANGELOG.md** — under `## [Unreleased] ### Added`: a user-documentation entry (the `docs/` guide + the two-surface model + drift guard).
- [ ] **Step 4: Checkpoint** — `git add README.md DESIGN.md CHANGELOG.md`; `build task T8 --status=DONE`.

---

## Task 9: full suite + two-commit settle

**Files:** none new — consolidates Tasks 1–8.

- [ ] **Step 1:** `pnpm turbo run test` → all green (core incl. the new `docs/cli-reference` guard; known dispatcher/build-per-task flakes are timeout-fixed — if either recurs, re-run isolated to confirm, per prior phases).
- [ ] **Step 2:** `git status --short` — confirm staged: all `docs/**`, the new test, `packages/core/src/cli/` (registrar extraction), `README.md`/`DESIGN.md`/`CHANGELOG.md`. Confirm **nothing under `.cadence/` staged**.
- [ ] **Step 3:** Single docs commit:

```bash
git commit -m "$(cat <<'EOF'
docs: CADENCE user-guide docs/ tree + command drift guard (Phase 31.1)

Adopter-facing docs/ (quickstart, concepts, cli, claude-code,
providers, reference/{commands,config}) covering both surfaces
(cadence CLI engine + Claude Code host adapter), ground-truthed to
GateZ (13 gates) / CadenceConfigZ / live --help. One vitest drift
guard pins reference/commands.md to the real command registry.
README slimmed to a pointer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4:** `node packages/core/bin/cadence.cjs settle run --auto` → expect `Settled 31-…`.
- [ ] **Step 5:** Settle commit:

```bash
git add .cadence/phases/31-user-docs/ .cadence/STATE.md .cadence/state.json
git commit -m "chore: settle Phase 31.1 — user-guide docs"
```

- [ ] **Step 6:** `git log --oneline -3` (docs+settle pair) + `cadence progress` (loop IDLE). Push is **user-gated** — stop and ask.

---

## Done criteria

- 8 new `docs/` pages exist, internally cross-linked, ground-truth-accurate (gate inventory = 13; config = `CadenceConfigZ`; commands = live `--help`).
- `cli-reference.test.ts` green and genuinely guards (documented command set == registry minus `help`).
- README slimmed; no npx-vs-reality mismatch; CHANGELOG/DESIGN updated.
- Full turbo suite green; settled as a CADENCE phase (two-commit).
- Carry-forwards documented honestly (block/needs-context id-validation; npx unpublished).

## Acceptance Criteria (for the cadence DRAFT)

- **AC-1:** `docs/concepts.md` documents the loop, two-commit convention, profiles×tiers matrix, and all 13 gates (3 always-fire + 10 by cost band incl. `deep-verify`) with fire conditions + bypasses, matching `profile.ts`/`engine.ts`.
- **AC-2:** `docs/reference/config.md` documents every `CadenceConfigZ` field with type/default/meaning + the 3 presets, matching `config.ts`.
- **AC-3:** `docs/reference/commands.md` documents every top-level + sub command from live `--help` and contains the exact `<!-- cadence:commands:start/end -->` marker block.
- **AC-4:** `packages/core/tests/docs/cli-reference.test.ts` asserts the documented command set equals the CLI registry minus Commander's auto `help`, and is green.
- **AC-5:** `docs/cli.md`, `docs/claude-code.md`, `docs/providers.md`, `docs/quickstart.md`, `docs/README.md` exist, cover the two surfaces + providers + an end-to-end tutorial, and are accuracy-checked vs source/`--help`.
- **AC-6:** Repo `README.md` slimmed (two-surface model + local-dogfood teaser + docs link, no npx mismatch); `DESIGN.md` §10 + `CHANGELOG.md` updated; full turbo suite green.
