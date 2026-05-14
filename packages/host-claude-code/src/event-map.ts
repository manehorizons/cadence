import type { AbstractEvent } from '@cadence/types';

export const EDIT_TOOL_MATCHER = 'Edit|Write|MultiEdit|NotebookEdit';

const EVENT_TABLE: Record<string, AbstractEvent> = {
  SessionStart: 'session-start',
  UserPromptSubmit: 'user-prompt',
  PreToolUse: 'pre-tool-edit',
  PostToolUse: 'post-tool-edit',
  Stop: 'session-stop',
  SubagentStop: 'subagent-result',
};

export function mapEvent(claudeCodeEvent: string): AbstractEvent | null {
  return EVENT_TABLE[claudeCodeEvent] ?? null;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export interface ExtractedPayload {
  files?: string[];
}

export function extractPayload(raw: unknown): ExtractedPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as {
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: { file_path?: unknown };
  };
  if (r.hook_event_name !== 'PreToolUse' && r.hook_event_name !== 'PostToolUse') return undefined;
  if (!r.tool_name || !EDIT_TOOLS.has(r.tool_name)) return undefined;
  const fp = r.tool_input?.file_path;
  if (typeof fp !== 'string' || fp.length === 0) return undefined;
  return { files: [fp] };
}
