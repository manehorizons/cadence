import type { AbstractEvent, ExtractedPayload } from '@manehorizons/cadence-types';

// Re-exported for back-compat: the canonical definition now lives in
// @manehorizons/cadence-types as part of the host-adapter contract.
export type { ExtractedPayload };

export const EDIT_TOOL_MATCHER = 'Edit|Write|MultiEdit|NotebookEdit';
export const SKILL_TOOL_MATCHER = 'Skill';

const EVENT_TABLE: Record<string, AbstractEvent> = {
  SessionStart: 'session-start',
  UserPromptSubmit: 'user-prompt',
  PreToolUse: 'pre-tool-edit',
  PostToolUse: 'post-tool-edit',
  Stop: 'session-stop',
  SubagentStop: 'subagent-result',
  SubagentStart: 'subagent-start',
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

export function extractPayload(raw: unknown): ExtractedPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as {
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: { file_path?: unknown; skill?: unknown };
    agent_id?: unknown;
    agent_type?: unknown;
  };
  const agentId = typeof r.agent_id === 'string' && r.agent_id.length > 0 ? r.agent_id : undefined;
  const agentType =
    typeof r.agent_type === 'string' && r.agent_type.length > 0 ? r.agent_type : undefined;
  const agentFields = { ...(agentId ? { agentId } : {}), ...(agentType ? { agentType } : {}) };

  if (r.hook_event_name !== 'PreToolUse' && r.hook_event_name !== 'PostToolUse') {
    // SubagentStart/SubagentStop (and any other future event) only ever
    // carry agent fields — no files/skill to extract.
    return Object.keys(agentFields).length > 0 ? agentFields : undefined;
  }
  if (!r.tool_name) return Object.keys(agentFields).length > 0 ? agentFields : undefined;
  // Skill tool: extract skill name (Phase 23.4).
  if (r.tool_name === 'Skill') {
    const s = r.tool_input?.skill;
    if (typeof s !== 'string' || s.length === 0) {
      return Object.keys(agentFields).length > 0 ? agentFields : undefined;
    }
    return { skill: s, ...agentFields };
  }
  // Edit tools: extract file path.
  if (!EDIT_TOOLS.has(r.tool_name)) {
    return Object.keys(agentFields).length > 0 ? agentFields : undefined;
  }
  const fp = r.tool_input?.file_path;
  if (typeof fp !== 'string' || fp.length === 0) {
    return Object.keys(agentFields).length > 0 ? agentFields : undefined;
  }
  return { files: [fp], ...agentFields };
}
