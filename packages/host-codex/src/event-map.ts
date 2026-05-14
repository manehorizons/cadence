import type { AbstractEvent } from '@keel/types';

export const EDIT_TOOL_MATCHER = 'apply_patch|Edit|Write';

const EVENT_TABLE: Record<string, AbstractEvent> = {
  SessionStart: 'session-start',
  UserPromptSubmit: 'user-prompt',
  PreToolUse: 'pre-tool-edit',
  PostToolUse: 'post-tool-edit',
  Stop: 'session-stop',
};

export function mapEvent(codexEvent: string): AbstractEvent | null {
  return EVENT_TABLE[codexEvent] ?? null;
}

export interface ExtractedPayload {
  files?: string[];
}

const APPLY_PATCH_DIRECTIVE = /^\*\*\*\s*(?:Add|Update|Delete)\s+File:\s*(.+?)\s*$/gm;

export function extractPayload(raw: unknown): ExtractedPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as {
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: { command?: unknown };
  };
  if (r.hook_event_name !== 'PreToolUse' && r.hook_event_name !== 'PostToolUse') return undefined;
  if (r.tool_name !== 'apply_patch') return undefined;
  const cmd = r.tool_input?.command;
  if (typeof cmd !== 'string' || cmd.length === 0) return undefined;

  const seen = new Set<string>();
  const files: string[] = [];
  APPLY_PATCH_DIRECTIVE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = APPLY_PATCH_DIRECTIVE.exec(cmd)) !== null) {
    const captured = m[1];
    if (captured === undefined) continue;
    const path = captured.trim();
    if (path.length === 0 || seen.has(path)) continue;
    seen.add(path);
    files.push(path);
  }
  if (files.length === 0) return undefined;
  return { files };
}
