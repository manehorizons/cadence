---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Adds `cadence next`, a read-only command that answers "what now?" deterministically from live loop state at any position — 1-3 ranked legal moves with exact commands, plus a stable `--json` contract (`{schemaVersion: 1, position, remainingTasks, blockedOn, legalMoves[]}`) for agent orchestrators. Sourced from an extended `nextAction()` (`packages/core/src/progress.ts`), which now also computes ranked `legalMoves[]` alongside its existing `{command, reason}` shape — strictly additive; `cadence progress` and `cadence quickstart` are unchanged. Closes rec-20260721-002.

Registers `/cadence-next` as the 15th Claude Code slash command and the matching Codex prompt command (both host adapters share the `COMMAND_GUIDANCE` catalog in `@manehorizons/cadence-types`).

Also narrows `cadence status --json` and `cadence quickstart --json`'s `next` field to `{command, reason}` explicitly — both were passing `nextAction()`'s full return through unnarrowed, so the new `legalMoves[]` array would otherwise have silently leaked into those two commands' existing public JSON contracts (mirrors the narrowing `cadence progress` already had).
