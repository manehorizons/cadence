---
'@manehorizons/cadence-core': patch
---

Redact secrets/credentials from persisted intelligence-ledger and security-audit output. `Evidence.summary` (free-text quotes attached via `addRecommendation`'s `evidenceSummary`) and `security-audit` gate `Finding.message` (both `SUMMARY.securityAudit` and the per-critical stderr log) now pass through a new `redactSecrets` utility before being written, replacing AWS access keys, GitHub tokens, bearer/basic Authorization header values, JWT-shaped strings, PEM private-key blocks, and generic `key=`/`token=`/`password=`/`secret=` assignments with `[REDACTED]`. The four intelligence ledger JSON files (`recommendations.json`, `evidence.json`, `assumptions.json`, `decisions.json`) are now also written with `0o600` (owner-only) file permissions, applied atomically at file-creation time rather than via a create-then-chmod race.
