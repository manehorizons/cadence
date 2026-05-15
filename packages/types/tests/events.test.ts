import { describe, it, expect } from 'vitest';
import { AbstractEventZ, type AbstractEvent } from '../src/events.js';

describe('AbstractEventZ', () => {
  it('accepts all seven valid abstract events', () => {
    const events: AbstractEvent[] = [
      'session-start',
      'user-prompt',
      'pre-tool-edit',
      'post-tool-edit',
      'session-stop',
      'subagent-result',
      'skill-invoke',
    ];
    for (const e of events) {
      expect(() => AbstractEventZ.parse(e)).not.toThrow();
    }
  });

  it('skill-invoke is parseable (AC-1, Phase 23.4)', () => {
    expect(AbstractEventZ.parse('skill-invoke')).toBe('skill-invoke');
  });

  it('rejects unknown event names', () => {
    expect(() => AbstractEventZ.parse('something-else')).toThrow();
  });
});
