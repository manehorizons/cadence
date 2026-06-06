import { describe, it, expect } from 'vitest';
import { routeHookEvent } from '../src/shim.js';

const patch = (file: string) => `*** Begin Patch\n*** Update File: ${file}\n*** End Patch`;

describe('routeHookEvent (AC-1)', () => {
  it('AC-1: SessionStart → session-start, stdin unchanged', () => {
    const raw = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'abc' });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('session-start');
    expect(JSON.parse(r.translatedStdin)).toEqual({ hook_event_name: 'SessionStart', session_id: 'abc' });
  });

  it('AC-1: PreToolUse apply_patch → pre-tool-edit + files[]', () => {
    const raw = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { input: patch('src/x.ts') } });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('pre-tool-edit');
    const parsed = JSON.parse(r.translatedStdin);
    expect(parsed.files).toEqual(['src/x.ts']);
    expect(parsed.tool_name).toBe('apply_patch'); // original payload preserved
  });

  it('AC-1: PostToolUse apply_patch → post-tool-edit + files[]', () => {
    const raw = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'apply_patch', tool_input: { input: patch('a.ts') } });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('post-tool-edit');
    expect(JSON.parse(r.translatedStdin).files).toEqual(['a.ts']);
  });

  it('AC-1: PreToolUse Bash → null (non-edit tool dropped)', () => {
    const raw = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
    expect(routeHookEvent(raw).abstractEvent).toBeNull();
  });

  it('AC-1: UserPromptSubmit / Stop / SubagentStop map through', () => {
    expect(routeHookEvent(JSON.stringify({ hook_event_name: 'UserPromptSubmit' })).abstractEvent).toBe('user-prompt');
    expect(routeHookEvent(JSON.stringify({ hook_event_name: 'Stop' })).abstractEvent).toBe('session-stop');
    expect(routeHookEvent(JSON.stringify({ hook_event_name: 'SubagentStop' })).abstractEvent).toBe('subagent-result');
  });

  it('AC-1: unmapped event → null, raw stdin passthrough', () => {
    const raw = JSON.stringify({ hook_event_name: 'PreCompact', foo: 1 });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBeNull();
    expect(r.translatedStdin).toBe(raw);
  });

  it('AC-1: malformed JSON → null, raw passthrough', () => {
    const r = routeHookEvent('not json{');
    expect(r.abstractEvent).toBeNull();
    expect(r.translatedStdin).toBe('not json{');
  });

  it('AC-1: missing hook_event_name → null', () => {
    expect(routeHookEvent(JSON.stringify({ tool_name: 'apply_patch' })).abstractEvent).toBeNull();
  });
});
