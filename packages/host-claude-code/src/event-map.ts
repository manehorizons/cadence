import type { AbstractEvent } from '@manehorizons/cadence-types';

export const EDIT_TOOL_MATCHER = 'Edit|Write|MultiEdit|NotebookEdit';
export const SKILL_TOOL_MATCHER = 'Skill';

const EVENT_TABLE: Record<string, AbstractEvent> = {
  SessionStart: 'session-start',
  UserPromptSubmit: 'user-prompt',
  PreToolUse: 'pre-tool-edit',
  PostToolUse: 'post-tool-edit',
  Stop: 'session-stop',
  SubagentStop: 'subagent-result',
};

/**
 * Map a Claude Code hook event name to its cadence abstract event.
 * `toolName` disambiguates `PostToolUse` between the edit-tool flow
 * (post-tool-edit) and Skill-tool flow (skill-invoke, Phase 23.4).
 */
export function mapEvent(claudeCodeEvent: string, toolName?: string): AbstractEvent | null {
  if (claudeCodeEvent === 'PostToolUse' && toolName === 'Skill') return 'skill-invoke';
  return EVENT_TABLE[claudeCodeEvent] ?? null;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export interface ExtractedPayload {
  files?: string[];
  skill?: string;
}

export function extractPayload(raw: unknown): ExtractedPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as {
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: { file_path?: unknown; skill?: unknown };
  };
  if (r.hook_event_name !== 'PreToolUse' && r.hook_event_name !== 'PostToolUse') return undefined;
  if (!r.tool_name) return undefined;
  // Skill tool: extract skill name (Phase 23.4).
  if (r.tool_name === 'Skill') {
    const s = r.tool_input?.skill;
    if (typeof s !== 'string' || s.length === 0) return undefined;
    return { skill: s };
  }
  // Edit tools: extract file path.
  if (!EDIT_TOOLS.has(r.tool_name)) return undefined;
  const fp = r.tool_input?.file_path;
  if (typeof fp !== 'string' || fp.length === 0) return undefined;
  return { files: [fp] };
}
