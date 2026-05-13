import { describe, it, expect } from 'vitest';
import { AbstractEventZ, type AbstractEvent } from '../src/events.js';

describe('AbstractEventZ', () => {
  it('accepts all six valid abstract events', () => {
    const events: AbstractEvent[] = [
      'session-start',
      'user-prompt',
      'pre-tool-edit',
      'post-tool-edit',
      'session-stop',
      'subagent-result',
    ];
    for (const e of events) {
      expect(() => AbstractEventZ.parse(e)).not.toThrow();
    }
  });

  it('rejects unknown event names', () => {
    expect(() => AbstractEventZ.parse('something-else')).toThrow();
  });
});
