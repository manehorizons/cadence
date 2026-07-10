---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Make verifier activation trustworthy: broader key discovery, a real
activation smoke test, and committed provider config that actually reaches
every real call site.

- A verifier API key is now discovered from a `.env` file at the repo root
  when it isn't exported into the process environment (`discoverKey`),
  closing the gap where a legitimately-available key was invisible to
  `cadence activate`/`cadence doctor` unless manually `export`ed.
- `cadence activate`'s live provider check is no longer coincidentally
  skippable — when a key is discovered and the provider isn't `mock`, the
  smoke test runs and its outcome (not mere key presence) gates whether
  activation is reported as successful. `--no-check` remains the only
  explicit opt-out.
- The discovered-key path now reaches every real verifier-selection call
  site (`cadence doctor`, `cadence settle run`'s deep-verify/code-review/
  security-audit seams, the draft/build gates, `cadence spec approve`), not
  just the primitives — including `cadence mcp serve --repo <path>`, where
  the server process's own working directory can differ from the repo being
  operated on. A teammate who never ran `cadence activate` locally, but
  whose key is discoverable and whose repo already commits a real provider
  choice, now gets real verification instead of a silent mock fallback.
