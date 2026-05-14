---
phase: 20-f5-f6-cleanup
id: 20-01
tier: quick-fix
status: APPROVED
---

# 20-01 — Strike F5 + F6 (stale deferred items)

## Objective

DESIGN.md §6 still lists F5 (Test ↔ AC linkage convention) and F6 (Verifier agent shape `--deep`) as deferred. Both shipped — F5 in Phase 14 (test-coverage scanner with the `AC-N`-token convention), F6 in Phase 15 (`--deep` verifier agent with `mock` + `anthropic` providers). Mark them resolved so the deferred table stops misleading future readers.

## Acceptance Criteria

### AC-1: F5 + F6 marked resolved in DESIGN.md §6
Given DESIGN.md §6 currently shows F5 and F6 as open deferred items
When the cleanup lands
Then both rows are struck through with a `**Resolved — Phase 14**` / `**Resolved — Phase 15**` note pointing at the phase that delivered them. Section 10 is untouched (its punchlist already ticks 13–17 + 17.2 + 17.3 + 18.1 + 19.1). No code, schema, or test surface changes.

## Tasks

### T1: Strike F5 + F6 in DESIGN.md §6
- files: `DESIGN.md`
- action: In the §6 deferred table: strike F5's `#` column with `~~F5~~` and append to its rightmost cell `**Resolved — Phase 14.** AC id token (\`AC-N\`) anywhere in a test file's contents; binary per-AC; scanner walks \`verification.testGlobs\` from \`.cadence/config.json\`.` Strike F6's `#` column with `~~F6~~` and append `**Resolved — Phase 15.** Two providers: \`mock\` (deterministic, offline) + \`anthropic\` (opt-in via \`ANTHROPIC_API_KEY\`, prompt-cached system prompt, Zod-typed per-AC verdicts via \`messages.parse()\`).` to its rightmost cell. Pattern matches the existing F1/F2/F3/F4 strike treatment.
- verify: visual read of §6 confirms F5/F6 strikethrough + Resolved notes; F1-F4 still struck; no other section touched.
- done: AC-1

## Boundaries

- DO NOT touch §10 — punchlist already reflects shipped phases.
- DO NOT delete the F5 / F6 rows. Strike-through with a Resolved note keeps history visible (matches F1/F2/F3/F4 treatment).
- DO NOT open new F-items in the same edit. Cleanup-only.
- DO NOT introduce a phase number bump or version tag.
