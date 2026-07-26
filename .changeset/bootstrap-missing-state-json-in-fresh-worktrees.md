---
'@manehorizons/cadence-core': patch
---

Fixes rec-20260726-002: a fresh `EnterWorktree` git worktree (or a fresh
clone) carries the committed `.cadence/` scaffold but never `state.json`
(gitignored since phase 196), so every state-mutating command threw
`NotInitializedError` saying "run `cadence init`" — but `cadence init`
correctly refuses on an already-`.cadence/`-committed repo, a dead end that
had to be worked around by hand-authoring `state.json` (hit live during
phase 222). `cadence onboard` already bootstraps exactly this case safely
(phase 196 fallout, #177), but nothing in the failure path pointed at it.
`SimpleStateBackend.readState()`'s `NotInitializedError` now distinguishes
"`.cadence/` doesn't exist at all" (still names `cadence init`) from
"`.cadence/` exists but `state.json` is missing" (now names `cadence
onboard`), and `cadence init`'s "already initialized" refusal prints an
additional line pointing at `cadence onboard` in the same missing-state.json
case. `cadence init` still refuses and writes nothing either way — only the
guidance changes.
