import { describe, it, expect } from 'vitest';
import { routeHookEvent } from '../src/shim.js';

describe('routeHookEvent', () => {
  it('SessionStart → session-start, stdin unchanged', () => {
    const raw = JSON.stringify({
      hook_event_name: 'SessionStart',
      session_id: 'abc',
      source: 'startup',
    });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('session-start');
    expect(JSON.parse(r.translatedStdin)).toMatchObject({
      hook_event_name: 'SessionStart',
      session_id: 'abc',
      source: 'startup',
    });
  });

  it('UserPromptSubmit → user-prompt', () => {
    const raw = JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'hello' });
    expect(routeHookEvent(raw).abstractEvent).toBe('user-prompt');
  });

  it('Stop → session-stop', () => {
    const raw = JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false });
    expect(routeHookEvent(raw).abstractEvent).toBe('session-stop');
  });

  it('PostToolUse apply_patch → post-tool-edit + files[] from patch', () => {
    const raw = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n*** Add File: src/x.ts\n+1\n*** Update File: src/y.ts\n@@\n-a\n+b\n*** End Patch\n',
      },
    });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('post-tool-edit');
    const parsed = JSON.parse(r.translatedStdin);
    expect(parsed.files).toEqual(['src/x.ts', 'src/y.ts']);
    expect(parsed.tool_name).toBe('apply_patch');
  });

  it('PreToolUse apply_patch → pre-tool-edit + files[]', () => {
    const raw = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: { command: '*** Begin Patch\n*** Add File: z.ts\n+1\n*** End Patch\n' },
    });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('pre-tool-edit');
    expect(JSON.parse(r.translatedStdin).files).toEqual(['z.ts']);
  });

  it('PostToolUse Bash → null (out-of-scope tool)', () => {
    const raw = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    });
    expect(routeHookEvent(raw).abstractEvent).toBeNull();
  });

  it('PostToolUse mcp tool → null', () => {
    const raw = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__filesystem__write',
      tool_input: {},
    });
    expect(routeHookEvent(raw).abstractEvent).toBeNull();
  });

  it('PermissionRequest → null (no KEEL equivalent)', () => {
    const raw = JSON.stringify({
      hook_event_name: 'PermissionRequest',
      tool_name: 'apply_patch',
      tool_input: { description: 'edit src/foo.ts' },
    });
    expect(routeHookEvent(raw).abstractEvent).toBeNull();
  });

  it('SubagentStop → null (Codex has no SubagentStop)', () => {
    const raw = JSON.stringify({ hook_event_name: 'SubagentStop' });
    expect(routeHookEvent(raw).abstractEvent).toBeNull();
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

  it('apply_patch with empty command → pre-tool-edit dropped to null', () => {
    const raw = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {},
    });
    const r = routeHookEvent(raw);
    expect(r.abstractEvent).toBe('post-tool-edit');
    expect(JSON.parse(r.translatedStdin).files).toBeUndefined();
  });
});
