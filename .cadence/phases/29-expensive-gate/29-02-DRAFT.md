---
phase: 29-expensive-gate
id: 29-02
tier: standard
status: PENDING
---

# 29-02 — 29.2 expensive-gate live exercise (local/Ollama)

## Objective

Exercise the matrix surface that has only ever run through unit tests — all five LLM gates at `strict × complex` — against a real local model (Ollama `qwen3-coder:30b`) on a real diff, and record per-gate behavior/precision/latency in `.cadence/shakedown/29-02-EXPENSIVE.md`.

## Context

Observation-only, mirrors Phase 29.1: every deviation logged, not fixed (fixes → a later remediation phase). ROADMAP 29.2 named `anthropic` providers; Phase 30.1 added the `local` provider so this runs at **zero cloud spend** instead — documented divergence (the anthropic-precision/cost contract stays a separate optional later check). The dogfood loop stays `auto × standard` + `mock` per the handoff convention: the live `strict × complex` × `local` run happens in a **scratch project**, never cadence's own committed config. `--allow-missing-coverage` at settle (observation artifacts only; `coverage-bypassed` anomaly expected — same as 29.1).

## Acceptance Criteria

### AC-1: scratch project reaches BUILD through a live local plan-review
Given a scratch project init'd at `strict` profile, `complex` tier, all 5 gate providers = `local`, env `CADENCE_LOCAL_BASE_URL=http://localhost:11434/v1` + `CADENCE_LOCAL_MODEL=qwen3-coder:30b`
When `draft approve` runs on a real DRAFT
Then plan-review fires against the real plan via Ollama and a real (non-mock) verdict is recorded (pass → BUILD, or refuse + documented).

### AC-2: per-task-verify + code-review + deep verifier produce real verdicts on a real diff
Given a real implementation + tests committed in the scratch project
When `build task --status=DONE` then `settle run --deep` run
Then per-task-verify (at build task), code-review and the deep verifier (at settle) each fire via Ollama and return non-mock verdicts on the real `git diff`.

### AC-3: security-audit runs on a real diff at settle
Given the scratch settle at `strict × complex`
When `settle run` reaches the security-audit gate
Then it runs the OWASP-aware pass via Ollama against the real diff and records findings (any severity) with verbatim output captured.

### AC-4: each gate's real-world precision assessed + recorded
Given all five gate outputs
When analyzed
Then `.cadence/shakedown/29-02-EXPENSIVE.md` records per gate: fired? / real verdict / false-positive or false-negative / latency / rough token cost, each finding tagged `bug | docs | ux | works-as-designed`.

### AC-5: documented bypasses behave as documented
Given a gate that refuses
When the matching `--allow-*-failure` / `--force` is passed
Then the bypass behaves as the README documents; the behavior is recorded.

## Tasks

### T1: scratch setup
- files: `.cadence/shakedown/29-02-EXPENSIVE.md`
- action: build dist; create a scratch dir outside cadence; `node packages/core/dist/cli/index.js init` it; edit its `.cadence/config.json` → 5 gates `provider:'local'`, profile `strict`; export `CADENCE_LOCAL_BASE_URL`/`CADENCE_LOCAL_MODEL`. Record the setup + pre-state verbatim.
- verify: scratch `config.json` shows 5 local providers + strict; Ollama reachable.
- done: AC-1

### T2: drive draft approve (plan-review) + build (per-task)
- files: `.cadence/shakedown/29-02-EXPENSIVE.md`
- action: write a real complex-tier DRAFT in the scratch (small genuine code change + tests, ≥6 tasks/ACs). `draft approve` → capture live plan-review verbatim/verdict/latency. Implement, `build task T<n> --status=DONE` → capture live per-task-verify.
- verify: plan-review + per-task-verify produced non-mock output; captured.
- done: AC-1, AC-2

### T3: drive settle (code-review + deep verifier + security-audit)
- files: `.cadence/shakedown/29-02-EXPENSIVE.md`
- action: `settle run --deep` in scratch → capture code-review, deep verifier, security-audit verbatim/verdicts/latency. Trigger ≥1 refusal + confirm the matching `--allow-*-failure`/`--force` bypass.
- verify: all three settle-time gates fired live; bypass confirmed.
- done: AC-2, AC-3, AC-5

### T4: analysis + report
- files: `.cadence/shakedown/29-02-EXPENSIVE.md`
- action: per-gate precision assessment (false pos/neg, sanity) with quoted model output; latency + rough token cost; findings tagged `bug|docs|ux|works-as-designed`; headline + carry-forward for the later remediation phase.
- verify: report covers all 5 gates + AC-4/AC-5; findings tagged.
- done: AC-4, AC-5

## Boundaries

- DO NOT flip cadence's own committed `.cadence/config.json` providers/profile — scratch project only; cadence loop stays `auto × standard` + `mock`.
- DO NOT fix any finding here — observation-only; remediation is a later phase (like 29.1 → 29.4/29.6).
- DO NOT commit the scratch project into cadence; only `.cadence/shakedown/29-02-EXPENSIVE.md` is the cadence-side artifact.
- DO NOT use `anthropic`/cloud — local/Ollama only (zero spend); record the ROADMAP divergence.
- DO NOT push without user approval.
