---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Recommendation retention (v1.24): manual + automatic soft-archival of
recommendations. Terminal recs already drop out of the active `cadence recommend`
surface but the ledger was append-only — v1.24 adds recoverable move-aside archival.

- `cadence recommendation archive <id>` / `unarchive <id>` and `recommendation list
  --archived` — manual soft-archive (moves a rec into the ledger's new `archived`
  array; recoverable, never deleted; `recommendation show` is archive-aware).
- `recommendations.autoArchive` config (default **on**, recoverable): a rec is
  auto-archived when it goes terminal — `shipped`/`rejected` immediately on `promote`,
  and a `converted` rec when its phase completes SETTLE (best-effort, never blocks
  settle). Set `false` to keep terminal recs in the active ledger.

Backward-compatible: a pre-v1.24 `recommendations.json` (no `archived` key) loads
unchanged. `host-claude-code` / `host-codex` carry version-alignment bumps only.
