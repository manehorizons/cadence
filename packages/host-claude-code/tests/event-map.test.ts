import { describe, it, expect } from 'vitest';
import { mapEvent, extractPayload, EDIT_TOOL_MATCHER } from '../src/event-map.js';

describe('mapEvent', () => {
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

  it('maps PreToolUse → pre-tool-edit', () => {
    expect(mapEvent('PreToolUse')).toBe('pre-tool-edit');
  });

  it('maps PostToolUse → post-tool-edit', () => {
    expect(mapEvent('PostToolUse')).toBe('post-tool-edit');
  });

  it('returns null for non-relevant events', () => {
    expect(mapEvent('Notification')).toBeNull();
    expect(mapEvent('PreCompact')).toBeNull();
    expect(mapEvent('NopeNope')).toBeNull();
  });
});

describe('EDIT_TOOL_MATCHER', () => {
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

describe('extractPayload', () => {
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
});
