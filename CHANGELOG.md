# Changelog

All notable changes to this project are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is [SemVer](https://semver.org/spec/v2.0.0.html). Phase numbers reference entries under `.cadence/phases/`.

## [Unreleased]

## [1.0.0] - 2026-05-15

### Added

- Manual approve gate at `cadence draft approve`: when `'approve'` is in the effective gate set (strict-any-tier, standard×standard, standard×complex), the command prompts `Approve and enter BUILD? [y/n]:` before transitioning to BUILD. Reuses the Phase 16 `Prompter` abstraction (`StdinPrompter` + `ScriptedPrompter`) and `CADENCE_PROMPTER_SCRIPT` env-var test seam. `--no-approve` bypasses per-invocation (required for non-TTY runs when the gate is on). `n` / retry-exhaustion refuses with exit 1 and no state change (Phase 24.1).
- Per-task verifier gate at `cadence build task <id> --status=DONE`: when `'per-task-verify'` is in the effective gate set (strict×standard, strict×complex), runs `PerTaskVerifier` against the task's files+diff (`git diff HEAD -- <files>`) and records a `pass | concerns | refuse` verdict into `PROGRESS.json tasks[id].perTaskVerify`. `MockPerTaskVerifier` (deterministic floor) and `AnthropicPerTaskVerifier` (prompt-cached `claude-sonnet-4-6` by default) ship; `config.perTaskVerifier.provider` selects. `refuse` blocks DONE recording unless `--allow-per-task-failure` (recorded as `bypassed: true`). Non-DONE statuses skip the gate (Phase 24.2).
- Code-review verifier gate at `cadence settle run`: when `'code-review'` is in the effective gate set (strict×standard, strict×complex, standard×complex), runs `CodeReviewVerifier` against `git diff HEAD -- <files>` for the union of touched files and records per-file `Finding[]` into `SUMMARY.codeReview`. `MockCodeReviewVerifier` flags every added `console.log` as HIGH; `AnthropicCodeReviewVerifier` reviews via prompt-cached `claude-sonnet-4-6`. HIGH findings refuse settle unless `--force` / `--allow-code-review-failure` (Phase 24.3).
- Plan-review verifier gate at `cadence draft approve`: when `'plan-review'` is in the effective gate set (strict×complex), runs `PlanReviewVerifier` against the parsed DRAFT (objective + ACs + tasks + boundaries) after the manual-approve gate and before the BUILD transition. `MockPlanReviewVerifier` is a deterministic floor (pass iff ≥1 AC and every AC has non-empty Given/When/Then); `AnthropicPlanReviewVerifier` does a holistic prompt-cached `claude-sonnet-4-6` review returning `{ pass, findings[] }` with optional per-finding `suggestedEdit`. `pass=false` refuses approve with exit 1 and no state change unless `--allow-plan-review-failure` (Phase 25.1).
- Security-audit verifier gate at `cadence settle run`: when `'security-audit'` is in the effective gate set (strict×complex only), runs `SecurityAuditVerifier` against `git diff HEAD -- <files>` for the union of touched files — after code-review and before SUMMARY write. `MockSecurityAuditVerifier` flags hardcoded `Authorization:` headers and JWT-shaped strings in added lines as CRITICAL; `AnthropicSecurityAuditVerifier` runs an OWASP-aware prompt-cached `claude-sonnet-4-6` pass. All findings (any severity) land on `SUMMARY.securityAudit`; CRITICAL findings refuse settle unless `--force` / `--allow-security-audit-failure`. Closes the v0.6.0 expensive-gate milestone (Phase 25.2).
- `cadence init` UX polish: interactive project-name prompt when `--name` is omitted (TTY or `CADENCE_PROMPTER_SCRIPT` seam; empty → `unnamed`), a gate-profile suggestion from git history (≥20 commits → `standard`, else `auto`; git failure → `auto`) with interactive accept/override and a `--gate-profile` flag written to `config.profile`, and a one-screen post-init summary. Non-TTY without flags applies defaults and never prompts/hangs; the legacy `Initialized CADENCE …` line is retained (Phase 26.1).
- `cadence init` writes a managed `CLAUDE.md` at the repo root (loop, gate profile, state locations, core commands) wrapped in `<!-- cadence:managed:start/end -->` markers. New `cadence init --claude-md` regenerates only the managed block — allowed on an already-initialized project, reading project name/profile from existing `state.json`/`config.json`; content outside the markers is preserved byte-for-byte and a marker-less user file is left untouched (Phase 26.2).
- `cadence status anomalies --tail [--follow]`: `--tail` prints the last N events oldest→newest (default listing stays newest-first); `--follow` keeps the NDJSON log open and streams appended events (offset-tracked, 200ms poll), honouring `--type`/`--since` on both the initial tail and streamed appends, exiting cleanly on SIGINT, and falling back to one-shot tail on a non-TTY. Closes the v0.7.0 operator-ergonomics milestone (Phase 26.3).
- GitHub Actions CI (`.github/workflows/ci.yml`): `pnpm install --frozen-lockfile` + `lint typecheck test build` on every PR and push to `main`, Node 20 + 22 × {ubuntu, windows, macos}; pnpm pinned to `9.12.0`. `.github/dependabot.yml` schedules weekly `github-actions` + `npm` update PRs. Branch protection documented as a manual GitHub setting (no API automation). No publish/release automation. Closes the v0.8.0 CI milestone (Phase 27.1).

### Changed

- `AnomalyTypeZ` schema bump — new `per-task-fail` member emitted on `refuse` verdicts (with or without bypass). Legacy `.cadence/anomalies.log` files predating the new type continue to parse via the existing newest-first reader (Phase 24.2).
- `AnomalyTypeZ` + `SummaryZ` schema bumps — new `code-review-high` anomaly type (one event per HIGH finding when bypassed) and new optional `Summary.codeReview: Record<file, Finding[]>` field (Phase 24.3).
- `CadenceConfigZ` schema bump — new optional `config.planReview: { provider: 'mock' | 'anthropic'; model?: string }` block (defaults to `{ provider: 'mock' }`) selecting the Phase 25.1 plan-review verifier (Phase 25.1).
- `FindingZ` + `CadenceConfigZ` + `SummaryZ` schema bumps — `Finding.severity` enum gains `'critical'` (additive; code-review still emits only high/medium/low), new optional `config.securityAudit: { provider; model? }` block (defaults to `{ provider: 'mock' }`), and new optional `Summary.securityAudit: Finding[]` field recorded whenever the gate ran (Phase 25.2).
- `cadence init` `--name` no longer carries a hardcoded `unnamed` default (absence is now detectable so it can prompt); new `--gate-profile` and `--claude-md` options added (Phase 26.1 / 26.2).
- `cadence status anomalies` gained `--tail` / `--follow`; `--limit` help text de-scoped from "newest first" since ordering now depends on `--tail` (Phase 26.3).

### Fixed

- Two pre-existing `@typescript-eslint/consistent-type-imports` lint errors (`packages/core/src/notify/loop-violation.ts`, `packages/core/src/verify/coverage.ts`) so `pnpm turbo run lint` is green and CI can gate on it (Phase 27.1).

## [0.3.0] - 2026-05-14

### Added

- Profile system foundation (strict / standard / auto) wired into `.cadence/config.json` + DRAFT frontmatter override (Phase 13).
- `--auto` settle's structural verifier — pass/blocked/needs-context derivation from `PROGRESS.json` task statuses (Phase 13).
- Test-coverage gate: each AC must be referenced by ≥1 test file via `AC-N` token scan; `--allow-missing-coverage` bypass (Phase 14).
- `--deep` independent verifier agent with `mock` (offline, linked-test rule) and `anthropic` providers; per-AC verdicts recorded into `SUMMARY.json deepVerify`; `--allow-verifier-failure` for transport gating (Phase 15).
- `--interactive` human-verdict walker — per-AC `pass | fail | skip` prompt via stdin; `CADENCE_PROMPTER_SCRIPT` env-var seam for tests; non-TTY refusal + `--no-interactive` bypass (Phase 16).
- Anomaly-notify transport contract with `stderr` (default) / `file` (NDJSON) / `none` transports + `selectNotifier` factory + `collectAnomalies` walker (Phase 17.1).
- Hook-side `files-outside-boundary` emission at `pre-tool-edit`; `cadence status anomalies [--type --limit]` reader for `.cadence/anomalies.log` (Phase 17.2).
- `AnomalyEvent.ts` required ISO8601 field + live `--since` filter on `status anomalies` (Phase 17.3).
- `webhook` transport — POSTs `{events: [...]}` JSON to a user-provided URL; optional `headers` + `timeoutMs`; failure-safe (stderr warn, URL never logged) (Phase 19.1).
- `auto × complex` soft cap enforcement (DESIGN.md §4 M2): both `settle run` and `draft approve` refuse without `--allow-auto-complex` (Phase 21.1).

### Changed

- DESIGN.md §6 deferred-items table reconciled — F1, F2, F3, F4, F5, F6 all marked resolved with phase pointers (Phase 20.1).
- Physical KEEL → CADENCE rename rollout: slash commands `keel-*.md` → `cadence-*.md`, `.claude/settings.json` regenerated, root `package.json` `cadence-monorepo`, `.cadence/config.json` `templates.dir`, `.cadence/PROJECT.md`, testkit fixture prefix, CONTRIBUTING.md (Phase 18.1). Pre-Phase-12 hook entries with `_managedBy: 'keel'` now evicted on re-install (Phase 18.1).

### Removed

- `packages/host-codex/` archived to the `keel-codex-archive` git tag and removed from `main` (Phase 11; pre-`0.2.0-rc.1` but cited here for traceability).

## [0.2.0-rc.1] - 2026-05-14

- KEEL → CADENCE rename rollout in source: `@cadence/*` package scopes, `.cadence/` state dir, `cadence` CLI binary (Phase 12).

## [0.1.0] - earlier

- Initial KEEL release. Phases 1–11 shipped under the KEEL name. Superseded by `0.2.0-rc.1`.

[0.3.0]: https://github.com/manehorizons/cadence/releases/tag/v0.3.0
[0.2.0-rc.1]: https://github.com/manehorizons/cadence/releases/tag/v0.2.0-rc.1
[0.1.0]: https://github.com/manehorizons/cadence/releases/tag/v0.1.0-rc.1
