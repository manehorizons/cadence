# Local LLM Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third LLM-gate provider `local` (OpenAI-compatible `/v1/chat/completions`, e.g. Ollama) across all five CADENCE gates, so the Phase 29.2 expensive-gate exercise can run at zero cloud spend.

**Architecture:** One shared `localChatJSON` client (plain `fetch`, tolerant JSON extract + Zod-validate + single repair retry). Five thin `Local<Gate>Verifier` classes mirror the existing `Anthropic<Gate>Verifier` symmetry, reusing each gate's module-private system prompt + Zod schema. Each `select<Gate>Verifier` factory gains a uniform `local` branch (env-driven base URL/model, warn+mock fallback). Defaults/presets unchanged → cadence's own dogfood loop stays `mock`.

**Tech Stack:** TypeScript, Node 24 global `fetch` (no new dep), Zod v4 (`zod/v4`, matching the existing verifier modules), vitest. Spec: `docs/superpowers/specs/2026-05-15-local-llm-provider-design.md`.

**Execution note (CADENCE dogfood — READ FIRST, overrides per-task git steps):** This runs as a CADENCE phase on `main` (no worktree — project convention) under the **strict two-commit-per-phase convention**: exactly ONE `feat(...)` commit (all source+tests+docs, NOT `.cadence/*`) then ONE `chore: settle …` commit (`.cadence/phases/30-local-provider/*` + STATE + state.json). The project's entire git history follows this — **never one commit per task.**

Therefore the per-task "Step: Checkpoint" entries below are **stage-and-verify checkpoints, NOT commits** — run the tests, `git add` the touched files, and record loop progress with `cadence build task T<n> --status=DONE`. Do **not** `git commit` until Task 7. Loop sequence: `cadence draft new 30-local-provider 01 --title="local LLM provider" --tier=complex` → fill DRAFT (ACs below) → `draft check` → `draft approve --allow-auto-complex` (auto×complex soft-cap) → implement Tasks 1–6 TDD, `build task T<n> --status=DONE` after each → Task 7 (single feat commit → `settle run --auto` → settle commit). Push is user-gated.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/types/src/config.ts` | 5 gate `provider` enums → add `'local'` | Modify |
| `packages/core/src/verify/local-client.ts` | Shared OpenAI-compatible JSON client | Create |
| `packages/core/src/verify/verifier.ts` | add `LocalVerifier` (deep verifier) | Modify |
| `packages/core/src/verify/code-review.ts` | add `LocalCodeReviewVerifier` | Modify |
| `packages/core/src/verify/per-task.ts` | add `LocalPerTaskVerifier` | Modify |
| `packages/core/src/verify/plan-review.ts` | add `LocalPlanReviewVerifier` | Modify |
| `packages/core/src/verify/security-audit.ts` | add `LocalSecurityAuditVerifier` | Modify |
| `packages/core/src/verify/factory.ts` + 4 sibling factories | `local` branch + `override` widen | Modify |
| `packages/core/tests/verify/local-client.test.ts` | client unit tests | Create |
| `packages/core/tests/verify/local-factories.test.ts` | factory selection tests | Create |
| `README.md`, `DESIGN.md`, `CHANGELOG.md` | document provider + env vars | Modify |

**Per-gate facts (confirmed by reading the modules):**

| Gate module | Iface | Result type | Private schema var | Empty-input early-return (mirror exactly) |
|---|---|---|---|---|
| `verifier.ts` | `Verifier` | `VerifyResult {verdicts,provider,model}` | `VerifierResponseSchema` (in `anthropic-verifier.ts`; move/export or re-declare locally — see Task 3) | `input.acs.length === 0` |
| `code-review.ts` | `CodeReviewVerifier` | `CodeReviewResult {findings,provider,model}` | `CodeReviewResponseSchema` | `files.length === 0 && diff.trim() === ''` |
| `per-task.ts` | `PerTaskVerifier` | (read file) | (read file) | **NONE** — `AnthropicPerTaskVerifier` always calls the model; `LocalPerTaskVerifier` has no early-return either (no empty-input test for it) |
| `plan-review.ts` | `PlanReviewVerifier` | (read file) | (read file) | read `AnthropicPlanReviewVerifier`; replicate its early-return iff one exists, else none |
| `security-audit.ts` | `SecurityAuditVerifier` | (read file) | (read file) | read `AnthropicSecurityAuditVerifier`; replicate its early-return iff one exists, else none |

For per-task/plan-review/security-audit: open the module, read its `Anthropic<Gate>Verifier` + private `SYSTEM_PROMPT`/schema/`formatUserMessage`, and mirror them — the `Local` class differs ONLY in transport (Task 4 template). Do not invent prompts/schemas; reuse the module's existing ones.

---

## Task 1: provider enum gains `local`

**Files:**
- Modify: `packages/types/src/config.ts` (5 occurrences of `z.enum(['mock', 'anthropic'])`)
- Test: `packages/types/tests/config.test.ts` (or the existing config schema test — locate with grep)

- [ ] **Step 1: Write failing test**

```ts
// in the config schema test file
it('accepts provider "local" on every LLM gate', () => {
  const cfg = CadenceConfigZ.parse({
    ...minimalValidConfigObject, // reuse the existing test's base object
    verifier: { provider: 'local' },
    perTaskVerifier: { provider: 'local' },
    codeReview: { provider: 'local' },
    planReview: { provider: 'local' },
    securityAudit: { provider: 'local' },
  });
  expect(cfg.verifier.provider).toBe('local');
  expect(cfg.securityAudit.provider).toBe('local');
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm -C packages/types test -- run config`
Expected: FAIL (zod rejects `'local'`).

- [ ] **Step 3: Implement**

In `packages/types/src/config.ts`, change each of the 5 gate blocks' `provider: z.enum(['mock', 'anthropic'])` to `z.enum(['mock', 'anthropic', 'local'])`. Do NOT change `defaultConfig` or `presets` (defaults stay `'mock'`).

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -C packages/types test -- run config` → PASS. Then `pnpm -C packages/types build`.

- [ ] **Step 5: Checkpoint (stage only — NO commit, per the Execution note)**

```bash
git add packages/types/src/config.ts packages/types/tests
```
Then: `node packages/core/bin/cadence.cjs build task T1 --status=DONE --notes "local enum on 5 gates"`

---

## Task 2: `localChatJSON` shared client

**Files:**
- Create: `packages/core/src/verify/local-client.ts`
- Test: `packages/core/tests/verify/local-client.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';
import { localChatJSON } from '../../src/verify/local-client.js';

const Schema = z.object({ ok: z.boolean() });

function fakeFetch(bodies: string[]): typeof fetch {
  let i = 0;
  return (async () => {
    const content = bodies[Math.min(i++, bodies.length - 1)];
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    } as Response;
  }) as unknown as typeof fetch;
}

describe('localChatJSON', () => {
  const base = { baseURL: 'http://x/v1', model: 'm', system: 's', user: 'u', schema: Schema };

  it('AC-1: parses clean JSON', async () => {
    const r = await localChatJSON({ ...base, transport: fakeFetch(['{"ok":true}']) });
    expect(r.ok).toBe(true);
  });

  it('AC-1: strips code fences and prose', async () => {
    const r = await localChatJSON({ ...base, transport: fakeFetch(['Sure:\n```json\n{"ok":true}\n```']) });
    expect(r.ok).toBe(true);
  });

  it('AC-2: repairs once then succeeds', async () => {
    const r = await localChatJSON({ ...base, transport: fakeFetch(['not json', '{"ok":false}']) });
    expect(r.ok).toBe(false);
  });

  it('AC-2: throws after failed repair', async () => {
    await expect(
      localChatJSON({ ...base, transport: fakeFetch(['nope', 'still nope']) }),
    ).rejects.toThrow(/parse|JSON|schema/i);
  });

  it('AC-3: throws naming base URL on network reject', async () => {
    const t = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    await expect(
      localChatJSON({ ...base, transport: t }),
    ).rejects.toThrow(/http:\/\/x\/v1/);
  });

  it('AC-3: throws on non-2xx', async () => {
    const t = (async () => ({ ok: false, status: 500, json: async () => ({}) } as Response)) as unknown as typeof fetch;
    await expect(localChatJSON({ ...base, transport: t })).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm -C packages/core test -- run verify/local-client`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `local-client.ts`**

```ts
import type { ZodType } from 'zod/v4';

export interface LocalChatJSONOptions<T> {
  baseURL: string;
  model: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Test seam; defaults to global fetch. */
  transport?: typeof fetch;
  maxTokens?: number;
}

/** Extract a JSON object from model content: drop fences, slice first { … last }. */
function extractJson(content: string): string {
  const noFence = content.replace(/```(?:json)?/gi, '');
  const start = noFence.indexOf('{');
  const end = noFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return noFence.trim();
  return noFence.slice(start, end + 1);
}

async function callOnce(
  o: LocalChatJSONOptions<unknown>,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const fetchImpl = o.transport ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${o.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: o.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0,
        ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
      }),
    });
  } catch (err) {
    throw new Error(
      `local provider: request to ${o.baseURL} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`local provider: ${o.baseURL} returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return body.choices?.[0]?.message?.content ?? '';
}

export async function localChatJSON<T>(o: LocalChatJSONOptions<T>): Promise<T> {
  const messages = [
    { role: 'system', content: o.system },
    { role: 'user', content: o.user },
  ];
  const raw1 = await callOnce(o as LocalChatJSONOptions<unknown>, messages);
  const first = o.schema.safeParse(safeJson(extractJson(raw1)));
  if (first.success) return first.data;

  // One repair retry: feed back the bad output + the validation error.
  const repairMessages = [
    ...messages,
    { role: 'assistant', content: raw1 },
    {
      role: 'user',
      content:
        'That was not valid. Return ONLY strict JSON matching the required schema, no prose, no code fences. Error: ' +
        first.error.message,
    },
  ];
  const raw2 = await callOnce(o as LocalChatJSONOptions<unknown>, repairMessages);
  const second = o.schema.safeParse(safeJson(extractJson(raw2)));
  if (second.success) return second.data;

  throw new Error(
    `local provider: model output failed JSON/schema validation after one repair retry (${o.baseURL}, model=${o.model}): ${second.error.message}`,
  );
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined; // schema.safeParse(undefined) fails → triggers repair/throw
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -C packages/core test -- run verify/local-client` → PASS (all 6).

- [ ] **Step 5: Checkpoint (stage only — NO commit)**

```bash
git add packages/core/src/verify/local-client.ts packages/core/tests/verify/local-client.test.ts
```
Then: `node packages/core/bin/cadence.cjs build task T2 --status=DONE --notes "localChatJSON client"`

---

## Task 3: `LocalVerifier` (deep verifier — reference implementation)

**Files:**
- Modify: `packages/core/src/verify/verifier.ts` (add class) and `packages/core/src/verify/anthropic-verifier.ts` (export the schema + `formatUserMessage` + `SYSTEM_PROMPT` so the local class reuses them — they are currently module-private there)
- Test: `packages/core/tests/verify/local-verifier.test.ts`

> Reuse, do NOT re-author, the prompt/schema. `anthropic-verifier.ts` holds `SYSTEM_PROMPT`, `VerifierResponseSchema`, `formatUserMessage` (module-private). This is the **only** gate where the Local class lives in a *different* module from the prompt/schema (`LocalVerifier` → `verifier.ts`; prompt/schema → `anthropic-verifier.ts`), so here you must `export` those three. The resulting `verifier.ts → anthropic-verifier.ts` edge is **type-only** at runtime (`anthropic-verifier.ts` imports from `./verifier.js` via `import type`, erased at compile) — no runtime cycle, so the export approach is safe; the relocate fallback (move the three into `verifier.ts`) is unlikely to be needed but remains available if the build flags a cycle.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { LocalVerifier } from '../../src/verify/verifier.js';

const fetchJson = (content: string) =>
  (async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) } as Response)) as unknown as typeof fetch;

describe('LocalVerifier', () => {
  it('AC-4: maps model verdicts into VerifyResult, provider=local', async () => {
    const v = new LocalVerifier({
      baseURL: 'http://x/v1', model: 'qwen',
      transport: fetchJson('{"verdicts":[{"id":"AC-1","pass":true,"reason":"ok"}]}'),
    });
    const r = await v.verify({
      acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      tests: {}, diff: '', files: [],
    });
    expect(r.provider).toBe('local');
    expect(r.model).toBe('qwen');
    expect(r.verdicts['AC-1']).toEqual({ pass: true, reason: 'ok' });
  });

  it('AC-4: empty ACs short-circuits with no network call', async () => {
    let called = false;
    const t = (async () => { called = true; return {} as Response; }) as unknown as typeof fetch;
    const v = new LocalVerifier({ baseURL: 'http://x/v1', model: 'm', transport: t });
    const r = await v.verify({ acs: [], tests: {}, diff: '', files: [] });
    expect(called).toBe(false);
    expect(r).toEqual({ verdicts: {}, provider: 'local', model: 'm' });
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm -C packages/core test -- run verify/local-verifier` → FAIL (no `LocalVerifier`).

- [ ] **Step 3: Implement**

In `anthropic-verifier.ts`, add `export` to `SYSTEM_PROMPT`, `VerifierResponseSchema`, `formatUserMessage` (or relocate per the note above). In `verifier.ts`:

```ts
import { localChatJSON } from './local-client.js';
import {
  SYSTEM_PROMPT,
  VerifierResponseSchema,
  formatUserMessage,
} from './anthropic-verifier.js';

export interface LocalVerifierOptions {
  baseURL: string;
  model: string;
  transport?: typeof fetch;
}

export class LocalVerifier implements Verifier {
  readonly name = 'local';
  constructor(private readonly o: LocalVerifierOptions) {}

  async verify(input: VerifyInput): Promise<VerifyResult> {
    if (input.acs.length === 0) {
      return { verdicts: {}, provider: this.name, model: this.o.model };
    }
    const parsed = await localChatJSON({
      baseURL: this.o.baseURL,
      model: this.o.model,
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input),
      schema: VerifierResponseSchema,
      ...(this.o.transport ? { transport: this.o.transport } : {}),
    });
    const verdicts: Record<string, AcVerdict> = {};
    for (const v of parsed.verdicts) verdicts[v.id] = { pass: v.pass, reason: v.reason };
    return { verdicts, provider: this.name, model: this.o.model };
  }
}
```

(Ensure `AcVerdict` is imported in `verifier.ts` — it's defined there already; just reference it.)

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -C packages/core test -- run verify/local-verifier` → PASS. Also re-run anthropic verifier tests to confirm the export refactor didn't break them: `pnpm -C packages/core test -- run verify/anthropic`.

- [ ] **Step 5: Checkpoint (stage only — NO commit)**

```bash
git add packages/core/src/verify/verifier.ts packages/core/src/verify/anthropic-verifier.ts packages/core/tests/verify/local-verifier.test.ts
```
Then: `node packages/core/bin/cadence.cjs build task T3 --status=DONE --notes "LocalVerifier + schema export"`

---

## Task 4: four remaining `Local<Gate>Verifier` classes

**Files (modify each gate module + add a test):**
- `packages/core/src/verify/code-review.ts` → `LocalCodeReviewVerifier`
- `packages/core/src/verify/per-task.ts` → `LocalPerTaskVerifier`
- `packages/core/src/verify/plan-review.ts` → `LocalPlanReviewVerifier`
- `packages/core/src/verify/security-audit.ts` → `LocalSecurityAuditVerifier`
- Test: `packages/core/tests/verify/local-gates.test.ts`

**Template (apply per gate; read the module first to get exact names):**

For gate module `G.ts` with interface `XVerifier`, result `XResult`, private `SYSTEM_PROMPT`, private `<Schema>`, private `formatUserMessage`:

1. **No exports needed.** Unlike Task 3, the `Local<X>Verifier` is added into the **same module** as the prompt/schema, so it references `SYSTEM_PROMPT` / `<Schema>` / `formatUserMessage` directly as module-private symbols. Do NOT add `export` to them and do NOT re-apply Task 3's cross-module export refactor here.
2. **Early-return: mirror the gate's `Anthropic<X>Verifier` faithfully.** Read that class. If it has an empty-input short-circuit, replicate the exact same condition + empty result shape. **If it has none, the `Local<X>Verifier` has none either** (always calls the model) — do not invent one. Confirmed: `code-review.ts` short-circuits `files.length===0 && diff.trim()===''`; `per-task.ts` has **NO** early-return (it always calls the model — verify by reading it); `plan-review.ts` / `security-audit.ts` — read and replicate whatever each does (if any).
3. Add:

```ts
import { localChatJSON } from './local-client.js';

export interface Local<X>VerifierOptions { baseURL: string; model: string; transport?: typeof fetch; }

export class Local<X>Verifier implements XVerifier {
  readonly name = 'local';
  constructor(private readonly o: Local<X>VerifierOptions) {}
  async verify(input: XInput): Promise<XResult> {
    // ONLY if Anthropic<X>Verifier has an early-return — same condition + shape:
    // if (<COND>) return { /* empty shape */, provider: this.name, model: this.o.model };
    const parsed = await localChatJSON({
      baseURL: this.o.baseURL, model: this.o.model,
      system: SYSTEM_PROMPT, user: formatUserMessage(input), schema: <Schema>,
      ...(this.o.transport ? { transport: this.o.transport } : {}),
    });
    // identical parsed→result mapping as Anthropic<X>Verifier, with provider:'local'
    return { /* mapped */, provider: this.name, model: this.o.model };
  }
}
```

Concrete example (code-review, fully known):

```ts
export class LocalCodeReviewVerifier implements CodeReviewVerifier {
  readonly name = 'local';
  constructor(private readonly o: { baseURL: string; model: string; transport?: typeof fetch }) {}
  async verify(input: CodeReviewInput): Promise<CodeReviewResult> {
    if (input.files.length === 0 && input.diff.trim().length === 0) {
      return { findings: {}, provider: this.name, model: this.o.model };
    }
    const parsed = await localChatJSON({
      baseURL: this.o.baseURL, model: this.o.model,
      system: SYSTEM_PROMPT, user: formatUserMessage(input), schema: CodeReviewResponseSchema,
      ...(this.o.transport ? { transport: this.o.transport } : {}),
    });
    const findings: Record<string, Finding[]> = {};
    for (const f of parsed.findings) {
      (findings[f.file] ??= []).push({
        severity: f.severity, message: f.message,
        ...(f.line !== undefined ? { line: f.line } : {}),
      });
    }
    return { findings, provider: this.name, model: this.o.model };
  }
}
```

- [ ] **Step 1:** Write `local-gates.test.ts` — one happy-path test per gate (4 cases). Add an empty-input-no-network test **only for gates whose `Anthropic*Verifier` has an early-return** (code-review yes; plan-review/security-audit per what you find when reading them; **per-task: NO early-return → no such test**). So expect ~7 cases total, not 8 — do not write an empty-input test for `LocalPerTaskVerifier`. Reference tokens `AC-4`/`AC-5`.
- [ ] **Step 2:** Run `pnpm -C packages/core test -- run verify/local-gates` → FAIL.
- [ ] **Step 3:** Implement the 4 classes per template (read each module for exact schema + parsed→result mapping + whether an early-return exists).
- [ ] **Step 4:** Run → PASS; re-run `pnpm -C packages/core test -- run verify` (all verify tests) → PASS.
- [ ] **Step 5: Checkpoint (stage only — NO commit)** — `git add` the 4 gate modules + `local-gates.test.ts`; then `node packages/core/bin/cadence.cjs build task T4 --status=DONE --notes "4 Local<Gate>Verifier classes"`.

---

## Task 5: factory `local` branches + `override` widen

**Files:**
- Modify: `factory.ts`, `code-review-factory.ts`, `per-task-factory.ts`, `plan-review-factory.ts`, `security-audit-factory.ts`
- Test: `packages/core/tests/verify/local-factories.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { selectVerifier } from '../../src/verify/factory.js';
// + import the other 4 selectors

describe('factory local branch', () => {
  it('AC-6: local + env set → Local verifier', () => {
    const v = selectVerifier({ verifier: { provider: 'local' } } as any, {
      env: { CADENCE_LOCAL_BASE_URL: 'http://x/v1', CADENCE_LOCAL_MODEL: 'm' },
    });
    expect(v.name).toBe('local');
  });
  it('AC-6: local + env unset → mock + warn', () => {
    const warns: string[] = [];
    const v = selectVerifier({ verifier: { provider: 'local' } } as any, {
      env: {}, warn: (m) => warns.push(m),
    });
    expect(v.name).toBe('mock');
    expect(warns.join()).toMatch(/local provider requested/);
  });
  // repeat the pair for the other 4 selectors
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — in each factory: widen `override?: 'mock' | 'anthropic'` → `'mock' | 'anthropic' | 'local'`; add before the final `return new Mock…`:

```ts
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

(`<gate>` = `verifier|codeReview|perTaskVerifier|planReview|securityAudit`; message prefix matches the existing anthropic warn in that file.)

- [ ] **Step 4:** Run `pnpm -C packages/core test -- run verify/local-factories` → PASS; then `pnpm -C packages/core build`.
- [ ] **Step 5: Checkpoint (stage only — NO commit)** — `git add` the 5 factory files + `local-factories.test.ts`; then `node packages/core/bin/cadence.cjs build task T5 --status=DONE --notes "5 factory local branches"`.

---

## Task 6: docs + full suite

**Files:** `README.md`, `DESIGN.md`, `CHANGELOG.md`

- [ ] **Step 1:** README — new subsection under the verifier/gates docs: `local` provider, `CADENCE_LOCAL_BASE_URL` (e.g. `http://localhost:11434/v1`), `CADENCE_LOCAL_MODEL` (e.g. `qwen3-coder:30b`), per-gate `model` override, warn+mock fallback when unset. DESIGN.md — provider list + §10 punchlist entry (Phase 30.1). CHANGELOG `[Unreleased] ### Added` — local provider line.
- [ ] **Step 2:** Run full suite: `pnpm turbo run test` → all green (core/types/testkit/host). If the documented `dispatcher.test.ts` parallel-timeout flake recurs, it is unrelated (Phase 29.5 raised its timeout; re-run isolated to confirm).
- [ ] **Step 3: Checkpoint (stage only — NO commit)** — `git add README.md DESIGN.md CHANGELOG.md`; then `node packages/core/bin/cadence.cjs build task T6 --status=DONE --notes "docs + full suite green"`.

---

## Task 7: single feat commit + settle + settle commit (two-commit convention)

**Files:** none new — consolidates Tasks 1–6.

- [ ] **Step 1:** `git status --short` — confirm staged: types/config + tests, all `verify/*` source + tests, 5 factories, README/DESIGN/CHANGELOG. Confirm **nothing under `.cadence/` is staged** (it belongs to the settle commit).
- [ ] **Step 2:** Single feat commit:

```bash
git commit -m "$(cat <<'EOF'
feat(core+types): local LLM provider for all five gates (Phase 30.1)

OpenAI-compatible /v1/chat/completions provider (Ollama et al.) via a
shared localChatJSON client (tolerant JSON + one repair retry) and five
Local<Gate>Verifier classes mirroring the Anthropic ones. Provider enum
gains 'local' on all five gates; factories select it from
CADENCE_LOCAL_BASE_URL/MODEL with warn+mock fallback. Defaults/presets
unchanged — cadence's own loop stays mock.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3:** `node packages/core/bin/cadence.cjs settle run --auto` → expect `Settled 30-01` (coverage gate passes: tests reference AC-1..AC-6 under `packages/**`).
- [ ] **Step 4:** Settle commit:

```bash
git add .cadence/phases/30-local-provider/ .cadence/STATE.md .cadence/state.json
git commit -m "chore: settle Phase 30.1 — local LLM provider"
```

- [ ] **Step 5:** `git log --oneline -3` (verify feat+settle pair) and `node packages/core/bin/cadence.cjs progress` (loop IDLE). Push is **user-gated** — stop and ask.

---

## Done criteria

- `provider: 'local'` accepted on all 5 gates; defaults/presets still `mock` (cadence loop unaffected).
- `localChatJSON`: clean/fenced JSON parse, one repair retry, throw-on-fail naming base URL+model, non-2xx + network reject throw.
- 5 `Local<Gate>Verifier` reuse each gate's existing prompt/schema, preserve the gate's empty-input early-return where its Anthropic sibling has one (per-task: none), stamp `provider:'local'`.
- 5 factories select Local with env / fall back to mock+warn without.
- Full turbo suite green. Docs updated.
- Settled as a CADENCE phase (two-commit). **Then** Phase 29.2 runs on `local` (qwen3-coder:30b, Ollama) per the spec's follow-on.

## Acceptance Criteria (for the cadence DRAFT)

- **AC-1:** `localChatJSON` returns schema-valid data from clean and fence/prose-wrapped model output.
- **AC-2:** Malformed output triggers exactly one repair retry; success returns data, repeat failure throws a clear error.
- **AC-3:** Non-2xx and network-reject both throw an error naming the base URL.
- **AC-4:** Each `Local<Gate>Verifier` maps model output into the gate's result type with `provider:'local'`; it short-circuits empty input with no network call **iff its `Anthropic<Gate>Verifier` does** (faithful mirror — per-task has none).
- **AC-5:** `Local<Gate>Verifier` reuses the gate module's existing system prompt + Zod schema (no duplicated/re-authored prompt or schema).
- **AC-6:** Each `select<Gate>Verifier` returns the Local verifier when `provider:'local'` + env present, else mock with a stderr warning; defaults/presets remain `mock`.
