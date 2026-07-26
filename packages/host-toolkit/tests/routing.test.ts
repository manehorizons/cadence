import { describe, it, expect } from 'vitest';
import { DISPATCH_DIALOGUE, SCOUT_DIALOGUE } from '@manehorizons/cadence-types';
import {
  mapEvent,
  extractPayload,
  routeHookEvent,
  EDIT_TOOL_MATCHER,
  COMMANDS,
} from '../src/routing.js';

// AC-1: routeHookEvent's dispatch algorithm and the slash-command catalog
// live in one shared module (packages/host-toolkit/src/routing.ts) that both
// host-claude-code and host-codex import instead of hand-rolling their own
// copy.

describe('mapEvent (AC-1)', () => {
  it('maps SessionStart → session-start', () => {
    expect(mapEvent('SessionStart')).toBe('session-start');
  });

  it('maps UserPromptSubmit → user-prompt', () => {
    expect(mapEvent('UserPromptSubmit')).toBe('user-prompt');
  });

  it('maps Stop → session-stop', () => {
    expect(mapEvent('Stop')).toBe('session-stop');
  });

  it('maps SubagentStop → subagent-result', () => {
    expect(mapEvent('SubagentStop')).toBe('subagent-result');
  });

  it('maps SubagentStart → subagent-start', () => {
    expect(mapEvent('SubagentStart')).toBe('subagent-start');
  });

  it('maps PreToolUse → pre-tool-edit', () => {
    expect(mapEvent('PreToolUse')).toBe('pre-tool-edit');
  });

  it('maps PostToolUse → post-tool-edit', () => {
    expect(mapEvent('PostToolUse')).toBe('post-tool-edit');
  });

  it('maps PostToolUse + tool_name=Skill → skill-invoke', () => {
    expect(mapEvent('PostToolUse', 'Skill')).toBe('skill-invoke');
  });

  it('maps PostToolUse + tool_name=Edit → post-tool-edit (regression)', () => {
    expect(mapEvent('PostToolUse', 'Edit')).toBe('post-tool-edit');
  });

  it('returns null for non-relevant events', () => {
    expect(mapEvent('Notification')).toBeNull();
    expect(mapEvent('PreCompact')).toBeNull();
    expect(mapEvent('NopeNope')).toBeNull();
  });
});

describe('EDIT_TOOL_MATCHER (AC-1)', () => {
  it('regex covers Edit, Write, MultiEdit, NotebookEdit', () => {
    const re = new RegExp(`^(?:${EDIT_TOOL_MATCHER})$`);
    expect(re.test('Edit')).toBe(true);
    expect(re.test('Write')).toBe(true);
    expect(re.test('MultiEdit')).toBe(true);
    expect(re.test('NotebookEdit')).toBe(true);
    expect(re.test('Bash')).toBe(false);
    expect(re.test('Read')).toBe(false);
  });
});

describe('extractPayload (AC-1)', () => {
  it('PostToolUse Edit → {files:[file_path]}', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/abs/path/foo.ts', old_string: 'a', new_string: 'b' },
    };
    expect(extractPayload(raw)).toEqual({ files: ['/abs/path/foo.ts'] });
  });

  it('PostToolUse Write → {files:[file_path]}', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/x.md', content: 'hi' },
    };
    expect(extractPayload(raw)).toEqual({ files: ['/x.md'] });
  });

  it('PostToolUse MultiEdit → {files:[file_path]}', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'MultiEdit',
      tool_input: { file_path: '/m.ts', edits: [] },
    };
    expect(extractPayload(raw)).toEqual({ files: ['/m.ts'] });
  });

  it('PreToolUse Edit → {files:[file_path]}', () => {
    const raw = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/p.ts', old_string: 'a', new_string: 'b' },
    };
    expect(extractPayload(raw)).toEqual({ files: ['/p.ts'] });
  });

  it('returns undefined when no file path', () => {
    expect(extractPayload({ hook_event_name: 'SessionStart' })).toBeUndefined();
    expect(extractPayload({ hook_event_name: 'PostToolUse', tool_name: 'Bash' })).toBeUndefined();
    expect(extractPayload(null)).toBeUndefined();
    expect(extractPayload('not-json')).toBeUndefined();
  });

  it('PostToolUse Skill → {skill:<name>}', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'using-superpowers' },
    };
    expect(extractPayload(raw)).toEqual({ skill: 'using-superpowers' });
  });

  it('PostToolUse Skill with missing skill field → undefined', () => {
    expect(
      extractPayload({ hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: {} }),
    ).toBeUndefined();
  });

  it('extracts agent_id/agent_type from a PreToolUse subagent edit', () => {
    const raw = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/p.ts', old_string: 'a', new_string: 'b' },
      agent_id: 'agent-123',
      agent_type: 'general-purpose',
    };
    expect(extractPayload(raw)).toEqual({
      files: ['/p.ts'],
      agentId: 'agent-123',
      agentType: 'general-purpose',
    });
  });

  it('extracts agent_id/agent_type from a SubagentStart event (no files/skill)', () => {
    const raw = { hook_event_name: 'SubagentStart', agent_id: 'agent-9', agent_type: 'claude' };
    expect(extractPayload(raw)).toEqual({ agentId: 'agent-9', agentType: 'claude' });
  });

  it('extracts agent_id/agent_type from a SubagentStop event', () => {
    const raw = { hook_event_name: 'SubagentStop', agent_id: 'agent-9', agent_type: 'claude' };
    expect(extractPayload(raw)).toEqual({ agentId: 'agent-9', agentType: 'claude' });
  });

  it('a main-thread PreToolUse edit (no agent_id) omits agentId/agentType', () => {
    const raw = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/p.ts' },
    };
    expect(extractPayload(raw)).toEqual({ files: ['/p.ts'] });
  });

  it('a SessionStart event with no extractable fields still returns undefined', () => {
    expect(extractPayload({ hook_event_name: 'SessionStart' })).toBeUndefined();
  });
});

describe('routeHookEvent (AC-1)', () => {
  it('SessionStart with no extra payload → session-start, stdin unchanged', () => {
    const raw = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'abc' });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('session-start');
    expect(JSON.parse(r.translatedStdin)).toEqual({
      hook_event_name: 'SessionStart',
      session_id: 'abc',
    });
  });

  it('PostToolUse Edit → post-tool-edit + translated stdin has files[]', () => {
    const raw = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/abs/foo.ts', old_string: 'a', new_string: 'b' },
    });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('post-tool-edit');
    const parsed = JSON.parse(r.translatedStdin);
    expect(parsed.files).toEqual(['/abs/foo.ts']);
    expect(parsed.tool_name).toBe('Edit');
  });

  it('PostToolUse Skill → skill-invoke + translated stdin has skill', () => {
    const raw = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'using-superpowers' },
    });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('skill-invoke');
    expect(JSON.parse(r.translatedStdin).skill).toBe('using-superpowers');
  });

  it('PostToolUse Bash → null (skip, non-edit tool)', () => {
    const raw = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash' });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBeNull();
  });

  it('PreToolUse Write → pre-tool-edit + files[]', () => {
    const raw = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/x.md', content: 'hi' },
    });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('pre-tool-edit');
    expect(JSON.parse(r.translatedStdin).files).toEqual(['/x.md']);
  });

  it('Notification → null (no abstract mapping)', () => {
    const raw = JSON.stringify({ hook_event_name: 'Notification', message: 'hi' });
    expect(routeHookEvent(raw).abstractEvent).toBeNull();
  });

  it('SubagentStop → subagent-result, stdin unchanged', () => {
    const raw = JSON.stringify({ hook_event_name: 'SubagentStop' });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('subagent-result');
  });

  it('empty stdin → null', () => {
    expect(routeHookEvent('').abstractEvent).toBeNull();
  });

  it('non-JSON stdin → null', () => {
    expect(routeHookEvent('not json {').abstractEvent).toBeNull();
  });

  it('missing hook_event_name → null', () => {
    expect(routeHookEvent('{"foo":1}').abstractEvent).toBeNull();
  });

  it('array stdin → null (rejects non-object payloads)', () => {
    expect(routeHookEvent('[1,2,3]').abstractEvent).toBeNull();
  });

  it('PreToolUse for a spoofed non-edit tool_name is defensively dropped', () => {
    // The host-side hook matcher already restricts this, but routeHookEvent
    // re-filters defensively (step 7 of the dispatch algorithm).
    const raw = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'NotARealEditTool',
    });
    expect(routeHookEvent(raw).abstractEvent).toBeNull();
  });
});

describe('COMMANDS slash-command catalog (AC-1)', () => {
  it('is the single shared source of truth both adapters render from', () => {
    expect(COMMANDS.length).toBeGreaterThan(0);
    const names = COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length); // no duplicate names
    expect(names).toContain('cadence-scout');
    expect(names).toContain('cadence-dispatch');
  });

  it('cadence-scout carries the shared SCOUT_DIALOGUE body', () => {
    const scout = COMMANDS.find((c) => c.name === 'cadence-scout');
    expect(scout?.body).toBe(SCOUT_DIALOGUE);
  });

  // Regression guard for the drift AC-1 calls out: Codex's own copy of this
  // catalog had silently dropped the dispatch dialogue body. The shared
  // catalog is the fix — any adapter importing COMMANDS gets it back.
  it('cadence-dispatch carries the shared DISPATCH_DIALOGUE body', () => {
    const dispatch = COMMANDS.find((c) => c.name === 'cadence-dispatch');
    expect(dispatch?.body).toBe(DISPATCH_DIALOGUE);
  });

  it('every command has a non-empty name, description, and cli suffix', () => {
    for (const spec of COMMANDS) {
      expect(spec.name.length).toBeGreaterThan(0);
      expect(spec.description.length).toBeGreaterThan(0);
      expect(spec.cli.length).toBeGreaterThan(0);
    }
  });
});
