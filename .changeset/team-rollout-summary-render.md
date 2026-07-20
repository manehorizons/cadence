---
'@manehorizons/cadence-core': minor
---

Adds `cadence summary render <phase> <num>`, a read-only CLI command that reads a settled phase's `<id>-SUMMARY.json`, validates it against the `SummaryZ` schema, and prints a deterministic Markdown rendering (per-AC pass/fail with evidence level, per-task status, gate outcomes, gate bypasses, decisions, deferred items — empty sections omitted entirely) suitable for pasting into a PR description or comment. Refuses loudly with a distinct stderr message and non-zero exit for each of three failure modes (missing file, invalid JSON, schema-validation failure) rather than crashing or printing a partial render. Adds `docs/team-rollout.md`, a guide for adopting CADENCE across a team in PR review without replacing existing CI or human review.
