---
phase: 25-security-audit
id: 25-02
tier: standard
status: PENDING
---

# 25-02 — security-audit verifier agent

## Objective

Wire a `SecurityAuditVerifier` gate at `cadence settle run` (after code-review, before SUMMARY write): when `'security-audit'` is in the effective gate set (strict×complex only), run an LLM-driven security pass on the phase diff and record `Finding[]` into `SUMMARY.securityAudit`; CRITICAL findings refuse settle unless `--force` / `--allow-security-audit-failure`.

## Acceptance Criteria

### AC-1: Verifier interface + mock + anthropic + factory
Given the codebase under `packages/core/src/verify/`
When the consumer imports from `verify/security-audit.ts`
Then it sees `SecurityAuditVerifier` (`name`, `verify(input: SecurityAuditInput): Promise<SecurityAuditResult>`), `SecurityAuditInput = { files: string[], diff: string }`, `SecurityAuditResult = { findings: Finding[], provider: string, model?: string }` (flat array, reuses `@cadence/types` `Finding`), `MockSecurityAuditVerifier`, `AnthropicSecurityAuditVerifier`, and `selectSecurityAuditVerifier(cfg, opts)` factory (mock fallback on missing API key with stderr warn)

### AC-2: Mock provider — deterministic secret heuristic
Given `MockSecurityAuditVerifier` with an input
When a `+` added line in the diff contains a hardcoded `Authorization:` header value OR a JWT-shaped string (`eyJ` + two further dot-separated base64url segments)
Then one `{ severity: 'critical', message }` finding is emitted per match (`'hardcoded Authorization header'` / `'hardcoded JWT-shaped credential'`), with `line` set from the hunk post-image counter; empty diff or no matches → empty findings; no other heuristics (deterministic floor only)

### AC-3: Anthropic provider — OWASP-aware Zod-typed audit
Given `AnthropicSecurityAuditVerifier` and `ANTHROPIC_API_KEY`
When `verify()` runs
Then it calls `messages.parse` once with a `cache_control: 'ephemeral'` OWASP-aware system prompt, Zod schema `{ findings: { severity: critical|high|medium|low, message, line? }[] }`, default model `claude-sonnet-4-6`; null parsed_output throws; `Anthropic.APIError` re-thrown wrapped; provider+model stamped into result; empty files+diff returns no findings without an API call

### AC-4: Gate-aware settle wiring + CRITICAL refuse
Given `effectiveGateSet(...).gates.includes('security-audit')` is true
When the user runs `cadence settle run --auto`
Then after the code-review gate and before SUMMARY assembly the verifier runs against `git diff HEAD -- <files>` for the union of touched files; on any CRITICAL finding the command exits 1 with stderr listing each (`security-audit: <line>? critical — <message>`) and a guidance line referencing `--allow-security-audit-failure` / `--force`, and NO SUMMARY is written; on zero CRITICAL findings settle proceeds; gate skipped when `'security-audit'` not in gateSet

### AC-5: `--allow-security-audit-failure` / `--force` bypass + SUMMARY shape
Given the gate produced CRITICAL findings
When the user re-runs with `--allow-security-audit-failure` OR `--force`
Then settle proceeds, a stderr trace `security-audit: <flag> set; proceeding past N CRITICAL finding(s)` is emitted, and `SUMMARY.securityAudit` records ALL findings (any severity) unchanged whenever the gate ran (pass or bypassed)

## Tasks

### T1: SecurityAuditVerifier + mock + anthropic + factory
- files: `packages/core/src/verify/security-audit.ts`, `packages/core/src/verify/security-audit-factory.ts`
- action: Define `SecurityAuditVerifier`, `SecurityAuditInput = { files: string[], diff: string }`, `SecurityAuditResult = { findings: Finding[], provider: string, model?: string }` (import `Finding` from `@cadence/types`). `MockSecurityAuditVerifier` walks the unified diff (same `+++ b/<file>` / `@@` post-line tracking as `MockCodeReviewVerifier`), emits `severity: 'critical'` findings for added lines matching an `Authorization:` header value regex or a JWT regex `eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`. `AnthropicSecurityAuditVerifier` mirrors `AnthropicCodeReviewVerifier` shape: injected `client`, prompt-cached OWASP system prompt, Zod schema `{ findings: { severity, message, line? }[] }`, default `claude-sonnet-4-6`, `DEFAULT_MAX_TOKENS = 8000`, empty files+diff short-circuits. `selectSecurityAuditVerifier` mirrors `selectCodeReviewVerifier` (mock fallback + stderr warn).
- verify: unit tests on mock (no diff / Authorization header / JWT string / multi-line) + anthropic (injected client canned / null throws / API error wrapped / empty short-circuit) + factory branches.
- done: AC-1, AC-2, AC-3

### T2: Schema bumps — Finding severity + config + Summary
- files: `packages/types/src/summary.ts`, `packages/types/src/config.ts`
- action: Extend `FindingZ.severity` enum to `['critical','high','medium','low']` (additive; code-review keeps emitting high/medium/low). Add `securityAudit: z.object({ provider: z.enum(['mock','anthropic']).default('mock'), model: z.string().optional() }).default({ provider: 'mock' })` to `CadenceConfigZ` (mirror `codeReview` + doc comment citing Phase 25.2 / strict×complex / `settle run`). Add `securityAudit: z.array(FindingZ).optional()` to `SummaryZ`. Add `securityAudit: { provider: 'mock' as const }` to `defaultConfig`.
- verify: existing config/summary/anomaly tests stay green; `defaultConfig` typechecks.
- done: AC-1, AC-5

### T3: settle.ts gate wiring + --allow-security-audit-failure
- files: `packages/core/src/cli/commands/settle.ts`
- action: Add `.option('--allow-security-audit-failure', '...')` + opts field. After the Phase 24.3 code-review block and before the AC-derivation / SUMMARY assembly, gate-check `gateSet.gates.includes('security-audit')`. When fired: reuse `collectDiffForCodeReview(cwd, touched)` for the union of touched files, call `selectSecurityAuditVerifier(cadenceConfig).verify({ files, diff })`, capture `securityAuditFindings`. Count `critical`. On CRITICAL > 0 AND neither `--force` nor `--allow-security-audit-failure`: stderr per CRITICAL (`security-audit: <line>? critical — <message>`) + guidance line + exit 1 + return BEFORE SUMMARY write. On CRITICAL > 0 WITH bypass: stderr trace `security-audit: <flag> set; proceeding past N CRITICAL finding(s)`. On CRITICAL === 0: silent. Always attach `securityAudit` to the SUMMARY object (`...(securityAuditFindings ? { securityAudit: securityAuditFindings } : {})`) when the gate ran. Verifier exceptions: stderr `security-audit: verifier failed — <msg>` and refuse unless bypass (mirror code-review catch).
- verify: new tests/cli/settle-security-audit.test.ts.
- done: AC-4, AC-5

### T4: Tests
- files: `packages/core/tests/verify/security-audit.test.ts`, `packages/core/tests/cli/settle-security-audit.test.ts`
- action: Unit tests for `MockSecurityAuditVerifier` (clean diff → none; added `Authorization: Bearer` line → critical; added `eyJ...` JWT → critical; multi-file attribution + line numbers) + `AnthropicSecurityAuditVerifier` (injected client returns canned findings / null throws / API error wrapped / empty files+diff no API call) + `selectSecurityAuditVerifier` (default mock / anthropic w/ key / anthropic w/o key → mock+warn / override). CLI integration via spawned-CLI + real git workdir + `initGitRepo` helper (mirror settle-code-review.test.ts), `{ timeout: 30_000 }` describe: strict profile + tier=complex DRAFT with ≥6 tasks; (a) JWT-in-diff → `settle run` refuses exit 1 with `security-audit:` stderr, no SUMMARY.json; (b) `--allow-security-audit-failure` proceeds + SUMMARY.securityAudit populated; (c) clean diff settles, SUMMARY.securityAudit === []; (d) auto profile (gate not in set) → SUMMARY.securityAudit undefined. Use `--no-approve` + seed AC coverage as in settle-code-review.test.ts.
- verify: `pnpm --filter @cadence/core test` green.
- done: AC-1, AC-2, AC-3, AC-4, AC-5

### T5: Docs + punchlist tick
- files: `DESIGN.md`, `CHANGELOG.md`, `README.md`
- action: DESIGN §4.1 — note `security-audit` shipped Phase 25.2 (and mark v0.6.0 expensive-gate milestone closed). DESIGN §10 punchlist — add ticked 25.2 line. CHANGELOG `[Unreleased]` Added entry (gate) + Changed entry (FindingZ severity + config + Summary schema bumps). README — new "Security-audit verifier" subsection under Verification.
- verify: `pnpm turbo run typecheck test build` green.
- done: AC-1, AC-4

## Boundaries

- DO NOT widen `MockSecurityAuditVerifier` past the Authorization-header / JWT heuristics — holistic OWASP judgment belongs to the Anthropic provider; mock is a deterministic floor.
- DO NOT compute diff via a JS git reimplementation — reuse `collectDiffForCodeReview` (`execSync git diff`).
- DO NOT add an `AnomalyType` member — strict×complex carries no `anomaly-notify` gate, so emission would be dead code.
- DO NOT block on high/medium/low security findings — only CRITICAL gates the settle; lower severities still recorded in SUMMARY.
- DO NOT introduce real network calls in tests — the Anthropic provider test must use an injected mock `client`.
- DO NOT write SUMMARY before the security-audit refuse check — a refused settle must leave no SUMMARY.json and `loopPosition=BUILD`.
