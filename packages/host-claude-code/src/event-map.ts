import type { ExtractedPayload } from '@thomas-powers-jr/cadence-types';

// The dispatch algorithm (mapEvent/extractPayload) and the edit/skill tool
// matchers now live in the shared toolkit package, `@thomas-powers-jr/cadence-host-toolkit`
// (phase 222) — this module re-exports it so existing imports of
// `./event-map.js` throughout host-claude-code (and its tests) keep working
// unchanged.
export {
  mapEvent,
  extractPayload,
  EDIT_TOOL_MATCHER,
  SKILL_TOOL_MATCHER,
} from '@thomas-powers-jr/cadence-host-toolkit';

// Re-exported for back-compat: the canonical definition now lives in
// @thomas-powers-jr/cadence-types as part of the host-adapter contract.
export type { ExtractedPayload };
