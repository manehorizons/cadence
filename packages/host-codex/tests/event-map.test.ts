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

  it('maps PreToolUse → pre-tool-edit', () => {
    expect(mapEvent('PreToolUse')).toBe('pre-tool-edit');
  });

  it('maps PostToolUse → post-tool-edit', () => {
    expect(mapEvent('PostToolUse')).toBe('post-tool-edit');
  });

  it('returns null for PermissionRequest (no KEEL equivalent)', () => {
    expect(mapEvent('PermissionRequest')).toBeNull();
  });

  it('returns null for non-relevant events', () => {
    expect(mapEvent('SubagentStop')).toBeNull();
    expect(mapEvent('Notification')).toBeNull();
    expect(mapEvent('NopeNope')).toBeNull();
  });
});

describe('EDIT_TOOL_MATCHER', () => {
  it('regex covers apply_patch, Edit, Write', () => {
    const re = new RegExp(`^(?:${EDIT_TOOL_MATCHER})$`);
    expect(re.test('apply_patch')).toBe(true);
    expect(re.test('Edit')).toBe(true);
    expect(re.test('Write')).toBe(true);
    expect(re.test('Bash')).toBe(false);
    expect(re.test('Read')).toBe(false);
  });
});

describe('extractPayload — apply_patch', () => {
  it('PostToolUse apply_patch Add File → single file', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n*** Add File: src/foo.ts\n+export const x = 1;\n*** End Patch\n',
      },
    };
    expect(extractPayload(raw)).toEqual({ files: ['src/foo.ts'] });
  });

  it('PostToolUse apply_patch Update File → single file', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n*** Update File: pkg/bar.ts\n@@ -1 +1 @@\n-old\n+new\n*** End Patch\n',
      },
    };
    expect(extractPayload(raw)).toEqual({ files: ['pkg/bar.ts'] });
  });

  it('PostToolUse apply_patch Delete File → single file', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Delete File: old/baz.ts\n*** End Patch\n',
      },
    };
    expect(extractPayload(raw)).toEqual({ files: ['old/baz.ts'] });
  });

  it('extracts multiple file directives in one patch', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Add File: a.ts',
          '+a',
          '*** Update File: b.ts',
          '@@ -1 +1 @@',
          '-x',
          '+y',
          '*** Delete File: c.ts',
          '*** End Patch',
          '',
        ].join('\n'),
      },
    };
    expect(extractPayload(raw)).toEqual({ files: ['a.ts', 'b.ts', 'c.ts'] });
  });

  it('PreToolUse apply_patch also extracts files', () => {
    const raw = {
      hook_event_name: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Add File: x.ts\n+1\n*** End Patch\n',
      },
    };
    expect(extractPayload(raw)).toEqual({ files: ['x.ts'] });
  });

  it('trims whitespace around path', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n***   Add File:    spaced/path.ts   \n+1\n*** End Patch\n',
      },
    };
    expect(extractPayload(raw)).toEqual({ files: ['spaced/path.ts'] });
  });

  it('deduplicates repeated paths', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Update File: same.ts',
          '@@',
          '+x',
          '*** Update File: same.ts',
          '@@',
          '+y',
          '*** End Patch',
        ].join('\n'),
      },
    };
    expect(extractPayload(raw)).toEqual({ files: ['same.ts'] });
  });
});

describe('extractPayload — undefined cases', () => {
  it('SessionStart → undefined', () => {
    expect(extractPayload({ hook_event_name: 'SessionStart' })).toBeUndefined();
  });

  it('Bash tool → undefined (out of scope)', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    };
    expect(extractPayload(raw)).toBeUndefined();
  });

  it('apply_patch with no directives → undefined', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: { command: 'not a real patch envelope' },
    };
    expect(extractPayload(raw)).toBeUndefined();
  });

  it('apply_patch missing tool_input.command → undefined', () => {
    const raw = {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {},
    };
    expect(extractPayload(raw)).toBeUndefined();
  });

  it('non-object input → undefined', () => {
    expect(extractPayload(null)).toBeUndefined();
    expect(extractPayload('not-json')).toBeUndefined();
    expect(extractPayload(undefined)).toBeUndefined();
  });
});
