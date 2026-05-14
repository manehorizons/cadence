---
phase: 19-f4-webhook
id: 19-01
tier: standard
status: APPROVED
---

# 19-01 — External webhook transport (F4)

## Objective

Resolve DESIGN.md F4 by adding a fourth `Notifier` transport — `webhook` — that POSTs the batched anomaly events as JSON to a user-provided HTTP endpoint. Gives the `auto` profile a way to surface anomalies *outside* the terminal session (Slack/Discord incoming webhooks, Zapier/n8n catch hooks, the user's continuity-runtime ingester, etc.) without baking any specific bridge into cadence. Stays a generic primitive — one URL in, JSON body out — no SDK dependencies, no message-format opinions.

## Acceptance Criteria

### AC-1: `'webhook'` transport in schema + `notify.webhook` config block
Given `CadenceConfigZ` and `selectNotifier`
When the config sets `notify.transport: 'webhook'` and provides `notify.webhook: { url: 'https://example.com/hook' }`
Then the schema parses cleanly; `transport: 'webhook'` is accepted alongside the existing `'stderr' | 'file' | 'none'` variants; `notify.webhook` is optional in general but **required** when `transport === 'webhook'` (validated via Zod refinement); `webhook.url` is a `z.string().url()`; `webhook.headers?: Record<string,string>` is optional; `webhook.timeoutMs?: number` is optional with a documented default of 5000 inside the notifier; presets unchanged.

### AC-2: WebhookNotifier POSTs `{ events: AnomalyEvent[] }` JSON
Given `new WebhookNotifier({ url, headers?, timeoutMs? })`
When `.notify(events)` is called with a non-empty array
Then the notifier issues exactly one HTTP `POST` to `url` with `Content-Type: application/json`, body `JSON.stringify({ events })`, and merges any caller-provided `headers` (Content-Type wins on conflict). Uses global `fetch` with `AbortSignal.timeout(timeoutMs ?? 5000)`. Reports `name: 'webhook'`. Empty `events` array is a no-op (zero network traffic).

### AC-3: Transport failures degrade to a stderr warning, settle continues
Given any of the following: network error, non-2xx HTTP response, abort by timeout, malformed URL at runtime
When `.notify(events)` is invoked
Then the notifier catches the failure, writes one line to `process.stderr` formatted `cadence-notify: webhook transport failed — <message> (continuing)\n` (matching `FileNotifier`'s shape), and returns successfully. Settle's outer try/catch already handles thrown notifiers; this AC is about *non-thrown* graceful degradation so the warning carries actionable context. The URL and headers are NOT logged (URL may carry a secret).

### AC-4: `selectNotifier` returns `WebhookNotifier` for `transport: 'webhook'`
Given `config.notify.transport === 'webhook'` with a valid `webhook` block
When `selectNotifier(config)` runs
Then it returns a `WebhookNotifier` instance constructed with the configured `url`, `headers`, and `timeoutMs`. Missing `webhook` block while transport is `'webhook'` is caught at config-parse time (AC-1 refinement), not at runtime. The other three transports remain unchanged.

### AC-5: full suite + docs + dogfood
Given Phase 19.1 lands
When `pnpm turbo run test` runs
Then ~377 tests pass + ~5-7 new webhook-targeted tests. DESIGN.md §3.3 transport list gains the `webhook` row; §6 marks F4 resolved. README "Anomaly notify" section gets a `### Webhook transport` subsection with one config example. AC-1..AC-5 each referenced by ≥1 test file. Self-dogfood: 19.1's own settle runs cleanly (one expected `coverage-bypassed` warn).

## Tasks

### T1: schema — `'webhook'` transport literal + `notify.webhook` block + refinement
- files: `packages/types/src/config.ts`, `packages/types/tests/config.test.ts`
- action: Extend the `transport` enum to `z.enum(['stderr', 'file', 'none', 'webhook'])`. Add `webhook: z.object({ url: z.string().url(), headers: z.record(z.string()).optional(), timeoutMs: z.number().int().positive().optional() }).optional()` to the `notify` block. Wrap the `notify` object in a `.refine()` that asserts: `if transport === 'webhook' then webhook && webhook.url`. Update `defaultConfig` (no `webhook` block — the default transport is `stderr`). Add 4 tests: (a) accepts `'webhook'` transport with a valid webhook block; (b) rejects `'webhook'` transport with no `webhook` block (refinement); (c) rejects non-URL string in `webhook.url`; (d) accepts optional `headers` + `timeoutMs`.
- verify: vitest green on types.
- done: AC-1

### T2: `WebhookNotifier` impl + factory wiring
- files: `packages/core/src/notify/webhook.ts` (new), `packages/core/src/notify/factory.ts`, `packages/core/tests/notify/webhook.test.ts` (new)
- action: New `WebhookNotifier` class implementing `Notifier` (`name: 'webhook'`, `notify(events)`). Constructor: `({ url, headers?, timeoutMs? })`. Body: `JSON.stringify({ events })`; header merge starts with caller's, then overlays `Content-Type: application/json`. Uses global `fetch` with `AbortSignal.timeout(timeoutMs ?? 5000)`. On non-2xx OR thrown: write `cadence-notify: webhook transport failed — <msg> (continuing)\n` to stderr; return resolved. Empty `events` → immediate return. Wire `selectNotifier`: when `config.notify.transport === 'webhook'`, return `new WebhookNotifier({ url: config.notify.webhook!.url, headers: config.notify.webhook!.headers, timeoutMs: config.notify.webhook!.timeoutMs })`. Tests spin up a `node:http` server bound to `127.0.0.1:0` (random port): cover (a) successful POST → body parses to `{events: [...]}`, content-type is `application/json`; (b) custom `Authorization` header passthrough; (c) non-2xx → stderr warn + resolved; (d) timeout → stderr warn + resolved; (e) empty events → no request reached the server; (f) factory returns `WebhookNotifier` instance for `transport: 'webhook'`.
- verify: vitest green on core.
- done: AC-2, AC-3, AC-4

### T3: docs + dogfood + DESIGN F4 resolved
- files: `DESIGN.md`, `README.md`
- action: DESIGN.md §3.3 transport list gains the `webhook` row (POST `{events:[...]}` to `notify.webhook.url`; bring your own bridge). §6 strikes F4 with **Resolved — Phase 19.1.** §10 punchlist gains `Phase 19.1 — F4 webhook transport ✓`. README "## Anomaly notify" section gets `### Webhook transport` with a Slack-style placeholder URL + `timeoutMs` default + Authorization-header example. Verify AC-1..AC-5 are each referenced by ≥1 test file. Self-dogfood: `cadence settle run --auto --allow-missing-coverage` produces a clean SUMMARY (one expected coverage-bypassed warn).
- verify: visual read; full suite green; settle settles.
- done: AC-5

## Boundaries

- DO NOT bundle a specific bridge (Slack SDK, Discord.js, axios). The point is a generic webhook primitive. Slack/Discord support comes for free via their incoming-webhook URLs.
- DO NOT add retries, exponential backoff, or a request queue. Single attempt per event batch; failures fall back to stderr per AC-3. Retry policy belongs behind the user's URL.
- DO NOT add HMAC signing or shared-secret auth in 19.1. If the user wants auth, they pass an `Authorization` header via `notify.webhook.headers`.
- DO NOT change `Notifier.notify(events: AnomalyEvent[])` signature. New transport, same contract.
- DO NOT make webhook the default. Default stays `stderr`. The operator opts in by editing `.cadence/config.json`.
- DO NOT add a CLI flag (`--notify-webhook=...`). Configuration is file-only.
- DO NOT POST when `events.length === 0`. Empty batches are a real case (clean settle) and must not generate network traffic.
- DO NOT log the URL or headers on a failure line — only the error message. The URL itself can be sensitive (Slack incoming-webhook URLs contain a token).
