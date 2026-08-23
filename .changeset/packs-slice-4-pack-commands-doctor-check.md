---
"@thomas-powers-jr/cadence-core": minor
---

Add: `cadence doctor` gains a new `pack-commands` check verifying each enabled pack's declared `commands[]` entries (slash-command names, `docs/packs-design.md` §3) name a key of `COMMAND_GUIDANCE` (`@thomas-powers-jr/cadence-types`) — the registered slash-command set. This is slice 4 of the packs arc (`docs/packs-design.md`) and, per D-AP, is deliberately **doctor-checked only, never enforced**: there is no `Gate`/`DELTAS` entry and no refusal path, and severity never escalates past `warning` — unlike the `packs` check's slice-1-to-slice-2 escalation, this rung is permanent.

`checkPackCommands` (`packages/core/src/doctor/run.ts`) mirrors `checkPacks`'s shape exactly: `loadConfig` + `resolvePacks`, degrading to `pass` on any config-load failure, and branching on the **resolved** pack list rather than `config.packs.enabled.length` so an id listed in both `packs.enabled` and `packs.disabled` is excluded before the check runs (disabled wins, D-AQ). An absent or empty `commands` field is clean, not a finding. When any resolved pack declares a `commands[]` entry that isn't a `COMMAND_GUIDANCE` key, the check reports `warning` naming the pack id and every unrecognized command, with `fixId: null` — inventing or removing a pack's declared commands is not a safe automatic repair.

The check's authority for "does this command exist" — `Object.keys(COMMAND_GUIDANCE)` — is pinned against the actual installed-slash-command catalog: a new test in `packages/host-toolkit/tests/routing.test.ts` asserts `COMMANDS.map(c => c.name)` (from `packages/host-toolkit/src/routing.ts`) equals `Object.keys(COMMAND_GUIDANCE)` exactly, so a command added to one catalog but not the other is caught immediately instead of letting `pack-commands` silently pass or falsely warn.

Closes `rec-20260822-012`.
