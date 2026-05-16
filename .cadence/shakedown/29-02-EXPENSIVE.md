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
