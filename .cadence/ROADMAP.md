# Roadmap

> Locked direction for **v0.3.0 → v1.0**. Single source of truth for what's left. Each phase below gets its own DRAFT.md under `.cadence/phases/<phase-id>/` when work begins; this file stays at the strategic level.

**Anchor decisions** (set 2026-05-14 in `/superpowers:write-plan` session):

- **v1.0 = feature-complete.** Every gate in DESIGN.md §4.1 fires. The matrix in §4.2 is no longer decorative.
- **Single-host v1.0.** Claude Code only. Codex / Aider / OpenCode are post-v1.0.
- **continuity-runtime stays abstract.** Webhook (Phase 19.1) is the seam. No direct integration.
- **CI-only, no publish automation.** GitHub Actions runs tests on PR. Releases stay hand-cut until v1.x.
- **Cost-tiered milestone breakdown.** v0.4 cheap → v0.5 medium → v0.6 expensive → v0.7 ergonomics → v0.8 CI → v1.0 ceremony.
- **Verifier-agent gates reuse `--deep` shape.** Each new agent gate (code-review, plan-review, security-audit, per-task-verify) gets a `Verifier`-style interface with `mock` + `anthropic` providers. Phase 15 patterns are the template.
- **Manual approve = interactive Y/N.** `cadence draft approve` on strict profile prompts before BUILD transition.
- **Per-task-verify = verifier agent.** Per-task verifier runs on each `cadence build task` outcome (LLM cost; opt-in via gate set).

---

## v0.4.0 — Cheap gates + telemetry truth

**Theme:** Close the no-LLM gaps. Make telemetry mean something. Wire the cheap gates that ship decoratively.

### Phase 23.1 — DRAFT-read mtime gate

**Objective.** DESIGN.md §4.1 lists `draft-read` as a cheap gate; it appears in every cell from `standard × standard` rightward. Today nothing reads the DRAFT.md or records its mtime. Add a state field `state.draftReadAt: ISO8601` recorded when `cadence draft approve` succeeds; `cadence settle run` refuses if the DRAFT.md mtime is newer than `draftReadAt` (the human edited the DRAFT after approving but before settling — read it again). `--allow-stale-draft` bypasses per-invocation.

**Files.**
- `packages/types/src/state.ts` — add `draftReadAt?: string` to `CadenceStateZ`.
- `packages/core/src/cli/commands/draft.ts` — `approve` writes `state.draftReadAt = new Date().toISOString()`.
- `packages/core/src/cli/commands/settle.ts` — gate check + `--allow-stale-draft` flag.
- `packages/core/tests/cli/settle.test.ts` (or new `tests/cli/draft-read-gate.test.ts`).
- DESIGN.md §4.1 — note `draft-read` shipped Phase 23.1.

**ACs.** (1) `draftReadAt` recorded on approve. (2) Settle refuses on mtime-newer-than-draftReadAt. (3) `--allow-stale-draft` bypasses. (4) Gate only fires when `'draft-read' ∈ gateSet.gates`. (5) Backwards-compat: existing state.json without `draftReadAt` treats the gate as never-fired (no refusal).

### Phase 23.2 — coherence-warn anomaly emission

**Objective.** §3.3 enumerates `coherence-warn` as a §3.3 anomaly trigger but `collectAnomalies` doesn't emit one. Wire emission at `cadence draft check` AND `cadence draft approve` per `severity: 'warn'` coherence issue (blockers already refuse; warns flow through). Source field `coherence.check` vs `coherence.approve`.

**Files.**
- `packages/types/src/anomaly.ts` — extend `AnomalyTypeZ` to include `'coherence-warn'`. **Schema breakage acceptable**: legacy log entries are operational state, not durable data.
- `packages/core/src/cli/commands/draft.ts` — emit warn events through `selectNotifier`.
- `packages/core/src/notify/collect.ts` — leave settle-side untouched (no settle-time coherence check today).
- `packages/core/tests/cli/draft-check.test.ts` + `draft-approve.test.ts` — extend with anomaly assertions.
- DESIGN.md §3.3 row for `coherence-warn`.

**ACs.** (1) New `coherence-warn` event type accepted by schema. (2) `draft check` emits one event per warn issue. (3) `draft approve` emits one event per warn issue before transitioning. (4) Gate-aware: `'anomaly-notify' ∉ gateSet.gates` ⇒ no emission. (5) Schema bump documented in CHANGELOG.

### Phase 23.3 — loop-violation anomaly emission

**Objective.** §3.3 enumerates `loop-violation` as an anomaly trigger. `LoopViolationError` is thrown at multiple sites (settle, build/record, draft commands) — none emit. Wire emission in the dispatcher / catch sites with `severity: 'error'`, `source: 'loop'`, `context: { expected, actual }`.

**Files.**
- `packages/types/src/anomaly.ts` — extend `AnomalyTypeZ` to include `'loop-violation'`.
- `packages/core/src/errors.ts` — `LoopViolationError` may grow `expected` + `actual` fields if not already there.
- `packages/core/src/cli/commands/settle.ts` + `build.ts` + `draft.ts` — catch-and-emit at the top-level try/catch where `LoopViolationError` is currently caught.
- New `packages/core/tests/notify/loop-violation.test.ts`.
- DESIGN.md §3.3 row for `loop-violation`.

**ACs.** (1) New `loop-violation` event type accepted by schema. (2) Each catch site emits exactly one event before exiting with code 1. (3) Event carries the `expected` and `actual` loop positions in context. (4) Gate-aware. (5) Existing settle/build/draft refusal exit codes unchanged.

### Phase 23.4 — `skillAudit` wiring + real `tokenUtilization`

**Objective.** `config.telemetry.skillInvocations: true` and `config.telemetry.tokenUtilization: true` both exist as boolean knobs but neither populates anything real. `state.skillAudit.invoked[]` is always empty; `tokenUtilization` increments by `+0.01` per user-prompt event (proxy, not a real signal). Wire both from real signals.

**Files.**
- `packages/types/src/state.ts` — `SkillInvocation` record shape if not already there.
- `packages/core/src/hooks/handlers.ts` — `handleUserPrompt` reads tool invocations from `ctx.raw` and appends to `state.skillAudit.invoked[]` when the tool name matches a known cadence skill set (or a configurable matcher). `tokenUtilization` switches to a heuristic that reads the actual token count from `ctx.raw` if the host provides it (Claude Code does in some hook payloads); falls back to the existing `+0.01` proxy with a one-time stderr note.
- `packages/host-claude-code/src/event-map.ts` — extend `extractPayload` to pull skill-invocation + token-count signals from raw payloads when present.
- `packages/core/tests/hooks/handlers.test.ts` — extend.
- DESIGN.md note: telemetry signals now load-bearing.

**ACs.** (1) `state.skillAudit.invoked` grows with each tool invocation that matches a skill name. (2) `state.skillAudit.required[]` semantics defined (a config-set list of skills the user expects to invoke at least once per session — if missing at SessionStop, emit a `skill-audit-miss` anomaly). Actually, defer the `required` part to a follow-up phase; 23.4 just wires `invoked`. (3) `tokenUtilization` reads real token counts when the host provides them; documents the fallback path. (4) `cadence status --json` exposes the populated `skillAudit.invoked` array. (5) Backwards compatible with state.json files lacking these fields.

---

## v0.5.0 — Medium gates

**Theme:** Confirmation gates and the first verifier-agent rollout on a non-AC dimension (code review).

### Phase 24.1 — Manual approve gate (interactive Y/N)

**Objective.** DESIGN.md §4.1 lists `approve` under medium-cost gates. Today `cadence draft approve` is non-interactive (just transitions state). Wire an interactive Y/N prompt when `'approve' ∈ gateSet.gates` (all strict cells + `standard × standard`+). Reuse the Phase 16 prompter abstraction.

**Files.**
- `packages/core/src/cli/commands/draft.ts` — approve action gains a prompter call when gated. Reuses `StdinPrompter` / `ScriptedPrompter` (Phase 16).
- New: `tests/cli/draft-approve-gate.test.ts` using `CADENCE_PROMPTER_SCRIPT` env-var seam.
- DESIGN.md §4.1 — `approve` shipped Phase 24.1.

**ACs.** (1) `cadence draft approve` prompts `Approve and enter BUILD? [y/n]` when gated. (2) `y` proceeds; `n` exits 1 cleanly with no state change. (3) Optional `--no-approve` bypasses the gate per-invocation. (4) Non-TTY refusal unless `--no-approve` (mirrors Phase 16 walker). (5) Gate-aware: outside the gate set, behavior unchanged.

### Phase 24.2 — Per-task verifier agent

**Objective.** DESIGN.md §4.1 lists `per-task-verify` under medium-cost gates (strict × standard+). Each `cadence build task <id> --status=DONE` outcome runs a per-task verifier on just that task's files. Reuses the `Verifier` interface from Phase 15 with a new `PerTaskVerifier` shape (input = `{task, files, diffSinceLastTask}`; output = `pass | concerns | refuse`). Refuse blocks the DONE recording.

**Files.**
- `packages/core/src/verify/per-task.ts` (new) — `PerTaskVerifier` interface + `MockPerTaskVerifier` + `AnthropicPerTaskVerifier`.
- `packages/types/src/config.ts` — `config.perTaskVerifier.provider: 'mock' | 'anthropic'`.
- `packages/core/src/cli/commands/build.ts` — gate-check before `recordTaskOutcome`.
- New: `tests/verify/per-task.test.ts`.
- DESIGN.md §4.1 — `per-task-verify` shipped Phase 24.2.

**ACs.** (1) `Verifier`-style interface for per-task. (2) `Mock` passes iff `files` non-empty and `diff` non-empty (deterministic). (3) `Anthropic` LLM call with prompt-cached system prompt. (4) Gate-aware. (5) `--allow-per-task-failure` bypass. (6) Failures recorded into PROGRESS.json + emit `per-task-fail` anomaly (new event type — `AnomalyTypeZ` schema bump; document in CHANGELOG).

### Phase 24.3 — code-review verifier agent

**Objective.** DESIGN.md §4.1 lists `code-review` under medium-cost. Strict-profile cells reference it. Runs on settle (or maybe at task close — pick one). Same shape as `--deep` verifier from Phase 15. Output: per-file findings (HIGH / MEDIUM / LOW severity). HIGH findings emit a `code-review-high` anomaly (new `AnomalyTypeZ` member — schema bump; shipped 17.1 schema has six types only). HIGH refuses settle unless `--allow-code-review-failure`.

**Files.**
- `packages/core/src/verify/code-review.ts` (new).
- `packages/core/src/cli/commands/settle.ts` — wire gate.
- `packages/types/src/config.ts` — `config.codeReview.provider`.
- `packages/types/src/summary.ts` — `Summary.codeReview?: Record<file, Finding[]>`.
- New: `tests/verify/code-review.test.ts`.
- DESIGN.md §4.1 — `code-review` shipped Phase 24.3.

**ACs.** (1) `CodeReviewVerifier` interface with mock + anthropic. (2) Mock: passes empty diff; flags any `console.log` left in source (deterministic heuristic). (3) Anthropic: per-file review with Zod-typed findings. (4) HIGH findings emit `code-review-high` anomaly via existing event type. (5) HIGH refuses settle unless `--force` or `--allow-code-review-failure`. (6) Summary records findings.

---

## v0.6.0 — Expensive gates

**Theme:** The strict-profile-only gates that round out the matrix.

### Phase 25.1 — plan-review verifier agent

**Objective.** DESIGN.md §4.1 lists `plan-review` as an expensive gate (strict × complex). Runs at DRAFT time — verifies the proposed plan (DRAFT.md content) is coherent, decomposes the right way, and has the right ACs for the goal. Same shape as `--deep` but input is the DRAFT.md text itself, not the diff.

**Files.**
- `packages/core/src/verify/plan-review.ts` (new).
- `packages/core/src/cli/commands/draft.ts` — gate-check at `draft approve` time (before transition to BUILD).
- `packages/types/src/config.ts` — `config.planReview.provider`.
- New: `tests/verify/plan-review.test.ts`.
- DESIGN.md §4.1 — `plan-review` shipped Phase 25.1.

**ACs.** (1) `PlanReviewVerifier` interface, mock + anthropic. (2) Mock: passes iff `acceptanceCriteria.length >= 1` and every AC has non-empty `given/when/then` (deterministic). (3) Anthropic: holistic review with structured output (severity + findings + suggested-edits). (4) Gate-aware. (5) Refuses approve on `pass=false` unless `--allow-plan-review-failure`.

### Phase 25.2 — security-audit verifier agent

**Objective.** Strict × complex only. Final gate before settle. LLM-driven security pass on the diff. Heavy and expensive — only fires on complex+strict, which is the rarest cell.

**Files.**
- `packages/core/src/verify/security-audit.ts` (new).
- `packages/core/src/cli/commands/settle.ts` — wire gate (after code-review, before SUMMARY write).
- `packages/types/src/config.ts` — `config.securityAudit.provider`.
- `packages/types/src/summary.ts` — `Summary.securityAudit?: Finding[]`.
- New: `tests/verify/security-audit.test.ts`.
- DESIGN.md §4.1 — `security-audit` shipped Phase 25.2.

**ACs.** (1) `SecurityAuditVerifier` interface, mock + anthropic. (2) Mock: scans for hardcoded `Authorization:` headers and JWT-shaped strings; deterministic. (3) Anthropic: full prompt with OWASP awareness. (4) CRITICAL severity refuses settle unless `--allow-security-audit-failure`. (5) Findings recorded into SUMMARY.

---

## v0.7.0 — Operator ergonomics

**Theme:** Friction reduction for new + existing users. No new gates.

### Phase 26.1 — `cadence init` UX polish

**Objective.** Today's `cadence init` writes `.cadence/config.json` + skeleton files. Polish: prompt for project name interactively (if no `--name`), suggest a profile based on git history (lots of commits → standard; bare repo → auto), show a one-screen summary of what was scaffolded, link to README.

**Files.**
- `packages/core/src/cli/commands/init.ts`.
- Refresh `tests/cli/init.test.ts`.
- README — update the "Try it" block to match new flow.

**ACs.** (1) Interactive name prompt when `--name` absent. (2) Profile suggestion heuristic + override. (3) Post-init summary on stdout. (4) Non-TTY skips prompts, defaults applied. (5) Existing tests pass + new TTY-mode test.

### Phase 26.2 — `CLAUDE.md` scaffold

**Objective.** Cadence users running through Claude Code get a `CLAUDE.md` written by `cadence init` (or a separate `cadence init --claude-md` flag) that primes Claude on the project's loop, profile, and where state lives. Reduces orientation-tax per session.

**Files.**
- `packages/core/src/cli/commands/init.ts` — add `--claude-md` flag (or always-write).
- `packages/core/src/init/claude-md-template.ts` (new) — template generator.
- New: `tests/cli/init-claude-md.test.ts`.
- README — note the new file.

**ACs.** (1) `cadence init` (or `--claude-md`) writes a `CLAUDE.md` at repo root. (2) Template names the active profile, points at DESIGN.md, lists key commands. (3) Idempotent: re-init preserves user edits if file has no managed marker. (4) Honored by Claude Code on next session start. (5) Documented in README.

### Phase 26.3 — `status anomalies` polish: `--tail` follow mode

**Objective.** `cadence status anomalies` currently does one-shot read. Add `--tail [--follow]` for live-tailing the NDJSON log as new events arrive. Useful when running `cadence settle` in a background terminal and watching events stream into another.

**Files.**
- `packages/core/src/cli/commands/status.ts` — extend the `anomalies` subcommand.
- New: `tests/cli/status-anomalies-tail.test.ts`.
- README — extend the reader section.

**ACs.** (1) `--tail` prints the last N (default 20). (2) `--follow` keeps the file open and streams new events. (3) Ctrl-C exits cleanly. (4) Combines with `--type` filter. (5) Non-TTY falls back to non-follow mode.

---

## v0.8.0 — CI

### Phase 27.1 — GitHub Actions tests-on-PR

**Objective.** `.github/workflows/ci.yml` runs `pnpm install && pnpm turbo run lint typecheck test build` on every PR + push to main. Matrix: Node 20 + Node 22. No publish automation.

**Files.**
- `.github/workflows/ci.yml` (new).
- Possibly `.github/dependabot.yml` for dep hygiene.
- README — add a CI badge.

**ACs.** (1) CI runs on PR + push to main. (2) Matrix Node 20 + 22. (3) Tests + lint + typecheck + build all green. (4) Failed CI blocks merge (branch protection — manual GitHub setup, documented). (5) README badge.

---

## v1.0.0 — Release ceremony

### Phase 28.1 — Cut v1.0.0

**Objective.** Final release. All §4.1 gates ship. CHANGELOG updated with the v0.4–v0.8 spread. README v1.0 banner. Tag created locally, push gated on user.

**Files.**
- `packages/{core,types,testkit,host-claude-code}/package.json` — `0.8.0` → `1.0.0`.
- `CHANGELOG.md` — `[1.0.0] - YYYY-MM-DD` entry.
- README — banner refresh.
- DESIGN.md §10 — tick `Phase 28.1 — v1.0.0 release`.

**ACs.** (1) All four packages at `1.0.0`. (2) CHANGELOG fully populated. (3) Annotated tag `v1.0.0` created locally. (4) Push gated on user approval. (5) Full suite green.

---

## Open questions (resolve when each phase starts)

- **23.1** — Should `draftReadAt` also be bumped by `cadence draft check`? (Probably not — check is read-only.)
- **23.4** — `state.skillAudit.required[]` semantics: who populates it? Config? Per-phase frontmatter? Defer to a follow-up phase if the answer isn't obvious at 23.4-DRAFT time.
- **24.2** — Should `per-task-verify` fire at `--status=DONE` only, or also at `BLOCKED` / `NEEDS_CONTEXT`? (Probably DONE only — others are explicit human escalations.)
- **24.3** — Code review runs at settle or per-task close? (Plan says settle; revisit if per-task gives better feedback loop.)
- **25.1** — `plan-review` at `draft new` (before approve) or at `draft approve` (gates BUILD entry)? (Plan says approve-time; consider draft-new for stricter profiles.)
- **25.2** — Security-audit triggers on every settle, or only on strict×complex per matrix? (Per matrix — keep it expensive-by-default.)
- **26.2** — CLAUDE.md content: should it embed `cadence status` output as a section the agent re-reads each session? Or just a static project blurb? (Brainstorm at phase start.)
