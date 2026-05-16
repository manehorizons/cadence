# Phase 29.2 — Expensive-gate live exercise (local / Ollama)

Observation-only (mirrors 29.1). Every deviation logged, not fixed — remediation is a later phase. Findings tagged `bug | docs | ux | works-as-designed`.

## Divergence from ROADMAP (intentional, recorded)

ROADMAP 29.2 specified `anthropic` providers. Phase 30.1 shipped a `local` provider, so this ran against **Ollama `qwen3-coder:30b`** at **zero cloud spend**. This validates the gate *plumbing* end-to-end and surfaces local-model precision/robustness; the Anthropic-precision/token-cost contract remains a separate optional later check.

## Setup

- Scratch project `C:/Users/digit/Documents/Projects/cadence-2902-scratch` (single-package JS, 23 commits, git). NOT cadence's own repo — cadence's committed config stays `auto × standard` + `mock` per convention.
- `cadence init --gate-profile=strict`; `.cadence/config.json` edited: all 5 gate providers → `local`, `profile: strict`; `verification.testGlobs` → `["**/*.test.js"]`.
- Env: `CADENCE_LOCAL_BASE_URL=http://localhost:11434/v1`, `CADENCE_LOCAL_MODEL=qwen3-coder:30b`. Ollama up; OpenAI-compatible `/v1/chat/completions` + `response_format:json_object` confirmed (`{"ok":true}`, 25 tok).
- Real DRAFT: `01-math` complex tier, 6 ACs / 6 tasks (subtract/multiply/clamp/isEven/sum/average + tests). `strict × complex` → effective gates include plan-review, per-task-verify, code-review, deep-verify (`--deep`), security-audit, interactive-verdict.
- CLI run from built `packages/core/dist/cli/index.js` (Phase 30.1 local provider in dist).

## Per-gate results

| Gate | Fired? | Live local? | Verdict | Latency | Notes |
|------|--------|-------------|---------|---------|-------|
| **plan-review** (`draft approve`) | yes (silent) | **unconfirmable** | pass (→ BUILD) | ~4s | Code only prints on `!pass`; provider/verdict **not persisted** on pass (no SUMMARY at approve-time). Can't prove local vs mock from artifacts. |
| **per-task-verify** (`build task DONE`) | **yes** | **YES — confirmed** | pass ×6 | ~4–5s ea (warm) | `PROGRESS.json tasks[T*].perTaskVerify = {provider:"local", model:"qwen3-coder:30b"}`, model-generated reasons. **Proves the `local` provider works end-to-end through the real CLI at strict×complex.** |
| **deep-verify** (`settle --deep`) | **yes** | **YES — confirmed, FAILED** | transport/schema failure | ~10s | qwen3-coder:30b output failed `VerifierResponseSchema` (`verdicts` array missing) **even after the one repair retry**. Gate refused with the exact designed error (names baseURL+model+zod error). `--allow-verifier-failure` → all ACs `pass=false`, settle continued. |
| **code-review** (`settle`) | no (no-op) | no | `SUMMARY.codeReview = {}` | ~0s | Early-returned: settle diff scoped to task `touchedFiles`, which were **empty** (`PROGRESS tasks[*].touchedFiles: []`) → `files==0 && diff==''` early-return (the faithful Anthropic-mirror behavior). Model never called. |
| **security-audit** (`settle`) | no (no-op) | no | `SUMMARY.securityAudit = []` | ~0s | Same empty-diff early-return as code-review. Model never called. |
| **interactive-verdict** (`settle`) | yes | n/a | refused non-TTY | ~0s | Correctly refused with the documented message; `--no-interactive` bypassed. Works-as-designed. |

## Findings

| ID | Tag | Sev | What | Later-phase action |
|----|-----|-----|------|--------------------|
| **G1** | `bug` (or `docs` if accepted limitation) | **HIGH** | Deep-verify with `local` qwen3-coder:30b fails strict JSON-schema conformance (`{verdicts:[...]}`) even after the single repair retry — the advertised `--deep` layer is unusable on this local model out of the box. Local 30B structured-output reliability ≪ Anthropic structured outputs. | Increase repair retries / stronger JSON coercion (e.g. inject schema into prompt, few-shot, or `format`-grammar where Ollama supports it); or document a minimum-capability model recommendation; or a `localChatJSON` strict-mode with N retries. |
| **G2** | `ux`/`docs` | MED | A failed verifier records `provider:"unknown"` in `SUMMARY.deepVerify` (not `"local"`), losing which provider/model failed. The stderr message has it; the persisted artifact does not. | Stamp `provider`/`model` on failure records. |
| **G3** | `ux`/`docs` | MED | Plan-review leaves **no persisted artifact** on pass (silent; no SUMMARY at approve-time). Operators/agents cannot later confirm plan-review ran, which provider, or its verdict. | Persist a plan-review record (e.g. into PROGRESS or a draft-side note) on pass, not only stderr-on-fail. |
| **G4** | `ux`/`works-as-designed?` | MED | code-review + security-audit silently no-op when task `touchedFiles` are empty (empty diff → early-return). At strict×complex these are *the* expensive gates; an empty `touchedFiles` (build task did not capture them here) makes the two heaviest gates pass vacuously. Faithful Anthropic-mirror behavior, but the **empty-touchedFiles** root cause is the real issue. | Investigate why `build task` recorded `touchedFiles: []` despite declared `files:`; consider deriving settle diff from `git diff HEAD` (all changes) when touchedFiles empty, or warn that the gate no-op'd. |
| **G5** | `works-as-designed` | — | per-task-verify, interactive-verdict non-TTY refusal, `--allow-verifier-failure` bypass, the `localChatJSON` error message (names baseURL+model+zod error), `--no-interactive`/`--no-approve` bypasses — all behaved exactly as documented. | None. |

## Positives (recorded, not findings)

- **The `local` provider wiring is correct end-to-end.** per-task-verify fired live 6/6 via the real CLI at strict×complex, `provider:"local"`, `model:"qwen3-coder:30b"`, model-authored reasons, ~5s warm. Phase 30.1 works in a real loop.
- The Phase 30.1 error contract is excellent: the deep-verify failure surfaced a precise, actionable message (provider, baseURL, model, zod error) — exactly as designed; `--allow-verifier-failure` degraded cleanly.
- Phase 29.6 F6 fix observed live: scratch `init --gate-profile=strict` printed the non-TTY `draft approve --no-approve` hint.
- The repair-retry path in `localChatJSON` engaged (deep-verify error explicitly says "after one repair retry") — the mechanism works; one retry is just insufficient for a 30B model on that schema (G1).

## Precision note (soft)

per-task-verify passed all 6 with "coherent and scoped" reasons, but the scratch working-tree diff contained **all** functions for every task (setup artifact — they were written in one edit). The model did not flag the diff as broader than the single task. Mostly a scratch-design caveat; mild leniency datapoint, not logged as a hard finding.

## Headline / carry-forward

`local` provider **plumbing is proven** (per-task-verify live, end-to-end, correct). The blocking issue for using `local` on the expensive gates is **G1**: local 30B JSON-schema conformance fails the deep-verify schema past one repair retry — the `--deep` (and likely code-review/security-audit, untested here due to G4's empty-diff no-op) layers need either more robust JSON coercion in `localChatJSON`, a documented minimum-model, or a strict-retry mode. **G4** independently neutered code-review + security-audit (empty `touchedFiles` → vacuous pass) and must be understood before those gates can be judged on local. G2/G3 are observability gaps. No cloud spend incurred. ROADMAP 29.2's `anthropic` precision/cost contract remains unrun (optional, separate).

**Out of scope (per DRAFT):** all fixes — remediation is a later phase, mirroring 29.1 → 29.4/29.6.

---

## CORRECTION (post-settlement direct-probe verification)

The settle-run table above inferred code-review/security-audit behavior from `SUMMARY.codeReview = {}` / `securityAudit = []`. Direct, isolated probes of the built `Local*Verifier` classes against Ollama `qwen3-coder:30b` afterward **disprove finding G4**:

| Gate | Direct probe | Result | Latency |
|------|--------------|--------|---------|
| code-review | diff with `console.log(secret)` + `eval(userInput)` | **LIVE, accurate** — 2 HIGH findings (debug/secret + eval injection), correct lines, `provider:local` | ~6s |
| security-audit | diff with hardcoded JWT + `exec(userInput)` | **LIVE, accurate** — 2 CRITICAL (hardcoded JWT, command injection) | ~5s |
| plan-review | a real DRAFT object | **LIVE, works** — `pass=false`, 3 findings, valid output | ~5s |
| deep-verify (`LocalVerifier`) | AC + diff + tests | **FAILS** — `verdicts[0].id` expected string, received undefined → `VerifierResponseSchema` fails past the 1 repair retry | ~9s |

**Revised dispositions:**

- **G4 — WITHDRAWN (misdiagnosis).** Settle scopes the gate diff from **DRAFT-declared task `files:`** (`settle.ts` ~323: `draft.tasks.flatMap(t => t.files)`), *not* `PROGRESS.touchedFiles`. The scratch DRAFT declared `files:` for every task, so the diff was non-empty; code-review/security-audit **did run live and correctly returned no findings on trivial pure-arithmetic code.** `{}`/`[]` = clean-code-correct, not a no-op. No bug. (The `PROGRESS.touchedFiles: []` observation was real but irrelevant to settle-time scoping.)
- **G1 — CONFIRMED but NARROWED.** Not a blanket "local 30B can't do JSON": 4 of 5 gates (per-task, code-review, security-audit, plan-review) produce valid schema-conforming JSON first try on the *same* model. **Only `LocalVerifier` (deep-verify) fails** — qwen3-coder:30b returns a verdicts array whose objects omit/misname the `id` field, so `VerifierResponseSchema` rejects it even after the single repair retry. Root cause is deep-verify-specific prompt/schema ergonomics (the prompt does not bind output verdict `id`s tightly to the input AC ids, nor give an example), **not** `localChatJSON`. Remediation should target the deep-verify prompt/schema-coercion (schema+example injection, id-binding, possibly an extra retry), not a global localChatJSON change.
- **G3 — CONFIRMED + plan-review proven live.** Plan-review works on local (probe: `pass=false`, 3 findings). The gap is purely observability: at `draft approve` on **pass**, nothing is persisted, so a loop run cannot later prove plan-review ran/which provider/verdict.
- **G2 — unchanged** (failed deep-verify records `provider:"unknown"`; the catch already has `cadenceConfig?.verifier?.provider` available at `settle.ts:382`).

**Corrected headline:** the `local` provider is **production-viable for 4 of the 5 gates** as-is. The only real defect is **G1 (deep-verify only)**. **G2/G3** are observability fixes. **G4 is not a bug.** Remediation phase scope: G1 + G2 + G3.

---

## REMEDIATION VERIFIED (Phase 29.7)

- **G1 — FIXED.** Deep-verify prompt now lists the exact AC ids, demands one verdict per id, and embeds a schema-conforming JSON example (`anthropic-verifier.ts formatUserMessage`, reused by `LocalVerifier`); `localChatJSON` now allows **two** repair retries. Live re-probe vs Ollama `qwen3-coder:30b`: `LocalVerifier` returns schema-valid verdicts (`{"AC-1":{pass:true,...},"AC-2":{pass:true,...}}`), `provider:local`, ~4s, **no schema-failure throw** (passes first call now). All 5 local gates now work live.
- **G2 — FIXED.** Failed deep-verify records the configured `verifier.provider` (+ `model` when set), not `'unknown'` (`settle.ts`). Test: `settle-deep` G2 case (local→closed port→throw→records `provider:'local', model:'tinytest'`).
- **G3 — FIXED.** `draft approve` writes `.cadence/phases/<phase>/<id>-PLAN-REVIEW.json` `{draftId,pass,provider,model?,findings,at}` on pass AND fail — durable, inspectable, no State-schema change. Test: `draft-plan-review` G3 case.
- **G4 — closed (not a bug)** per the correction above; no code change.

Anthropic structured-output path unaffected (only the shared prompt text clarified — strictly helps). Remediation shipped in Phase 29.7 (`29-gate-remediation/29-07`).
