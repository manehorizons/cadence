---
"@thomas-powers-jr/cadence-core": minor
---

Fix: a DRAFT whose `## Acceptance Criteria` section is non-empty but contains a malformed (non-numeric) `### AC-<id>:` heading — e.g. `### AC-K1:` — no longer parses silently to an empty `acceptanceCriteria` array. `parseDraftMd` now throws a `CadenceError('...', 'COHERENCE_FAILED')` naming the numeric-id requirement and the offending heading text, for any block starting with `### AC-` that doesn't match the strict `### AC-<number>: <name>` form — including a section that mixes valid and malformed headings, where the malformed one was previously dropped silently while the valid ones parsed fine.

This closes a fail-open gap in the gate stack's front door: an empty AC set doesn't make `structural-verifier`, `test-coverage`, evidence-floor, or `settle --auto`'s completeness check fail — it makes them pass vacuously, since there is nothing to check against. `cadence draft check`/`draft approve` now refuse a malformed draft instead of reporting `coherence: OK`.

A genuinely empty `## Acceptance Criteria` section (zero `### AC-` blocks at all — e.g. `draft new`'s pre-`add-ac` skeleton) stays schema-legal, per design (no `DraftZ` schema minimum — dozens of existing test fixtures and the draft-authoring workflow itself rely on that). For that case, `settle run --auto`/interactive settle now emits an explicit stderr notice naming the empty AC set, so the outcome never reads as an unqualified pass even though settle can still complete.

Measured against the full historical corpus (300 committed `*-DRAFT.md` files): the new rule newly rejects none of them. 12 historical drafts already failed to parse today for an unrelated, pre-existing reason (legacy `status: DONE` frontmatter predating the current status enum) — tracked separately, not affected by this change.

A related gap was found but is out of scope here and filed as `rec-20260822-002`: the `cadence_settle` MCP tool's response-selection logic picks stdout-or-stderr via `||` rather than surfacing both, so the new settle-time notice doesn't reach MCP callers on the success path (it reaches real stderr correctly on the CLI).

Closes `rec-20260822-001`.
