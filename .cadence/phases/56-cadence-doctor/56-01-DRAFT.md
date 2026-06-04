---
phase: 56-cadence-doctor
id: 56-01
tier: standard
status: PENDING
---

# 56-01 — cadence doctor — diagnose project setup

## Objective

Add a `cadence doctor` command that runs a set of deterministic, offline health
checks on a project's CADENCE setup and reports actionable problems with
severity + remediation, so silent misconfiguration surfaces as clear diagnostics
instead of looking like CADENCE being broken.

## Acceptance Criteria

### AC-1: healthy project reports all-pass and exits 0
Given an initialized project with a valid `.cadence/` (config + state parse) on Node >= 20
When the operator runs `cadence doctor`
Then every check is reported as `ok`, no problems are listed, and the process exits 0.

### AC-2: uninitialized project is diagnosed, not crashed
Given a directory with no `.cadence/`
When the operator runs `cadence doctor`
Then the "initialized" check reports an `error` naming the missing `.cadence/`, gives a remediation hint (`cadence init`), and the process exits 1 (no stack trace / no `NotInitializedError` bubble).

### AC-3: each problem carries name + severity + remediation
Given any failing check
When `cadence doctor` renders its report
Then the problem line includes the check name, a severity (`error` | `warning`), a one-line detail, and a one-line remediation hint.

### AC-4: `--json` emits machine-readable results
Given any project state
When the operator runs `cadence doctor --json`
Then stdout is a single JSON object with a `checks` array of `{ name, status, severity, detail, remediation }` and a top-level `ok` boolean — and nothing else is written to stdout.

### AC-5: exit code reflects worst severity (CI-usable)
Given a project with at least one `error`-severity problem
When `cadence doctor` runs
Then it exits 1; given only `warning`-severity problems (or none) it exits 0. (So the command is usable as a CI gate.)

### AC-6: non-portable slash-command run-line is flagged
Given a Claude Code host install where a `.claude/commands/cadence-*.md` run-line contains a machine-absolute path (e.g. `!node C:\...` or `!node /abs/.../cli/index.js`)
When `cadence doctor` runs
Then the host-portability check reports a `warning` naming the offending file, with remediation pointing at re-running `install` without `--local`.

## Design notes

- **Report model** (`packages/core/src/doctor/model.ts`): a `DoctorCheck` =
  `{ name, status: 'ok' | 'warning' | 'error', severity: 'ok' | 'warning' | 'error', detail, remediation: string | null }`
  and a `DoctorReport` = `{ ok: boolean, checks: DoctorCheck[] }` where
  `ok === checks.every(c => c.severity !== 'error')`. (`status` mirrors
  `severity`; both kept to satisfy the SPEC's JSON shape literally.)
- **Pure core** (`packages/core/src/doctor/run.ts`): `runDoctor(root, env)` where
  `env = { nodeVersion, platform }` is injected (not read from `process`), so
  every check is deterministic + testable without monkeypatching globals.
  Reuses `checkNodeMajor` and `loadConfig`.
- **Thin CLI** (`commands/doctor.ts`): parse `--json`, call `runDoctor`, render,
  set `process.exitCode = report.ok ? 0 : 1`. Mirrors the `status` command shape.
- Host checks (host-hooks, host-commands) run only when `.claude/` exists;
  managed markers are `_managedBy: "cadence"` (settings) and
  `<!-- managed-by: cadence -->` (command files); a non-portable run-line is one
  whose `!`-line contains an absolute path (`/abs…` or drive-letter `C:\…`).

## Tasks

### T1: report model + `runDoctor` core + the three intrinsic checks
- files: `packages/core/src/doctor/model.ts`, `packages/core/src/doctor/run.ts`, `packages/core/tests/doctor/run.test.ts`
- action: define `DoctorCheck`/`DoctorReport` + `runDoctor(root, env)`; implement checks **node** (reuse `checkNodeMajor`), **initialized** (`.cadence/` + `loadConfig` parses/validates), **state** (`state.json` parses, `STATE.md` present). `ok` rolls up worst severity.
- verify: `pnpm --filter @manehorizons/cadence-core test -- doctor/run.test.ts` — healthy fixture → all `ok` + `report.ok===true`; no-`.cadence/` fixture → `initialized` is `error`; sub-floor node injected → `node` is `error`.
- done: AC-1, AC-2

### T2: the setup + host checks
- files: `packages/core/src/doctor/run.ts`, `packages/core/tests/doctor/host-checks.test.ts`
- action: add **git-hooks** (`core.hooksPath`===`.githooks`, else `warning`), **host-hooks** (if `.claude/settings.json` present, `_managedBy:"cadence"` entries exist), **host-commands** (if `.claude/commands/` present, every managed `cadence-*.md` `!`-run-line is portable; an absolute path → `warning` naming the file + remediation to re-run `install` without `--local`).
- verify: same suite — a fixture with a `!node C:\…` command line yields a `warning`-severity `host-commands` finding naming that file; a portable install yields `ok`.
- done: AC-6

### T3: `cadence doctor` CLI command (human + --json + exit codes) + register
- files: `packages/core/src/cli/commands/doctor.ts`, `packages/core/src/cli/register.ts`, `packages/core/tests/cli/doctor.test.ts`
- action: register `doctor` with `--json`; human render lists each problem as `name severity detail` + a remediation line (AC-3); `--json` writes exactly one JSON object `{ ok, checks:[…] }` to stdout (AC-4); `process.exitCode = report.ok ? 0 : 1` (AC-5).
- verify: `pnpm --filter @manehorizons/cadence-core test -- cli/doctor.test.ts` — healthy `tempRepo({initialized:true})` → exit 0; uninitialized dir → exit 1 + no stack trace; `--json` parses to an object with `checks` array + `ok` boolean and nothing else on stdout; `error`-severity fixture → exit 1, `warning`-only → exit 0.
- done: AC-3, AC-4, AC-5

### T4: document the command
- files: `docs/reference/commands.md`
- action: add a `cadence doctor` entry (synopsis, `--json`, the v1 check set, exit-code/CI semantics, report-only note).
- verify: grep `docs/reference/commands.md` for `cadence doctor`; manual read for accuracy against the implemented flags.
- done: AC-3

## Boundaries

- DO NOT add a `--fix` / auto-repair mode — report-only in v1 (SPEC constraint).
- DO NOT spawn host processes, hit the network, or call an AI verifier — checks are pure filesystem/config inspection.
- DO NOT mutate loop state, allocate a loop id, or run any gate — `doctor` is read-only diagnostics (like `status`/`progress`).
- DO NOT change behavior of existing commands; the only edit to shared code is the one registration line in `register.ts`.
- DO NOT read `process.version`/`process.platform` inside checks — inject via `env` so checks stay deterministic/testable.
