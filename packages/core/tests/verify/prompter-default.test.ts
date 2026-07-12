import { describe, it, expect, afterEach } from 'vitest';
import { createDefaultPrompter, ScriptedPrompter, StdinPrompter } from '../../src/verify/prompter.js';

describe('createDefaultPrompter', () => {
  const ORIGINAL = process.env.CADENCE_PROMPTER_SCRIPT;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CADENCE_PROMPTER_SCRIPT;
    else process.env.CADENCE_PROMPTER_SCRIPT = ORIGINAL;
  });

  it('returns a ScriptedPrompter when CADENCE_PROMPTER_SCRIPT is set', () => {
    process.env.CADENCE_PROMPTER_SCRIPT = 'y\n';
    expect(createDefaultPrompter()).toBeInstanceOf(ScriptedPrompter);
  });

  it('returns a StdinPrompter-constructing factory otherwise (throws off a non-TTY, per StdinPrompter itself)', () => {
    delete process.env.CADENCE_PROMPTER_SCRIPT;
    expect(() => createDefaultPrompter()).toThrow(/not a TTY/);
    // (StdinPrompter's own constructor throws in this non-TTY test process — confirms
    // createDefaultPrompter() really does fall through to `new StdinPrompter()` and
    // isn't silently swallowing the env var.)
  });
});
