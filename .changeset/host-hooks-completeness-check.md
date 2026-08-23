---
"@thomas-powers-jr/cadence-core": minor
"@thomas-powers-jr/cadence-host-toolkit": minor
"@thomas-powers-jr/cadence-host-claude-code": minor
---

Fix: `cadence doctor`'s `host-hooks` check now verifies that every managed hook entry the Claude Code installer writes is actually present — completeness, not just marker existence. It previously passed as soon as any single non-stale `_managedBy: "cadence"` entry existed anywhere in `.claude/settings.json`, which let a genuinely partial install (missing the `PostToolUse` `Skill`-tool matcher, or the entire `SubagentStart` event) report `ok` indefinitely. That gap was measured live in this repo: `state.skillAudit.invoked` never populated because the `Skill`-tool hook never fired, and `runSkillAuditCheck` would hard-refuse any settle declaring a required skill — with `doctor` reporting everything healthy throughout (see phase 294, `rec-20260823-005`).

`host-hooks` now reports `error` (escalated from `warning`) when one or more expected managed entries are missing, naming every gap specifically — not just the first. A managed entry that is present but references a stale, pre-rename npm scope is unaffected by this change and still reports `warning`, as before.

The expected hook set is a single source of truth in `@thomas-powers-jr/cadence-host-toolkit` (`CLAUDE_CODE_EXPECTED_HOOKS`), which `install.ts` now builds its installed shape from directly. `@thomas-powers-jr/cadence-core` cannot import host-adapter packages, so it holds its own independent copy for the doctor check; a dedicated test in `@thomas-powers-jr/cadence-host-claude-code` (which depends on both) pins the two against each other so they cannot silently drift apart.

`checkCodexHooks` (`.codex/hooks.json`) has the identical existence-only gap and is deliberately left unfixed in this change — Codex's expected hook shape differs genuinely (different event names, `apply_patch` matcher) and is out of scope here; the gap is filed as its own follow-up recommendation rather than silently left unaddressed.

Closes `rec-20260823-005`.
