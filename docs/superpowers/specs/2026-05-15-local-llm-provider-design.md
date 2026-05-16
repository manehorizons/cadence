# Design — `local` LLM provider (Ollama / OpenAI-compatible)

**Date:** 2026-05-15
**Status:** Approved (brainstorming) — pending spec review + implementation plan
**Context:** CADENCE v1.1, before Phase 29.2. Enables the five LLM gates to run
against a local OpenAI-compatible runtime (Ollama) at zero cloud spend, and
ships local-LLM support as a real product capability.

## Problem

The five LLM gates (`verifier`, `perTaskVerifier`, `codeReview`, `planReview`,
`securityAudit`) accept only `provider: 'mock' | 'anthropic'`. Each
`select<Gate>Verifier` factory hardcodes `anthropic → new Anthropic<Gate>Verifier`,
else mock. `AnthropicVerifier` constructs `new Anthropic({ apiKey })` with **no
`baseURL` seam** and uses `messages.parse()` + `zodOutputFormat` +
`cache_control: ephemeral` — the real Anthropic structured-output path. There is
no way to point the gates at a local model. Phase 29.2 (expensive-gate live
exercise) therefore requires live Anthropic key + token spend.

The user runs **Ollama** (`http://localhost:11434/v1`, OpenAI-compatible
`/v1/chat/completions`), default model **`qwen3-coder:30b`**.

## Goals

- Add a third provider, `local`, to all five gates.
- Target OpenAI-compatible `/v1/chat/completions` (Ollama and equivalents).
- Zero new npm dependencies (Node 24 global `fetch`).
- Preserve the codebase's existing one-class-per-gate-per-provider symmetry.
- No machine specifics in committed config (env-driven, per the F1 lesson).
- Cadence's own dogfood loop stays `mock` (defaults/presets unchanged).

## Non-Goals (YAGNI)

Streaming; tool-use; provider-native `json_schema` mode; model auto-pull;
multi-model routing; retries beyond a single JSON-repair attempt; a committed
config flip for the dogfood loop; changing the gate verdict semantics.

## Architecture

### Shared client — `packages/core/src/verify/local-client.ts`

```
localChatJSON<T>(opts: {
  baseURL: string;
  model: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  transport?: typeof fetch;   // test seam
}): Promise<T>
```

Behavior:
1. POST `${baseURL}/chat/completions` with
   `{ model, messages: [{role:'system',content:system},{role:'user',content:user}],
   response_format: { type: 'json_object' }, temperature: 0 }` via `transport ?? fetch`.
2. Extract assistant message content; strip Markdown code fences; slice from the
   first `{` to the last `}`.
3. `JSON.parse` → validate with the supplied Zod `schema`.
4. On parse OR validation failure: **one repair retry** — re-POST with an
   appended user turn containing the offending raw output and the validator
   error, demanding strict JSON for the same schema.
5. Still failing after the retry → `throw new Error(...)` (transport-class
   failure, naming the gate + cause). Connection refused / network error →
   `fetch` rejects → wrapped `Error` naming the base URL.

Rationale for tolerant parse + single retry: local models honor
`response_format: json_object` unevenly and emit fences/prose; one bounded
repair is the pragmatic floor without unbounded loops.

### Five `Local<Gate>Verifier` classes

Added to the existing gate modules — `verify/verifier.ts` (deep verifier),
`verify/code-review.ts`, `verify/per-task.ts`, `verify/plan-review.ts`,
`verify/security-audit.ts` — alongside the existing `Mock<Gate>Verifier` /
`Anthropic<Gate>Verifier`. Each `Local<Gate>Verifier`:

- `readonly name = 'local'`
- Constructor: `{ baseURL: string; model: string; transport?: typeof fetch }`
- `verify`/gate method: reuses **that gate's existing system prompt and Zod
  response schema** (identical to its `Anthropic<Gate>Verifier`), formats the
  same user message, and delegates transport + parse to `localChatJSON`. Maps
  the parsed result into the gate's existing result type
  (`VerifyResult` / code-review findings / etc.), stamping
  `provider: 'local'`, `model`.

No gate result schema or prompt changes — only a new transport implementation
behind the established per-gate interface (`Verifier`, `CodeReviewVerifier`,
`PerTaskVerifier`, `PlanReviewVerifier`, `SecurityAuditVerifier`).

### Config + selection

`packages/types/src/config.ts`: for each of the five gate blocks, widen
`provider` to `z.enum(['mock','anthropic','local'])`. Defaults remain `'mock'`;
`defaultConfig` and all presets are unchanged, so cadence's own loop is
unaffected.

Each `select<Gate>Verifier`: widen `opts.override?` to include `'local'` and
add a uniform branch (mirrors the existing anthropic branch):

```
if (provider === 'local') {
  const baseURL = env.CADENCE_LOCAL_BASE_URL;
  const model = config?.<gate>?.model ?? env.CADENCE_LOCAL_MODEL;
  if (!baseURL || !model) {
    warn('<gate>: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.');
    return new Mock<Gate>Verifier();
  }
  return new Local<Gate>Verifier({ baseURL, model });
}
```

- Base URL and model are **env-only**: `CADENCE_LOCAL_BASE_URL`,
  `CADENCE_LOCAL_MODEL`. A per-gate config `model` (already an optional field)
  overrides `CADENCE_LOCAL_MODEL` when set.
- Missing base URL or model → warn + mock fallback, exactly paralleling the
  existing "anthropic requested but `ANTHROPIC_API_KEY` unset" behavior, so the
  downgrade UX is consistent.
- No pre-flight connectivity check — an unreachable endpoint surfaces as the
  gate's clear runtime error at call time.

### Error semantics

- Per-AC / per-finding failures → `result.verdicts[id].pass = false` (or the
  gate's equivalent), never a throw — unchanged contract.
- Malformed model output after the single repair retry → throw (gate refuses
  with a transport error, same shape as the Anthropic path's "no parseable
  output").
- Network/connection failure → throw, message names the base URL.

## Testing

Unit tests inject `transport` (a stub `fetch`) — no live Ollama required:

- `local-client`: happy JSON; fenced/prose-wrapped JSON; malformed → repair →
  success; malformed → repair → still bad → throw; network reject → throw.
- Each factory: `provider:'local'` + env set → returns `Local<Gate>Verifier`;
  `provider:'local'` + env unset → mock + warn (mirrors existing
  anthropic-missing-key factory tests).

All tests live under `packages/**` → the test-coverage gate (cadence monorepo
glob) links each AC. Cadence's own loop runs `mock`, so no live calls in CI.

## Follow-on — Phase 29.2

After this ships, run the expensive-gate exercise at `strict × complex` with all
five providers = `local`, `CADENCE_LOCAL_MODEL=qwen3-coder:30b`,
`CADENCE_LOCAL_BASE_URL=http://localhost:11434/v1`, via a scratch/env config
(no committed flip — the dogfood loop stays `auto × standard` per the handoff
convention). Record `.cadence/shakedown/29-02-EXPENSIVE.md`: per-gate fired? /
verdict / false-pos-neg / latency.

**Documented divergence:** ROADMAP Phase 29.2 names `anthropic` providers — it
validates the *cloud* path's precision and token cost. The local run validates
the gate plumbing end-to-end and provides a free expensive-gate smoke; the
Anthropic-precision/cost check remains a separate, optional later step. This
divergence is intentional and must be recorded in the 29.2 report and the
ROADMAP open question.

## Affected files

- `packages/types/src/config.ts` — provider enum ×5.
- `packages/core/src/verify/local-client.ts` — new shared client.
- `packages/core/src/verify/{verifier,code-review,per-task,plan-review,security-audit}.ts`
  — add `Local<Gate>Verifier`.
- `packages/core/src/verify/{factory,code-review-factory,per-task-factory,plan-review-factory,security-audit-factory}.ts`
  — `local` branch + `override` type widen.
- `packages/core/tests/verify/**` — client + factory tests.
- `README.md`, `DESIGN.md`, `CHANGELOG.md` — document the provider + env vars.

## Build sequence (for the plan)

1. `packages/types` provider enum + rebuild types.
2. `local-client.ts` + its unit tests.
3. Five `Local<Gate>Verifier` classes.
4. Five factory `local` branches + `override` widen + factory tests.
5. Docs (README/DESIGN/CHANGELOG).
6. Full suite green; dogfood as a CADENCE phase (two-commit convention);
   then Phase 29.2 on local.
