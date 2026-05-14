import type { AbstractEvent } from '@cadence/types';
import { extractPayload, mapEvent } from './event-map.js';

export interface RouteResult {
  abstractEvent: AbstractEvent | null;
  translatedStdin: string;
}

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
  const obj = parsed as { hook_event_name?: unknown };
  if (typeof obj.hook_event_name !== 'string') {
    return { abstractEvent: null, translatedStdin: raw };
  }
  const abstractEvent = mapEvent(obj.hook_event_name);
  if (abstractEvent === null) {
    return { abstractEvent: null, translatedStdin: raw };
  }
  // Defensive filter: PreToolUse/PostToolUse for non-edit tools should be dropped
  // even though the settings.json matcher already restricts them.
  if (abstractEvent === 'pre-tool-edit' || abstractEvent === 'post-tool-edit') {
    const toolName = (parsed as { tool_name?: unknown }).tool_name;
    const editTools = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
    if (typeof toolName !== 'string' || !editTools.has(toolName)) {
      return { abstractEvent: null, translatedStdin: raw };
    }
  }
  const extracted = extractPayload(parsed);
  const translated: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  if (extracted?.files) translated.files = extracted.files;
  return { abstractEvent, translatedStdin: JSON.stringify(translated) };
}
