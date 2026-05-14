import { describe, it, expect } from 'vitest';
import { routeHookEvent } from '../src/shim.js';

describe('routeHookEvent', () => {
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
    // Original payload preserved alongside translated fields.
    expect(parsed.tool_name).toBe('Edit');
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
});
