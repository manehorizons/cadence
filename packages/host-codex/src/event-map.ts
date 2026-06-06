import type { AbstractEvent, ExtractedPayload } from '@manehorizons/cadence-types';

// Re-exported for parity with the Claude adapter; the canonical definition lives
// in @manehorizons/cadence-types as part of the host-adapter contract.
export type { ExtractedPayload };

/** Codex's edit tool. Unlike Claude (Edit/Write/…), all edits flow through one tool. */
export const EDIT_TOOL_MATCHER = 'apply_patch';

const EVENT_TABLE: Record<string, AbstractEvent> = {
  SessionStart: 'session-start',
  UserPromptSubmit: 'user-prompt',
  PreToolUse: 'pre-tool-edit',
  PostToolUse: 'post-tool-edit',
  Stop: 'session-stop',
  SubagentStop: 'subagent-result',
};

/**
 * Map a Codex CLI hook event name to its cadence abstract event, or null when
 * unmapped (e.g. PreCompact/PostCompact/PermissionRequest/SubagentStart — the
 * contract permits null for events cadence does not act on).
 */
export function mapEvent(codexEvent: string, _toolName?: string): AbstractEvent | null {
  return EVENT_TABLE[codexEvent] ?? null;
}

// `*** Add File: <p>` / `*** Update File: <p>` / `*** Delete File: <p>` /
// `*** Move to: <p>` — the markers in OpenAI's apply_patch envelope. Each names
// a path the patch touches; for boundary checking we collect them all (a Move
// touches both its Update source and its destination).
const PATCH_MARKER = /^\*\*\* (?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/;

/** Pull every touched path out of an apply_patch envelope string, in order. */
function pathsFromPatch(patch: string): string[] {
  const files: string[] = [];
  for (const line of patch.split(/\r?\n/)) {
    const m = PATCH_MARKER.exec(line);
    if (m && m[1]) files.push(m[1]);
  }
  return files;
}

/**
 * Extract the normalized payload from a Codex raw hook event. For `apply_patch`
 * (Codex's sole edit tool) the patch envelope lives in `tool_input`, but the
 * Codex docs are ambiguous about the exact field (`input` vs `command`), so we
 * scan every string-valued field for the patch markers. Non-edit tools (Bash,
 * MCP) and non-tool events yield undefined — matching the Claude adapter's shape.
 */
export function extractPayload(raw: unknown): ExtractedPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as {
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
  };
  if (r.hook_event_name !== 'PreToolUse' && r.hook_event_name !== 'PostToolUse') return undefined;
  if (r.tool_name !== 'apply_patch') return undefined;
  if (!r.tool_input || typeof r.tool_input !== 'object') return undefined;

  for (const value of Object.values(r.tool_input)) {
    if (typeof value === 'string' && value.includes('*** ')) {
      const files = pathsFromPatch(value);
      if (files.length > 0) return { files };
    }
  }
  return undefined;
}
