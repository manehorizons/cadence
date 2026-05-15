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
  const toolName = (parsed as { tool_name?: unknown }).tool_name;
  const toolNameStr = typeof toolName === 'string' ? toolName : undefined;
  const abstractEvent = mapEvent(obj.hook_event_name, toolNameStr);
  if (abstractEvent === null) {
    return { abstractEvent: null, translatedStdin: raw };
  }
  // Defensive filter: PreToolUse/PostToolUse for non-edit tools should be dropped
  // even though the settings.json matcher already restricts them. Skill tool
  // takes its own route (skill-invoke) above and bypasses this filter.
  if (abstractEvent === 'pre-tool-edit' || abstractEvent === 'post-tool-edit') {
    const editTools = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
    if (typeof toolName !== 'string' || !editTools.has(toolName)) {
      return { abstractEvent: null, translatedStdin: raw };
    }
  }
  const extracted = extractPayload(parsed);
  const translated: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  if (extracted?.files) translated.files = extracted.files;
  if (extracted?.skill) translated.skill = extracted.skill;
  return { abstractEvent, translatedStdin: JSON.stringify(translated) };
}
