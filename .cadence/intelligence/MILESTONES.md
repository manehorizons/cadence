# CADENCE Milestone Candidates

> Generated from `.cadence/intelligence/milestones.json`.

## Proposed

### mil-rec-rec-20260619-001 — No-install first touch

- objective: Document and optimize the no-install path: `npx -y @manehorizons/cadence-core tutorial` should let a newcomer feel the CADENCE loop before committing to a global install or repo initialization. This reduces adoption friction and makes the first touch side-effect free.
- status: proposed
- recommendations: rec-20260619-001
- pre-mortem:
  - likely failure modes:
    - _(why might this fail?)_
  - hidden dependencies:
    - _(what must already be true?)_
  - drift risks:
    - Milestone touches documentation surfaces — spec/doc drift risk.
  - out of scope:
    - _(what is explicitly NOT in this milestone?)_

### mil-rec-rec-20260619-002 — Make cadence tutorial the hero path

- objective: Reposition the existing throwaway `cadence tutorial` as the primary README/quickstart call-to-action before global install or in-repo init. The sandbox already runs the real loop; onboarding should make it impossible to miss.
- status: proposed
- recommendations: rec-20260619-002
- pre-mortem:
  - likely failure modes:
    - _(why might this fail?)_
  - hidden dependencies:
    - _(what must already be true?)_
  - drift risks:
    - Milestone touches documentation surfaces — spec/doc drift risk.
  - out of scope:
    - _(what is explicitly NOT in this milestone?)_

### mil-rec-rec-20260619-006 — First real phase agent prompt

- objective: After init, print or generate a copy-paste prompt for the user's AI agent: create a quick-fix draft for the stated goal, keep ACs testable, and stop for approval. This bridges the CLI into the actual agent workflow.
- status: proposed
- recommendations: rec-20260619-006
- pre-mortem:
  - likely failure modes:
    - _(why might this fail?)_
  - hidden dependencies:
    - _(what must already be true?)_
  - drift risks:
    - Milestone touches documentation surfaces — spec/doc drift risk.
  - out of scope:
    - _(what is explicitly NOT in this milestone?)_

### mil-rec-rec-20260619-007 — Failure-first tutorial mode

- objective: Add `cadence tutorial --fail-first` that intentionally shows a settle refusal, explains why the gate blocked closure, then applies the fix and settles cleanly. Teach the product's core value: refusal-to-settle, not just a happy path.
- status: proposed
- recommendations: rec-20260619-007
- pre-mortem:
  - likely failure modes:
    - _(why might this fail?)_
  - hidden dependencies:
    - _(what must already be true?)_
  - drift risks:
    - Milestone touches documentation surfaces — spec/doc drift risk.
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

- mil-rec-rec-20260611-003 — Make real verification the felt default — close the gap between the enforcement wedge and the mock default → .cadence/intelligence/exports/mil-rec-rec-20260611-003/SPEC.md
- mil-rec-rec-20260619-003 — Draft templates for first real work → .cadence/intelligence/exports/mil-rec-rec-20260619-003/SPEC.md

## Closed

None.
