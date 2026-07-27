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
- **23.4** — ✓ **RESOLVED (Phase 34.1):** `required[]` = DRAFT frontmatter `requiredSkills` ∪ `config.skillAudit.required`, enforced at `settle run` (declaration = opt-in; unconditional `skill-audit-miss` anomaly; `--allow-skill-audit-miss` bypass). 23.4's AC-2 SessionStop-anomaly idea superseded by the settle-time check.
- **24.2** — Should `per-task-verify` fire at `--status=DONE` only, or also at `BLOCKED` / `NEEDS_CONTEXT`? (Probably DONE only — others are explicit human escalations.)
- **24.3** — Code review runs at settle or per-task close? (Plan says settle; revisit if per-task gives better feedback loop.)
- **25.1** — `plan-review` at `draft new` (before approve) or at `draft approve` (gates BUILD entry)? (Plan says approve-time; consider draft-new for stricter profiles.)
- **25.2** — Security-audit triggers on every settle, or only on strict×complex per matrix? (Per matrix — keep it expensive-by-default.)
- **26.2** — CLAUDE.md content: should it embed `cadence status` output as a section the agent re-reads each session? Or just a static project blurb? (Brainstorm at phase start.)
- **29.1** — Foreign project: **RESOLVED — `~/Documents/Projects/continuity-runtime`** (temporarily abandoned, usable as a test target). Real 75-commit history not shaped for cadence; **npm single-package** (`package-lock.json`, `src/`+`tests/`, no `packages/`) so the default `testGlobs=packages/**/*.test.ts(x)` *should* miss its tests — the highest-value pre-publish finding. biome (≠ cadence eslint), vitest, TypeScript; clean tree, no `.cadence/`. **Two caveats to carry into 29.1-DRAFT:** (a) pre-existing `.claude/` + `.planning/` — `.planning/` is harmless GSD residue, but `.claude/` means host-install must *merge into* a non-empty `.claude/settings.json` (in-scope whether wanted or not — and a realistic user condition). (b) Same TS+vitest family → stresses layout/tooling foreignness, **not** language foreignness; "are gates JS-tuned" stays an explicit out-of-scope boundary (documented, or a later phase).
- **29.2** — `anthropic` providers cost real API spend per run. Cap to one strict×complex phase, or sweep every anthropic gate at least once? (Plan: one representative phase that trips all five gates; widen only if findings warrant.)
- **30.1** — changesets vs hand-rolled release workflow; public npm vs private registry; npm provenance on/off. (Brainstorm at 30.1-DRAFT — this is the irreversible-once-published decision.)

---

## Process decision — stay on the CADENCE loop, do not migrate to GSD (2026-05-15)

**Decided:** development process stays on the dogfooded CADENCE `DRAFT → BUILD → SETTLE` loop with `.cadence/` as the single system of record. We will **not** move the meta-process onto GSD (`.planning/`, `gsd-*` skills). Settled — do not re-litigate without a material change in the reasons below.

**Why:**
1. **Dogfooding is the validation strategy, not a habit.** v1.1's entire thesis is that CADENCE needs more real-loop miles. Running phases through GSD instead would zero out the very coverage this milestone exists to add — self-undermining.
2. **Two planning systems = split brain.** ROADMAP/state live in `.cadence/`; GSD wants its own `.planning/` roadmap + state machine. No clean "GSD owns process, CADENCE owns code" seam — both *are* the process. Dual systems mean drift + import/conflict tax.
3. **Process maturity already present.** Two-commit-per-phase, annotated milestone tags, conventions doc, handoffs, green dogfood loop. GSD's heavy machinery (research / plan-check / verify subagents, parallel waves, convergence) solves problems a solo, well-scoped, full-context project does not have.

**Escape hatch (the only sanctioned GSD/superpowers use):** borrow individual skills as point tools at irreversible / high-ambiguity junctures only — system of record stays `.cadence/`. Pre-approved:
- `brainstorming` / `grill-me` before **Phase 30.1** (publish is irreversible — Open question 30.1 already flags it).
- `grill-with-docs` to pressure-test the **Phase 29.1** foreign-project pick.

Revisit only if: a second host returns (multi-host coordination), the team grows past solo, or a phase genuinely needs parallel-wave execution the CADENCE loop can't express.

---

## v1.1.0 — Battle-test shakedown + publish pipeline

**Status:** v0.4 → v1.0 fully shipped (Phases 13–28.1), tagged through `v1.0.0`, pushed. Loop IDLE. v1.1 thesis: **CADENCE has only ever run its own happy path (`auto × standard`, `mock` providers, one host, one OS, one project — itself). Self-dogfood validated the spine; it cannot validate "works because the project IS cadence."** Phases 29.x close the validation gap; 30.1 ships publish — and is **gated on 29.4** so we never publish an untested loop. Server-side CI enforcement, the backlog parking lot, and the deferred open questions (23.1 / 23.4 / 24.3 / 26.2) move to **v1.2+** to keep this milestone tight. (23.4 resolved — Phase 34.1; see v1.2 feature-expansion.)

### Phase 29.1 — Real-project shakedown (foreign repo)

**Objective.** Run CADENCE end-to-end on a **non-cadence** project. `cadence init` a real codebase (greenfield or small existing project with ≥1 real feature), then drive ≥2 real phases through `DRAFT → BUILD → SETTLE` at the default `auto × standard`. Goal is the blind-spot catch: assumptions that only hold because the dogfood target is cadence itself (path layout, monorepo shape, test-glob defaults, git-history heuristics in `init`).

**Files.**
- `.cadence/shakedown/29-01-FOREIGN.md` (new) — the foreign project chosen, commands run, every friction point / bug / surprising default, verbatim error text.
- No `packages/**` changes in this phase — observation only; fixes land in 29.4.

**ACs.** (1) A non-cadence project initialized via `cadence init` (record the `--gate-profile` suggestion vs. what was correct). (2) ≥2 phases taken full-loop to a written SUMMARY on that project. (3) Friction log captures every deviation from documented behavior with verbatim output. (4) Each finding tagged `bug | docs | ux | works-as-designed`.

---

### Phase 29.2 — Expensive-gate live exercise (strict×complex, `anthropic` providers)

**Objective.** Exercise the matrix surface that has **never run through a real loop** — only unit tests (handoff convention: 25.x gates tested, not dogfooded). Run ≥1 phase at `strict × complex` with `verifier/codeReview/perTaskVerifier/planReview/securityAudit` provider = `anthropic` and a live `ANTHROPIC_API_KEY`, so plan-review (`draft approve`), per-task-verify, code-review, deep verifier, and security-audit (`settle run`) all fire against real input.

**Files.**
- `.cadence/shakedown/29-02-EXPENSIVE.md` (new) — per-gate: did it fire, real verdict, false-positive/negative assessment, latency, rough token cost.
- Config diffs (provider/profile) recorded in the report; no committed config flip (the dogfood loop must stay `auto × standard` per handoff convention — use a scratch config or env override).

**ACs.** (1) One phase reaches BUILD through a live `anthropic` plan-review at `draft approve`. (2) per-task-verify + code-review + deep verifier produce real (non-mock) verdicts on real diff. (3) security-audit runs on a real `git diff` at settle. (4) Each gate's real-world precision assessed (false positive / false negative / sane) with the model's actual output quoted. (5) `--allow-*-failure` and `--force` bypasses confirmed to behave as documented when a real gate refuses.

---

### Phase 29.3 — Interactive / approve TTY exercise

**Objective.** The manual `approve` prompt and `--interactive` AC walker are only ever driven by `CADENCE_PROMPTER_SCRIPT` in tests — never a real TTY. Exercise both interactively by a human and confirm the non-TTY refusal paths (CI, piped stdin) match the README.

**Files.**
- `.cadence/shakedown/29-03-TTY.md` (new) — transcript notes: prompt clarity, retry behavior, the `n`/empty/3-retry refusal, `--no-approve`/`--no-interactive` bypass, non-TTY stderr message wording.

**ACs.** (1) `draft approve` y/n prompt driven on a real TTY incl. the refuse-and-leave-state-untouched path. (2) `settle run --interactive` walked per-AC on a real TTY with pass/fail/skip + note. (3) Non-TTY refusal verified for both gates (clear stderr, exit 1). (4) Any wording/UX friction logged for 29.4.

---

### Phase 29.4 — Shakedown remediation

**Objective.** Fold every `bug`/`docs`/`ux` finding from 29.1–29.3 into real fixes. This is the gate before publish: if the shakedown found nothing, that itself is the (verified) result. `works-as-designed` items are closed with a one-line rationale, not changed.

**Files.**
- `packages/**` — fixes per finding (scoped by the reports).
- `README.md` / `DESIGN.md` — doc corrections for any behavior the shakedown proved misdocumented.
- `.cadence/shakedown/29-04-REMEDIATION.md` (new) — finding → disposition (fixed-commit / doc-fixed / wontfix-rationale) table.

**Depends on.** 29.1, 29.2, 29.3.

**ACs.** (1) Every `bug` finding either fixed (with test) or explicitly deferred to v1.2 with rationale. (2) Every `docs` finding corrected in README/DESIGN. (3) Remediation table maps each finding to disposition. (4) Full suite green after fixes. (5) No open `bug`-tagged finding remains undispositioned.

---

## v1.1.0 — Publish pipeline

### Phase 30.1 — Publish pipeline

**Status: ✓ Delivered v1.1 via the reversible proof path** (dogfood phase `33-publish-pipeline`/`33-01`). Metadata hardened on the 3 publishable packages (`@cadence/testkit` → `private`, dev-only); `scripts/publish-proof.mjs` proves real `pnpm publish` → clean-install → no `workspace:` leak → both bins run against an ephemeral local verdaccio with Windows-safe teardown; public `pnpm publish --dry-run` + `npm pack` confirm the public shape (tarballs = dist/bin/package.json/LICENSE/README only). ACs 1–6 met **by the reversible variant** (AC-6's "scoped-test publish … private registry" path). The irreversible remainder — real public publish, provenance, `release.yml`, changesets — is the **v1.2 "Public release"** milestone below. Spec/plan: `docs/superpowers/{specs,plans}/2026-05-16-publish-pipeline*`.

**Objective.** Real release automation — the deliberate Phase 28.1 boundary. changesets (or hand-rolled), a release workflow, npm provenance, public-npm vs private-registry decision. **Must include a dry-run publish** of all four packages and verify the published tarball contents (no source leak, correct `files`/`exports`, `bin` resolves).

**Files.**
- `.changeset/` + `.github/workflows/release.yml` (new), or equivalent hand-rolled release script.
- `packages/{core,types,testkit,host-claude-code}/package.json` — `files`, `exports`, `bin`, `publishConfig`, `repository`, `provenance` as needed.
- README — install line switches from local-dogfood to published `npx @cadence/core`.
- `DESIGN.md` — publish-pipeline section.

**Depends on.** 29.4 (do not publish an unvalidated loop).

**ACs.** (1) `pnpm -r publish --dry-run` (or changesets equivalent) succeeds for all four packages. (2) Tarball inspected: no stray source/test/`.cadence` files, `bin` resolves from a clean install. (3) Release workflow gated on green CI (`needs: ci-success`). (4) Registry target (public npm vs private) decided and documented. (5) Provenance decision documented. (6) A real or scoped-test publish proves the path (revocable: `npm unpublish`/dist-tag, or a private registry).

---

## Deferred to v1.2+ (not in v1.1 scope)

- **Server-side CI enforcement.** The repo is now **public** and a server-side `ci-success` required check is active (a push to `main` reported it as *expected*, though still admin-bypassable). Remaining: fully require it (no bypass) and retire the client-side `.githooks/pre-push` hook — or keep the hook as belt-and-suspenders. (History: while private on GitHub Free, only the client-side hook gated `main`.)
- **Backlog parking lot.** No `.cadence/` backlog file exists; stand one up (`gsd-add-backlog`-style) so ideas have a home.
- **Deferred open questions.** 23.1, 24.3, 26.2 — real product decisions, a phase each when picked up. (24.2 may be folded in if 29.2/29.3 surface it.) (23.4 resolved — Phase 34.1.)
- **Test infra.** ✓ **Pulled forward into v1.1 — delivered as Phase 32.1** (shared `vitest.shared.ts` base: `testTimeout`/`hookTimeout`/`maxForks`; `tempRepo` rmdir retry; 29.5/30.2 per-test band-aids reverted). The deferral boundary was deliberately broken: the flake was costing a blocking pre-push failure + a remediation phase roughly every push (3rd recurrence at Phase 31.1).
- **Intelligence module internal seams** (architecture review 2026-05-25 candidate #6 — *speculative, monitor*). Today: 16+ files, 2,971 LoC under `packages/core/src/intelligence/`, no internal seams. Future seams (when pain arrives): `ledger` (read/write/id-gen/supersede) · `render` (markdown spine + per-kind shapes) · `scan/recommend` (read-only views) · `cli surface` — three internal modules, one external interface. **Trigger condition (do NOT refactor speculatively):** the first time a markdown-render change requires editing ≥4 files in `intelligence/`. Until then, leave alone.

---

## v1.4.0 — Public release (DELIVERED 2026-06-02)

**Status:** **closed 2026-06-02** via phase `45-public-release` (DRAFT 45-01). The first publish happened out of band on 2026-05-30 (repo public + npm `1.1.1`); the version-hygiene remainder is now done. **Renumbered from v1.2.0 on 2026-05-25** to sit *after* the architecture-deepening milestone (v1.3.0). See MILESTONES.md for the full delivered checklist.

**Delivered.**
- ✓ **Public-npm publish** of `@manehorizons/cadence-{core,types,host-claude-code}@1.4.0` (2026-06-02, via `release.yml` CI). testkit stays private.
- ✓ **Version hygiene** — `1.1.1 → 1.4.0` (first published version matching `main`); annotated git tag `v1.4.0` at the published commit (`fbbcf91`). Earlier `1.1.1` left as-is (fix-forward).
- ✓ **npm provenance** — `--provenance` via OIDC in `release.yml`; `slsa.dev/provenance/v1` attestation confirmed on npm.
- ✓ **changesets** adopted (`@changesets/cli` + `.changeset/config.json`, access public, testkit ignored) for future releases.
- ✓ **`@manehorizons/cadence-testkit`** re-decided: stays `private`.
- Note: zod `^3 → ^4` shipped as a public-API-affecting dep change, documented in CHANGELOG `[1.4.0]`.

**Depended on.** Phase 30.1 (reversible proof) + the repo-visibility decision (resolved — repo public).

---

## v1.5.0 — Multi-host (deferred, named)

**Status:** named & scoped, NOT started. Added 2026-05-30. Sequenced **after** v1.4 Public release — going public is what surfaces real demand for a second host (which tool, from actual users), and a published host-agnostic CLI + a documented adapter contract is the thing third parties build against. Additive (engine unchanged) → minor bump, consistent with DESIGN's "multi-host is a v1.x/v2 concern."

**Reverses, deliberately, the Phase 11 archive (D5 / D9 / F3).** v1 collapsed dual-host as premature (YAGNI) — `packages/host-codex/` removed from main, the `HostCapabilities` abstraction folded back into Claude-Code-specific code, prior state preserved at the `keel-codex-archive` tag. This milestone is the "re-add later as a fresh phase if needed" escape hatch that decision left open, opened **only now that the single-host loop is solid and the engine is proven in public use**. The host-agnostic-engine anchor is **not** inverted: adapters keep translating a host's lifecycle into the abstract events the core dispatcher already speaks (`packages/host-claude-code/src/event-map.ts` — `SessionStart→session-start`, `PreToolUse→pre-tool-edit`, …); the engine stays host-unaware.

**Scope.**
- **Re-introduce a host-adapter contract** — the leaner successor to the collapsed `HostCapabilities`, derived from what `host-claude-code` *actually* needs (event map + payload extraction + install/shim/locate-self), not speculative capability flags. Prior art lives at the `keel-codex-archive` tag.
- **First second adapter** — a new `@cadence/host-<tool>` package mirroring `host-claude-code` (lifecycle → abstract events + an installer). **Target chosen by post-public user pull** (Codex / Gemini / Aider / OpenCode — do not pick speculatively).
- **Generalize the testkit mock host** so adapter tests don't hard-code Claude Code semantics.
- **"Write your own adapter" doc** — publish the abstract-event contract + a worked example so third parties can add hosts without core changes.

**Depends on.** v1.4 (public release) + a concrete second-host demand signal. **Activation gate:** do NOT start speculatively. The original anti-goal ("no multi-host complexity before single-host is solid") is now satisfied; the remaining guard is "no second adapter without a real user for it." Pick the first target tool from actual post-publish demand, then scope it into phases.

---

## v1.2.0 — Feature expansion (superpowers-inspired)

Source: `docs/superpowers/2026-05-16-cadence-expansion-survey.md` (full weighing of 6 candidates). CADENCE ships DRAFT→BUILD→SETTLE; this milestone closes the gap toward the full idea→shipped arc that superpowers covers manually today.

- **#6 Required-skill enforcement** — ✓ **delivered Phase 34.1** (closes open-question 23.4).
- **#2 Review-convergence loop primitive** — ✓ **delivered Phase 35.1** (pure `nextConvergence`; `plan-review`@approve bounded with sidecar attempts + escalation; reused by #4).
- **#1 brainstorm→spec stage** — ✓ **delivered Phase 36.1** (SPEC loop position + `cadence spec new/check/approve`; convergent spec-review reuses #2's `nextConvergence`; host-agnostic scaffold+validate). **SPEC→DRAFT content auto-seed delivered as #1b (Phase 38.1).**
- **#4 Code-review convergence at settle** — ✓ **delivered Phase 37.1** (Phase 24.3 code-review@settle wrapped in the Phase 35.1 `nextConvergence`; `<id>-CODE-REVIEW.json` attempts + escalation; `--force`/`--allow-code-review-failure` contract preserved; the third `nextConvergence` attach-point).
- **#1b SPEC→DRAFT auto-seed** — ✓ **delivered Phase 38.1** (`draft new` reads the sibling same-id `APPROVED` SPEC → pre-fills DRAFT Objective + ACs via pure `renderDraftBody`; additive `AcceptanceCriterionZ.name`; byte-identical legacy fallback). Closes #1 fully.
- **#3 `cadence build --subagent` / #5 `cadence research` stage — PARKED.** Both invert the host-agnostic-engine anchor (cadence is driven *by* an agent; it is not an agent/research orchestrator). Revisit ONLY if that anchor is reconsidered.

Sequence: #6 ✓ → #2 ✓ → #1 ✓ → #4 ✓ → #1b ✓ ; #3/#5 parked (host-agnostic-anchor conflict). v1.2 feature-expansion COMPLETE — no non-parked work remains.

---

## v1.3.0 — Architecture deepening

**Theme:** Interface tightening. Pull policy out of CLI commands into reusable deep modules; collapse adapter farms into one generic factory; close half-leaking seams. No new user-facing features.

**Source.** `/tmp/architecture-review-20260525-103233.html` — 6-candidate review run against the `praxis-intelligence-ledger` branch on 2026-05-25 using the `improve-codebase-architecture` skill. Top recommendation: candidate #2 (lift the gate engine out of CLI commands) — it unlocks #3 and #5 "almost for free." Candidate #6 (intelligence/ internal seams) is **parked** in the Deferred section above with an explicit trigger condition.

**Anchor decisions** (set 2026-05-25):
- v1.3 sits **before** v1.4 Public release — tighten interfaces before they harden in the public API surface.
- **Sequencing:** Phase 39.x (gate extraction) first; 40.1 / 41.1 / 42.1 independent; 43.1 last (depends on the gate-module pattern from 39.x).
- **Deletion-test discipline.** Every phase passes: delete the command/handler that triggered the gate, and the gate logic is still discoverable + reusable from the new module.
- **Bit-identical contract.** No phase changes user-visible behavior. Golden transcripts / snapshot tests anchor each extraction.

**Pressure-test revisions** (set 2026-05-29 — code-grounded review of the roadmap against `gates/engine.ts`, `settle.ts`, the `Gate` enum in `packages/types/src/profile.ts`, and the verify/notify dirs):
- **Registry endgame, hybrid-sequenced.** `gates/engine.ts` already computes the ordered `effectiveGateSet().gates: Gate[]`, and `settle.ts` already guards each inline block with `gateSet.gates.includes(<gate>)` — the engine's gate set is *already partially load-bearing*. 39.x extracts gates as hand-wired `runXGate(ctx)` calls (low blast radius), but **39.1 designs a registry-ready, uniform `GateImpl(ctx) => Promise<GateResult>` shape**. A new **Phase 44.1** then converts the hand-wired calls into an engine-driven `Record<Gate, GateImpl>` registry that `settle` drives by iterating `effectiveGateSet().gates`. This makes `gatesFor` load-bearing (one source of truth for which gates fire *and* in what order) instead of advisory. Consistent with 40.1/42.1's consolidate-the-duplication philosophy, deferred so the per-phase extractions stay mechanical.
- **Total registry over the `Gate` enum.** The enum has 13 members; the original roadmap extracted only 9 and left `structural-verifier`, `build-test-must-pass`, `draft-read`, `anomaly-notify` inline. **Phase 39.2** (freed up — deep-verify moved into 39.1) extracts the first three as discrete gate impls so the registry is *total*. **`anomaly-notify` is the deliberate exception** — it is not a discrete gate but a cross-cutting emission toggle threaded through other gates' blocks (`settle.ts:517,541,734`, plus `build.ts`, `hooks/handlers.ts`); it stays a `ctx.shouldNotify` flag the other impls consult, **not** a registry entry. Net registry = 12 discrete impls + 1 modifier flag.
- **Non-gates move out of `gates/`.** `skill-audit` (39.6) and `boundary` (43.1) are **not** in the `Gate` enum — they are anomaly checks, not profile×tier gates. They relocate to a new **`packages/core/src/checks/`** namespace and stay *outside* the registry. Keeps `gates/` coherent: one decision engine + 12 enum-gate impls.
- **Ports decouple the consolidations.** Gates depend on injected collaborators carried by `SettleContext` — a **verifier port** (already implied by 39.2) and an **emit port** (`ctx.emitUnconverged`). 39.4/39.7 wire to the emit *port*, so 40.1 (verifier factory) and 42.1 (emit spine) consolidate *behind* the ports — invisible to the gates. This makes "40.1/41.1/42.1 independent" actually true and removes the 42.1-vs-39.4/39.7 double-touch churn.
- **De-risk 39.1.** 39.1 extracts **two** gates (coverage **and** deep-verify) to validate the `SettleContext`/`GateResult`/`GateImpl` shape against real variety before six more phases commit to it.
- **Estimate corrections.** `draft.ts` is **506 LoC** (roadmap said 456). 41.1's "~23 call sites" is closer to **~13 `renderStateMd` references across ~7 files**, and the interface is named **`StateBackend`** (not `Backend`). ACs updated to real numbers below.

### Phase 39.1 — Lift the coverage + deep-verify gates out of settle.ts (shape-defining phase)

**Objective.** Pull **two** inline gates from `cli/commands/settle.ts` (currently 900 LoC, gates inlined in one ~800-line command action) into `core/src/gates/` — the test-coverage gate and the `--deep` verifier gate — and in doing so **define the shared `SettleContext` / `GateResult` / `GateImpl` contract** the rest of v1.3 consumes. Two gates (not one) so the shape is validated against real variety — a pure-policy gate (coverage) and a port-consuming gate (deep-verify needs an injected verifier) — before six more phases commit to it. Settle builds context and routes; no policy stays inline.

**Registry-ready shape (load-bearing for Phase 44.1).** `GateImpl` is `(ctx: SettleContext) => Promise<GateResult>` — uniform across every gate, so 44.1 can drop the modules into a `Record<Gate, GateImpl>` registry with no re-extraction. `SettleContext` carries **injected collaborator ports**: a `verifier` port and an `emitUnconverged` port (so 40.1/42.1 consolidate behind them), plus `shouldNotify` (the `anomaly-notify` toggle — see Pressure-test revisions). `GateResult` is a uniform `{ outcome, anomalies?, summaryPatch? }` shape, not gate-specific returns.

**Files.**
- `packages/core/src/gates/coverage.ts` (new).
- `packages/core/src/gates/deep-verify.ts` (new — moved up from old 39.2).
- `packages/core/src/gates/types.ts` (new) — `SettleContext`, `GateResult`, `GateImpl`, and the port interfaces (`VerifierPort`, `EmitPort`), shared with all subsequent 39.x phases.
- `packages/core/src/cli/commands/settle.ts` — replace both inline blocks with `runCoverageGate(ctx)` / `runDeepVerifyGate(ctx)`.
- `packages/core/tests/gates/{coverage,deep-verify}.test.ts` (new) — tests target the gates directly, not the CLI surface.

**ACs.** (1) `runCoverageGate(ctx)` and `runDeepVerifyGate(ctx)` are the single homes for their gate logic. (2) `GateImpl` shape is uniform across both and registry-ready (validated by both gates conforming without per-gate casts). (3) `settle.ts` no longer references `verification.testGlobs` or coverage/deep-verify parsing directly. (4) Gate tests reach every branch without standing up the CLI stack. (5) Verifier reaches deep-verify via the `ctx.verifier` port, not a direct factory import. (6) Settle-time behavior bit-identical to pre-extraction (transcript-snapshot test). (7) `settle.ts` net LoC drops by both inline blocks' size + framing.

### Phase 39.2 — Lift the remaining always-fire / cheap enum gates (registry completion)

**Objective.** (Pressure-test addition — *total registry over the enum*.) The original roadmap left four `Gate`-enum members inline. This phase extracts the three that are discrete checks — `structural-verifier`, `build-test-must-pass`, `draft-read` (the Phase 23.1 DRAFT-read mtime gate at `settle.ts:171`) — into `gates/{structural-verifier,build-test,draft-read}.ts`, conforming to the `GateImpl` shape from 39.1. After this, every enum gate except `anomaly-notify` has a discrete module, so Phase 44.1's registry can be *total*. `anomaly-notify` is intentionally NOT extracted — it is a cross-cutting `ctx.shouldNotify` emission toggle, not a discrete gate.

**Files.**
- `packages/core/src/gates/{structural-verifier,build-test,draft-read}.ts` (new).
- `packages/core/src/cli/commands/settle.ts` — replace the three inline blocks with gate calls.
- `packages/core/src/cli/commands/draft.ts` — these three also appear in draft's path; route there too.
- `packages/core/tests/gates/{structural-verifier,build-test,draft-read}.test.ts` (new).

**ACs.** (1) Three new gate modules conform to the 39.1 `GateImpl` shape. (2) `settle.ts` and `draft.ts` route only for these gates — no inline policy. (3) The `gateSet.gates.includes('draft-read')` guard semantics (mtime baseline + `--allow-stale-draft`) preserved. (4) Tests target gates, not the CLI. (5) Behavior bit-identical. (6) Every `Gate` enum member except `anomaly-notify` now has a discrete `gates/*.ts` module.

**As built (2026-05-29) — bit-identical anchor amended (operator decision).** AC #5 was found false at plan time: only `draft-read` had inline enforcement; `structural-verifier` and `build-test-must-pass` were `ALWAYS_FIRE` enum members with **zero in-engine enforcement** (decorative — see the v0.6-era "matrix no longer decorative" v1.0 anchor that was never actually satisfied for these two). Rather than document them as external exceptions, the operator chose to **wire them for real**, consciously trading this phase's bit-identical guarantee to make the matrix load-bearing:
- `draft-read` → `gates/draft-read.ts`: verbatim extraction, **bit-identical** (transcript-anchored). AC #3/#5 hold for it.
- `structural-verifier` → `gates/structural-verifier.ts`: **new refusal** on `PENDING`/`IN_PROGRESS` tasks (terminal = DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED). Bypass `--allow-open-tasks` / `--force`.
- `build-test-must-pass` → `gates/build-test-must-pass.ts`: **new refusal** on a non-zero `verification.testCommand` exit, via an injected `RunnerPort`. Config-gated — unset `testCommand` ⇒ passes silently (preserves bit-identical for existing green settles, AC-7). Bypass `--allow-failing-build` / `--force`.

AC #2 deviation: `draft.ts` was **not** touched — these gates have no `draft.ts` enforcement site (they fire at settle). Net result still satisfies AC #6: 5 enum gates now have `gates/*.ts` modules (coverage, deep-verify, draft-read, structural-verifier, build-test-must-pass); `anomaly-notify` is the exception; the remaining 7 await 39.3–39.7. Design + plan: `docs/superpowers/{specs,plans}/2026-05-29-*39.2*`.

### Phase 39.3 — Lift the interactive AC-walker out of settle.ts

**Objective.** Pull the Phase 16 `--interactive` per-AC walker (StdinPrompter / ScriptedPrompter / non-TTY refusal) into `gates/interactive.ts` exposing `runInteractiveGate(ctx)`.

**Files.**
- `packages/core/src/gates/interactive.ts` (new).
- `packages/core/src/cli/commands/settle.ts`.
- `packages/core/tests/gates/interactive.test.ts` (new) — drives via `CADENCE_PROMPTER_SCRIPT` seam.

**ACs.** (1) Walker is one module; prompter still injectable. (2) Settle routes only. (3) Non-TTY refusal preserved. (4) Per-AC `pass/fail/skip + note` semantics preserved. (5) Behavior bit-identical.

### Phase 39.4 — Lift the code-review gate (+ convergence sidecar) out of settle.ts

**Objective.** Pull the Phase 24.3 code-review verifier gate **and** its Phase 37.1 convergence sidecar into one module: `gates/code-review.ts`. The convergence-sidecar centralization is the bonus win the architecture review called out for this phase.

**Files.**
- `packages/core/src/gates/code-review.ts` (new) — `runCodeReviewGate(ctx)` calls the verifier **via `ctx.verifier`**, drives the `nextConvergence` loop, writes the `<id>-CODE-REVIEW.json` sidecar, emits convergence anomalies **via `ctx.emitUnconverged`** (the port — not a direct `notify/code-review.ts` import).
- `packages/core/src/cli/commands/settle.ts`.
- `packages/core/tests/gates/code-review.test.ts` (new).

**ACs.** (1) Gate + sidecar live in one module. (2) Phase 35.1 `nextConvergence` primitive consumed without modification. (3) `--allow-code-review-failure` and `--force` contracts preserved. (4) Settle.ts routes only. (5) Sidecar attempts + escalation behavior bit-identical to Phase 37.1 baseline (snapshot-tested). (6) Convergence anomalies emitted through `ctx.emitUnconverged`, so 42.1's spine swap is invisible here (no re-touch).

### Phase 39.5 — Lift the security-audit gate out of settle.ts

**Objective.** Pull the Phase 25.2 security-audit verifier gate into `gates/security-audit.ts`.

**Files.**
- `packages/core/src/gates/security-audit.ts` (new).
- `packages/core/src/cli/commands/settle.ts`.
- `packages/core/tests/gates/security-audit.test.ts` (new).

**ACs.** (1) Gate is one module. (2) `--allow-security-audit-failure` / `--force` preserved. (3) `Summary.securityAudit` recording stays. (4) CRITICAL refusal preserved. (5) Behavior bit-identical.

### Phase 39.6 — Lift the skill-audit check out of settle.ts (into `checks/`, not `gates/`)

**Objective.** Pull the Phase 34.1 required-skill enforcement (skill-audit-miss anomaly + `--allow-skill-audit-miss` bypass) into `checks/skill-audit.ts`. **Note (pressure-test):** `skill-audit` is **not** a member of the `Gate` enum — it's an anomaly check, not a profile×tier gate — so it lives in the new `packages/core/src/checks/` namespace and stays *outside* the Phase 44.1 registry. It may still reuse the `GateResult` shape for a uniform return, but it is dispatched explicitly, not via the gate set.

**Files.**
- `packages/core/src/checks/skill-audit.ts` (new).
- `packages/core/src/cli/commands/settle.ts`.
- `packages/core/tests/checks/skill-audit.test.ts` (new).

**ACs.** (1) Check is one module under `checks/`. (2) DRAFT frontmatter `requiredSkills` ∪ `config.skillAudit.required` union semantics preserved. (3) `--allow-skill-audit-miss` bypass preserved. (4) `state.skillAudit.invoked[]` source-of-truth unchanged. (5) Behavior bit-identical. (6) `checks/` is not referenced by `gates/engine.ts` or the registry — dispatched explicitly from settle.

### Phase 39.7 — Lift the draft + build command gates

**Objective.** With settle.ts now a router, do the same for `draft.ts` (**506 LoC** as of 2026-05-29) and `build.ts` (274 LoC). Draft holds the approve, plan-review (+ Phase 35.1 convergence sidecar), and coherence gates; build holds per-task-verify (Phase 24.2). One phase covers both because each gate is small in isolation. Plan-review's convergence emission goes through `ctx.emitUnconverged` (the port), same as 39.4.

**Files.**
- `packages/core/src/gates/{approve, plan-review, coherence, per-task-verify}.ts` (new).
- `packages/core/src/cli/commands/{draft, build}.ts` — shrink to routers.
- `packages/core/tests/gates/{approve, plan-review, coherence, per-task-verify}.test.ts` (new per gate).

**ACs.** (1) Four new gate modules exist, conforming to the 39.1 `GateImpl` shape. (2) `draft.ts` drops under 200 LoC (a steeper cut than first scoped — it's 506, not 456). (3) `build.ts` drops under 150 LoC. (4) Plan-review convergence sidecar preserved (`nextConvergence` consumed unchanged), emitted via `ctx.emitUnconverged`. (5) Phase 24.1, 24.2, 25.1 contracts all preserved. (6) Behavior bit-identical at the CLI surface (transcript snapshots).

### Phase 40.1 — Verifier factory consolidation

**Objective.** (Architecture review candidate #1.) Six factory files under `packages/core/src/verify/` (`factory.ts`, `code-review-factory.ts`, `plan-review-factory.ts`, `spec-review-factory.ts`, `per-task-factory.ts`, `security-audit-factory.ts` — ~355 LoC total) repeat one selection algorithm with a `mock | anthropic | local` switch and identical fallback warnings. Collapse into one generic `createVerifierFactory<P, V>(spec)` plus six ~10-line bindings.

**Files.**
- `packages/core/src/verify/factory-generic.ts` (new) — `createVerifierFactory<P, V>(spec)` owns the provider switch, anthropic-key fallback, local-url fallback, and warn injection.
- `packages/core/src/verify/{verifier, code-review, plan-review, spec-review, per-task, security-audit}-factory.ts` — shrink to thin bindings.
- `packages/core/tests/verify/factory-generic.test.ts` (new) — fallback / warn rules tested once.

**ACs.** (1) Generic factory exists; six bindings each ≤ 15 LoC. (2) Fallback-warning rule lives in exactly one place. (3) Adding a seventh verifier type costs ≤ 10 lines + a spec. (4) Behavior bit-identical at every consumer call site. (5) No factory file remains over 20 LoC.

### Phase 41.1 — Backend `commit(state)` seam

**Objective.** (Architecture review candidate #3.) The `StateBackend` interface (`state/backend.ts:3` — note: named `StateBackend`, not `Backend`) is too narrow: **~13 `renderStateMd` references across ~7 files** (`cli/commands/{settle,draft,init,spec}.ts`, `hooks/handlers.ts`, `build/record.ts`) pair `backend.writeState(state)` with a manual `renderStateMd(state)` + `atomicWriteText(STATE.md, …)`. Forgetting the second step = stale `STATE.md`. Add `backend.commit(state)` that writes both artefacts; demote `writeState` to package-internal.

**Files.**
- `packages/core/src/state/backend.ts` — add `commit(state): Promise<void>` to the `StateBackend` interface; implement in `SimpleBackend`.
- `packages/core/src/state/simple.ts`.
- All two-step call sites (~13 across ~7 files) — swap the two-step pattern for `commit(state)`.
- `packages/core/tests/state/commit.test.ts` (new) — both artefacts written atomically.

**ACs.** (1) `backend.commit(state)` writes `state.json` and `STATE.md` together. (2) No caller outside `state/` imports `renderStateMd` directly. (3) `writeState` is no longer in the public `StateBackend` interface (or is clearly marked internal). (4) A new state-derived artefact can be added by changing one method. (5) Whole class of stale-STATE.md bugs gone — no two-step path remains for callers to omit.

### Phase 42.1 — `emitUnconverged` notify spine

**Objective.** (Architecture review candidate #4.) Three convergence emitters under `packages/core/src/notify/` (`plan-review.ts`, `spec-review.ts`, `code-review.ts` — ~48 LoC each) share an identical try / notify / stderr-degrade spine; ~70 % is duplication. Extract `emitUnconverged(notifier, kind, payload)`; the three sites supply only the payload. **Decoupled by design (pressure-test):** 39.4/39.7 already consume convergence emission through the `ctx.emitUnconverged` port, so this phase is a pure internal swap *behind* the port — the extracted gates need no re-touch, and 42.1 is genuinely order-independent w.r.t. 39.x.

**Files.**
- `packages/core/src/notify/emit-unconverged.ts` (new) — the spine: try, notify, degrade-on-throw, ts-stamp.
- `packages/core/src/notify/{plan-review, spec-review, code-review}.ts` — shrink to payload builders.
- `packages/core/tests/notify/emit-unconverged.test.ts` (new) — spine tested once.

**ACs.** (1) `emitUnconverged` is the single home for the transport contract. (2) Each of the three emitters becomes ≤ 8 LoC (payload + call). (3) Stderr-degrade behavior identical across all three kinds (centrally tested). (4) Adding a fourth convergence emitter costs ≤ 4 LoC. (5) Notifier injection seam unchanged.

### Phase 43.1 — Drain boundary-check logic from `handlePreToolEdit` (into `checks/`)

**Objective.** (Architecture review candidate #5.) The `handlePreToolEdit` handler in `hooks/handlers.ts` inlines five layers (parse DRAFT, walk files vs. `task.files`, decide boundary, build `AnomalyEvent`, notify with stderr fallback). Same intent as the settle-time boundary detection in `collectAnomalies`, but distinct code. Extract `checks/boundary.ts` with `runBoundaryCheck(ctx)`; both `handlePreToolEdit` and the settle-time collector call it. **Note (pressure-test):** boundary is **not** in the `Gate` enum — it's a hook-time + settle-time anomaly check — so it lives in `checks/` alongside skill-audit (39.6), *outside* the Phase 44.1 registry.

**Depends on.** 39.1–39.7 (the `GateResult`/port pattern + `checks/` namespace established) and ideally 41.1 (commit seam).

**Files.**
- `packages/core/src/checks/boundary.ts` (new).
- `packages/core/src/hooks/handlers.ts` — `handlePreToolEdit` returns to dispatch + return shape.
- `packages/core/src/cli/commands/settle.ts` (or wherever `collectAnomalies` lives) — replace inline boundary check with `runBoundaryCheck(ctx)`.
- `packages/core/tests/checks/boundary.test.ts` (new) — tests target the check, not the hook.

**ACs.** (1) Boundary detection lives in one module under `checks/`. (2) Hook handler and settle-time path both call it — one rule, two emission points. (3) Hook handler shrinks to dispatch + check + return. (4) Tests target the check, not the hook. (5) Behavior bit-identical at both call sites.

### Phase 44.1 — Engine-driven gate registry (the hybrid endgame)

**Objective.** (Pressure-test addition — *registry endgame*.) With every enum gate now a discrete `GateImpl` module (39.1–39.7 + 39.2), convert settle's hand-wired `if (gateSet.gates.includes(X)) { runXGate(ctx) }` sequence into a single engine-driven dispatch: a `Record<Gate, GateImpl>` registry that settle drives by **iterating `effectiveGateSet(state, config, draft).gates`**. This makes `gates/engine.ts` load-bearing at runtime — *one* source of truth for both *which* gates fire and *in what order* — instead of the order living redundantly in settle's call sequence. `anomaly-notify` stays a `ctx.shouldNotify` flag consulted inside the impls (not a registry entry); `checks/` modules (skill-audit, boundary) stay explicitly dispatched, outside the registry.

**Depends on.** 39.1–39.7 + 39.2 (all 12 discrete enum-gate impls must exist and share the `GateImpl` shape).

**Files.**
- `packages/core/src/gates/registry.ts` (new) — `const GATE_REGISTRY: Record<Gate, GateImpl>` + a `runGates(ctx, gateSet)` driver that iterates `gateSet.gates` in order.
- `packages/core/src/cli/commands/settle.ts` — replace the hand-wired gate sequence with `runGates(ctx, gateSet)`.
- `packages/core/tests/gates/registry.test.ts` (new) — registry totality (every non-`anomaly-notify` `Gate` member has an entry, enforced at type level) + ordering preserved.

**ACs.** (1) `GATE_REGISTRY` is total over `Gate` minus `anomaly-notify` — missing an entry is a compile error (exhaustive `Record`). (2) Settle dispatches by walking a canonical **`GATE_ORDER: Gate[]`** constant intersected with `effectiveGateSet().gates`; no gate name is hardcoded in settle's control flow. (3) Firing order matches the pre-44.1 execution sequence (snapshot-tested). **Note (39.1 design, 2026-05-29):** matrix order (`[...ALWAYS_FIRE, ...deltas]`) ≠ execution order (settle runs deep-verify before code-review, draft-read before coverage), and the *first* refusing gate owns stderr+exit — so a `GATE_ORDER` constant is required; iterating `gateSet.gates` in array order is NOT behavior-preserving. (4) Adding a future gate = add an enum member + a `GATE_ORDER` entry + a registry entry; settle is untouched. (5) Behavior bit-identical at the CLI surface.

---

Entry point next session — **reconciled 2026-06-01** (this entry was badly stale: it said "start with Phase 39.1" when all of 39.1–44.1 had already shipped):

- **v1.2.0 Feature expansion** — ✓ SHIPPED (34.1–38.1).
- **v1.3.0 Architecture deepening** — ✓ SHIPPED. All of 39.1–44.1 landed on `main` 2026-05-29 (paired `docs(planning)` + `feat(core)` commits, full gate green at each); the registry endgame (44.1) is live in `settle.ts`. These shipped through the superpowers workflow **without the CADENCE settle ceremony**; the `.cadence/phases/39–44` artifacts were **backfilled 2026-06-01** (see `.cadence/RECONCILIATION-2026-06-01.md`).
- **v1.4.0 Public release** — ✓ SHIPPED 2026-06-02 (phase `45-public-release`). `@manehorizons/cadence-{core,types,host-claude-code}@1.4.0` published to npm via `release.yml` with provenance; annotated tag `v1.4.0` cut at the published commit. The earlier `1.1.1` (2026-05-30, bundled v1.2 + v1.3) is left as-is (fix-forward). See MILESTONES.md §v1.4.0.
- **v1.5.0 Session continuity** — ✓ SHIPPED 2026-06-03. `cadence handoff`/`resume` + `/cadence-handoff`/`/cadence-resume` (phase `46-handoff-resume`) and the boundary-check path-normalization fix (phase `47-boundary-path-fix`). `@manehorizons/cadence-{core,types,host-claude-code}@1.5.0` published to npm via `release.yml` with provenance; annotated tag `v1.5.0` cut at the published commit. See MILESTONES.md §v1.5.0.

All v1.1 work (29.x shakedown/remediation, 30.1 reversible publish proof, 31.1 docs, 32.1 test-infra, 32.2 lint, 33.1 publish) is shipped.

---

## v1.13.0 — Multi-host reach (Codex adapter) — ✓ SHIPPED 2026-06-06

Published to npm with SLSA provenance; annotated tag `v1.13.0` (`cd775ce`) cut at
the published commit. The first consumer of the phase-60 host-adapter contract: a
**fourth published package**, `@manehorizons/cadence-host-codex`, that `satisfies
HostAdapter` for the OpenAI Codex CLI — the contract held at **v1 unchanged** (a
differently-shaped host conformed without a bump, the portability proof). Built
across five phases, all settled + pushed:

- **Phase 65 — Codex adapter spike** ✓ — resolved the unknowns (command surface,
  `apply_patch` payload recoverability, non-TTY hook flow, event-map coverage);
  go on contract v1.
- **Phase 66 — adapter core** ✓ — package scaffold + `codexAdapter` with
  `mapEvent` over Codex's near-1:1 lifecycle and `extractPayload` parsing Codex's
  multi-file `apply_patch` envelope into `ExtractedPayload.files`.
- **Phase 67 — install surface** ✓ — `cadence-host-codex install` writes project
  `.codex/hooks.json` + **global** `~/.codex/prompts/` slash commands + the CLI.
- **Phase 68 — hook shim** ✓ — `cadence-host-codex hook`, the runtime shim from
  Codex's stdin-JSON lifecycle to the core dispatcher.
- **Phase 69 — docs** ✓ — Codex worked example in `host-adapters.md` + package
  README/LICENSE.

The other three public packages carried version-alignment bumps only. Full
scope/rationale/risks in MILESTONES.md §v1.13.0.

---

## v1.14.0 — Verifier correctness (deep-verify sees the code) — ✓ SHIPPED 2026-06-06

Decided 2026-06-06 (after OpenCode was rejected as the 3rd host adapter — rationale
in MILESTONES.md §Post-v1.0). **Keystone correctness fix:** the `deep-verify` gate
sent `diff: ''` to the AI verifier, so "deep verification" judged ACs on test-linkage
+ filenames only and never saw the implementation — even with a real provider. Both
phases settled; all four published packages bumped `1.13.0 → 1.14.0` in lockstep.

- **Phase 70 — diff wiring + cap + provenance** ✓ — `deep-verify.ts` now feeds the
  verifier the memoized `git diff HEAD` (shared with `code-review`) via the existing
  `ctx.diff()` (Phase 39.4 — pre-existed, so the keystone was simpler than planned),
  bounded by the new `verifier.diffCapBytes` config (default 256KB) + pure
  `capDiff()` helper with an honest `[diff truncated: N of M bytes]` marker; run-level
  `deepVerifyMeta` provenance written to the SUMMARY. (`per-task` verifier was already
  diff-aware — no blind spot.)
- **Phase 71 — banner honesty + docs + changeset** ✓ — mock-fallback banner re-gated
  on the gate's real firing condition (`--deep` **or** gate-set membership); docs
  (`concepts.md`, `config.md`, DESIGN.md **D12**) + doc-presence drift test; changeset
  for the lockstep bump.

Full scope/rationale in MILESTONES.md §v1.14.0.

---

## v1.15.0 — Verifier robustness (real providers, production-ready) — ✓ SHIPPED 2026-06-06

Chosen 2026-06-06 (the natural follow-on to v1.14, now that `deep-verify` actually sends
the diff). Make the **real** providers dependable in a settle gate, let the operator pick
one at the CLI, and make every run's token/cost auditable — the items deferred from
v1.14's scope guard. Provider hardening + ergonomics, **not** a verifier rewrite. All
phases settled; all four published packages bumped `1.14.0 → 1.15.0` in lockstep; full
scope/rationale/scope-guards in MILESTONES.md §v1.15.0.

- **Phase 72 — Provider hardening** ✓ — `anthropic` request `timeoutMs` + `maxRetries`
  (config-driven, via the pure `buildAnthropicClientConfig` seam); `local` bearer auth
  from `CADENCE_LOCAL_API_KEY` + `verifier.localHeaders` for OpenAI-compatible proxies.
  Tested via existing injected-client / transport seams; no live network.
- **Phase 73 — Selection + cost visibility** ✓ — `settle run --verifier
  <mock|anthropic|local>` (flag > config > default `mock`, validated, honest
  mock-fallback banner); optional token usage `{ inputTokens, outputTokens }` on
  `VerifyResult` → `deepVerifyMeta`/SUMMARY (extended the v1.14 `cadence-types` type).
- **Phase 74 — Release v1.15.0** ✓ — docs (`config.md` fields + auth env, `commands.md`
  `--verifier`, `providers.md` hardening/selection/cost) + changeset + lockstep
  `1.14.0 → 1.15.0` bump; **no new DESIGN.md D-number** (hardening + ergonomics, not a
  contract change). Tag + npm provenance via the manual `Release` workflow at publish.

Deferred candidate vectors (MILESTONES.md §Post-v1.0): observability (structured
logging / OTel), the **public launch** (assets staged local-only). No viable next
host adapter today (OpenCode rejected; Aider has no hooks).

---

## v1.16.0 — MCP surface deepening — ✓ SHIPPED 2026-06-07

Chosen 2026-06-07 (the leading Post-v1.0 candidate). Grow `cadence mcp serve` from a
thin tools-only slice (phase 58) into a full MCP integration along four dimensions —
adding the two missing MCP primitives (Resources, Prompts), widening the tool set to
the proven-out commands, and making setup paste-free. stdio-only and
imperative-surface-only still hold; DESIGN.md **D11** deepened additively (no new
D-number). All four published packages bumped `1.15.0 → 1.16.0` in lockstep. Design:
`docs/superpowers/specs/2026-06-07-mcp-surface-deepening-design.md` (local-only).

- **Phase 75 — Resources** ✓ — `.cadence/` artifacts read-on-demand under a
  `cadence://` scheme (5 static + 2 templated phase resources); no subscriptions.
- **Phase 76 — Tool parity** ✓ — `cadence_handoff`, `cadence_resume`,
  `cadence_recommendation_add`, `cadence_recommendation_promote`, `cadence_doctor`
  (15 tools total), over thin services reusing existing core `run*` functions.
- **Phase 77 — Shared guidance + Prompts** ✓ — command prose + the scout dialogue
  extracted to a shared `cadence-types` module (host slash-command output
  byte-identical, golden-fixture–guarded); MCP prompts `cadence_scout` / `cadence_next`
  / `cadence_draft` / `cadence_settle`.
- **Phase 78 — Zero-config** ✓ — `cadence mcp install [--print] [--client <c>]`
  non-destructively writes/merges `.mcp.json` (idempotent; refuses malformed clobber).
- **Phase 79 — Release v1.16.0** ✓ — docs (`mcp.md`, `commands.md`), DESIGN.md D11
  extension, changeset, lockstep `1.15.0 → 1.16.0` bump. Tag + npm provenance via the
  manual `Release` workflow at publish.

Deferred candidate vectors (MILESTONES.md §Post-v1.0): observability (structured
logging / OTel), the **public launch** (assets staged local-only).

> **v1.17.0 – v1.23.0** (2026-06-07 → 06-11) shipped without separate ROADMAP
> sections — observability (v1.17), worktree safety (v1.18/v1.19), handoff-retention
> (v1.20), quickstart-onboarding (v1.21), verification-activation (v1.22), the
> phase-id ceiling fix (v1.22.1), and the phase-100 `shipped` terminal rec status
> (v1.23). Full narratives in MILESTONES.md.

---

## v1.24.0 — Recommendation retention (manual + auto soft-archival) — ✓ SHIPPED 2026-06-11

All three phases settled + merged to `main` (PRs #77/#78/#79, CI green all 6 OS×Node
legs); all four published packages bumped `1.23.0 → 1.24.0` in lockstep (changeset
consumed). npm publish is the operator-triggered manual `Release` workflow. Full
narrative + the phase-102 CI dogfood note in MILESTONES.md §v1.24.0.

Direct follow-on to phase 100. `recommendations.json` is append-only; terminal recs
already hide from the active `recommend` surface but accumulate forever. Add manual +
automatic **soft-archival** (move-aside, recoverable) so the working ledger stays lean
while honoring phase 100's retain-as-provenance choice. Storage: a second `archived`
array in the same file (one atomic write moves a rec between arrays). Commands named
`archive`/`unarchive` (honest verb). Auto-archive (`recommendations.autoArchive`,
default **on**, recoverable): `shipped`/`rejected` immediately; `converted` when its
phase settles. **No new DESIGN.md D-number expected** (additive to the
recommendation-lifecycle model). Full scope/rationale/scope-guards in MILESTONES.md
§v1.24.0; design `docs/superpowers/specs/2026-06-11-recommendation-retention-design.md`.

- **Phase 101 — Archive core + manual commands** ✓ (PR #77) — `archived` array +
  `archivedAt` / `archiveReason` optional rec fields (`.default([])` keeps existing files
  valid); pure `archiveRecommendation` / `unarchiveRecommendation`;
  `runRecommendation{Archive,Unarchive}`; CLI `recommendation archive <id>` /
  `unarchive <id>` / `list --archived`. TDD. (Dropped the planned `--reason` flag — no
  free-text note field behind the `archiveReason` enum.)
- **Phase 102 — Auto-archive + config** ✓ (PR #78) — `recommendations.autoArchive`
  config; compose archival into the `shipped`/`rejected` status writes (atomic);
  best-effort settle→rec hook in `services/settle.ts` archiving a `converted` rec when its
  phase settles (never blocks settle, reported); `autoArchive` in the `config edit`
  catalog; archive-aware `recommendation show`. TDD.
- **Phase 103 — Release v1.24.0** ✓ (PR #79) — docs (`commands.md` archive/unarchive +
  `--archived`; `config.md` `recommendations` section), changeset, lockstep
  `1.23.0 → 1.24.0` across all four published packages. Tag + npm provenance via the
  manual `Release` workflow at publish.

---

## v1.26.0 — Guided onboarding: `cadence start` — ✓ DELIVERED 2026-06-13

All three phases settled through CADENCE's own loop on branch
`feat/v1.26-cadence-start`; all four published packages bumped `1.25.0 → 1.26.0`
in lockstep (changeset consumed, CLAUDE.md narrative leads with 1.26.0). npm publish
is the operator-triggered manual `Release` workflow. Built subagent-driven (implementer
+ two-stage spec/quality review per phase); the code-quality review caught a Windows-CI
portability bug pre-merge (`npx` via `child_process.spawn` needs `shell:true` on win32).

A newcomer faces several setup commands and must know which fits; the read-only
`cadence quickstart` prints a *map* but doesn't route or run anything. **`cadence start`**
is the interactive sibling: "What are you doing?" → numbered pick → confirm → runs the
matching command (tutorial, init, Claude Code / Codex host install, MCP install, doctor).
Dispatch is a uniform subprocess spawn (the `cadence` binary for core routes, `npx` for
the two host packages) — `start` never imports host code. Scriptable via
`--pick`/`--yes`/`--json`; non-TTY prints the menu and exits 0. **No new DESIGN.md
D-number** (additive onboarding/legibility). Full scope/scope-guards in MILESTONES.md
§v1.26.0; design `docs/superpowers/specs/2026-06-13-cadence-start-onboarding-design.md`.

- **Phase 105 — Pure core** ✓ — `START_OPTIONS` menu catalog (→ runner + args) +
  text/JSON/confirm renderers + `resolvePick`; no I/O. TDD (AC-1..AC-4).
- **Phase 106 — CLI shell + wiring** ✓ — `runStart` (pick/confirm/spawn dispatch,
  json/non-tty, error paths), `registerStartCommand`, a `start` entry in the `quickstart`
  command map, and a `cadence start` pointer in `init`'s next-steps output. TDD
  (AC-5..AC-13). Windows `npx`-spawn fix folded in.
- **Phase 107 — Release v1.26.0** ✓ — docs (`commands.md` `start` entry + README
  pointer), MILESTONES/ROADMAP narrative, changeset, lockstep `1.25.0 → 1.26.0` across
  all four published packages. Tag + npm provenance via the manual `Release` workflow at publish.

---

## v1.27.0 — Onboarding breeze: `init` is the front door — STARTED 2026-06-17

Chosen 2026-06-17 (direct follow-on to v1.26 `cadence start`). v1.26 made setup
*routable* — `start` points a newcomer at the right command. v1.27 makes the command
it points at *just work*: `cadence init` becomes a zero-friction front door that
scaffolds a working, real-verification-ready loop with no follow-up commands and no
prompts. Sourced from an onboarding assessment (2026-06-17) that walked install → first
successful loop and found ~8 typed steps + 1 hand-edit + a separate `activate` hop.
**No new DESIGN.md D-number** (additive onboarding/legibility, same lane as
`quickstart`/`start`/`activate`). Recs: rec-20260617-001/002/004 (accepted);
rec-20260617-003 (arg-syntax) + rec-20260617-005 (agent/non-TTY mode) deferred to a
v1.28 follow-on.

**Thesis.** The three init-hub recs cohere: each lands on `init.ts`, and together they
collapse "install → working real-verification loop" from ~8 steps + a hand-edit + a
separate activate into `cadence init` (auto-wired, demo phase, real verifier when a key
is present) → 3 paste-ready commands. The biggest breeze-per-effort of the five
findings.

### Phase 108 — Zero-prompt init that auto-wires the host (rec-20260617-001)

**Objective.** `cadence init` prompts for name (default `unnamed`) + profile, then tells
the user to *separately* run the host install. Make init derive everything: name from
`package.json`/dir, gate profile from git (the existing `suggestGateProfile` heuristic),
and — when a Claude Code workspace is detected (`.claude/` present) — offer (or, with a
flag, auto-run) `cadence-host-claude-code install` in the same step. `--name`/`--preset`/
`--gate-profile` stay as explicit overrides. One command, zero questions, fully wired.

**Files.**
- `packages/core/src/cli/commands/init.ts` — name/profile auto-derivation; host-wire step.
- `packages/host-claude-code/src/install.ts` — reusable install entrypoint init can invoke (or a spawn, mirroring `start`'s launcher discipline — core must not import host code).
- `packages/core/tests/cli/init.test.ts` — auto-derive + host-wire coverage.

**ACs.** (1) `init` with no flags writes a valid `.cadence/` with a derived name (no
`unnamed`) and a git-suggested gate profile, asking nothing. (2) `--name`/`--preset`/
`--gate-profile` still override the derivations. (3) When `.claude/` is present, init
offers/auto-runs the host install without core importing host code (spawn seam, like
`start`). (4) Non-TTY runs never block (no prompt path reachable). (5) Behavior for an
already-initialized dir unchanged (still refuses / `--claude-md` path intact).

### Phase 109 — `init --demo`: a pre-filled first phase in the real repo (rec-20260617-002)

**Objective.** `cadence tutorial` runs in a throwaway sandbox then deletes it — the user
ends with nothing, and the README quickstart's "fill `.cadence/phases/.../DRAFT.md`" is
the steepest step in the happy path. Add `cadence init --demo` (or a `start` route) that
scaffolds a real phase with the objective + AC-1 + task T1 **already written** (reuse the
`tutorial` toy template), so the user runs `approve → done → settle` immediately and
watches a real gate fire/pass **in their own repo**.

**Files.**
- `packages/core/src/cli/commands/init.ts` — `--demo` flag → scaffold the seeded phase.
- `packages/core/src/cli/commands/tutorial.ts` — extract the shared toy-DRAFT template.
- `packages/core/tests/cli/init-demo.test.ts` (new).

**ACs.** (1) `cadence init --demo` leaves a ready-to-approve phase DRAFT in the real
`.cadence/`. (2) The seeded DRAFT carries objective + ≥1 AC + ≥1 task (no hand-edit
needed to reach settle). (3) The toy template is shared with `tutorial` (one source).
(4) `init` without `--demo` is unchanged. (5) The seeded loop runs `approve → done →
settle` clean end-to-end (tested).

### Phase 110 — Fold activation into init when a key is present (rec-20260617-004)

**Objective.** The `mock` verifier is named "NOT real verification" across
init/doctor/config-explain, but turning it on is a *separate* `cadence activate` +
`export ANTHROPIC_API_KEY` dance. At init, if `ANTHROPIC_API_KEY` is already in the env,
offer (or `--activate` auto-select) the `anthropic` provider right there — reusing the
`activate` plan/assess seam (no key persisted). A user who already has a key gets real
verification with zero extra hops and no scolding.

**Files.**
- `packages/core/src/cli/commands/init.ts` — env probe + `--activate`; reuse activate seam.
- `packages/core/src/cli/commands/activate.ts` (or `activate/*`) — shared provider-write seam.
- `packages/core/tests/cli/init-activate.test.ts` (new).

**ACs.** (1) With `ANTHROPIC_API_KEY` set, `init --activate` writes `verifier.provider =
anthropic` (deep-verify seam) without persisting the key. (2) Without the key (or without
`--activate`), init stays on `mock` and prints the existing activate pointer. (3) The
provider-write reuses the `activate` seam (no duplicated logic). (4) Non-TTY safe. (5) The
mock-NOT-real-verification notice is suppressed when real verification was just wired.

### Phase 111 — Release v1.27.0

**Objective.** Docs (`commands.md` init flags `--demo`/`--activate` + the auto-wire
behavior; README quickstart collapsed to the new flow; `providers.md`/`concepts.md`
touch-ups), changeset, lockstep `1.26.0 → 1.27.0` across all four published packages.
Tag + npm provenance via the manual `Release` workflow at publish.

**ACs.** (1) README quickstart reflects the zero-prompt / `--demo` / key-aware flow.
(2) `commands.md` documents the new init flags. (3) Changeset present; all four packages
bumped in lockstep. (4) Full suite green. (5) CLAUDE.md narrative leads with `1.27.0`.

**Scope guards.** *In:* the init-hub trio (auto-derive + host-wire, `--demo`, key-aware
activate) + docs + release. *Out (deferred to v1.28):* rec-003 (auto-derive phase id +
`--ac` syntax shorthands) and rec-005 (agent/non-TTY mode + `--preset agent`). *Out
(YAGNI):* a full interactive init wizard; remembering host choices; non-Anthropic
key-detection at init.

---

## Backfilled: phases 118–230 (2026-06-18 – 2026-07-27)

The following sections were backfilled 2026-07-27, closing a gap where `.cadence/phases/`
kept advancing (through phase 230) without ROADMAP.md/MILESTONES.md being updated to
match, following the shipped-version retrospective convention this repo already uses for
delivered milestones (see Phase 111 and earlier). Each backfilled phase's own settled
artifacts under `.cadence/phases/<N>-<slug>/` are the record and were not modified by this
backfill — these sections are an index into that record, not a replacement for it.

## v1.30.0 – v1.32.0 — Hardening pass, draft/settle ergonomics, and release integrity — ✓ SHIPPED 2026-06-18 → 06-23

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/118–129`. None of
these tags has a dedicated release phase, so the phase→version attribution below is
**date-derived** (settle date vs tag date) and is approximate at the boundaries.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.30.0 | 2026-06-18 | 118–122 |
| v1.31.0 | 2026-06-19 | 123 |
| v1.32.0 | 2026-06-23 | 124, 129 |

This arc opens with phase 118, a hardening review that turns prior review findings into
fail-closed behavior: centralized phase-slug validation before every filesystem join (path
traversal refusal), `execFileSync` argv git diff collection replacing shell-string
interpolation (metacharacter injection), config loading that refuses invalid
`.cadence/config.json` instead of silently falling back to defaults, and a docs pass
reconciling README/DESIGN with the shipped (not archived) Codex adapter. The next phases are a
DX pass on the loop's day-to-day surface: 119 lets `draft new` derive its own phase/task id and
adds `--pass-all`/`--ac-pass` settle shorthands; 120 makes gate bypasses durably auditable — a
`SUMMARY.json` `gateBypasses` array, a rendered Markdown section, and a loud settle-time stderr
warning, closing a silent-bypass gap; 121 is a local-only, gitignored, sourced
competitive-positioning note for launch prep with deliberately narrow claims; 122 closes the
remaining Codex host-adapter test-parity gaps (local hook install roundtrip, prompts sourced
from the shared `COMMAND_GUIDANCE`/`SCOUT_DIALOGUE` catalog). Phase 123 adds first-real-work
DRAFT templates (`bugfix`/`feature`/`refactor`) to `draft new` so a newcomer's first real phase
doesn't require hand-authoring Objective/AC/Tasks/Boundaries from scratch. Phase 124 hardens the
release process itself: `scripts/release-integrity.mjs` creates/updates the GitHub Release for
the published tag and verifies npm+tag+GitHub-Release agreement across every public package,
failing loudly on mismatch instead of leaving an `untagged-*` draft. Phase 129, after the
numbering gap, rebuilds `cadence tutorial` around a genuine refuse→fix→pass arc — the demo
stages an unbacked AC-1 claim, lets settle's `test-coverage` gate really refuse it, then adds a
real test and genuinely passes, making the refusal itself the tutorial's money moment, with zero
engine changes. **No new DESIGN.md D-number** across this arc — all eight phases are additive to
existing models (path/config safety, the draft/settle CLI surface, the Codex adapter, the
release pipeline, the tutorial).

- **Phase 118 — hardening review: fail-closed config, path-safe phases, shell-safe diffs** ✓ —
  centralized phase-slug validation before filesystem joins across draft/spec approve/new,
  settle, and MCP resource reads; replaced shell-string git diff collection with `execFileSync`
  argv execution (regression-tested against shell-metacharacter filenames); invalid
  `.cadence/config.json` now fails closed instead of falling back to defaults; reconciled
  README/docs/DESIGN with the shipped Codex adapter; full local lint/typecheck/test/build gate
  green.
- **Phase 119 — auto-derived phase id + settle pass shorthands** ✓ — `cadence draft new --title
  "..."` (positionals omitted) now derives the next-free phase slug and task id `01` itself;
  added `--pass-all` and `--ac-pass <id...>` settle shorthands so ACs can be marked PASS without
  the `AC-1=pass` syntax; `cadence progress` prints the simplified command. Existing explicit
  `draft new <phase> <num>` and `--ac AC-1=pass` paths stay compatible.
- **Phase 120 — loud bypass audit trail** ✓ — settle now records an optional `gateBypasses`
  array in `SUMMARY.json` (gate, flag, reason), renders a `## Gate bypasses` section in
  `SUMMARY.md`, and prints a `settle bypass [...]` stderr warning for each recorded bypass; clean
  settles are unaffected — `gateBypasses` stays absent and the section is omitted.
- **Phase 121 — competitive objection FAQ** ✓ — local-only, gitignored `COMPETITIVE.md`
  launch-prep note: sourced positioning against Spec Kit, OpenSpec, BMad Method, CodeRabbit,
  Greptile, Qodo, Graphite, and Thoughtworks Radar, a narrow in-loop-enforcement wedge claim, an
  objection FAQ, and an explicit "overclaims to avoid" section.
- **Phase 122 — Codex host adapter parity tests** ✓ — added Codex-equivalent local hook install
  roundtrip coverage (`.codex/hooks.json` through the local shim) and re-sourced Codex prompt
  prose from the shared `COMMAND_GUIDANCE`/`SCOUT_DIALOGUE` catalog (including `cadence-scout`),
  with parity tests locking prompts to Codex-shaped frontmatter (no Claude `allowed-tools`/
  autorun line).
- **Phase 123 — draft templates for first real work** ✓ — `cadence draft new --template
  <bugfix|feature|refactor>` renders a deterministic, non-placeholder Objective/AC/Tasks/
  Boundaries body for a newcomer's first real DRAFT; validated against unknown template names
  (refuses before writing) and against existing no-template/explicit-phase-id behavior; README/
  quickstart/command reference document the first-real-phase command and that templates are
  scaffolds to edit, not proof of correctness.
- **Phase 124 — release integrity: GitHub releases stay in sync** ✓ — new
  `scripts/release-integrity.mjs` discovers public packages, validates lockstep versions,
  extracts the `packages/core/CHANGELOG.md` entry, and creates/updates the GitHub Release for the
  pushed tag; the Release workflow runs it post-tag with `GH_TOKEN`/`NODE_AUTH_TOKEN`, failing
  loudly (naming the mismatched package/tag/release) instead of leaving an `untagged-*` draft;
  `docs/release.md` now defines "done" as npm + tag + GitHub Release + latest marker all
  agreeing.
- **Phase 129 — rebuild tutorial around the catch (refuse→fix→pass)** ✓ — `cadence tutorial` now
  stages an unbacked AC-1 claim, lets `settle run --auto` genuinely refuse it (`test-coverage`
  names AC-1, loop stays in BUILD), then adds a real `sum.test.mjs` and genuinely passes to IDLE
  with a SUMMARY; the refusal renders as a visually distinct banner; no `--ac` manual assertion
  or coverage-bypass flag anywhere in the tutorial path; zero engine changes.

*(Phases 125–128 were never used — see the numbering ledger.)*

## v1.33.0 – v1.36.0 — Onboarding trust: agent-prompt, doctor repairs, dry-run preview, and the onboarding-honesty wave — ✓ SHIPPED 2026-06-25 → 07-01

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/130–139`. None of
these tags has a dedicated release phase inside this arc, so the phase→version attribution
below is **date-derived** (settle date vs tag date) and is approximate at the boundaries.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.33.0 | 2026-06-25 | 130 |
| v1.34.0 | 2026-06-26 | 131 |
| v1.35.0 | 2026-06-26 | 132 |
| v1.36.0 | 2026-07-01 | 133–139 |

This arc runs two related campaigns back to back. Phases 130–132 build the first-run trust
surfaces that let a new adopter see what CADENCE will do before it does it: `cadence
agent-prompt` (a copy-paste prompt that hands a fresh user's AI agent the DRAFT-then-stop
workflow, backed by one pure `renderAgentPrompt` shared by the command and `init`'s output),
`doctor --fix`/`--wire-host`/`--dry-run` (best-effort auto-repair of onboarding drift —
git-hooks, STATE.md, host install — classified `auto`/`wire-host`/`manual` via a pure
`planFixes`), and `init --dry-run` (a pure `planInit` → `InitPlan` that resolves everything a
real init would and prints a fit-check preview without writing anything, so `init` can be run
safely inside a populated repo). Phases 133–139 are a different shape of work: they are the
direct fix set from an onboarding-honesty audit (the `rec-20260701-00x` series, findings
F2/F4/F5/F6/F9/F10), shipped together as v1.36.0 ("onboarding-honesty wave 1"). Each phase
closes one concrete gap between what CADENCE claims about itself and what it actually does —
`doctor`'s git-hooks check flagging a directory that was never there, `cadence progress`
lacking `--json`, `init --demo` printing next-step blocks that immediately refuse because a
demo phase is already open, the README's real-phase walkthrough missing an inline
`--no-approve` pointer, three surfaces breaking the "always name a concrete next move" pattern,
and a slash-command count published inconsistently across four docs. Phase 139 is the
capstone and the largest single change in the arc: it flips the default `coverageMode` from
`mention` to `assertion` for all three presets, derives a real `verification.testCommand` from
the target repo's `package.json#scripts.test` + detected package manager, and makes
`build-test-must-pass` print a loud stderr notice instead of passing silently when no test
command is configured — closing the gap between what `cadence tutorial` demonstrates
(real enforcement) and what a fresh `init` actually delivered. All published packages moved in
lockstep across the four tags. **No new DESIGN.md D-number** in this window (git history on
`DESIGN.md` has no commits in the 06-24 → 07-02 range).

- **Phase 130 — `cadence agent-prompt` + init block** ✓ — pure `renderAgentPrompt(goal?)`
  substitutes a supplied goal or falls back to `<your goal>`; the `agent-prompt` CLI command
  and a new "Hand it to your AI agent" block in `init`'s output share the same renderer so they
  cannot drift; the prompt teaches `cadence draft new --template`, AC tagging, and explicitly
  tells the agent to stop before `draft approve`.
- **Phase 131 — `doctor --fix`/`--wire-host`/`--dry-run`** ✓ (rec-20260619-004) — a pure
  `planFixes(report)` classifies each non-ok doctor finding as `auto`/`wire-host`/`manual`;
  `applyFixes` best-effort-repairs git-hooks (via `git config`) and STATE.md
  (`renderStateMd`), host wiring is gated behind `--wire-host` and deduped by fix id, and
  `--dry-run` previews without writing.
- **Phase 132 — `init --dry-run` fit-check preview** ✓ (rec-20260619-005) — a pure
  `planInit(cwd, opts, env)` composes the existing resolution helpers (`deriveName`,
  `detectTestGlobs`, gate-profile suggestion, preset/activation/host decisions) into an
  inspectable `InitPlan`; `--dry-run` short-circuits before any write and prints the rendered
  plan, including on an already-`.cadence/`-initialized repo (previews instead of refusing).
  Real write path left byte-for-byte unchanged.
- **Phase 133 — doctor git-hooks check: verify dir before flagging/fixing** ✓
  (rec-20260701-002, F2) — a missing `.githooks/` directory now reports not-applicable
  instead of `warning`, and `--fix` never overwrites a pre-existing custom `core.hooksPath`
  (e.g. a Husky `.husky` setup); happy path unchanged.
- **Phase 134 — `cadence progress --json`** ✓ (rec-20260701-004, F4) — mirrors
  `recommendService`'s `--json` pattern, emitting the same structured `{ command, reason }`
  payload the service already returns instead of requiring callers to regex the rendered text.
- **Phase 135 — `init --demo`: suppress conflicting next-step blocks** ✓ (rec-20260701-005,
  F5) — the generic "Your first loop" and "Hand it to your AI agent" blocks (both of which
  immediately refuse with `loopPosition is DRAFT` when a demo phase is already open) are
  suppressed when `--demo` seeded a phase; the "Demo phase ready" (approve → done → settle)
  block still prints unchanged.
- **Phase 136 — README real-phase example: inline `--no-approve` pointer** ✓
  (rec-20260701-006, F6) — investigation found the agent-prompt side of this finding already
  fixed in phase 130; the remaining gap was the README's "drive a real phase yourself"
  walkthrough showing a bare `draft approve` with no inline pointer to `--no-approve` for the
  non-interactive/CI/agent case, now added.
- **Phase 137 — Refusal trio: concrete next-move everywhere** ✓ (rec-20260701-007, F10) —
  three fixes: BUILD-state `cadence progress` now names the actual first-pending task id (or
  `settle run --auto`) instead of an unrunnable compound OR command; `draft approve` on a
  missing DRAFT.md gives a clean guarded refusal (mirroring `spec approve`) instead of a raw
  ENOENT; `settle run` out of position now names the actual next step via the same
  `nextAction()` `cadence progress` uses.
- **Phase 138 — Docs truth pass: slash-command counts + start menu completeness** ✓
  (rec-20260701-011, F9–F10) — reconciled the slash-command count to code truth (12) across
  README, quickstart, and claude-code.md (including a broken TOC anchor); added the 3 missing
  commands to quickstart's table; added a 7th `cadence start` menu option ("Turn on real
  verification" → `cadence activate`) so the guided front door reaches the remedy its own
  mock-verifier banner recommends by name. The README flagship-walkthrough claim in the same
  rec was live-tested and found already accurate — scoped out, no change needed.
- **Phase 139 — Default install enforces what the tutorial demonstrates** ✓
  (rec-20260701-001, wave 2, "enforcement wedge") — flips `verification.coverageMode` to
  `'assertion'` by default for all three presets (`solo`/`team`/`production`); adds a pure
  `detectTestCommand` helper (covers all 4 lockfile types + no-lockfile/no-scripts fallbacks)
  wired into both `InitPlan` and the real `init.ts` write path; `build-test-must-pass` prints a
  new `NO_TEST_COMMAND_NOTICE` via `ctx.io.err` instead of passing silently when no test
  command is configured. Existing `.cadence/config.json` files are untouched — the flip only
  applies to new inits.

- **Scope guards (as built).** *In:* the full agent-prompt/doctor-fix/dry-run trust surfaces
  (130–132) and the complete onboarding-honesty wave-1 fix set (133–139, all six audit
  findings plus the enforcement-default flip). *Out:* `--host` variants or host
  auto-detection in the agent prompt; refactoring `init`'s real write path to consume
  `planInit`; `cadence init --json`; a `cadence explain` start-menu option (phase 138 noted no
  equivalent forcing function existed, deferred); rec-003 (SUMMARY provenance) and rec-009
  (sealed gates), explicitly called out in phase 139's DRAFT as separate, later phases.

## v1.37.0 – v1.38.0 — SUMMARY gate provenance + sealed production gates — ✓ SHIPPED 2026-07-02 → 07-03

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/140–141`; those
artifacts are the record and were not modified. Phase 140's attribution to v1.37.0 is
**evidenced** (named explicitly in the v1.37.0 release commit and `packages/core/CHANGELOG.md`).
Phase 141's attribution to v1.38.0 is **date-derived**: its merge commit (`f9205d16`, PR #123)
landed 2026-07-02 20:28 (-0500), after the v1.37.0 tag (18:09 same day) and before the v1.38.0
tag (2026-07-03 13:58) — but phase 141 shipped without its own changeset, so `gates.sealed`
never appears in either release's CHANGELOG prose; v1.38.0's changelog entry names only phases
142–144.*

| tag | tagged | phases attributed |
|---|---|---|
| v1.37.0 | 2026-07-02 | 140 (evidenced) |
| v1.38.0 | 2026-07-03 | 141 (date-derived; undocumented in changelog) |

This arc closes the three-recommendation "enforcement-wedge wave 2" trio the operator opened
with rec-20260701-001/-003/-009 — three separate gaps in the settle loop's honesty story.
Phase 140 makes a settle's PASS verdicts auditable: `SUMMARY.json`'s new `gates[]` array records
per-gate `ran`/`skipped` (+ reason) provenance for all 8 settle-dispatched gates in
`GATE_ORDER`, each `acResults[]` row carries a per-AC `evidence` class (`ai-verified` /
`executed` / `assertion` / `mention` / `unverified`) derived by a new pure
`gates/ac-evidence.ts`, and a mock-provider deep-verify is now structurally prevented from ever
reporting `ai-verified`; `SUMMARY.md` renders both a `## Gate provenance` section and per-AC
evidence tags, and pre-phase SUMMARY records stay parseable. v1.37.0's own release commit
titled itself "enforcement-wedge wave 2 (**partial**)" — phase 141, the trio's third leg, was
still in flight at cut time. Phase 141 finishes it: the `production` gate-profile preset now
seals `test-coverage` and `build-test-must-pass` via a new `gates.sealed: string[]` config
field, and both gates refuse `--force`/their own `--allow-*` flag outright when sealed, with a
refusal message that names `gates.sealed`. The phase's own follow-up commit records that
shipping it closed "wave 2's enforcement-wedge trio (001/003/009 all shipped now)." No new
DESIGN.md D-number resulted from either phase.

- **Phase 140 — SUMMARY gate provenance** ✓ (rec-20260701-003) — `SUMMARY.json`'s `gates[]`
  array records ran/skipped(+reason) provenance for all 8 settle-dispatched gates in
  `GATE_ORDER`; `acResults[]` rows carry a derived `evidence` class; mock-provider deep-verify
  never yields `ai-verified` (it falls through to that AC's test-coverage evidence instead);
  `SUMMARY.md` renders the new `## Gate provenance` section plus per-AC evidence tags; pre-phase
  SUMMARY records without the new fields still parse and render unchanged.
- **Phase 141 — sealed gates: production preset makes named gates non-bypassable** ✓
  (rec-20260701-009) — new `gates.sealed: string[]` config field (defaults `[]`, backward
  compatible); the `production` preset sets it to `['test-coverage', 'build-test-must-pass']`
  (`solo`/`team` presets unchanged, stay `[]`); a shared `isGateSealed(ctx, gateId)` predicate
  makes both `coverage.ts` and `build-test-must-pass.ts` ignore `--force` and their per-gate
  `--allow-*` flag when sealed, refusing with a message that names `gates.sealed`; unsealed
  bypass behavior (and its bypass-notice logging) is byte-for-byte unchanged.

- **Scope guards (as built).** *In:* per-gate/per-AC provenance rendering and evidence-class
  derivation (140); the `gates.sealed` non-bypass mechanism, scoped to exactly `test-coverage`
  and `build-test-must-pass` on the `production` preset only (141). *Out:* sealing any gate
  besides those two, changing what makes either gate refuse in the first place, or touching the
  `solo`/`team` presets' bypass posture — all three explicitly excluded in phase 141's
  Boundaries.

## v1.38.0 – v1.39.0 — Cross-worktree handoff picker + intelligence-ledger lifecycle — ✓ SHIPPED 2026-07-03

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/142–149`; those artifacts
are the record and were not modified.*

| tag | tagged | phases attributed |
|---|---|---|
| v1.38.0 | 2026-07-03 | 142–144 (**evidenced** — phase 144 is the release phase) |
| v1.39.0 | 2026-07-03 | 145–149 (date-derived) |

This arc closes two adjacent but distinct milestones on the same day. Phases 142–144 finish the
cross-worktree handoff-picker line: 142 extracts the git-worktree-discovery plumbing the
phase-collision guard already used (`parseWorktreePorcelain`, `normalizeWorktreePath`,
`isSameWorktree`, `worktreeKey`) into a shared `packages/core/src/git/worktrees.ts` module and adds
a new best-effort `gatherHandoffCandidates` primitive that live-scans local + sibling worktrees for
resumable handoff docs, ranked freshest-first — deliberately no cached index, the same
"observe ground truth" philosophy the collision guard already locked in; 143 wires that primitive
into `cadence resume`'s CLI/service layer as an opt-in picker (`--list`/`--pick <n>`/`--path <p>`/
`--local`, a `resume` config block, a strictly read-only sibling-resume path) while keeping
single-worktree output byte-identical to pre-phase-143; 144 documents the full surface across
commands.md/config.md/concepts.md, appends a DESIGN.md §13 addendum (explicitly no new D-number —
this is a sibling application of §13's locked "ground truth, not a registry" decision, extended
from phase numbers to handoff docs), and cuts the v1.38.0 lockstep release. Phases 145–149 then
work through a batch of intelligence-ledger and CLI-ergonomics fixes that landed against the
already-tagged v1.39.0 with no dedicated release phase of their own: 145 stops a settled phase's
`converted` recommendation from silently vanishing into `ledger.archived`, routing it through a new
visible `settle-pending` status instead (surfaced by `cadence doctor`/`cadence progress`, promotable
only to `shipped`); 146 adds `--top <n>` truncation to `cadence recommend` plus a
`/cadence-recommend` slash command for both hosts as a lightweight front door; 147 fixes issue
#129 — the collision guard matched upstream occupancies on phase number alone, so a phase's own
already-pushed SPEC/DRAFT reflected back from `origin` looked like a foreign conflict on the very
next `draft new`/`settle run` — by exempting an upstream occupancy only when its full directory name
(number + slug) exactly matches a local occupancy's, leaving sibling matching and genuinely
different same-numbered upstream phases unaffected; 148 and 149 are direct follow-ons that 145's own
boundaries explicitly deferred to "a later phase in this arc" — `settle run --ship-ref <text>`
(issue #134) promotes a converted recommendation straight to `shipped` instead of the default
settle-pending advance, and `cadence milestone close <id>` (issue #135) gives an `exported`
milestone a `closed` terminal status with a non-blocking advisory on unshipped members. No new
DESIGN.md D-number resulted from either half of this arc.

- **Phase 142 — worktree-discovery extraction + handoff-candidate core** ✓ — extracted the
  phase-collision guard's git-worktree-discovery plumbing into `packages/core/src/git/worktrees.ts`,
  rewired `occupancy.ts` onto it with zero behavior change (regression-guarded by its own unmodified
  test file), and added the unwired `gatherHandoffCandidates` primitive consumed starting phase 143.
- **Phase 143 — CLI/service integration + picker for `cadence resume`** ✓ — wired
  `gatherHandoffCandidates` into `cadence resume`: `--list`/`--pick`/`--path`/`--local` flags, a
  `resume` config block (`crossWorktree` default true, `autoList` default false), a TTY-aware
  picker, and a hard-invariant read-only sibling-resume path (no `lastHandoff` stamp, no writes to a
  foreign `.cadence/`, `context: null` on `--full` for a sibling pick).
- **Phase 144 — docs + release for cross-worktree handoff picker (v1.38.0)** ✓ — documented the
  full `resume` flag surface in commands.md, a new `## resume` section in config.md, a
  concepts.md addendum, and a DESIGN.md §13 addendum; cut the v1.38.0 lockstep release across all
  four published packages.
- **Phase 145 — settle-pending recommendation status** ✓ — a settling phase's `converted`
  recommendation now transitions to a visible `settle-pending` status instead of being archived;
  `settle-pending → shipped` is the only sanctioned promotion; `cadence doctor`/`cadence progress`
  surface pending-ship recs with the exact promote command.
- **Phase 146 — `cadence recommend --top <n>` + `/cadence-recommend` slash command** ✓ — core
  truncation logic (`report.totals.ranked` still reports the pre-truncation count), a renderer
  truncation note, the CLI flag, and a new `/cadence-recommend` slash command for both hosts
  (auto-run `cadence recommend --top 5`), bumping Claude Code's installed-command count 12→13.
- **Phase 147 — upstream self-authorship exemption for the phase-collision guard** ✓ (issue #129)
  — exempts an `upstream` occupancy from conflicting only when its full directory name (number +
  slug) exactly matches a `local` occupancy's name at the same number; a differently-named upstream
  phase at the same number, and any `sibling` occupancy, still conflicts as before.
- **Phase 148 — `settle run --ship-ref` shortcut** ✓ (issue #134) — opt-in `--ship-ref <text>`
  promotes a settling phase's `converted` recommendation straight to `shipped` (setting
  `shippedRef`), reusing the existing tested `converted → shipped` transition; omitting the flag
  leaves settle's default behavior unchanged.
- **Phase 149 — `cadence milestone close <id>` verb** ✓ (issue #135) — new transition (legal only
  from `exported`) moves a milestone to `closed`, with an optional `--ref <text>` stored as
  `closedRef` and rendered in MILESTONES.md's "## Closed" section; closing warns but does not block
  on any linked recommendation that isn't yet `shipped`.

- **Scope guards (as built).** *In:* cross-worktree handoff discovery + picker + docs + release
  (v1.38.0); settle-pending ledger status, `recommend --top` + slash command, the collision-guard
  self-match fix, the `--ship-ref` shortcut, and the milestone `close` verb (v1.39.0). *Out:* phase
  143 left `cadence handoff`'s write path/retention pruning untouched; phase 145's boundaries
  explicitly deferred both the `--ship-ref` flag and any `cadence milestone` command changes to
  "a later phase in this arc" — fulfilled by 148 and 149 respectively; phase 149 explicitly declined
  a `milestone reopen`/`unclose` verb as not requested by its source issue.

## v1.40.0 – v1.41.0 — AC-ref parser fix, structured draft editing, MCP intelligence-lifecycle parity — ✓ SHIPPED 2026-07-04 → 07-04

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/150–154`; those
artifacts are the record and were not modified. Phase→version boundaries **evidenced**
(phase 152 is the release phase for v1.40.0, phase 154 for v1.41.0 — both tags shipped the same
day).*

| tag | tagged | phases attributed |
|---|---|---|
| v1.40.0 | 2026-07-04 | 150–152 (**evidenced** — phase 152 is the release phase) |
| v1.41.0 | 2026-07-04 | 153–154 (**evidenced** — phase 154 is the release phase) |

Two same-day releases closing out a legibility bug and opening a structured write path. Phase
150 was found while dogfooding phase 149 (issue #135): `status.ts` and `notify/collect.ts` each
carried a byte-identical private `parseAcRefs(done: string)` whose exact-match regex
(`/^AC-\d+$/`) silently dropped any comma-token with trailing annotation text — e.g. `done: AC-1,
AC-2, AC-3, AC-4 (core logic)` parsed to only three ids, leaving AC-4 stuck `pending` with no
diagnostic pointing at the real cause. The fix de-duplicated both private copies into one shared,
tested `packages/core/src/parse/ac-refs.ts` using a per-token prefix match. Phase 151 is the
larger piece: three new additive `cadence draft` subcommands (`set-objective`, `add-ac`,
`add-task`) that mutate a PENDING `DRAFT.md`'s sections from the CLI, round-tripping byte-exactly
through `parseDraftMd`/`renderDraftBody` — hand-editing stays fully supported, this just closes
the class of bug where a hand-typed heading typo silently corrupts AC/task id sequencing. Phase
152 released v1.40.0, documenting the three subcommands in `commands.md` and bundling phases
139-151. The second half of the arc, phase 153, closes MCP tool-parity gaps in the
scout-to-phase intelligence lifecycle: an MCP-only client could add or promote a recommendation
but not convert it to a phase, propose a milestone, or archive it. Three new thin-wrapper tools
(`cadence_recommendation_convert`, `cadence_milestone_propose`, `cadence_recommendation_archive`)
plus a `cadence://phase/{phase}/summary.json` resource close that gap, and the
`cadence_recommendation_promote` tool description was rewritten to point at the two new tools
instead of a CLI-only dead end. Phase 154 released v1.41.0, documenting the additions in
`docs/mcp.md` and bumping the advertised tool count from 15 to 18. All four published packages
bumped `1.39.0 → 1.40.0 → 1.41.0` in lockstep across the two releases. **No new DESIGN.md
D-number** in either version (both additive to existing models: the draft-parsing model and the
D11 MCP imperative-loop surface).

- **Phase 150 — AC-ref parser drops ids after trailing annotation** ✓ — deduplicated the
  byte-identical private `parseAcRefs` from `status.ts` and `notify/collect.ts` into a shared
  `packages/core/src/parse/ac-refs.ts` using a per-token prefix match instead of the exact
  whole-token match, so a trailing annotation after a valid `AC-N` id no longer silently drops it.
- **Phase 151 — structured draft editing: `draft add-ac` / `add-task` / `set-objective`** ✓ —
  three additive CLI subcommands that mutate a PENDING `DRAFT.md`'s Objective/AC/Tasks sections,
  round-tripping byte-exactly through `parseDraftMd`; `add-task --done` refuses on an unknown AC
  id, all three refuse outside `PENDING` status.
- **Phase 152 — Release v1.40.0** ✓ — documented the three phase-151 subcommands in
  `docs/reference/commands.md`; lockstep `1.39.0 → 1.40.0` across all four published packages;
  bundled phases 139-151.
- **Phase 153 — MCP parity for the intelligence lifecycle** ✓ — added
  `cadence_recommendation_convert`, `cadence_milestone_propose`, `cadence_recommendation_archive`
  as thin wrappers over the existing service/store functions, a `summary.json` MCP resource, and
  rewrote the `cadence_recommendation_promote` description to name the two new tools as real
  next steps.
- **Phase 154 — Release v1.41.0** ✓ — documented phase 153's three tools + resource in
  `docs/mcp.md` (tool count 15 → 18); lockstep `1.40.0 → 1.41.0` across all four published
  packages.

- **Scope guards (as built).** *In:* the AC-ref parser fix, the three structured-draft-editing
  subcommands, the two release cuts, the three MCP intelligence-lifecycle tools, the
  SUMMARY.json resource, the promote-description fix. *Out:* phase 153 explicitly declined
  `cadence_recommendation_unarchive` and `cadence_milestone_accept/defer/export` MCP tools —
  out of scope per rec-20260701-010's stated fix list, left as a follow-up recommendation if more
  parity is wanted later.

## v1.42.0 — Boundary enforcement + subagent dispatch — ✓ SHIPPED 2026-07-06

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/155–160`; those
artifacts are the record and were not modified. Phase→version boundaries **evidenced**
(phase 160 is the release phase for this tag).*

`boundaryEnforcement` shipped warn-only: the pre-tool hook could see an edit land outside
the DRAFT's declared `files:` and say so, but nothing refused, and settle never
re-derived the violation from the diff — so a boundary was a suggestion at the moment it
mattered most, the completion claim. This milestone closes both ends. The dispatch work
is the other half of the same session-discipline problem: `cadence dispatch plan` turns
the approved DRAFT's `depends:` graph into dependency-ordered waves, and phase 158 makes
a worker that keeps editing *after* reporting DONE visible instead of silent. All six
phases settled; all published packages bumped `1.41.0 → 1.42.0` in lockstep. **No new
DESIGN.md D-number** (additive to the existing boundary + dispatch models).

- **Phase 155 — boundary-enforcement `block` mode** ✓ (rec-20260704-001) — opt-in
  `boundaryEnforcement: 'block'`; the pre-tool edit check refuses the edit rather than
  warning. Default `warn` behavior byte-for-byte unchanged.
- **Phase 156 — settle-time boundary diff scan** ✓ — direct follow-on to 155: settle
  re-derives touched paths from the diff and compares them against the DRAFT's `files:`,
  so a violation that dodged the edit-time hook is still caught at the completion claim.
- **Phase 157 — multi-line Objective truncation fix** ✓ (rec-20260704-002) —
  `parseSpecMd` kept only the first line of a multi-line `## Objective`, silently
  discarding SPEC content downstream of the parse.
- **Phase 158 — subagent task-redundancy monitoring** ✓ — post-DONE file touches
  detected at edit time and at `SubagentStop`.
- **Phase 159 — wave-based subagent dispatch** ✓ — `cadence dispatch plan` emits
  dependency-ordered dispatch waves from the approved DRAFT.
- **Phase 160 — Release v1.42.0** ✓ — changeset consumed; lockstep `1.41.0 → 1.42.0`;
  CLAUDE.md narrative leads with `1.42.0`.

- **Scope guards (as built).** *In:* both boundary-enforcement halves, the SPEC parser
  fix, redundancy monitoring, dispatch waves, release. *Out:* `block` as the default
  (`warn` remains default); automatic wave *execution* — `dispatch plan` emits the plan,
  the operator/host runs it.

## v1.43.0 – v1.44.1 — Trustworthy verification, gate/settle audit-trail integrity, onboarding polish — ✓ SHIPPED 2026-07-10 → 07-12

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/161–177`. None of
these tags has a dedicated release phase, so the phase→version attribution below is
**date-derived** (settle date vs tag date) and is approximate at the boundaries.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.43.0 | 2026-07-10 | 161–164 |
| v1.44.0 | 2026-07-11 | 165–169 |
| v1.44.1 | 2026-07-12 | 170, 171, 173, 174, 176, 177 |

Three threads run through this window. The first is closing the "mock-default undercuts the
enforcement wedge" competitive risk end to end: phase 164 makes verifier-key discovery reach
beyond `export`ed env vars (`.env` file, committed provider config) and turns `cadence activate`
into a real smoke-tested call instead of a key-string check; phase 165 adds a 4th verifier
provider (`host-cli`) that shells out to the user's already-authenticated `claude`/`codex`
binary so independent verification works with zero separately-configured API key; phases 166–167
generalize assertion-mode coverage from a JS/TS-only scanner into a shared lexer engine with
built-in python/go/rust/php profiles (167 is this arc's other complex-tier keystone, alongside
163); phase 169 closes a real documented gap — a test hidden behind `.skip`/`.todo`/`.failing`
no longer counts as qualifying coverage even with an intact assertion inside it. The second
thread is settle/gate audit-trail integrity: phase 170 makes a refusing gate persist a SUMMARY
instead of vanishing with only an ephemeral stderr line, phase 173 adds optimistic-concurrency
revision checking to the single state-write choke point so two racing writers can't silently
lose an update, and phase 176 closes the last gap in that story — a gate that *throws* (not just
one that refuses) now also produces an audited SUMMARY. The third thread is onboarding and
portfolio polish: phase 161 sweeps stale surface-model/Claude-Code-only doc claims and adds a
CTO-facing README section, phase 162 makes Codex a one-command bootstrap target, phase 163
(complex tier) hardens `cadence resume`/`handoff` with fetch-backed freshness checks and a
completion gate, phase 171 fixes a real destructive-install incident (malformed
`.claude/settings.json` silently wiped third-party hooks), and phase 174 adds a post-settle
retro digest with an optional `gh issue` offer. The test-gutting demo becomes the README's
flagship example across three phases: 168 lands it as a committed, deterministic example; 175
(no phase directory — see numbering ledger) repositions the README hero to lead with it; a stale
branch merge (PR #189) accidentally reverted that hero back to billsplit-only, and 177 restores
it with an animated `gutting.svg` terminal recording. All published packages advanced
`1.42.0 → 1.43.0 → 1.44.0 → 1.44.1` in lockstep across the three tags. **No new DESIGN.md
D-number** (D12 predates this window at Phase 70; nothing here crossed a locked-decision
boundary).

- **Phase 161 — Portfolio readiness doc sync** ✓ — normalized "one engine, three surface
  categories ... four current entry points" vocabulary across README/docs/DESIGN.md/CONTEXT.md,
  removed stale "Claude Code only"/exclusive-ambient-gates claims (Codex now described as a
  shipped host-adapter/conformance consumer), added a "For technical reviewers" section + Mermaid
  architecture diagram + portfolio summary to README, backed by a new doc-content assertion test.
- **Phase 162 — Codex first-run bootstrap** ✓ (rec-20260708-001) — added a Codex bootstrap entry
  point that shells out to the Codex host installer, generalized the managed agent block so
  `AGENTS.md` generates/regenerates alongside `CLAUDE.md`, added Codex readiness doctor
  checks/fixes, and documented the pre-Codex first-run ordering with a CLI fallback.
- **Phase 163 — Handoff/Resume hardening: freshness & completion gates** ✓ — fetch-backed git
  facts (`readGitFacts` fetches by default, `--no-fetch` opt-out), an origin-ahead banner
  (`checkRemoteFreshness`, `config.resume.remoteCheck`, `--offline`), unfilled
  `<!-- FILL IN -->` section detection on resume, a new `cadence handoff --check` completion
  gate (exit 0/1/3), and handoff's files-in-play capped to the same selected recs every other
  scope uses.
- **Phase 164 — Trustworthy verifier activation** ✓ — broader key discovery
  (`discoverKey`: env var, then a repo-root `.env` file, no new runtime dependency), a
  non-skippable activation smoke test gating `cadence activate`'s reported success on one real
  provider call, and committed-provider-config inheritance so a teammate with the same kind of
  key inherits real verification without running `activate` themselves; an as-built T5 amendment
  threaded `cwd`/`repoRoot` into 6 real production verifier-selection call sites (doctor, settle
  ×3, build/draft gates, spec-approve) after independent review found the unit-tested primitives
  alone didn't reach `cadence mcp serve --repo <path>`.
- **Phase 165 — Host-CLI headless verifier provider** ✓ (rec-20260710-002) — a 4th verifier
  provider (`host-cli`) spawning the user's already-authenticated `claude`/`codex` binary in
  headless mode; the JSON-extraction/schema-repair-retry harness was factored out of
  `local-client.ts` into a shared transport-agnostic module reused by both providers; loud,
  non-blocking mock fallback when the binary is missing/unauthenticated. As-built: only
  `per-task-verify` got a real `hostCli` builder wired end-to-end — `deep-verify` and the other
  4 review families still fall back to mock, narrowing AC-1's original scope. Per-gate-run
  batching (rec-20260710-004) and the MCP-driven inversion alternative (rec-20260710-003) were
  explicitly deferred.
- **Phase 166 — Language-aware coverage defaults** ✓ — `cadence init` now defaults
  `verification.coverageMode: 'assertion'` only for detected js/ts projects; every other/unknown
  language defaults to `mention` with language-aware default test-file globs (python/go/rust/php);
  the test-coverage gate's refusal message now distinguishes a glob-discovery miss from an
  assertion-parsing miss, and `cadence doctor` flags assertion mode paired with a non-js/ts
  detected language.
- **Phase 167 — Shared-lexer multi-language assertion-coverage engine** ✓ — generalized
  `findTestSpans` into one shared string/comment-aware engine parameterized by a per-language
  profile (opener/assertion patterns, comment/string tables, one of four block-boundary
  strategies), re-expressing js/ts with byte-identical behavior and shipping built-in
  python/go/rust/php profiles, per-file dispatch with a strict zero-spans-on-unrecognized-shape
  invariant, an add-only `verification.coverageProfiles` config escape hatch with load-time
  validation, a `cadence verify coverage --explain` diagnostic, and a doc-tested supported-
  language matrix. Zero new runtime dependency — homegrown lexer, no tree-sitter (dec-20260711-001,
  LOCKED).
- **Phase 168 — Land test-gutting demo as a committed example** ✓ — extracted
  `docs/demo-test-gutting.zip` into `examples/demo-test-gutting/`, verified `run-demo.sh`
  end-to-end against a locally built v1.43.0 CLI, reconciled `docs/DEMO.md`'s transcripts against
  real v1.43 output (Beat 3's refusal message had drifted under phase 166's diagnostics),
  confirmed determinism across two independent runs.
- **Phase 169 — Assertion-mode coverage refuses the .skip/.todo/.failing dodge** ✓ — an AC
  linked only to a `test.skip`/`.todo`/`.failing` block with an intact assertion call no longer
  counts as qualifying; `findTestSpans` flags skip/todo/failing openers as non-asserting
  regardless of assertion-token presence, and a new distinct refusal message ("only linked test
  is skipped") separates this case from "no linked test" and "mentioned but not asserting."
- **Phase 170 — Refused settle persists gate provenance + SUMMARY** ✓ — added a `refused`
  `GateProvenance` status + `reason` field (additive, back-compat with pre-existing ran/skipped
  records), threaded the refusal reason verbatim through all 9 settle-dispatched gate impls, and
  a refused settle now persists `SUMMARY.json`/`.md` with the gates array populated through the
  refusing entry and zero `loopPosition`/`activeDraft` mutation.
- **Phase 171 — Installer destructive-recovery: preserve third-party settings on parse failure**
  ✓ — fixes the real deja-hooks-wiped incident (31f1351 / PR #170): `installHooks()` now
  distinguishes `ENOENT` (still starts fresh) from malformed JSON (now refuses the install
  instead of resetting to `{}`), and every successful write goes through a timestamped backup +
  atomic temp-file rename.
- **Phase 173 — Optimistic concurrency for cadence state writes** ✓ — added a `revision` field
  to `CadenceState` (default 0, backward-compatible) and an optimistic-concurrency check in
  `SimpleStateBackend.commit()` — the single write choke point every writer (CLI, hooks, MCP)
  shares — refusing a stale commit with a new `StateConflictError` naming both revisions, while a
  single command's own sequential commits on one in-memory object never self-conflict. Lock
  files/PID tracking were explicitly rejected during spec review in favor of pure in-process
  comparison.
- **Phase 174 — Post-settle retro artifact + GitHub issue offer** ✓ (rec-20260712-001) — every
  successful settle now synthesizes a friction digest (gate bypasses, non-DONE tasks,
  code-review/security-audit/boundary-scan findings) from data already in SUMMARY, writes it as
  `<draftId>-RETRO.json`/`.md`, and — only for a friction-having digest on an interactive run —
  offers to file a GitHub issue via `gh`; fully config-toggleable and non-fatal on any failure.
  Cross-phase retro rollup and Praxis-scoring feedback (rec-20260712-002/003) explicitly deferred.
- **Phase 175 — README leads with the test-gutting demo** ✓ (no phase directory — see numbering
  ledger) — repositioned README's hero section to lead with the test-gutting demo (docs/DEMO.md's
  "Your CI is green. Cadence still said no." framing) ahead of the existing $100/3 billsplit
  demo, which was kept as a secondary example rather than deleted.

*(Phase 172 was never used — see the numbering ledger.)*

- **Phase 176 — Audit trail for settle gate throws** ✓ (rec-20260712-007) — `runSettleGates` now
  catches any exception thrown by a gate impl (previously only `security-audit` self-normalized
  its own throws) and converts it into a `refuse` `GateResult`, routing it through phase 170's
  refusal path so a raw throw also produces an audited SUMMARY instead of escaping uncaught to
  `settle.ts`'s outer catch with no record at all.
- **Phase 177 — README embeds the animated test-gutting demo SVG** ✓ — restored README's
  test-gutting-demo hero (accidentally reverted to the old billsplit-only version when PR #189
  merged a stale branch over phase 175's PR #188), this time replacing the static Beat-3
  transcript with a looping `gutting.svg` terminal recording of all 4 DEMO.md beats, and
  committed the new recording assets (`gutting.svg`, `gutting.cast`, `record-demo.sh`).

- **Scope guards (as built).** *In:* doc/portfolio polish, Codex onboarding, handoff/resume
  freshness + completion gates, verifier-trustworthiness (broader key discovery + activation
  smoke test + committed provider config), the host-cli verifier provider, language-aware
  coverage defaults plus the full multi-language coverage engine (python/go/rust/php), closing
  the `.skip` dodge, refused-settle and gate-throw SUMMARY persistence, installer parse-failure
  recovery, optimistic-concurrency state writes, the post-settle retro artifact, and the
  test-gutting demo becoming the README's flagship example. *Out:* OS keychain key discovery and
  `local`-provider activation smoke-testing (phase 164); per-gate-run batching, quota-transparency
  messaging, and the MCP-driven inversion alternative for the host-cli provider (phase 165); new
  per-language assertion-span parsing beyond the four shipped profiles (phase 166); a
  `--collect-all` "keep running all gates after a refusal" diagnostic mode (phase 170); an
  explicit opt-in `install --repair` auto-fix path (phase 171); cross-phase retro rollup and
  Praxis-scoring feedback from retro friction (phase 174).

## v1.45.0 – v1.46.0 — Verifier/security hardening + onboarding ergonomics — ✓ SHIPPED 2026-07-15 → 07-17

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/178–191`. None of
these tags has a dedicated release phase, so the phase→version attribution below is
**date-derived** (settle date vs tag date) and is approximate at the boundaries.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.45.0 | 2026-07-15 | 178–185 |
| v1.46.0 | 2026-07-17 | 186–191 |

This arc's first half hardens the parts of CADENCE that talk to external processes or persist
sensitive data: the headless host-CLI verifier gets a quota-transparency notice, a
self-invocation guard, and a spawn timeout (178); a shared `redactSecrets` utility closes two
verbatim-secret leak vectors — `Evidence.summary` and `security-audit` `Finding.message`
(including a second stderr-logging leak the T3 implementer caught mid-task) — and restricts
intelligence-ledger JSON files to `0o600` (180); MCP's two approval-bypass tools
(`cadence_draft_approve`/`cadence_spec_approve`) gain a caller-issued trust envelope bound to
origin, a structural tool-def hash, a capability class, and expiry, closing the "the tool call
IS the approval" gap with no revoke/expiry logic (181, complex tier); a `security-audit`-scoped
`AbortSignal`/`traceId` threads through `host-cli-client.ts`, the `Verifier` interface, and
`SecurityAuditVerifier`, wired end-to-end for one real gate to prove it's connected, not orphaned
(184); and CI gains CodeQL, gitleaks secret scanning, an npm-audit-exceptions policy, and
SBOM/license-inventory generation, all on push/PR/weekly cron (182). Alongside the security
theme, 179 adds `cadence milestone status` (read-only worktree fan-in reconciliation), 183
extends the generated-docs drift-check discipline to per-command flags/config schema
keys/exit-code taxonomy, and 185 makes the pre-release tarball smoke test exercise the real
DRAFT→BUILD→SETTLE loop instead of just `--help`. All eight phases settled; published packages
bumped to `1.45.0` in lockstep. The second half is a smaller, ops/DX-focused batch: a read-only
`cadence retro` cross-phase friction rollup (186); a fix so `--allow-auto-complex` soft-cap
overrides actually land in `SUMMARY.json`'s `gateBypasses` instead of being stderr-only (187); a
new `init --full` mega-flag and a `cadence onboard` command for the 2nd-Nth teammate cloning an
already-`.cadence/`-initialized repo (188, 189); `doctor --fix` auto-remediation for the
handoff-retention check, reusing the existing pruning primitives (190); and host-cli builders
wired for the 5 verifier families phase 165 left unwired — spec-review, plan-review, code-review,
security-audit, and deep-verify — closing a real-world gap where a downstream project's
`host-cli`-configured spec-review gate was silently rubber-stamping via mock fallback (191).
Published packages bumped to `1.46.0` in lockstep. **No new DESIGN.md D-number** resulted from
either version.

- **Phase 178 — headless-verifier guardrails** ✓ (rec-20260710-006) — `host-cli-client.ts` gets a
  once-per-process quota-transparency stderr notice, a self-invocation refusal (detects running
  inside the same host-CLI family via its session env var, falls back to mock through the
  existing `wrapWithFallback` path), and a configurable spawn timeout (`HostCliError({reason:
  'timeout'})`). As-built: the self-invocation env-var check also fires for ordinary Claude-Code
  subagent sessions (this repo's own standard workflow), so two more pre-existing test suites
  needed `env: {}` pinning to stay deterministic.
- **Phase 179 — `cadence milestone status`** ✓ — read-only fan-in command mapping a milestone's
  converted recommendations to their owning worktree (local/sibling, via phase 142's
  `gatherHandoffCandidates`) and that worktree's live loop position; unconverted recs and
  unmatched phases are reported as `not-yet-converted`/`no-worktree-found`, never dropped.
  Fan-out (automated worktree provisioning) stays explicitly out of scope.
- **Phase 180 — secret redaction for evidence + security-audit findings** ✓ — new
  `redactSecrets()` utility (AWS keys, GitHub tokens, bearer/basic auth headers, JWTs, PEM
  blocks, generic `key=`/`token=`/`password=`/`secret=` assignments) applied at
  `addRecommendation`'s evidence-summary write and the `security-audit` gate's `Finding.message`
  write; intelligence ledger JSON files now write `0o600` on POSIX. As-built: also closed a
  second leak the T3 implementer found — the gate's stderr critical-finding log was printing the
  raw unredacted message even after the SUMMARY write was fixed.
- **Phase 181 — MCP tool-trust envelope** ✓ — the 18 registered MCP tools get a `capabilityClass`
  (`READ_ONLY`/`LEDGER_WRITE`/`LOOP_WRITE`/`APPROVAL_BYPASS`/`SETTLE`); a structural
  `computeToolDefHash` fingerprints name+description+inputSchema; a file-backed
  `.cadence/mcp-trust.json` grant ledger plus `cadence mcp trust grant/revoke/list` CLI; the two
  `APPROVAL_BYPASS` tools now refuse without a valid, unexpired, def-hash-matching,
  version-matching grant, naming the failing check. `cadence_settle` (`SETTLE` class) is
  classified but deliberately left ungated this phase.
- **Phase 182 — CI security automation** ✓ (rec-20260712-013) — new `codeql.yml`
  (javascript-typescript, push/PR/weekly cron) and consolidated `security.yml` (gitleaks secret
  scan, npm-audit-exceptions policy against `docs/security/audit-exceptions.md`, CycloneDX
  SBOM + license inventory, all on push/PR/weekly cron). As-built: `pnpm audit` under the
  repo's pinned pnpm hits npm's retired legacy audit endpoint, so the audit cross-check needed a
  dedicated `scripts/check-audit-exceptions.mjs` running a pinned modern pnpm via corepack.
- **Phase 183 — generated-docs drift check** ✓ (rec-20260712-012) — extends the existing
  drift-guard discipline to per-command registered flags (`commands.md`), the config schema's
  top-level key set (`config.md`), and a new `docs/reference/exit-codes.md` cross-checked against
  every exit-code literal actually used in `packages/core/src`; all as vitest assertions under
  the existing `ci-success` test job, no new workflow needed.
- **Phase 184 — verifier AbortSignal/traceId plumbing** ✓ (rec-20260712-010) — optional
  `signal`/`traceId` threaded through `host-cli-client.ts` (new `HostCliError` reason
  `'aborted'`), the `Verifier` interface (`LocalVerifier` forwards to `fetch`, `MockVerifier`
  ignores), and `SecurityAuditVerifier`; the `security-audit` gate generates a per-run
  `crypto.randomUUID()` traceId and passes it through on its one real call site, proving the
  plumbing is genuinely connected for at least one gate. `PerTaskVerifier`/`CodeReviewVerifier`/
  `PlanReviewVerifier`/`SpecReviewVerifier` explicitly deferred to a future phase.
- **Phase 185 — smoke-test the packed npm tarball** ✓ — `scripts/publish-proof.mjs`'s
  post-install check now runs `cadence init` → `draft new` → `draft approve` → `build task
  --status=DONE` → `settle run --auto` (5 steps — the approve step wasn't anticipated when AC-1
  was drafted) against the verdaccio-installed CLI inside the clean temp project, not just
  `--help`; teardown stays unconditional on a mid-loop failure. Not wired into CI in this phase.
- **Phase 186 — cross-phase retro rollup** ✓ (rec-20260712-002) — read-only `cadence retro` scans
  every settled phase's `*-RETRO.json`, computing gate-bypass/rough-task-status/finding-category
  frequency counts with recurring-vs-one-off buckets so a 2+-phase pattern isn't buried under
  one-off noise; empty/missing/malformed-artifact cases handled per the repo's best-effort
  introspection convention. Feeding retro friction into Praxis scoring (rec-20260712-003) stays
  explicitly out of scope.
- **Phase 187 — `gateBypasses` records `--allow-auto-complex` overrides** ✓ — fixes
  `settle.ts`'s and `draft-approve.ts`'s soft-cap override checks being stderr-only and invisible
  to `SUMMARY.json`'s `gateBypasses`, contradicting CLAUDE.md's "every bypass is loud and
  recorded" claim; new `auto-complex-override` `AnomalyType` wired through settle's
  `gateBypassesFromAnomalies` and draft-approve's `anomaly-notify` notifier pathway.
- **Phase 188 — `cadence init --full`** ✓ — collapses `--wire-host`/`--demo`/`--activate` into
  one flag (`opts.wireHost ?? opts.full` per flag — an explicit flag still overrides `--full`'s
  default), degrades safely when preconditions (host workspace, `ANTHROPIC_API_KEY`) are absent,
  and prints a consolidated "what I did/skipped" summary alongside (not replacing) the existing
  per-feature messages. Bare `cadence init` behavior is byte-for-byte unchanged.
- **Phase 189 — `cadence onboard`** ✓ — one-command per-machine setup for a teammate cloning a
  repo with `.cadence/` already committed: installs host hooks via a newly-extracted shared
  `host-wire.ts` module (also used by `init --full`), reports project name/gate profile/
  provider-readiness without touching `config.json`/`state.json`, and refuses cleanly with no
  `.cadence/` present; `cadence init` now seeds a merge-idempotent `CONTRIBUTING.md` block
  pointing the next contributor at it.
- **Phase 190 — `doctor --fix` auto-remediates handoff retention** ✓ — a deliberately narrowed
  slice of rec-20260709-002: when `handoff.retain` is unset and the SESSION-doc archive exceeds
  the existing warn threshold, `--fix` now sets the default and prunes to budget via the
  existing `pruneHandoffDir`/`selectPrunable` primitives (never reimplemented), always retaining
  the current `lastHandoff` file. The other four manual-only checks (`worktree-phases`,
  `verification-readiness`, `recommendation-shipped-drift`, `coverage-mode-language-support`)
  stay manual — each needs a genuine judgment call doctor can't safely automate.
- **Phase 191 — host-cli builders for the last 5 verifier families** ✓ — wires a real
  `HostCli*Verifier` for spec-review, plan-review, code-review, security-audit, and deep-verify
  (`Verifier`), each mirroring the existing `HostCliPerTaskVerifier` pattern against its family's
  own prompt/schema; security-audit and deep-verify additionally thread `{signal, traceId}`
  through to `hostCliJSON`. Closes a real gap surfaced by a downstream project ("necro") whose
  `host-cli`-configured spec-review gate was silently mock-falling-back and rubber-stamping.

- **Scope guards (as built).** *In:* headless-verifier guardrails, milestone worktree
  reconciliation, secret redaction + ledger file permissions, the MCP trust envelope (minus
  `cadence_settle`), CI security automation, docs-drift checks, abort-signal plumbing for
  `security-audit`, a real-loop tarball smoke test, the retro rollup, the `gateBypasses` fix,
  `init --full` + `cadence onboard`, doctor's handoff-retention auto-fix, and host-cli builders
  for the remaining 5 verifier families. *Out:* MCP request batching (178); gating
  `cadence_settle` under the trust envelope (181); retro-friction-feeds-Praxis-scoring
  (rec-20260712-003, 186); abort-signal plumbing for `PerTaskVerifier`/`CodeReviewVerifier`/
  `PlanReviewVerifier`/`SpecReviewVerifier` (184); wiring `publish-proof.mjs` into CI (185); the
  other four manual-only doctor checks (190); adding `{signal, traceId}` to the four verifier
  interfaces phase 184 didn't touch (191).

## v1.47.0 – v1.48.0 — Dispatch-safety hardening, worktree-safe state tracking, and intelligence-ledger fixes — ✓ SHIPPED 2026-07-18 → 07-19

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/192–200`. Phase→version
boundaries are **evidenced**, not date-derived — the two release commits (`1923f6bb` for
v1.47.0, `0bec56bb` for v1.48.0) each enumerate their exact bundled phase list in the commit
body. That evidence puts the split at 194/195, not 195/196 as a pure settle-date-vs-tag-date
comparison would suggest (phase 195 settled 2026-07-18T22:50Z, before the v1.47.0 tag's commit
time of 16:12Z-05:00 on the same calendar day but after the tag's UTC cut — the release commit
is the disambiguating source of truth here). v1.48.0's release also bundled phase 201, one phase
past this arc's boundary; it is out of scope for this fragment.

| tag | tagged | phases attributed (evidenced via release-commit body) |
|---|---|---|
| v1.47.0 | 2026-07-18 | 192–194 |
| v1.48.0 | 2026-07-19 | 195–200 (of the release's 195–201; 201 is outside this arc) |

The arc opens with a real incident: on 2026-07-18, a dispatched fork agent in the deja repo
self-recorded its own `cadence build`/`settle` outcome and committed directly to `main` four
times, unsupervised, before any orchestrator review (rec-20260718-001). Phases 192–193 are the
direct fix — a mandatory prohibition block in every rendered dispatch packet forbidding an agent
from self-recording status, plus a `recommendIsolation` heuristic (rec-20260718-002) that
surfaces `'worktree'|'none'` per task in `dispatch plan`'s output so isolation stops being pure
human/skill convention. Phase 194 closes a live StateConflictError bug (issue #234): telemetry-only
counters (`session.subagentSpawns`) were going through the same revision-guarded
`SimpleStateBackend.commit()` as structural writes, so a long-running verifier gate could get
invalidated by an unrelated `SubagentStop` telemetry bump; `bumpSessionCounter` gives telemetry a
write path exempt from the optimistic-concurrency compare-and-swap while structural state keeps
its existing guard unchanged. Phase 195 adds the `task-verify-required` settle gate (issue #206,
rec-20260712-001) — settle no longer writes a bare `T1: DONE` into SUMMARY.md when a task's
`- verify:` line was empty; gate count goes 13→14. Phase 196 is the arc's keystone: it fixes
issue #177 (cross-worktree `.cadence/state.json`/`STATE.md` merge conflicts) by gitignoring the
four CADENCE-owned ephemeral paths by default, adding a `doctor --fix` migration, preserving the
audit-trail value of a tracked `state.json` via a new `stateAtSettle` SUMMARY snapshot, adding
conflict-marker diagnosis + a `--resolve-state-conflict` repair flag, and self-migrating this
repo's own tracked state. Phase 197 is 196's necessary fallout: making `state.json` per-worktree
silently broke `cadence onboard`'s bootstrap path for a fresh worktree or clone, dead-ending every
state-reading command in `NotInitializedError`; `onboard` now bootstraps a fresh IDLE
`state.json`, deriving the project name from `PROJECT.md`'s header rather than `package.json`
(which disagrees with it in this very repo). Phase 198 closes a CodeQL ReDoS finding (issue #249)
by length-capping `--filter-regex` before compilation in `assumption`/`decision`/`recommendation`.
Phases 199–200 round out the intelligence-ledger CLI: `recommendation evidence add` (issue-free,
a genuine gap — the only prior path to attach evidence to an existing recommendation was a manual
lockstep hand-edit of two files), and a fix for `nextRecommendationId` colliding with archived IDs
once every same-day recommendation had been archived (issue #248). All nine phases settled;
v1.47.0 and v1.48.0 both landed as `@manehorizons/cadence-core` minor bumps with the other three
published packages patch-cascaded to match (a known, manual, recurring lockstep step per the
v1.48.0 release commit — changesets' `fixed`/`linked` config is intentionally left empty). **No
new DESIGN.md D-number** (D12 remains the latest entry; this arc's work is additive to the
existing state-backend, gate-matrix, and dispatch-packet models).

- **Phase 192 — dispatch-packet action-class prohibition boilerplate** ✓ (rec-20260718-001) —
  mandatory prohibition block added to `renderPacket`'s output forbidding a dispatched agent
  from self-recording its own `cadence build task --status=...` outcome; instructs it to stop
  and report to the orchestrator instead. `docs/reference/commands.md`'s dispatch-plan Behavior
  paragraph updated to match.
- **Phase 193 — dispatch-plan worktree-isolation recommendation** ✓ (rec-20260718-002) — pure
  `recommendIsolation(task)` heuristic (`'worktree'` when a task declares `files:`, `'none'`
  otherwise) threaded into `renderPacket`'s text and into `dispatch plan --json`'s
  `DispatchTaskPlan.recommendedIsolation` field.
- **Phase 194 — telemetry-only session counters exempted from the revision guard** ✓ — new
  `StateBackend.bumpSessionCounter` write path for `session.subagentSpawns` that bypasses
  optimistic-concurrency compare-and-swap, fixing a deterministic `StateConflictError` (issue
  #234) when a host-cli verifier gate overlapped a concurrent telemetry-only commit; structural
  state's revision guard is unchanged (confirmed by a new structural-conflict regression test).
- **Phase 195 — `task-verify-required` settle gate** ✓ (rec-20260712-001) — settle now refuses
  to finalize a task as DONE when its DRAFT `- verify:` field is empty, closing issue #206;
  registered in `standard`+`complex` tiers across all profiles; gate matrix count 13→14.
- **Phase 196 — worktree-safe state tracking** ✓ — `state.json`, `STATE.md`, `mcp-trust.json`,
  and `intelligence/context/` gitignored by default (issue #177) with a `doctor --fix` migration;
  new `stateAtSettle` SUMMARY snapshot preserves the audit-trail value a tracked `state.json` used
  to carry incidentally; conflict-marker diagnosis plus a `--resolve-state-conflict` repair flag
  added; every non-conflict-repairing catch site funnels through a shared `formatCommandError`
  pointer to the fix; this repo's own tracked `.cadence/` state self-migrated in the same phase.
- **Phase 197 — `cadence onboard` bootstraps missing `state.json`** ✓ — closes the dead-end 196
  left for a fresh worktree or a fresh clone of a repo with `.cadence/` already committed;
  `onboard` now creates a fresh IDLE `state.json`, deriving the project name from `PROJECT.md`'s
  header (not `package.json`, which disagrees with it here); `doctor`'s missing-state-json
  remediation text corrected to point at the real fix.
- **Phase 198 — `--filter-regex` length bound (ReDoS guard)** ✓ — closes issue #249 (CodeQL):
  `assumption.ts`/`decision.ts`/`recommendation.ts` now reject oversized `--filter-regex`
  patterns before compiling them with `new RegExp(...)`; guard duplicated per-file matching the
  existing `parseRegexFlags` precedent, no new shared helper or runtime dependency.
- **Phase 199 — `cadence recommendation evidence add` CLI writer** ✓ — new
  `addEvidenceToRecommendation` store function atomically appends an evidence entry and links its
  id into the target recommendation's `evidenceIds`, closing the only remaining path that
  required a manual, easy-to-desync hand-edit of `evidence.json`/`recommendations.json` together.
- **Phase 200 — recommendation-ID collision fix (archived IDs)** ✓ — `nextRecommendationId` now
  scans `ledger.archived` as well as `ledger.recommendations` when computing the next same-day
  sequence number, closing issue #248 (a day where every recommendation had been archived reset
  the counter to `001` and collided with the first ID issued that day); the other three ledger
  types' next-ID functions are unaffected by design.

- **Scope guards (as built).** *In:* dispatch-packet self-record prohibition, the isolation
  recommendation heuristic, the telemetry revision-guard exemption, the verify-evidence settle
  gate, worktree-safe state tracking end-to-end (gitignore + migration + `stateAtSettle` +
  conflict repair), the onboard bootstrap fallout fix, the ReDoS length guard, and both
  intelligence-ledger CLI/store fixes. *Out (phase 192):* worktree-default isolation itself and
  an `isolation` schema field — explicitly deferred to rec-20260718-002 (phase 193). *Out (phase
  198):* a catastrophic-backtracking heuristic or a shared validator module — a fixed length cap
  duplicated per-file was the chosen scope.

## v1.49.0 – v1.50.0 — Praxis lifecycle UX + consumer-repo CI verification — ✓ SHIPPED 2026-07-20 → 07-22

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/201–211`. Neither tag has a dedicated release phase, so the phase→version attribution below is **date-derived** (settle date vs tag date) and is approximate at the boundaries.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.49.0 | 2026-07-20 | 201–203 |
| v1.50.0 | 2026-07-22 | 204–211 |

v1.49.0 closed out three long-standing gaps in the Praxis intelligence layer's own lifecycle tooling: a milestone pre-mortem had no CLI path for an operator to add judgment calls the deterministic heuristics can't derive (201), a deferred milestone had no way back to `proposed` short of hand-editing `milestones.json` (203), and reviewers had no deterministic way to see gate/settle results without opening raw `SUMMARY.json` (202, the first half of the "team rollout kit" rec — the CI-gate-generator half was explicitly deferred to a later phase). v1.50.0 is the larger of the two: its keystone is 204's `cadence verify phase` + `cadence init --ci` — phase-scoped, state-independent re-derivation of whether a settled phase's AC coverage still holds, plus a GitHub Actions scaffold that calls it — which is exactly the CI-gate half 202 deferred. Alongside it: an opt-in UI-SPEC gate between SPEC and DRAFT for UI-heavy phases (205), a `cadence next` command that surfaces `nextAction()`'s ranked legal moves at any loop position with a versioned `--json` contract (206), a sweep making every intelligence-layer empty-result/refusal message name its precondition, nearest candidates, and unblocking command (207, which also picks up the empty-state-footer integration 206 explicitly deferred), a `cadence doctor` check plus CLAUDE.md/skill guidance against concurrent-session collisions on the same phase/draft (208 — this is the origin of the "Zombie Session" named failure mode), and a three-phase split closing out the "Claude Code login ≠ `ANTHROPIC_API_KEY`" confusion across the runtime warning (209), the docs (210), and `doctor`/`activate`'s CLAUDECODE-aware messaging (211). **No new DESIGN.md D-number** in either tag — all eleven phases are additive to the existing gate/CLI/doc surfaces (the UI-SPEC gate is documented as a §4 gate-matrix delta, not a new locked decision).

- **Phase 201 — milestone pre-mortem CLI writer for operator-authored fields** ✓ (rec-20260714-001) — `--add-out-of-scope`/`--add-likely-failure-mode`/`--add-hidden-dependency` repeatable flags on `cadence milestone premortem <id>`; operator-added `likelyFailureModes`/`hiddenDependencies` entries now survive a later deterministic refresh the same way `outOfScope` already did, via a marker-and-filter convention in `deepenPreMortem`.
- **Phase 202 — team rollout kit** ✓ — `cadence summary render <phase> <num>` prints a deterministic human-readable rendering of a settled phase's gate/AC outcomes for pasting into PR review, refusing loudly on missing/malformed `SUMMARY.json`; paired with `docs/team-rollout.md` covering shared team conventions without replacing existing CI or human review.
- **Phase 203 — milestone reopen: deferred → proposed transition** ✓ — `cadence milestone reopen <id>` adds the missing `applyTransition()` path out of `deferred`, guarded against `recommendationId` collision with any live survivor milestone, so a stuck milestone's claimed recs re-enter `clusterMilestones()`'s re-clustering pool instead of staying permanently excluded.
- **Phase 204 — `cadence init --ci`: CI-gate re-verification for consumer repos** ✓ (rec-20260709-003) — `cadence verify phase` phase-scopes coverage re-derivation to a settled phase's own DRAFT task files against the current working tree (no active loop state required, no cross-phase AC-token collision), with `--changed --base` discovery and a test-command re-run reported as a line distinct from coverage drift; `cadence init --ci` scaffolds `.github/workflows/cadence-verify.yml` with a real install+test command and prints (never executes) the `gh api` branch-protection recipe.
- **Phase 205 — UI-SPEC gate (`spec new --ui` / `ui-spec-review`)** ✓ (rec-20260711-004) — an opt-in `<id>-UI-SPEC.md` sibling to SPEC with per-component Layout/Tokens/Precedent-Reference sections, gated by a convergent `ui-spec-review` reusing the `nextConvergence` primitive; an APPROVED UI-SPEC seeds a `## UI Contract` section into the scaffolded DRAFT.
- **Phase 206 — `cadence next`: state-derived legal next moves** ✓ (rec-20260721-002) — extends the engine's existing `nextAction()` (used by `quickstart`/`progress`) with ranked `legalMoves[]` rather than reimplementing it; `cadence next --json` exposes a versioned `schemaVersion: 1` contract; 15th slash command registered.
- **Phase 207 — empty states and refusals name the precondition, nearest candidates, and unblocking command** ✓ (rec-20260721-001) — extracts `next.ts`'s ranked-candidate logic into a shared `intelligence/nearest-candidate.ts` and threads it through `milestone propose`, `recommend`, recommendation not-found/refusal messages, and the retro rollup's zero-phases case; documents the four-part invariant in `docs/concepts.md` as the bar for future intelligence-layer commands.
- **Phase 208 — concurrent-session collision safety** ✓ (rec-20260722-001) — a `phase-freshness` `cadence doctor` check warns when the active phase's `PROGRESS.json` shows task activity within a 10-minute threshold (possible live concurrent session); the remaining behavioral guidance (confirm-dead-before-resume, resume-in-place, worktree isolation from task 1, immediate pre-op `git status`) is folded into `CLAUDE.md` and the `phase-build`/`pr-land` skills.
- **Phase 209 — Claude-Code-vs-`ANTHROPIC_API_KEY` distinction in the mock-fallback warning** ✓ (rec-20260723-001) — the `anthropic`-provider mock-fallback warning (`verifier-factory.ts`) and `cadence config explain`'s `provider-no-key` warning both now state that a Claude Code login doesn't satisfy the provider's separately-billed API key, while preserving the exact `ANTHROPIC_API_KEY is unset` substring five sibling tests depend on.
- **Phase 210 — docs callout: anthropic provider auth is separate from Claude Code's own login** ✓ (rec-20260723-002) — a callout in `docs/providers.md`'s `anthropic` section, modeled on the existing `host-cli` quota-transparency notice, stating the same login/key distinction before the `ANTHROPIC_API_KEY` setup snippet.
- **Phase 211 — CLAUDECODE-aware messaging for anthropic provider + host-cli suggestion** ✓ (rec-20260723-003) — when `deep-verify`'s provider is `anthropic`, the key is missing, and `CLAUDECODE=1`, `cadence doctor`'s verification-readiness check and `cadence activate`'s key-missing message (`renderText`/`renderJson`, with a `claudeCodeHostCliSuggested` JSON field) proactively suggest `cadence activate --provider host-cli`, via a shared `isClaudeCodeSession(env)` helper — byte-identical to today outside that specific case.

- **Scope guards (as built).** *In:* the full set above. *Out:* 202 explicitly deferred `cadence init --ci`/CI-gate-workflow scaffolding (picked up whole by 204); 206 explicitly deferred wiring its ranked-moves output into an empty-state footer (picked up by 207, which only exposes the computation for a later phase to consume, not the footer itself); 208 deliberately left the freshness threshold hardcoded (no config knob) and did not wire the check into `cadence resume` (stays read-only/doc-scoped per D10).


## v1.51.0 – v1.51.1 — Evidence-floor + trust-envelope gates, Praxis ledger unification — ✓ SHIPPED 2026-07-24 → 07-25

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/212–221`; those artifacts are the record and were not modified. Phase→version boundaries **evidenced** via the release commits (`d7dedf12` tags v1.51.0 at phase-218's predecessor state, `f835470d` tags v1.51.1) cross-checked against `CHANGELOG.md`'s own `[1.51.0]`/`[1.51.1]` sections, which name every phase in this arc explicitly.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.51.0 | 2026-07-24 | 212–218 |
| v1.51.1 | 2026-07-25 | 219–221 |

This arc closes enforcement gaps at both ends of the loop CADENCE itself runs on. v1.51.0 tightens what "settled" is allowed to mean: `gates.evidenceFloor` (214) refuses a settle when an AC's PASS rests on evidence below a configured floor on the `ai-verified`>`executed`>`assertion`>`mention`>`unverified` ladder — closing the enforcement gap the Phase 140 ladder left as visibility-only — while phase 216 closes the matching MCP-surface gap by wrapping `cadence_settle` in the same `gatedRun` trust envelope already proven on the two `APPROVAL_BYPASS` tools. Around that keystone pair, 212 makes retro friction (phase 174/186's artifacts) feed back into Praxis scoring as a transparent `frictionPts` term, 213 turns on real per-package coverage thresholds in CI, 217 gates `CHANGELOG.md` currency the same way `CLAUDE.md`'s version line is already gated (closing the record-integrity gap that let the changelog silently stall at `1.6.0` for 44 versions), and 215 hardens the audit protocol itself — a new "The Unlogged Audit Finding" entry in `CLAUDE.md`, `dec-20260724-001`'s response to the v1.47.0 audit's P0 that never reached the ledger. v1.51.1 turns the release process's own rough edges and the Praxis ledgers' duplication into fixes: 218 gives post-publish npm verification a patient 10-attempt budget after the v1.51.0 Release workflow itself hit a CDN-propagation false-red, 219 closes an id-minting collision hole in `nextRecommendationId`, and 220 — the arc's largest phase — replaces all five subject ledgers' hand-rolled read/write/id-mint logic with one shared module, generalizing 219's safeguard to all four minting subjects and bringing milestones to parity in `audit`/`reconcile`/`stats`. 221 closes out three confirmed CLI/MCP parity gaps, including relocating `next`/`verify`/`explain` into `services/` so MCP can reach them. All published packages bumped `1.50.0 → 1.51.0 → 1.51.1` in lockstep across both tags. **No new DESIGN.md D-number** in this arc (both gates and the ledger unification are additive to existing models).

- **Phase 212 — Retro friction feeds back into Praxis scoring** ✓ (rec-20260712-003) — `cadence retro feedback` matches recurring cross-phase friction (bypass gates, rough task statuses, finding categories from `computeRetroRollup`'s recurring bucket) against recommendations by `affectedAreas`/`affectedFiles` overlap, writes idempotent `evidence.json` entries, and `scoreRecommendation` gains a new, capped, transparent `frictionPts` term.
- **Phase 213 — Coverage thresholds enforced in CI** ✓ (rec-20260712-014) — `vitest.shared.ts` gained real per-package `coverage.thresholds` (provider `v8`, `include: src/**`) derived from measured coverage with headroom; the dead root-only `vitest.config.ts` coverage block was removed; the gate was proven to actually fail on an injected regression before being confirmed clean.
- **Phase 214 — `gates.evidenceFloor`** ✓ (rec-20260724-001) — new settle gate refuses when any AC's PASS evidence ranks below a configured floor; preset defaults `solo`→`assertion`, `team`/`production`→`executed`; an `ai-verified`-under-mock-provider refusal names the structural reason instead of a generic message; a required-reason per-AC bypass records into `SUMMARY.gateBypasses`.
- **Phase 215 — P0 escape retro: ledger-diff step in CLAUDE.md** ✓ (rec-20260724-002, `dec-20260724-001`) — "The Unlogged Audit Finding" failure-mode entry added to CLAUDE.md's Verification-honesty section, requiring an audit session to check every critical/P0 finding against `recommendations.json` before closing; backed by a doc-content test asserting the entry's key phrases.
- **Phase 216 — Close the trust envelope for `cadence_settle`** ✓ (rec-20260724-005) — `cadence_settle`'s MCP `run()` wrapped in the existing `gatedRun` trust-envelope check (same four checks already applied to the two `APPROVAL_BYPASS` tools); `enforceApprovalBypassGrant` renamed `enforceGatedToolGrant` since it now gates three tools, not two.
- **Phase 217 — CHANGELOG.md currency gate** ✓ (rec-20260724-003) — extends the existing `check-doc-sync.sh` (unmodified) to also require `CHANGELOG.md`'s newest `## [x.y.z]` heading match a version bump, at pre-commit and pre-push, mirroring the `CLAUDE.md` check exactly.
- **Phase 218 — Post-publish npm verification retry budget** ✓ (rec-20260725-001) — `release-integrity.mjs`'s `verifyNpmPackages` gets a distinctly more patient `POST_PUBLISH_VERIFY_ATTEMPTS=10` budget for the post-publish call only; `verifyNpmPublished`'s pre-publish fast-fail is untouched; fixes a real false-red on the v1.51.0 Release workflow run (30136637570) caused by npm CDN propagation lag.
- **Phase 219 — Recommendation id-minting cross-checks evidence.json** ✓ (rec-20260724-013) — `nextRecommendationId` now takes the max across `recommendations.json` AND `evidence.json`'s referenced `recommendationId`s for the date prefix, so a dangling evidence row can no longer collide with a freshly minted id; `cadence doctor` gains an orphaned-evidence check.
- **Phase 220 — Deepen the Praxis ledger into one module** ✓ (rec-20260725-002) — all five subject ledgers (recommendations/evidence/assumptions/decisions/milestones) now share one generic read/write/id-mint core (`store/ledger.ts`) with existing per-subject functions kept as thin wrappers; phase 219's cross-ledger id-collision safeguard generalizes to all four minting subjects; milestones reach parity in `intelligence audit`/`reconcile`/`stats` (new `orphan-milestone` finding kind) and gains the missing `{ mode: 0o600 }` write; a shared CLI list/filter pipeline replaces three independently maintained copies across `recommendation`/`decision`/`assumption` commands.
- **Phase 221 — MCP/CLI parity** ✓ (rec-20260725-003) — `cadence_recommendation_promote` now threads a `ref` argument into `shippedRef` (matching the CLI's `--ref`) and rejects it on non-shipped promotions; the duplicated "newly-proposed milestone" predicate collapses into one exported `hasNewlyProposedMilestone`; `next`/`verify`/`explain` relocate from `cli/commands/` into `services/` and get registered as MCP tools — tool count 18→22.


## Unreleased — dogfooding-driven hardening: adapter dedup, attestation, doctor coverage, convergent-review consolidation — phases 222–230 (settled, not yet published)

*Backfilled 2026-07-27 from the settled artifacts under `.cadence/phases/222–230`; those
artifacts are the record and were not modified. All 9 phases are confirmed on `main` via
`git log` (commits `1f70e66b`…`65bcd73d`) but sit **after** the `v1.51.1` tag — `npm view
@manehorizons/cadence-core version` still reports `1.51.1`. This work has not shipped in any
release yet; treat every bullet below as landed-but-unpublished, not as a future plan.*

This arc is a grab-bag of dogfooding-driven fixes and one deliberate consolidation push, mostly
sourced from friction the repo's own recent phases surfaced. Phase 222 is the biggest single
piece of mechanical work: it extracts the hook-routing/slash-command/install-merge/locate-self
logic that `host-claude-code` and `host-codex` had been duplicating into a new
`@manehorizons/cadence-host-toolkit` package, while deliberately keeping each adapter's payload-
extraction logic (`mapEvent`/`extractPayload`/`routeHookEvent`) local where the two hosts
genuinely differ — and along the way restores a previously-dropped `cadence-dispatch` dialogue
body that had silently regressed when Codex's command catalog diverged from the shared one.
Three phases close verification-honesty gaps directly: 223 gives `SUMMARY.json` a settle-time
sha256 content hash plus a `cadence summary verify` command so a hand-edited settled artifact is
now detectable (scope is detection only — signing is explicitly deferred behind
`rec-20260726-001`, parked on a threat-model rec per `dec-20260726-001`); 224 adds a `cadence
doctor` check, `ledger-remote-collision`, that fetches the tracked upstream and diffs new-
since-merge-base ledger ids on both sides to catch the exact cross-session `mintId` collision
class that had bitten a real session (see the memory `cadence-rec-id-collision-on-rebase`) —
detection only, no central id-issuing service, matching the repo's offline/zero-runtime-
dependency stance; and 226 closes three doc/provenance drifts around `gates.sealed` (docs
undercounted which gates consult it, two bypass-table rows were missing, and
`build-test-must-pass`/`boundary-scan` weren't recording skip-reason provenance the way
`test-coverage` does) with a doc-content test asserting the sealed-gate doc list is a superset
of every gate file that actually imports `isGateSealed`. Phase 225 is the arc's other big
mechanical piece: `nextConvergence()`'s surrounding read-sidecar → verify → classify → push-
history → write-sidecar → branch sequence, previously copy-pasted across `plan-review.ts`,
`code-review.ts`, and `spec-approve.ts` (twice), is now a single `runConvergentReview` primitive
all four call sites delegate to — a behavior-preserving refactor verified byte-identical against
16 characterization tests pinned before the extraction began. The remaining phases are point
fixes: 227 closes a dead-end hit live during phase 222 itself (a fresh `EnterWorktree` worktree
has `.cadence/` but no gitignored `state.json`, and `cadence init`'s refusal used to send the
user nowhere useful — both dead-ends now point at `cadence onboard`); 228 mechanically splits
the ~555-line `settleService` into 10 named, behavior-preserving step functions (precondition/
load, phase-collision backstop, gate-set resolution, `SettleContext` construction, evidence-
floor gate, state-commit/retro-offer, etc.) with zero test-file edits as the correctness proof;
229 adds a doc-content test guarding README's mermaid architecture diagram against drifting from
the real `VerifierProvider`/entry-surface set; and 230 fixes the built-in Python coverage
profile's opener regex, which previously produced zero coverage for an entire file when a test
function carried a `-> None:`-style return-type annotation. **No new DESIGN.md D-number** —
every phase here is additive/internal to existing models (host-adapter contract, gate/settle
pipeline, doctor check-set, convergence protocol).

- **Phase 222 — shared host-adapter toolkit** ✓ — new `@manehorizons/cadence-host-toolkit`
  package carries `routeHookEvent`, the slash-command catalog, `install.ts`'s managed-marker
  merge logic, and `locate-self.ts`, consumed by both `host-claude-code` and `host-codex`; each
  adapter's genuinely-divergent payload-extraction logic stays local. Restores a dropped
  `cadence-dispatch` dialogue body. Also adds `HostCapabilities.agentIdentification` so a host
  that can't confirm `agentId` (Codex, undocumented hook payload shape) is noticed loudly
  instead of silently, and wires `host-codex`'s CLI to actually populate it end-to-end.
- **Phase 223 — settle-time SUMMARY content hash + `cadence summary verify`** ✓
  (rec-20260724-006) — `computeSummaryContentHash` (canonical deep-key-sort + sha256) wired into
  `settle.ts` before every SUMMARY write, rendered into `SUMMARY.md`; new `cadence summary verify
  <phase> <num>` subcommand reports MATCH/MISMATCH/NO_HASH. Detection only — no signing, deferred
  to rec-20260726-001 per dec-20260726-001.
- **Phase 224 — `cadence doctor` ledger-remote-collision check** ✓ (rec-20260726-003) — fetches
  the tracked upstream (reusing `checkRemoteFreshness`), diffs local's and origin's new-since-
  merge-base recommendation/evidence/decision/assumption ids, warns on overlap; degrades to `ok`
  (never `error`) on no-repo/no-upstream/failed-fetch/detached-HEAD/no-merge-base. `manual`
  fixKind — no auto-repair, matching `worktree-phases`.
- **Phase 225 — shared `runConvergentReview` primitive** ✓ (rec-20260725-008) — extracts the
  read-sidecar → verify → `nextConvergence` → push-history → write-sidecar → branch sequence out
  of `plan-review.ts`, `code-review.ts`, and both `spec-approve.ts` call sites into one function;
  16 characterization tests pinned pre-refactor prove byte-identical sidecar JSON and per-site
  branching (`code-review`'s OR-bypass + try/catch preserved).
- **Phase 226 — centralize gate bypass and seal policy documentation + provenance** ✓ — fixes
  `docs/reference/config.md` and `docs/concepts.md`'s bypass table to name all 3 `gates.sealed`-
  consulting gates (was 2) and add the missing `--allow-failing-build`/
  `--allow-boundary-scan-failure` rows; adds a bypass-flag naming-policy subsection with
  git-log-verified dates correcting a stale claim about `--allow-failing-build`'s history;
  `build-test-must-pass`/`boundary-scan` now record skip-reason provenance in `registry.ts` like
  `test-coverage` already did.
- **Phase 227 — point missing-state.json errors at `cadence onboard`** ✓ (rec-20260726-002) —
  `SimpleStateBackend.readState()` and `cadence init`'s refusal now distinguish "`.cadence/`
  never initialized" from "`.cadence/` exists but `state.json` is missing" (the fresh-worktree
  shape) and route the latter to `cadence onboard` instead of a dead-end `cadence init` retry.
  Message-routing only — `init` still refuses and exits non-zero; `onboard`'s bootstrap logic
  untouched.
- **Phase 228 — split `settleService` into named step functions** ✓ (rec-20260725-007) —
  mechanical extraction of the ~555-line function's ~9-10 concerns (precondition/load,
  phase-collision backstop, gate-set/banner/soft-cap, `SettleContext` construction via a new
  `buildSettleContext` factory, gate-loop refusal SUMMARY, AC-result derivation, anomaly/skill-
  audit, evidence-floor gate, summary/retro/promotion, state-commit/retro-offer) into named
  step functions within the same file; zero test-file edits, `SettleArgs`/`CommandResult`
  signature unchanged.
- **Phase 229 — README architecture-diagram doc-test** ✓ (rec-20260726-004) — new
  `readme-architecture-diagram.test.ts` guards README's mermaid diagram's named
  `VerifierProvider` values and entry-surface list against drifting from code truth.
- **Phase 230 — python coverage opener recognizes return-type annotations** ✓ — widened the
  OPENER regex to accept an optional `-> <return type>` group before the trailing colon on
  `def`/`async def` test functions, which previously produced zero coverage for the whole file;
  4 regression tests added (plain, async, class-method, richer-type). Audited `js-ts.ts` for the
  analogous gap and confirmed it doesn't apply (that opener matches the `it(`/`test(` call token,
  not the callback signature).


### Numbering ledger — phases 118–230 (backfilled 2026-07-27)

Six phase numbers in this range have no directory under `.cadence/phases/`. They are
recorded here so a future reader does not read the gap as missing data.

- **125, 126, 127, 128** — never used. No directory, no commit, no artifact. Numbers
  burned during parallel drafting (the phase-collision guard's contract is refuse +
  suggest `max(observed)+1`, so a collision costs a number). Nothing shipped under them.
- **172** — no trace anywhere: not on disk, not in `git log`. Same class as 125–128,
  with no corroborating incident.
- **175** — **real work, no artifact.** Commit `docs: README leads with the test-gutting
  demo (phase 175) (#188)` is on `main`, and phase 177's DRAFT names "phase 175's PR
  #188" as the stale-branch incident it reverted. The phase directory was lost with the
  stale branch. Phase 177 restored the outcome; see arc G.


## v1.52.0 (planned) — Assurance manifest: settle can tell mock from real — NEXT

Sourced from the Phase 0 assurance/kernel/criteria-anchored-review spec
(`docs/handoffs/cadence-phase0-assurance-kernel-review.md`) and 11 recommendations filed
2026-07-27 (`rec-20260727-001` through `-011`, scout `scout-20260727-kernel-review-phase0`).
Closes CADENCE's sole surviving P0: **settle cannot currently distinguish a `mock`-verified
review from a real one.** `CodeReviewResult` already carries `provider` and `model`
(`packages/core/src/verify/code-review.ts:30`), and `GateProvenanceZ`
(`packages/types/src/summary.ts:63`) records only `{gate, status, skipReason, reason}` — so
the identity of *who verified* is computed and then thrown away at persistence. A SUMMARY
that says `code-review: ran` is indistinguishable between a real Anthropic review and the
deterministic mock that flags `console.log`.

Slice 1 (phases 232–233) is **unconditionally valuable standalone** — it closes the P0 even
if slices 2–4 are abandoned, which the spec's own tripwires explicitly permit. Two prep
phases land first, unrelated to the assurance theme but staged here: Phase 231 (the
`roadmap-currency` doctor check) so this arc doesn't repeat the mistake it's part of fixing,
and Phase 238 (drop Node 20 support) — filed 2026-07-27 during the same session, ahead of
kernel work starting. Neither blocks the other; the operator picks build order.

### Phase 231 — `cadence doctor` check: roadmap-currency (rec-20260727-012)

**Objective.** Add a warning-only, non-blocking `cadence doctor` check comparing the
highest phase number under `.cadence/phases/` against the highest phase number referenced
in `ROADMAP.md`/`MILESTONES.md`; warn when drift exceeds a threshold. Deliberately
`fixId: null` — generating roadmap prose is exactly what must not be automated. Ships as its
own small phase, ahead of Phase 0's Slice 1, so the anti-recurrence mechanism is live before
new phase numbers start accumulating again.

**Files.**
- `packages/core/src/cli/commands/doctor/checks/roadmap-currency.ts` (new) —
  `checkRoadmapCurrency(root): Promise<DoctorCheck>`, `ROADMAP_DRIFT_WARN_THRESHOLD = 10`.
- `packages/core/src/cli/commands/doctor/registry.ts` (or wherever checks register) —
  wire the new check in.
- `packages/core/tests/cli/doctor-roadmap-currency.test.ts` (new).
- `docs/reference/commands.md` — `doctor` section, paired doc edit.
- `.cadence/skills/release-cut` (or equivalent) — add the roadmap-index-currency step
  adjacent to the existing doc-sync verification step.

**ACs.** (1) `cadence doctor` reports the drift between the highest on-disk phase number and
the highest referenced in ROADMAP.md/MILESTONES.md (using `min` across the two files, so
catching up one file doesn't mask the other). (2) Drift ≤ 10 → pass; drift > 10 → warning,
never a hard failure, `fixId: null`. (3) The check degrades to a silent pass when
`.cadence/phases/` is empty or ROADMAP.md is still the `init` stub — a fresh consumer repo
never sees this warning. (4) Best-effort: any read failure reports "not determinable" rather
than throwing, matching `checkPhaseFreshness`'s existing idiom. (5) Paired doc edit in
`docs/reference/commands.md`'s `doctor` section.

### Phase 238 — Drop Node 20 support; raise engine floor to Node >=22 (rec-20260727-013)

**Objective.** Retire the Node 20 CI leg and the `engines.node` floor across all five
published packages plus `host-toolkit`, landing before Phase 0's kernel/assurance work
begins. Unrelated to that arc's theme — grouped here only as pre-Phase-0 staging, same
role as Phase 231 — and may ship in its own release rather than bundled with the
assurance-manifest work depending on how release-cut timing falls.

**Files.**
- `.github/workflows/ci.yml` — matrix `node: [20, 22]` → `node: [22]` (6 test jobs → 3
  across ubuntu/macos/windows).
- `.github/workflows/security.yml` — the standalone `sbom` job's `node-version: 20` →
  `22` for consistency (unrelated to the test matrix; just a tool-runner pin).
- `package.json`, `packages/{core,types,host-claude-code,host-codex,host-toolkit}/package.json`
  — `engines.node` `">=20"` → `">=22"`.
- `packages/core/src/cli/node-guard.ts` — `checkNodeMajor`'s default `min = 20` → `22`.
- `packages/core/tests/cli/node-guard.test.ts` — update the ~4 assertions/descriptions
  pinned to the Node-20 floor.
- Root `package.json` — `@types/node` `^20.14.0` → `^22.x`.
- `.github/dependabot.yml` — reword the `@types/node` major-bump `ignore` rule + its
  comment, which currently ties the exemption to the Node-20 floor explicitly.
- `CLAUDE.md` (2 spots), `README.md`, `website/src/content/docs/start/install.md` — manual
  prose sweep of "Node 20 + 22" mentions. **Not doc-test-gated** — no test asserts the
  literal string "20" — so this is manual diligence, not an automated check.

**Boundaries.** Do NOT touch `CHANGELOG.md`, `.cadence/ROADMAP.md`/`MILESTONES.md`, or any
`.cadence/phases/**` DRAFT/SPEC/SUMMARY artifact that mentions Node 20 — those are frozen
historical records, not current-state docs.

**ACs.** (1) CI matrix runs only Node 22 across all three OSes; `ci-success` still passes.
(2) All six `engines.node` fields read `>=22`; a changeset is filed since this is a real
breaking change for consumers still on Node 20. (3) `checkNodeMajor` and its tests reflect
the new floor. (4) `dependabot.yml`'s `@types/node` ignore rule and comment match the new
floor's rationale. (5) The four named current-state docs no longer say "Node 20"; historical
docs/artifacts are untouched. (6) `pnpm turbo run lint typecheck test build` green.

### Phase 232 — Gate provenance carries verifier identity; SUMMARY schemaVersion 2 (rec-20260727-001)

**Objective.** Stop discarding verifier identity at persistence. Enrich `GateProvenanceZ`
with the verifier family and model that actually ran a gate, and thread the already-computed
`provider`/`model` from `CodeReviewResult` (and the security-audit equivalent) through to the
persisted provenance entry instead of dropping them. This is a SUMMARY shape change, so bump
`SummaryZ.schemaVersion` from the literal `1` to `1|2`: writers emit `2`, readers accept both,
and a pre-parse probe reads the raw `schemaVersion` before Zod validation so an unknown
*higher* version reports "written by a newer Cadence" rather than a corruption error. Zero
`GATE_ORDER` changes; no gate behavior changes; no new refusals. Purely: the record stops
lying by omission.

**Files.**
- `packages/types/src/summary.ts` — `GateProvenanceZ` gains optional verifier-identity
  fields; `SummaryZ.schemaVersion` becomes `z.union([z.literal(1), z.literal(2)])`.
- `packages/core/src/gates/code-review.ts` + `security-audit.ts` — pass the result's
  `provider`/`model` into the provenance entry rather than discarding them.
- `packages/core/src/services/settle.ts` (provenance persistence step, per phase 228's named
  step functions) — write `schemaVersion: 2`.
- SUMMARY reader — pre-parse `schemaVersion` probe + newer-version diagnostic.
- `packages/core/tests/**` — round-trip on a v1 fixture, a v2 fixture, and an unknown v3.
- `docs/concepts.md` (SUMMARY provenance) — paired doc edit.

**ACs.** (1) A `code-review` gate run by a real provider persists that provider's family and
model in its `GateProvenanceZ` entry; a `mock` run persists `mock` — the two SUMMARY records
are distinguishable. (2) Same for `security-audit`. (3) New settles write `schemaVersion: 2`;
every pre-existing `schemaVersion: 1` SUMMARY still parses unchanged (additive-schema rule).
(4) A SUMMARY carrying an unrecognized higher `schemaVersion` produces a "written by a newer
Cadence" diagnostic, not a parse/corruption error. (5) `GATE_ORDER`, gate verdicts, and
refusal behavior are byte-for-byte unchanged — this phase adds no gate and changes no
outcome.

### Phase 233 — Per-settle assurance record (rec-20260727-002)

**Objective.** With verifier identity persisted (phase 232), compute one **assurance
record** per settle: a derived, whole-run answer to "how strongly was this settle actually
verified?", composed from the per-gate verifier identities plus the existing per-AC
`AcEvidenceZ` ranking (`ai-verified > executed > assertion > mention > unverified`). The
record is *derived and reported*, not a new gate — it adds no refusal and no bypass flag.
Its job is to make a settle whose gates all ran under `mock` visibly different, in the
durable record, from one verified for real. This phase is also where the spec's first
tripwire is evaluated.

**Files.**
- `packages/types/src/summary.ts` — the assurance-record schema, on `SummaryZ` (optional, so
  v2 SUMMARYs without it stay valid).
- `packages/core/src/gates/` — a pure derivation over the gate provenance array + AC evidence
  classes; no I/O, no gate registration.
- `packages/core/src/services/settle.ts` — one named step that computes and attaches it.
- SUMMARY renderer + `cadence summary verify` (phase 223's attestation) — surface it.
- `packages/core/tests/**`; `docs/concepts.md` — paired doc edit.

**ACs.** (1) Every settle writes an assurance record derived from persisted gate provenance +
per-AC evidence classes. (2) An all-`mock` run and an equivalent real-provider run produce
**different** assurance records for an otherwise identical phase. (3) The derivation is a
pure function of the provenance + evidence arrays — no gate-specific special-casing (this AC
*is* the tripwire; see below). (4) Settle's pass/refuse outcome is unchanged — the record is
reported, never gating. (5) The record is covered by phase 223's settle-time content hash, so
it cannot be edited post-settle without invalidating the attestation.

> **Tripwire (from the spec, binding).** If AC-3 cannot be met — if the assurance record
> requires gate-specific special cases to express — **stop after phase 233 and abandon
> slices 2–4.** Slice 1 is standalone-valuable; the later slices are premised on the
> boundary being real, and a special-cased manifest is the evidence that it is not. Record
> the outcome in the phase SUMMARY's decisions, and strike phases 234–237 below.

### Phase 234 — Kernel / verifier / consumer boundary, lint-enforced *(sketch — contingent)*

**Gate to entry.** Phase 233 settled with AC-3 met (no gate-specific special cases).

**Objective (sketch).** The kernel/verifier/consumer split is already ~80% built and
unnamed. Name the three as published contracts and add a lint rule that fails the build on
an internal-import violation across them. **No package moves, no distribution work, zero
`GATE_ORDER` changes** — this is naming and enforcing a boundary that already exists, in the
same spirit as the core→host arrow. Maps to rec-20260727-003 (medium). Files/ACs at DRAFT
time.

> **Tripwire (from the spec, binding).** If the boundary extraction runs beyond a couple of
> focused sessions, **revert it.** Overrun is the diagnosis, not a schedule problem: it means
> this is a rewrite wearing a refactor's clothes, and the premise that the boundary is
> already 80% built was wrong.

### Phase 235 — Criteria-anchored review verifier: input + anchor ladder *(sketch — contingent)*

**Gate to entry.** Phase 234 landed without tripping its overrun tripwire.

**Objective (sketch).** `CodeReviewInput` is `{ files, diff }`
(`packages/core/src/verify/code-review.ts:22`) — the review verifier **cannot see the
DRAFT's acceptance criteria at all**, so it reviews code against general good practice rather
than against what the phase committed to. Extend the input with ACs, boundaries, and task
refs, and implement the anchor ladder (`executable > structured > declared >
undeclared/criteria-gap`) so each finding is classified by the strength of the criterion it
anchors to — including emitting explicit **criteria-gap** findings where the diff does work
no AC covers. Maps to rec-20260727-004, rec-20260727-005 (medium, `needs-decision`).

### Phase 236 — Finding identity, disposition, and ledger routing *(sketch — contingent)*

**Gate to entry.** Phase 235 settled, **and** rec-20260727-007 (shared fingerprint primitive
extraction from Déjà, `needs-evidence`) is resolved — stable finding identity is its
dependent, and building a bespoke fingerprint before that investigation lands is how two
incompatible ones get shipped.

**Objective (sketch).** Give findings a stable identity (id + target discriminant), a
disposition, and expiring waivers, then route them to the recommendation ledger — which
requires extending `RecommendationSourceZ` (`packages/types/src/intelligence.ts:3`,
currently `manual | code-analysis | impact | cadence | session`) with a `review` member.
Maps to rec-20260727-006, rec-20260727-011 (medium, `needs-decision`).

### Phase 237 — Invariant promotion from recurring findings *(sketch — contingent)*

**Gate to entry.** Phase 236 settled and has produced enough routed findings for
`RetroRollup.findingCategories.recurring` to be non-trivially populated. This is
`needs-evidence` by design — entering early means promoting invariants from noise.

**Objective (sketch).** Consume the already-built
`RetroRollup.findingCategories.recurring` (phase 186) and split **recurring-unanchored** (an
invariant candidate — something that keeps going wrong that no criterion names) from
**recurring-anchored** (a spec-quality signal — criteria that keep being violated). Maps to
rec-20260727-008 (low, `needs-evidence`).

### Not yet phases

- **rec-20260727-007** — shared fingerprint primitive extraction from Déjà
  (`needs-evidence`). A prerequisite *investigation* for phase 236's finding identity, not a
  phase of its own. Resolve before 236 is drafted.
- **rec-20260727-009** — counter-verifier as a kernel component (`raw-idea`).
- **rec-20260727-010** — Conductor as a CLI client (`raw-idea`).

Both `raw-idea` items are architectural raw material. They are recorded here so the arc's
shape is legible, and are deliberately **not** given phase numbers.
