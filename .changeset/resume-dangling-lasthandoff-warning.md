---
"@thomas-powers-jr/cadence-core": patch
"@thomas-powers-jr/cadence-types": patch
---

`cadence resume` now warns when `state.json`'s `session.lastHandoff` pointer names a `SESSION-*.md` file that no longer exists. Previously `locateFreshestHandoff` silently fell back to the freshest-by-`generated_at` doc in `.cadence/handoff/` with no signal that the pointer was dangling, so a stale-but-plausible doc could read as authoritative. The warning names both the missing pointer filename and the doc actually served, and is rendered as its own message distinct from the existing loop-position drift banner, on both the `cadence resume` CLI text surface and the `resumeService`/MCP `CommandIO` surface.

`ResumeResult` (`@thomas-powers-jr/cadence-types`) gains an additive, optional `danglingHandoffPointer` field carrying the missing pointer's filename when this fires. Absent on every normal resolution path (no pointer ever set, or the pointer names a file that exists).
