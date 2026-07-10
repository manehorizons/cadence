# CADENCE Milestone Candidates

> Generated from `.cadence/intelligence/milestones.json`.

## Proposed

### mil-rec-rec-20260710-002 — Host-CLI headless verifier provider: reuse Claude Code/Codex's own auth instead of requiring a raw API key

- objective: All 3 current verifier providers (mock/anthropic/local) either do no real judgment or require a directly-configured credential (ANTHROPIC_API_KEY, or an OpenAI-compatible endpoint's own key) -- there is no path for a user who already has Claude Code or Codex installed and authenticated to use that existing auth for cadence's independent-verifier gates. Proposal: a 4th provider that shells out to the host CLI in headless/non-interactive mode (e.g. 'claude -p <prompt> --output-format json', or an analogous 'codex exec') as a fresh out-of-band subprocess -- genuinely independent of the calling session (arguably MORE independent than same-session self-report, since it is a new process with no shared context), while reusing whatever auth that CLI already has configured, with zero new env var required. Open design questions: (1) does the host CLI's headless/print mode reliably emit structured JSON matching cadence's per-AC verdict Zod schema, or does it need a repair-retry loop like local-client.ts; (2) process-spawn latency/cost vs a direct API call, and whether it belongs behind a new HostAdapter capability (e.g. 'headlessVerify') so core does not hardcode 'claude'/'codex' binary names -- core never imports host code, so this needs the same core-spawns-host-as-subprocess pattern already used for host installs; (3) whether per-gate model selection still makes sense when the host CLI picks its own model. Directly addresses the competitive risk (see cadence-competitive-landscape notes) that mock-default undercuts the enforcement wedge for users without a standalone Anthropic API key.
- status: proposed
- recommendations: rec-20260710-002
- pre-mortem:
  - likely failure modes:
    - _(why might this fail?)_
  - hidden dependencies:
    - _(what must already be true?)_
  - drift risks:
    - _(what docs/specs will drift?)_
  - out of scope:
    - _(what is explicitly NOT in this milestone?)_

## Accepted

### mil-rec-rec-20260617-001 — Zero-prompt init that auto-wires the host

- objective: cadence init prompts for name (default 'unnamed') + profile, then tells the user to separately run the host install. Derive name from package.json/dir, profile from git (suggestGateProfile already exists), detect .claude/ and offer/auto-run host install in the same step. --name/--preset stay as overrides. One command, zero questions, fully wired.
- status: accepted
- recommendations: rec-20260617-001
- pre-mortem:
  - likely failure modes:
    - _(why might this fail?)_
  - hidden dependencies:
    - _(what must already be true?)_
  - drift risks:
    - _(what docs/specs will drift?)_
  - out of scope:
    - _(what is explicitly NOT in this milestone?)_

### mil-rec-rec-20260617-002 — init --demo: pre-filled first phase in the real repo

- objective: cadence tutorial runs in a throwaway sandbox then deletes it - user ends with nothing. README quickstart says 'fill .cadence/phases/.../DRAFT.md' - that hand-edit is the cliff. Scaffold a real phase with objective + AC-1 + task T1 already written (reuse tutorial toy template, tutorial.ts:44-75) so the user runs approve -> done -> settle immediately and watches a real gate fire/pass in their own repo.
- status: accepted
- recommendations: rec-20260617-002
- pre-mortem:
  - likely failure modes:
    - _(why might this fail?)_
  - hidden dependencies:
    - _(what must already be true?)_
  - drift risks:
    - _(what docs/specs will drift?)_
  - out of scope:
    - _(what is explicitly NOT in this milestone?)_

### mil-rec-rec-20260617-004 — Fold activation into init when API key present

- objective: Out-of-box mock verifier is plastered as 'NOT real verification' across init/doctor/config-explain, but turning it on is a separate cadence activate + export ANTHROPIC_API_KEY dance. At init, if ANTHROPIC_API_KEY is already in env, offer (or --activate auto-select) anthropic right there. User with key gets real verification with zero extra hops and no scolding.
- status: accepted
- recommendations: rec-20260617-004
- pre-mortem:
  - likely failure modes:
    - _(why might this fail?)_
  - hidden dependencies:
    - _(what must already be true?)_
  - drift risks:
    - _(what docs/specs will drift?)_
  - out of scope:
    - _(what is explicitly NOT in this milestone?)_

## Deferred

- mil-rec-rec-20260617-003 — Auto-derive phase id and collapse --ac syntax
- mil-rec-rec-20260617-005 — Agent/non-TTY mode to kill the StdinPrompter minefield

## Exported

- mil-grp-onboarding-honesty — onboarding-honesty → .cadence/intelligence/exports/mil-grp-onboarding-honesty/SPEC.md
- mil-rec-rec-20260611-003 — Make real verification the felt default — close the gap between the enforcement wedge and the mock default → .cadence/intelligence/exports/mil-rec-rec-20260611-003/SPEC.md
- mil-rec-rec-20260619-003 — Draft templates for first real work → .cadence/intelligence/exports/mil-rec-rec-20260619-003/SPEC.md
- mil-rec-rec-20260619-006 — First real phase agent prompt → .cadence/intelligence/exports/mil-rec-rec-20260619-006/SPEC.md
- mil-rec-rec-20260701-012 — Boundary enforcement block mode, including subagent edits → .cadence/intelligence/exports/mil-rec-rec-20260701-012/SPEC.md
- mil-rec-rec-20260704-001 — Settle-time boundary diff scan (blocking) for subagent edits → .cadence/intelligence/exports/mil-rec-rec-20260704-001/SPEC.md

## Closed

- mil-rec-rec-20260708-002 — Mock milestone workflow proof for Codex first-run bootstrap (ref: proof workflow artifact: .cadence/intelligence/exports/mil-rec-rec-20260708-002/SPEC.md; phase 162 settled on feat/codex-first-run-recommendation)
