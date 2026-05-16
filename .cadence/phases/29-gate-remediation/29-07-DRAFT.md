---
phase: 29-gate-remediation
id: 29-07
tier: standard
status: PENDING
---

# 29-07 — 29.2 remediation: G1 (deep-verify local) + G2 + G3

## Objective

Fix the three real findings from the Phase 29.2 expensive-gate exercise (`.cadence/shakedown/29-02-EXPENSIVE.md`, post-correction): G1 deep-verify JSON robustness on local models, G2 failed-verifier provider stamp, G3 plan-review pass-time observability. (G4 withdrawn — not a bug.)

## Context

29.2 direct probes proved 4/5 local gates work (per-task, code-review, security-audit, plan-review). Only `LocalVerifier` (deep-verify) fails: qwen3-coder:30b returns a verdicts array whose objects omit/misname `id` → `VerifierResponseSchema` rejects past the one repair retry. Root cause is the deep-verify prompt not binding output ids to input AC ids nor giving an example — shared `SYSTEM_PROMPT`/`formatUserMessage` in `anthropic-verifier.ts` (reused by `LocalVerifier`; Anthropic path is schema-enforced via `messages.parse` so a clearer prompt only helps). G2: `settle.ts:377` hardcodes `provider:'unknown'` though `cadenceConfig?.verifier?.provider` is in scope. G3: `draft.ts` plan-review records nothing on pass; no artifact exists at approve time (PROGRESS is build-time).

## Acceptance Criteria

### AC-1: deep-verify prompt binds output ids + gives an example
Given the deep-verify system/user prompt
When built for a set of ACs
Then it explicitly instructs one verdict per AC echoing each AC's exact id, lists the required ids, and includes a concrete schema-conforming JSON example.

### AC-2: localChatJSON allows two repair retries
Given malformed model output
When `localChatJSON` runs
Then it attempts up to two repair retries (was one) before throwing; success on either retry returns data; the throw message still names baseURL+model.

### AC-3: deep-verify on local qwen3-coder:30b now produces a valid verdict (live)
Given Ollama `qwen3-coder:30b` and the enhanced prompt + retries
When `LocalVerifier.verify` runs on a real AC+diff
Then it returns schema-valid verdicts (no schema-failure throw) — verified by a live re-probe and recorded in this DRAFT's notes / the remediation report.

### AC-4: failed deep-verify records the real provider/model
Given the deep-verify verifier throws and `--allow-verifier-failure`
When settle records the fallback verdicts
Then each records the configured `verifier.provider` (+ model when known), not `'unknown'`.

### AC-5: plan-review persists a record on pass and fail
Given plan-review fires at `draft approve`
When it completes (pass OR fail)
Then a `.cadence/phases/<phase>/<id>-PLAN-REVIEW.json` artifact is written with `{draftId, pass, provider, model?, findings:<count>, at}`.

## Tasks

### T1: G1 prompt — bind ids + example
- files: `packages/core/src/verify/anthropic-verifier.ts`, `packages/core/tests/verify/anthropic-verifier.test.ts` (or a new prompt test)
- action: enhance `SYSTEM_PROMPT`/`formatUserMessage` so the user message lists the exact AC ids and demands one verdict per id with that exact id, plus a concrete example JSON `{"verdicts":[{"id":"AC-1","pass":true,"reason":"..."}]}`. Keep it schema-accurate; Anthropic path unaffected (only clarified).
- verify: a unit test asserts the formatted message contains every input AC id + the example; existing anthropic-verifier tests still green.
- done: AC-1

### T2: G1 — two repair retries in localChatJSON
- files: `packages/core/src/verify/local-client.ts`, `packages/core/tests/verify/local-client.test.ts`
- action: generalize the single repair to up to two retries (loop); throw after the 2nd still-bad, message unchanged (names baseURL+model). Update/extend tests: bad,bad,good→ok; bad,bad,bad→throw.
- verify: `pnpm -C packages/core test -- run verify/local-client` green.
- done: AC-2

### T3: G3 — persist plan-review artifact
- files: `packages/core/src/cli/commands/draft.ts`, `packages/core/tests/cli/draft-plan-review.test.ts`
- action: after plan-review runs (pass or fail, before the refuse-return on fail too), write `.cadence/phases/<phase>/<id>-PLAN-REVIEW.json` with `{draftId,pass,provider,model?,findings:res.findings.length,at:ISO}` via the atomic writer. No state-schema change.
- verify: test — approve with plan-review in gate set (mock) → artifact exists with provider + pass.
- done: AC-5

### T4: G2 — real provider on failed deep-verify
- files: `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/settle-*.test.ts` (the deep-verify failure test)
- action: replace `provider: 'unknown'` (settle.ts ~377) with `cadenceConfig?.verifier?.provider ?? 'mock'` and include `model` when `cadenceConfig?.verifier?.model` set. Mirror onto the fallback verdicts.
- verify: settle deep-verify failure test asserts recorded `provider` is the configured one, not `'unknown'`.
- done: AC-4

### T5: live G1 re-probe + report + full suite
- files: `.cadence/shakedown/29-02-EXPENSIVE.md` (append remediation-verified note), `CHANGELOG.md`, `DESIGN.md`
- action: rebuild dist; live re-probe `LocalVerifier` vs Ollama qwen3-coder:30b — confirm valid verdicts now (AC-3). Append a "G1 remediation verified" note to the report; CHANGELOG `### Fixed` (G1/G2/G3); DESIGN punchlist. Full `pnpm turbo run test` green.
- verify: live deep-verify probe returns schema-valid verdicts; full turbo suite green.
- done: AC-3

## Boundaries

- DO NOT change the Anthropic structured-output path semantics — `messages.parse` stays; only the shared prompt text is clarified.
- DO NOT touch code-review/security-audit/per-task verifiers — proven working on local; out of scope.
- DO NOT add a State Zod field for G3 — use a per-phase sidecar artifact (no schema bump / fixture ripple).
- DO NOT re-litigate G4 — withdrawn (not a bug) per the report correction.
- DO NOT flip cadence's own committed config; DO NOT push without user approval.
