---
'@manehorizons/cadence-core': patch
'@manehorizons/cadence-types': patch
'@manehorizons/cadence-host-claude-code': patch
'@manehorizons/cadence-host-codex': patch
'@manehorizons/cadence-host-toolkit': patch
---

Extracts the logic host-claude-code and host-codex duplicated into a new
shared package, `@manehorizons/cadence-host-toolkit`:

- The hook-event routing algorithm's shape and the slash-command catalog
  (`COMMANDS`) now live in `host-toolkit/src/routing.ts`. Both adapters
  render their slash commands from this one catalog, which fixes a real
  drift bug: host-codex's local copy had silently lost `cadence-dispatch`'s
  `DISPATCH_DIALOGUE` body. Host-codex's own `mapEvent`/`extractPayload`/
  `routeHookEvent` stay local — its `apply_patch`-based extraction is
  genuinely different from host-claude-code's `file_path`-based extraction,
  not just duplicated; only the structurally-identical `RouteResult` type is
  shared.
- `install.ts`'s managed-marker merge logic and `locate-self.ts` are also
  extracted into the toolkit, with one shared test suite; both adapters'
  own `install.ts`/`locate-self.ts` are now thin wrappers.
- Core now enforces a new `HostCapabilities.agentIdentification` flag: a
  host that declares it cannot supply `agentId`/`agentType` (Codex, whose
  hook payload shape doesn't document one) causes core to notice loudly on
  stderr instead of silently behaving as if no subagent were involved.
  Codex's CLI now embeds its declared capabilities into the real hook
  payload it sends to `cadence hook`, so the check is live end-to-end, not
  just testable in isolation.

No CLI-facing behavior, flags, or exit codes changed for either adapter —
this is an internal dedup/extraction plus one new loud-notice-on-a-capability-
gap fix, not a rewrite. `HostAdapter`'s public contract is unchanged.
