---
cadence_handoff: 1
generated_at: 2026-07-19T21:07:56.748Z
label: phase-199-recommendation-evidence-add-shipped
loop_position: BUILD
active_phase: 198-bound-filter-regex-complexity-to-prevent-redos
active_draft: 198-01
tier: standard
git_branch: main
git_dirty: true
git_head: c70d20f
git_ahead: 1
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-19 (phase-199-recommendation-evidence-add-shipped)

## TL;DR for the next session
- Shipped phase 199 (`rec-20260719-001`) via PR #254: `cadence recommendation evidence add <recId> --note <text>`, a tied-record writer that atomically appends evidence to an existing recommendation (closes the gap where `cadence intelligence reconcile` silently can't re-derive `evidenceIds`).
- Built subagent-driven in an isolated worktree (`.claude/worktrees/199-recommendation-evidence-add`): 5 tasks, each independently reviewed by a fresh adversarial subagent, then a whole-branch review — all clean, zero Critical/Important findings. Full monorepo `pnpm turbo run lint typecheck test build` was green (20/20) before push, and `ci-success` was green on the PR. Squash-merged with operator consent.
- Discovered (again) that `draft add-task` has no `--depends` flag, so hand-authoring a DRAFT without `- depends:` lines makes `cadence dispatch plan` put everything in one wave with no real ordering — caught and fixed by hand-adding `depends:` lines post-approval before dispatching (see `[[feedback-draft-add-task-no-depends-flag]]`).
- `secret-scan` (gitleaks) is red on PR #254 and will stay red in its history forever — it's a non-blocking check (not part of required `ci-success`, confirmed by reading `.github/workflows/ci.yml`) triggered by a fake-AWS-key-shaped test fixture used to test redaction. A follow-up `gitleaks:allow` suppression commit did NOT clear it because gitleaks scans `git log -p` per-commit, not final HEAD state — the raw string still appears in the *original* commit's diff. Fixing it for real needs a history rewrite (squash + force-push), which the operator declined (correctly — not worth it for a non-blocking check). This will recur any time a new PR introduces this same pattern; the durable fix would be a `.gitleaks.toml` allowlist entry, not per-line suppression comments.
- Bundled the previously-held `.cadence/intelligence/*` ledger dirt (from the 2026-07-19 milestone-walkback session — `rec-20260719-001` itself plus `rec-20260714-001`'s broadened scope) into phase 199's feature commit, per the prior handoff's explicit instruction. It's now on `main`; the primary checkout's own stale local copies of those files were reconciled (byte-for-byte verified lossless) rather than re-committed.
- No blockers. `main` is synced with origin after this handoff's own stamp commit lands (see gotcha below on how that commit needs to reach origin).

## What landed this session

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 1 ahead / 0 behind origin
- HEAD `c70d20f`
- Recent commits:
```
c70d20f chore(cadence): stamp session handoff — milestone-walkback-pre-mortem-gaps-logged
7cc606d feat: add cadence recommendation evidence add CLI writer (phase 199) (#254)
cb339a4 chore(cadence): land stuck session-handoff commits (phases 194-198) (#253)
7a9098a fix: bound --filter-regex length to prevent ReDoS (phase 198) (#252)
9dd68f8 fix: cadence onboard bootstraps missing state.json for fresh worktrees/clones (phase 197) (#250)
ac6722c fix: untrack per-worktree state.json/STATE.md to stop cross-worktree merge conflicts (issue #177) (phase 196) (#247)
14c7336 fix: settle refuses bare TN: DONE with no verify evidence (phase 195) (#245)
1923f6b chore(release): v1.47.0 -- dispatch-packet action-class boilerplate, worktree isolation recommendation, telemetry revision-conflict fix (#243)
```
- Loop: BUILD · phase 198-bound-filter-regex-complexity-to-prevent-redos · tier standard

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260619-008 — Team rollout kit (accepted/needs-decision)
  - rec-20260709-003 — cadence init --ci: generate + enforce a CI gate workflow for consumer repos (candidate/raw-idea)
  - rec-20260710-001 — Clarify Claude Code auth vs ANTHROPIC_API_KEY confusion in provider docs + fallback warning (candidate/raw-idea)
  - rec-20260711-004 — Cadence-native UI-spec gate between SPEC and DRAFT (when applicable) (candidate/raw-idea)
  - rec-20260712-003 — Retro friction feeds back into Praxis recommendation scoring (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
- Files in play:
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
- Phase 199 (`199-recommendation-evidence-add-cli-writer`) drafted, approved, built, settled, and merged: PR #254.
- `addEvidenceToRecommendation` store function in `packages/core/src/intelligence/store/recommendations.ts` — atomic dual-ledger write (evidence.json + recommendations.json), redacts secrets via `redactSecrets`, refuses cleanly on unknown recommendation id.
- `cadence recommendation evidence add <recId> --note <text>` CLI subcommand in `packages/core/src/cli/commands/recommendation.ts`.
- New tests: `packages/core/tests/intelligence/store/recommendations.test.ts` (AC-1/AC-2/AC-3) and `packages/core/tests/cli/recommendation.test.ts` (happy path + refusal path).
- `docs/reference/commands.md` documents the new subcommand.
- `.changeset/recommendation-evidence-add.md` added (minor bump — new CLI capability).
- `rec-20260719-001` converted → shipped-in-progress (`settle-pending`) via the phase conversion + settle.

## Carry-forward gotchas
- **This handoff's own stamp commit is unpushed and must go through branch+PR** — `git push origin main` is structurally always rejected here (branch protection requires `ci-success` recorded against the exact pushed SHA, which only exists via a PR through Actions). This is the same recurring pattern as phases 194-198 (batched via PR #253) — consider batching this one too rather than letting it accumulate again.
- **Primary checkout's local `.cadence/state.json` (gitignored) is still stale**, now spanning 3+ sessions: shows `loopPosition: BUILD`, `activePhase: 198-bound-filter-regex-complexity-to-prevent-redos`, `activeDraft: 198-01` — phase 198 shipped and merged long ago. Cosmetic only (gitignored, never committed). Do **not** run `cadence settle run --auto` in the primary checkout to "fix" it.
- **`secret-scan` on PR #254 is permanently red in history** (see TL;DR) — non-blocking, don't try to re-fix via another follow-up commit; it structurally can't clear without a history rewrite. If this pattern recurs on a future PR, the durable fix is a `.gitleaks.toml` allowlist, not a per-line `gitleaks:allow` comment (that only helps commits made *after* the comment exists).
- `rec-20260619-008` (Team rollout kit) is still parked at `needs-decision` — untouched this session. Open question per the 2026-07-19 pre-mortem: resolve "CI/PR-template guidance" vs. "`cadence ci install`" before re-promoting.
- GitHub issues `#248` and `#251` are still open and untriaged — flagged for 2+ sessions now, untouched again this session.
- Untracked docs still unrecognized across 4+ sessions: `docs/cc-insights-ingestion-handoff.md`, `docs/handoff-v147-recommendations.md`. Also `audit-reports/` and `packages/core/.gitignore`, still untouched. Worth the operator taking a look eventually — these are not phase 199 artifacts.
- `rec-20260714-001` (broadened pre-mortem-fields CLI-writer gap) is still open/unaddressed — only its sibling `rec-20260719-001` was picked up this session.

## Next action
**Action:** Land this handoff's stamp commit (and the still-unpushed prior one, `c70d20f`) via branch + PR — e.g. `git checkout -b chore/session-handoffs-2026-07-19 && git push -u origin chore/session-handoffs-2026-07-19 && gh pr create ...` — then pick the next unit of work: `rec-20260714-001` (the sibling CLI-writer gap), GitHub issues `#248`/`#251` (untriaged, 2+ sessions old), or the next `cadence recommend` candidate.
**Verify:** `gh pr checks <n>` shows `ci-success` green; after merge, `git log origin/main..HEAD` on `main` is empty.
**If it fails:** if `cadence draft new --from-rec` collides on a phase number, re-check `cadence progress`/`cadence doctor` for the current genuinely-free number (was 199, will be 200+ next). If working in a fresh worktree, remember the state.json bootstrap gotcha — build from source (`pnpm --filter @manehorizons/cadence-types build && pnpm --filter @manehorizons/cadence-testkit build && pnpm --filter @manehorizons/cadence-core build`) then use `node packages/core/bin/cadence.cjs onboard` before any other cadence command, since the global npm-installed `cadence` binary predates unmerged local fixes.
