# Changelog

All notable changes to this project are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is [SemVer](https://semver.org/spec/v2.0.0.html). Phase numbers reference entries under `.cadence/phases/`.

## [Unreleased]

### Added

- Manual approve gate at `cadence draft approve`: when `'approve'` is in the effective gate set (strict-any-tier, standard×standard, standard×complex), the command prompts `Approve and enter BUILD? [y/n]:` before transitioning to BUILD. Reuses the Phase 16 `Prompter` abstraction (`StdinPrompter` + `ScriptedPrompter`) and `CADENCE_PROMPTER_SCRIPT` env-var test seam. `--no-approve` bypasses per-invocation (required for non-TTY runs when the gate is on). `n` / retry-exhaustion refuses with exit 1 and no state change (Phase 24.1).

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
