# Team Rollout Guide

A practical guide for bringing CADENCE into a team's day-to-day PR workflow.
It assumes at least one contributor is already running the DRAFT→BUILD→SETTLE
loop locally; this doc is about making the *results* of that loop visible and
useful to the rest of the team during code review.

## What this is NOT

CADENCE is **not** a CI pipeline and it does not replace human code review.
It does not run in your CI system, it does not gate merges, and it does not
post anything to your PRs automatically. Nothing described below requires
touching `.github/workflows/`, branch protection rules, or any existing CI
job — CADENCE's role here is narrower and purely additive: a settled phase
produces a `SUMMARY.json` artifact, and `cadence summary render` turns that
artifact into Markdown a human can read in a PR. That's the entire surface
area. Your CI still runs. Your reviewers still review. CADENCE just gives
them one more piece of evidence to look at, in a format they don't have to
go dig for by hand.

(As of phase 204, `cadence init --ci` scaffolds a narrow, separate piece: a
GitHub Actions workflow that runs on every pull request and calls `cadence
verify phase --changed` — a state-independent re-derivation of whether a
settled phase's AC coverage still holds. The workflow itself has no `paths:`
filter; `--changed` does its own `.cadence/phases/*/*-SUMMARY.json` git-diff
scoping *inside* that command, after the job has already started, so it
correctly no-ops ("nothing to verify") on a PR that never touched a
`SUMMARY.json` rather than skipping the job entirely. `init --ci` also prints
a `gh api` branch-protection recipe but never executes it. It is not a
general CI bootstrap, it does not replace human review or the team's real CI,
and it is unrelated to `cadence summary render` above. See
`docs/reference/commands.md`'s `init`/`verify phase` sections for the full
behavior, including the important limitation that a test-command failure it
surfaces is suite-wide, not attributed to a specific AC.)

## The core workflow

1. A contributor runs a phase through CADENCE's own loop (DRAFT → BUILD →
   SETTLE) as usual, ending with a settled phase and a
   `.cadence/phases/<phase>/<id>-SUMMARY.json` artifact on disk.
2. Before opening the PR (or as a follow-up comment on an already-open PR),
   the author — or a reviewer, if the author forgot — runs:

   ```
   cadence summary render <phase> <num>
   ```

   for example:

   ```
   cadence summary render 199-recommendation-evidence-add-cli-writer 01
   ```

   This is a plain, read-only CLI command. It reads that one
   `<id>-SUMMARY.json` file, validates it, and prints deterministic Markdown
   to stdout — nothing is written back to `.cadence/`, `state.json` is never
   touched, and no network call is made. Running it twice against the same
   file produces byte-identical output.
3. The author pastes that Markdown into the PR description, or as a PR
   comment, instead of asking reviewers to open the raw `SUMMARY.json` and
   parse it by hand.

The rendered output covers, in order: the phase id and completion
timestamp, each acceptance criterion's pass/fail status with its evidence
level, each task's terminal status, the gate outcomes that ran during
settle, any gate bypasses, any recorded decisions, and any deferred items.
Sections with nothing to report (no bypasses, no decisions, no deferred
items) are left out of the render entirely rather than printed as empty
headers — so what you see is only what's actually there.

If the `SUMMARY.json` is missing, malformed JSON, or fails schema
validation, the command refuses with a distinct stderr message for each
case and a non-zero exit code — it will not print a blank or partial
render, so a reviewer never mistakes an error for an empty-but-valid
summary.

## What reviewers should check

When a `cadence summary render` output shows up in a PR, here's what's
worth a reviewer's attention:

- **Per-AC pass/fail, but read the evidence tag too.** Each acceptance
  criterion line looks like `AC-1: PASS (executed)` or `AC-2: PASS
  (mention)`. The evidence level in parentheses matters as much as the
  PASS/FAIL badge — `executed` or `ai-verified` means the AC was backed by
  a real test run or a review agent's judgment; `mention` is a much weaker
  signal (the AC token merely showed up somewhere). A PASS with weak
  evidence is worth a direct question in review, not a rubber stamp.
- **Any task that isn't done.** A task status other than a clean-completion
  terminal state (`DONE`/`DONE_WITH_CONCERNS`) — e.g. `BLOCKED` or
  `NEEDS_CONTEXT` — shows up plainly in the Tasks section, verbatim as
  recorded. That's a flag that the phase may have shipped with known gaps.
- **The Gate bypasses section, if present.** This is the one section that
  most deserves a reviewer's attention when it appears. A gate bypass means
  an operator explicitly overrode a refusal — the gate wanted to say no,
  and a human said "override, and here's why" instead. CADENCE surfaces
  this to reviewers on purpose; it is not something to skim past. If you
  see a bypass line, ask about it: was the override justified, and does the
  stated reason actually hold up?
- **Gate outcomes generally.** A gate that ran and passed is one thing; a
  gate that was skipped (not in the active tier × profile gate set, or not
  requested) is a different signal from one that actually ran and passed.
  The rendered output distinguishes these explicitly rather than collapsing
  them into a single green checkmark.

None of this replaces your existing review judgment — it's additional,
pre-digested evidence to weigh alongside the diff itself, same as you'd
weigh a linked test-coverage report or a static-analysis comment.

## Shared conventions

A lightweight, fully optional convention some teams find useful: add a
`## CADENCE Summary` section to your `.github/PULL_REQUEST_TEMPLATE.md`
with a placeholder for the rendered output, e.g.:

```markdown
## CADENCE Summary

<!-- Run `cadence summary render <phase> <num>` and paste the output below. -->
<!-- Delete this section if the PR isn't backed by a settled CADENCE phase. -->

```

Adopting this is entirely up to the team — nothing about `cadence summary
render` requires a specific PR template shape, and a team can just as
easily paste the output as a comment instead of editing the template at
all. Treat this snippet as a starting point, not a required format.

## Out of scope (not covered here)

This guide deliberately does not cover:

- **Automated CI gate scaffolding.** `cadence init --ci` (phase 204) is built,
  but it is a separate feature from everything else in this guide, so it isn't
  walked through here — see `docs/reference/commands.md` instead. In short: it
  writes a GitHub Actions workflow that calls `cadence verify phase --changed`
  on pull requests and prints (never executes) a branch-protection recipe.
  It's GitHub-only (no GitLab/CircleCI support), it never runs `gh api` or any
  other branch-protection call on your behalf, and its test-command signal is
  suite-wide — it cannot attribute a failure to the specific AC that broke.
- **Auto-posting to PRs.** `cadence summary render` is a plain CLI command
  you run by hand, or that a team can choose to wire into their own CI
  scripting if they want the output posted automatically — but that wiring
  is entirely on the team to build; CADENCE does not ship a GitHub Actions
  integration, bot, or webhook for it.
- **Replacing CI or human review.** Covered above, but worth repeating: if
  your team is looking for CADENCE to replace a CI check or a required
  reviewer, that is not what this workflow does.
