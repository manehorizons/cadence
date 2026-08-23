// Phase 295: core's first public JS export. `@thomas-powers-jr/cadence-core`
// has otherwise never had a library API — it is consumed as a CLI binary
// (`bin/cadence.cjs`) or spawned as a subprocess. This one static data
// constant is exported solely so `packages/host-claude-code`'s drift test
// (which depends on both this package and `@thomas-powers-jr/cadence-host-toolkit`)
// can pin it against host-toolkit's independent copy of the same list —
// core still never imports host-adapter code in the other direction.
export { CLAUDE_CODE_EXPECTED_HOOKS } from './doctor/host-hooks.js';
