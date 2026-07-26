import type { AbstractEvent, ExtractedPayload } from '@manehorizons/cadence-types';
import { COMMAND_GUIDANCE, DISPATCH_DIALOGUE, SCOUT_DIALOGUE } from '@manehorizons/cadence-types';

// Re-exported for convenience: the canonical definition lives in
// @manehorizons/cadence-types as part of the host-adapter contract.
export type { ExtractedPayload };

// ---------------------------------------------------------------------------
// Hook-event routing (formerly duplicated in each adapter's event-map.ts /
// shim.ts). Both host-claude-code and host-codex receive Claude-Code-shaped
// hook JSON on stdin and translate it into a cadence AbstractEvent — this is
// the one shared implementation of that 8-step dispatch algorithm.
// ---------------------------------------------------------------------------

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
 * Map a host hook event name to its cadence abstract event. `toolName`
 * disambiguates `PostToolUse` between the edit-tool flow (post-tool-edit)
 * and the Skill-tool flow (skill-invoke, Phase 23.4).
 */
export function mapEvent(hostEvent: string, toolName?: string): AbstractEvent | null {
  if (hostEvent === 'PostToolUse' && toolName === 'Skill') return 'skill-invoke';
  return EVENT_TABLE[hostEvent] ?? null;
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

export interface RouteResult {
  abstractEvent: AbstractEvent | null;
  translatedStdin: string;
}

/**
 * Translate one host stdin-JSON hook event into a cadence abstract event plus
 * the stdin the core dispatcher should receive. The 8-step algorithm: parse
 * JSON (1), reject non-object/array payloads (2), require a string
 * `hook_event_name` (3), read `tool_name` (4), map the event — with the Skill
 * disambiguation (5), bail out on an unmapped event (6), defensively re-filter
 * Pre/PostToolUse to known edit tools (7), then extract + translate the
 * payload (8). Unmapped events, malformed JSON, and Pre/PostToolUse for
 * non-edit tools return `{ abstractEvent: null }` with the raw stdin passed
 * through untouched (the core never sees them).
 */
export function routeHookEvent(raw: string): RouteResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw); // 1. parse
  } catch {
    return { abstractEvent: null, translatedStdin: raw };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // 2. reject non-object/array payloads
    return { abstractEvent: null, translatedStdin: raw };
  }
  const obj = parsed as { hook_event_name?: unknown };
  if (typeof obj.hook_event_name !== 'string') {
    // 3. require a string hook_event_name
    return { abstractEvent: null, translatedStdin: raw };
  }
  // 4. read tool_name
  const toolName = (parsed as { tool_name?: unknown }).tool_name;
  const toolNameStr = typeof toolName === 'string' ? toolName : undefined;
  // 5. map the event (Skill disambiguation happens inside mapEvent)
  const abstractEvent = mapEvent(obj.hook_event_name, toolNameStr);
  if (abstractEvent === null) {
    // 6. bail out on an unmapped event
    return { abstractEvent: null, translatedStdin: raw };
  }
  // 7. Defensive filter: PreToolUse/PostToolUse for non-edit tools should be
  // dropped even though the host's own hook matcher already restricts them.
  // Skill tool takes its own route (skill-invoke) above and bypasses this
  // filter.
  if (abstractEvent === 'pre-tool-edit' || abstractEvent === 'post-tool-edit') {
    if (typeof toolName !== 'string' || !EDIT_TOOLS.has(toolName)) {
      return { abstractEvent: null, translatedStdin: raw };
    }
  }
  // 8. extract + translate the payload
  const extracted = extractPayload(parsed);
  const translated: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  if (extracted?.files) translated.files = extracted.files;
  if (extracted?.skill) translated.skill = extracted.skill;
  return { abstractEvent, translatedStdin: JSON.stringify(translated) };
}

// ---------------------------------------------------------------------------
// Slash-command catalog (formerly duplicated — and drifted — between each
// adapter's install-commands.ts). This is the descriptor data only; each
// adapter still owns its host-specific file-rendering shape (front-matter
// fields, code-fence wrapping, target directory) because those legitimately
// differ between Claude Code's `.claude/commands/*.md` and Codex's global
// `~/.codex/prompts/*.md`. What must stay identical across hosts is *which*
// commands exist and their description/cli/argumentHint/trailing/body — this
// array is that single source of truth.
// ---------------------------------------------------------------------------

export interface CommandSpec {
  name: string;
  description: string;
  argumentHint?: string;
  cli: string; // suffix appended to the cadence command; may include $ARGUMENTS
  trailing?: string;
  /**
   * Multi-line prompt body rendered after the auto-run command line. Used by
   * dialogue commands (e.g. cadence-scout, cadence-dispatch) that are a
   * prompt template rather than a thin CLI shell-out. Thin commands leave
   * this unset.
   */
  body?: string;
}

// Guidance prose (description/trailing) + the dialogue bodies live in the
// shared `@manehorizons/cadence-types` guidance module (phase 77) so the MCP
// prompts and these slash commands share one source of truth. The
// command-shape fields (cli, argumentHint, which commands carry a dialogue
// body) live here so both host adapters render from the identical catalog.
const g = COMMAND_GUIDANCE;
export const COMMANDS: CommandSpec[] = [
  {
    name: 'cadence-progress',
    description: g['cadence-progress'].description,
    cli: 'progress',
    trailing: g['cadence-progress'].trailing,
  },
  {
    name: 'cadence-next',
    description: g['cadence-next'].description,
    cli: 'next',
    trailing: g['cadence-next'].trailing,
  },
  {
    name: 'cadence-draft',
    description: g['cadence-draft'].description,
    argumentHint: '<phase-id> <task-num> [--title=<title>]',
    cli: 'draft new $ARGUMENTS',
    trailing: g['cadence-draft'].trailing,
  },
  {
    name: 'cadence-approve',
    description: g['cadence-approve'].description,
    argumentHint: '<phase-id> <task-num>',
    cli: 'draft approve $ARGUMENTS',
    trailing: g['cadence-approve'].trailing,
  },
  {
    name: 'cadence-check',
    description: g['cadence-check'].description,
    argumentHint: '<phase-id> <task-num>',
    cli: 'draft check $ARGUMENTS',
    trailing: g['cadence-check'].trailing,
  },
  {
    name: 'cadence-build',
    description: g['cadence-build'].description,
    argumentHint: '<task-id> --status=<PASS|FAIL|BLOCKED|ESCALATED>',
    cli: 'build task $ARGUMENTS',
    trailing: g['cadence-build'].trailing,
  },
  {
    name: 'cadence-settle',
    description: g['cadence-settle'].description,
    argumentHint: '[--ac AC-1=pass ...]',
    cli: 'settle run $ARGUMENTS',
    trailing: g['cadence-settle'].trailing,
  },
  {
    name: 'cadence-done',
    description: g['cadence-done'].description,
    argumentHint: '<task-id> [--notes=<n>]',
    cli: 'done $ARGUMENTS',
    trailing: g['cadence-done'].trailing,
  },
  {
    name: 'cadence-block',
    description: g['cadence-block'].description,
    argumentHint: '<task-id> [--notes=<n>]',
    cli: 'block $ARGUMENTS',
    trailing: g['cadence-block'].trailing,
  },
  {
    name: 'cadence-needs-context',
    description: g['cadence-needs-context'].description,
    argumentHint: '<task-id> [--notes=<n>]',
    cli: 'needs-context $ARGUMENTS',
    trailing: g['cadence-needs-context'].trailing,
  },
  {
    name: 'cadence-handoff',
    description: g['cadence-handoff'].description,
    argumentHint: '[label]',
    cli: 'handoff $ARGUMENTS',
    trailing: g['cadence-handoff'].trailing,
  },
  {
    name: 'cadence-resume',
    description: g['cadence-resume'].description,
    cli: 'resume',
    trailing: g['cadence-resume'].trailing,
  },
  {
    name: 'cadence-recommend',
    description: g['cadence-recommend'].description,
    argumentHint: '[count]',
    cli: 'recommend --top 5',
    trailing: g['cadence-recommend'].trailing,
  },
  {
    name: 'cadence-scout',
    description: g['cadence-scout'].description,
    argumentHint: '[topic]',
    cli: 'recommend',
    body: SCOUT_DIALOGUE,
  },
  {
    name: 'cadence-dispatch',
    description: g['cadence-dispatch'].description,
    cli: 'dispatch plan --json',
    body: DISPATCH_DIALOGUE,
  },
];
