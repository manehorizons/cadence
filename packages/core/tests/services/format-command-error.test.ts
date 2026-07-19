import { describe, it, expect } from 'vitest';
import { formatCommandError, formatTopLevelError } from '../../src/services/format-command-error.js';
import { StateCorruptError, NotInitializedError } from '../../src/errors.js';

// AC-6 (issue #177) — single source of truth for the "<cmd> failed: ..."
// line every command-service's outer catch prints, plus the top-level CLI
// backstop. A StateCorruptError gets a `cadence doctor --fix` pointer
// appended; every other error type is byte-for-byte what each of the 9
// call sites printed before this helper existed.

describe('formatCommandError', () => {
  it('a StateCorruptError gets the "<cmd> failed: ..." prefix plus a doctor --fix pointer', () => {
    const err = new StateCorruptError('state.json is not valid JSON: Unexpected token');
    expect(formatCommandError('progress', err)).toBe(
      "progress failed: state.json is not valid JSON: Unexpected token\nRun 'cadence doctor --fix' to diagnose and repair.",
    );
  });

  it('a plain Error keeps the existing "<cmd> failed: <message>" shape, unchanged', () => {
    const err = new Error('draft not found');
    expect(formatCommandError('draft approve', err)).toBe('draft approve failed: draft not found');
  });

  it('a non-Error thrown value is stringified into the same shape, unchanged', () => {
    expect(formatCommandError('build task', 'raw string throw')).toBe(
      'build task failed: raw string throw',
    );
  });

  it('a different CadenceError subclass (e.g. NotInitializedError) is not treated as state-corrupt', () => {
    const err = new NotInitializedError();
    expect(formatCommandError('settle run', err)).toBe(
      `settle run failed: ${err.message}`,
    );
  });
});

describe('formatTopLevelError', () => {
  it('a StateCorruptError gets a doctor --fix pointer, with no "<cmd> failed:" prefix', () => {
    const err = new StateCorruptError('state.json failed schema validation: bad shape');
    expect(formatTopLevelError(err)).toBe(
      "state.json failed schema validation: bad shape\nRun 'cadence doctor --fix' to diagnose and repair.",
    );
  });

  it('a plain Error keeps just its message, unchanged', () => {
    expect(formatTopLevelError(new Error('unexpected'))).toBe('unexpected');
  });

  it('a non-Error thrown value is stringified, unchanged', () => {
    expect(formatTopLevelError('raw string throw')).toBe('raw string throw');
  });
});
