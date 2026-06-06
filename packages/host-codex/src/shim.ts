import type { AbstractEvent } from '@manehorizons/cadence-types';
import { extractPayload, mapEvent, EDIT_TOOL_MATCHER } from './event-map.js';

export interface RouteResult {
  abstractEvent: AbstractEvent | null;
  translatedStdin: string;
}

/**
 * Translate one Codex stdin-JSON hook event into a cadence abstract event plus
 * the stdin the core dispatcher should receive. Mirrors the Claude adapter's
 * shim; the difference is Codex's sole edit tool (`apply_patch`) and the
 * multi-file payload extraction. Unmapped events, malformed JSON, and
 * Pre/PostToolUse for non-edit tools return `{ abstractEvent: null }` with the
 * raw stdin passed through (the core never sees them).
 */
export function routeHookEvent(raw: string): RouteResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { abstractEvent: null, translatedStdin: raw };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { abstractEvent: null, translatedStdin: raw };
  }
  const obj = parsed as { hook_event_name?: unknown; tool_name?: unknown };
  if (typeof obj.hook_event_name !== 'string') {
    return { abstractEvent: null, translatedStdin: raw };
  }
  const toolName = typeof obj.tool_name === 'string' ? obj.tool_name : undefined;
  const abstractEvent = mapEvent(obj.hook_event_name, toolName);
  if (abstractEvent === null) {
    return { abstractEvent: null, translatedStdin: raw };
  }
  // Defensive filter: the hooks.json matcher already restricts Pre/PostToolUse to
  // apply_patch, but drop any non-apply_patch edit event that slips through.
  if (abstractEvent === 'pre-tool-edit' || abstractEvent === 'post-tool-edit') {
    if (toolName !== EDIT_TOOL_MATCHER) {
      return { abstractEvent: null, translatedStdin: raw };
    }
  }
  const extracted = extractPayload(parsed);
  const translated: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  if (extracted?.files) translated.files = extracted.files;
  return { abstractEvent, translatedStdin: JSON.stringify(translated) };
}
