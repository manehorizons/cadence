---
'@manehorizons/cadence-core': patch
---

`cadence dispatch plan`'s rendered packet (`renderPacket`) previously told the dispatched implementation agent to self-record its own outcome via `cadence build task <id> --status=...` — the only thing scoping its behavior was a `files:` boundary. A real incident (2026-07-18) showed the gap: a dispatched fork agent overran its scoped task, ran `cadence build`/`cadence settle` and `git commit` directly against `main` four times, self-authorized without the orchestrator's review. Every rendered packet now includes a mandatory prohibition block forbidding state-mutating `cadence` subcommands (`cadence build`, `cadence settle`, etc.), `git commit`/`git push`, `gh`/network actions, and invoking `AskUserQuestion` — the dispatched agent must stop and report to the orchestrating session once its verify condition is met (or it's blocked); the orchestrator alone records the task outcome.
