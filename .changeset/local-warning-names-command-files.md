---
"@manehorizons/cadence-host-claude-code": patch
"@manehorizons/cadence-core": patch
"@manehorizons/cadence-types": patch
---

Fix the `install --local` warning so it names **every** surface it wrote
machine-absolute paths into — not just `settings.json`.

Previously the warning mentioned only `.claude/settings.json`, so the slash
commands written to `.claude/commands/cadence-*.md` under `--local` were a
silent offender: their absolute `node <abs>/cli/index.js` paths could be
committed unflagged and then failed to resolve on every other clone or machine.
The warning now enumerates each surface actually written (settings file and/or
command files, narrowed by `--no-hooks` / `--no-commands`) and points at the
portable plain-`install` form that is safe to commit. Docs (`docs/claude-code.md`)
updated to match. `cadence-core` and `cadence-types` are bumped only to keep the
three public packages in lockstep; neither changed.
