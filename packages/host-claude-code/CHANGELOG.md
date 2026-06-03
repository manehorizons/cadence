# @manehorizons/cadence-host-claude-code

## 1.5.0

### Minor Changes

- Add session-continuity commands `cadence handoff` (scaffold a SESSION doc with loop state, read-only git facts, and the context-handoff packet pre-filled) and `cadence resume` (read-only replay of the freshest handoff + live context), plus `/cadence-handoff` and `/cadence-resume` host slash commands. Also fixes a `files-outside-boundary` false positive where absolute touched paths were compared against relative DRAFT `files:` declarations.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-core@1.5.0
  - @manehorizons/cadence-types@1.5.0
