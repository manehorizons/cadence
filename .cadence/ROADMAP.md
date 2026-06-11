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

## v1.24.0 — Recommendation retention (manual + auto soft-archival) — PLANNED 2026-06-11

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

- **Phase 101 — Archive core + manual commands** — `archived` array + `archivedAt` /
  `archiveReason` optional rec fields (`.default([])` keeps existing files valid); pure
  `archiveRecommendation` / `unarchiveRecommendation`; `runRecommendation{Archive,
  Unarchive}`; CLI `recommendation archive <id> [--reason]` / `unarchive <id>` /
  `list --archived`. TDD.
- **Phase 102 — Auto-archive + config** — `recommendations.autoArchive` config; compose
  archival into the `shipped`/`rejected` status writes (atomic); best-effort settle→rec
  hook in `services/settle.ts` archiving a `converted` rec when its phase settles (never
  blocks settle, reported); `config explain` pointer. TDD.
- **Phase 103 — Release v1.24.0** — docs (`commands.md` archive/unarchive + `--archived`;
  `config.md` `recommendations.autoArchive`), changeset, lockstep `1.23.0 → 1.24.0`
  across all four published packages. Tag + npm provenance via the manual `Release`
  workflow at publish.
