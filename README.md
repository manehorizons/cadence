# CADENCE

**Coordinated AI-Driven Engineering with Notifications and Customizable Execution** — structured AI-assisted development.

CADENCE is a customizable plan/build/settle framework for AI-assisted development. Inspired by GSD (Get Shit Done) and PAUL (Plan-Apply-Unify Loop); independently implemented in TypeScript. The product center is a tunable quality regime: three user-involvement profiles (`strict` / `standard` / `auto`) × three phase tiers (`quick-fix` / `standard` / `complex`) decide which gates fire — see `DESIGN.md` for the full matrix.

> **Status:** Phase 12 renamed the project KEEL → CADENCE (`v0.2.0-rc.1`). Earlier history shipped Phases 1–11 under the KEEL name; the `keel-codex-archive` tag preserves the dual-host implementation removed in Phase 11. Behavioral verifier (hybrid: structural + test-coverage default, `--deep` for agent, `--interactive` for human) is the next major implementation phase per `DESIGN.md`.

## Loop

`DRAFT → BUILD → SETTLE` — define the unit of work, execute task-by-task with per-task qualify, close the loop with a SUMMARY.

## Try it (headless, with the mock host)

```bash
mkdir /tmp/cadence-demo && cd /tmp/cadence-demo
npx @cadence/core init --name=demo
npx @cadence/core draft new 01-foundation 01 --title=Demo
# edit .cadence/phases/01-foundation/01-01-DRAFT.md
npx @cadence/core draft approve 01-foundation 01
npx @cadence/core status                      # full phase context in one screen
npx @cadence/core build task T1 --status=DONE
npx @cadence/core settle run --auto           # derive AC verdicts from task statuses
```

`settle run --auto` reads PROGRESS.json and derives each AC's verdict the same way `cadence status` does: all linked tasks DONE → pass, any BLOCKED → fail with `auto: <task> blocked`, NEEDS_CONTEXT → fail with `auto: <task> needs context`, anything still PENDING → refuses with a clear error (`--force` settles anyway). Pass explicit `--ac AC-1=fail:custom` to override the derivation for an individual AC. The legacy `--ac`-only flow still works exactly as before.

`cadence status` renders project, loop position, active draft, per-task status, AC derivation (pass/blocked/needs-context/pending), and the next-action hint. `cadence status --json` emits the same data as a single JSON document for scripting.

## Use with Claude Code

```bash
cd your-project
npx @cadence/core init --name=your-project
npx @cadence/host-claude-code install
# Start a new Claude Code session; CADENCE hooks are wired into .claude/settings.json
# and slash commands /cadence-progress /cadence-draft /cadence-approve /cadence-check
# /cadence-build /cadence-settle /cadence-done /cadence-block /cadence-needs-context
# are available under .claude/commands/.
```

> Dogfooding a local checkout of CADENCE before publishing? Build the workspace (`pnpm build`) then run `node packages/host-claude-code/bin/cadence-host-claude-code.cjs install --local --settings .claude/settings.local.json`. `--local` writes absolute paths to the workspace builds instead of `npx`-style commands; pair it with `settings.local.json` so the machine-specific paths stay out of git.

## Verification

`cadence settle run --auto` enforces two layers by default:

1. **Structural** — each AC's linked tasks must all be DONE (or pre-overridden via `--ac AC-N=pass:note`).
2. **Test-coverage** — each AC must be referenced by ≥1 test file. The scanner walks `verification.testGlobs` from `.cadence/config.json` (default: `packages/**/*.test.ts(x)`) and matches the literal token `AC-N` anywhere in test content. Refusal lists the offending ACs + the searched globs.

The convention is loose by design: put the AC id in a `describe()` / `it()` name, or in a leading comment. The gate is binary per AC — coverage-percentage tools (istanbul/c8) are out of scope.

Bypass flags:

- `cadence settle run --allow-missing-coverage` — skip the test-coverage gate for this invocation
- `cadence settle run --ac AC-1=pass:override` — explicit verdict wins; gate is skipped for that AC
- `cadence settle run --auto --force` — settle past *both* structural blockers and coverage refusals (for emergencies)

The gate fires only when the active (tier × profile) puts `'test-coverage'` in the effective `GateSet`. Under `auto × quick-fix` it does not fire. See `DESIGN.md` Section 4.2 for the full matrix.

### Deep verifier (`--deep`)

`cadence settle run --auto --deep` runs an independent verifier against each AC and records per-AC verdicts into `SUMMARY.json deepVerify`. Two providers, selected via `.cadence/config.json`:

```json
{
  "verifier": { "provider": "mock" }
}
```

- **`mock` (default)** — deterministic. Passes an AC iff it has ≥1 linked test in the coverage scan; otherwise fails with `"no linked test found"`. No I/O, no API key, works offline. Useful for CI dogfood and as a floor.
- **`anthropic`** — opt-in. Sends each AC's plain-English text + diff + test refs to Claude (default model: `claude-sonnet-4-6`, overridable via `verifier.model`). Uses `messages.parse()` with a Zod schema for typed JSON verdicts; system prompt is prompt-cached. Requires `ANTHROPIC_API_KEY` in env — if absent, silently falls back to `mock` with a stderr warning.

Failed verdicts on non-overridden ACs refuse the settle (exit 1) unless `--force` is passed. Transport failures (network / malformed JSON) refuse unless `--allow-verifier-failure` is passed (which records the failure into `deepVerify`). Explicit `--ac` overrides still win — the verifier runs for visibility but the manual verdict takes effect.

`--interactive` (human verdict per AC) ships in Phase 16.

## Codex support — archived

Codex CLI host adapter shipped earlier as `@keel/host-codex` (Phases 02 / 09). Phase 11 removed it from main; the complete pre-removal state is preserved on the `keel-codex-archive` git tag. Resurrection is a future v1.x/v2 phase.

## Host capabilities

Currently single-host: Claude Code only. The capabilities surface (hook coverage, blocking events, slash command support) is declared inline in `@cadence/host-claude-code` as a plain typed constant. If a second host returns, we'll re-evaluate whether a schema-validated abstraction is worth its complexity cost.

## Packages

- `@cadence/core` — CLI + state engine + parsers + classifier + hook dispatcher
- `@cadence/types` — Zod schemas + TS interfaces
- `@cadence/testkit` — fixture builder + MockHostAdapter for tests
- `@cadence/host-claude-code` — Claude Code host adapter: hook installer + event mapping + slash command codegen

## License

MIT
