---
description: End-of-session handoff — reconcile memory + docs, write a SESSION handoff doc, commit & push so another LLM can resume cleanly
argument-hint: "[short context label, e.g. v1.2-slice7]"
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

<!-- managed-by: handoff (hand-authored workflow command) -->

# /handoff — session handoff

You are closing out a work session on CADENCE (and, when on `praxis-intelligence-ledger`, the Praxis layer). Produce a clean, truthful handoff so a fresh LLM session can resume with zero context loss.

`$ARGUMENTS` (optional) is a short context label for the handoff filename / title (e.g. `v1.2-slice7`, `bugfix-F2`). If empty, derive one from the branch + the dominant work this session.

**Hard rules:**
- **Truth over tidiness.** Document only what actually happened and what is actually true in the repo right now. Never invent progress, test results, or "next steps" that weren't established. If something is uncertain, say so explicitly in the handoff.
- **No silent scope creep.** Do not refactor, "fix while I'm here", merge the PR, undraft a PR, or push tags. Tag pushes and PR merges require separate explicit user approval — out of scope for `/handoff`.
- **Push is in scope** for this command (the user invoked `/handoff`, which explicitly requests commit + push of the current branch). But the pre-push hook runs the full gate — if it fails, stop and report; do not `--no-verify`.

Work the steps in order. Use a TodoWrite list to track them.

---

## Step 0 — Capture ground truth

Run and read, do not skip:

```
git status --short --branch
git branch --show-current
git log --oneline -8
git diff --stat
node packages/core/dist/cli/index.js progress   # or: node packages/core/bin/cadence.cjs progress
```

If on `praxis-intelligence-ledger`, also: `git log origin/praxis-intelligence-ledger..HEAD --oneline` and note draft PR #9 status (do not change it).

Form a precise mental model: what landed this session, what's uncommitted, what's in-flight (loop position / active phase / active slice), what's blocked, what's next. Everything downstream must match this.

## Step 1 — Run the gate (honest status)

The handoff must record real gate state, not assumed. Run the full done-bar:

```
pnpm turbo run lint typecheck test build
```

Record the result verbatim-ish (pass/fail per task, test counts). If red: the handoff's job is to hand off a *known-red* state honestly with the failure captured and the likely cause — do **not** try to fix it under `/handoff` unless the user asked. A truthful red handoff is correct; a fake-green one is a defect.

## Step 2 — Update all memory

Auto-memory lives at:
`C:\Users\digit\.claude\projects\C--Users-digit-Documents-Projects-cadence\memory\`

1. Read `MEMORY.md` and every entry file it points to.
2. Reconcile each against the ground truth from Step 0–1. For every memory that is now stale, wrong, or superseded: **update it in place** (keep the frontmatter `name`/`description`/`type` accurate; convert any relative dates to absolute, e.g. today is the session date).
3. Add new memories only for durable, cross-session, non-obvious facts (project state shifts, decisions, gotchas, feedback). Do **not** memorialize ephemeral task detail, code patterns derivable from the repo, or git history.
4. Keep `MEMORY.md` an index only — one line per entry, pointer + hook. No memory bodies in the index.
5. Common targets this project: `project_cadence_name.md` (milestone/release state), `project_praxis_layer.md` (slice progress, origin sha, next slice, PR state), `project_cadence_workflow.md`, the `feedback_*` gotcha files. Update whichever moved.

Memory must be internally consistent and match the repo *now* — a future session trusts it.

## Step 3 — Update all docs

Update only docs that the session's work actually changed or made stale. Do not rewrite untouched docs.

- **In-repo:** `DESIGN.md` (esp. the §10 punchlist if touched), `CHANGELOG.md`, `README.md`, `docs/**`, and on `praxis-intelligence-ledger` the per-slice `docs/superpowers/{specs,plans}/*` design/plan docs.
- **`.cadence/`:** `ROADMAP.md`, `STATE.md`, `PROJECT.md`, phase artifacts — reconcile if phase/milestone state advanced.
- **Forward-reference reconciliation:** if this session shipped something a previous doc described as "a later slice / future work", find those forward-refs (`grep` prior specs/plans) and mark them shipped (strike-through + annotation, don't delete history).
- **Canonical Praxis design** lives in the sibling **`C:\Users\digit\Documents\Projects\synth\`** (user's source of truth; `praxis/` is scratchpad only). If a design decision changed, note it — but only edit the sibling repo if the session's work actually altered the design contract; otherwise leave it and record the divergence in the handoff.

Respect project conventions: plan-doc-first, two-commit-per-phase, no `.synth/`-branded artifacts in production.

## Step 4 — Scaffold the SESSION handoff doc with `cadence handoff`, then fill the narrative

Don't hand-roll the doc — **scaffold it with the engine command**, which pre-fills the error-prone machine facts (stale shas / wrong branch / wrong loop position are the classic handoff defects). Then you only write the judgment.

```
cadence handoff <context-label>
# dogfood from source: node packages/core/bin/cadence.cjs handoff <context-label>
```

This writes `.cadence/handoff/SESSION-<YYYY-MM-DD>[-<context-label>].md` (today's date + the `$ARGUMENTS` label or a derived one) and, by default, stamps `state.session.lastHandoff` so the next session's `cadence resume` finds it. Re-running for the same day+label is **refused** unless you pass `--force` (it won't silently clobber your narrative) — for a narrative-only touch-up, edit the file directly instead; use `--force` only to regenerate the machine facts; use a distinct `--label` for a genuinely separate thread.

What the command **pre-fills** (verify, don't retype):
- **Frontmatter** — loop snapshot, read-only git facts (branch/dirty/ahead-behind/head), context-packet path.
- **State on handoff** — branch, clean/dirty, ahead/behind, HEAD + recent commits, `git diff --stat`, loop position · active phase · tier.
- **CADENCE context** — top recommendations, open assumptions, active decisions, files in play (from `cadence context handoff`).
- **Empty narrative stubs** — `TL;DR`, `What landed this session`, `Carry-forward gotchas`, `Next action`.

Then **fill the narrative stubs** (the next LLM should be able to act from the `TL;DR` alone; put commit shas + phase/slice ids in `What landed`; gate result from Step 1 belongs in `TL;DR`/`Next action`), and **append the sections the engine template does not emit**:

- A one-line **"Continues `<prev SESSION file>`"** link under the title when applicable.
- **Conventions reaffirmed / decisions** — anything decided this session that constrains future work.
- **Quick resume commands** — a copy-pasteable block: pull, `git config core.hooksPath .githooks`, install+build, `cadence progress`, the right ROADMAP/spec slice, the explicit next command.

The doc is for an LLM with **no memory of this session** — keep it self-contained and precise over breezy.

## Step 5 — Commit & push

Follow the two-commit-per-phase convention where it applies; for a pure handoff (no source change) a single commit is fine.

- Stage deliberately by path (never blanket `git add -A`): handoff doc, changed docs, changed `.cadence/` artifacts/state. Source + tests + DESIGN/README/CHANGELOG go in their own `feat`/`fix` commit if this session also produced code that isn't yet committed.
- Auto-memory under `C:\Users\digit\.claude\...` is **outside the repo** — it is not committed by git; updating the files (Step 2) is the persistence. Do not try to add it to the repo.
- Commit message: clear, conventional, `why` over `what`, with the standard `Co-Authored-By` trailer. Example subject: `chore: session handoff — <context> (<date>)`.
- `git push` the current branch. The pre-push hook runs the full turbo gate (esp. on protected branches) — let it run. If it fails: **stop, do not bypass**, report the failure and leave commits local (a truthful "pushed-blocked" handoff state).
- After push: `git status --short --branch` to confirm sync; record final sha in the handoff doc + the relevant memory.

## Step 6 — Report

Give the user a terse close-out: branch + final sha, gate result, handoff doc path, which memories/docs were updated, and the one-line "next session starts here". Flag anything that needed a judgment call or is still uncertain.
