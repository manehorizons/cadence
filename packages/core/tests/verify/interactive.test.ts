import { describe, it, expect } from 'vitest';
import { walkAcsInteractively } from '../../src/verify/interactive.js';
import { ScriptedPrompter } from '../../src/verify/prompter.js';
import type { InteractiveInput } from '../../src/verify/interactive.js';

// AC-2: walker prints context + collects pass/fail/skip verdicts;
// skipped ACs are omitted from the result.

const baseInput: InteractiveInput = {
  acs: [
    { id: 'AC-1', given: 'g1', when: 'w1', then: 't1' },
    { id: 'AC-2', given: 'g2', when: 'w2', then: 't2' },
    { id: 'AC-3', given: 'g3', when: 'w3', then: 't3' },
  ],
  tests: {
    'AC-1': [{ file: 'tests/a.test.ts', line: 12, snippet: 'AC-1' }],
  },
  files: ['src/a.ts', 'src/b.ts'],
};

describe('walkAcsInteractively (AC-2)', () => {
  it('collects pass/fail verdicts and omits skipped ACs', async () => {
    const chunks: string[] = [];
    const prompter = new ScriptedPrompter([
      'pass',          // AC-1 verdict
      'implementation looks right', // AC-1 note
      'fail',          // AC-2 verdict
      'no test exercises the error path', // AC-2 note
      'skip',          // AC-3 verdict (no note prompt)
    ]);
    const result = await walkAcsInteractively(baseInput, prompter, {
      write: (c) => chunks.push(c),
    });
    expect(result).toEqual({
      'AC-1': { verdict: 'pass', note: 'implementation looks right' },
      'AC-2': { verdict: 'fail', note: 'no test exercises the error path' },
    });
    expect(result['AC-3']).toBeUndefined();
  });

  it('renders AC text + linked tests + touched files', async () => {
    const chunks: string[] = [];
    const prompter = new ScriptedPrompter(['skip', 'skip', 'skip']);
    await walkAcsInteractively(baseInput, prompter, {
      write: (c) => chunks.push(c),
    });
    const transcript = chunks.join('');
    expect(transcript).toMatch(/AC-1/);
    expect(transcript).toMatch(/Given: g1/);
    expect(transcript).toMatch(/Linked tests \(1\)/);
    expect(transcript).toMatch(/tests\/a\.test\.ts:12/);
    expect(transcript).toMatch(/Touched files: src\/a\.ts, src\/b\.ts/);
    expect(transcript).toMatch(/AC-2/);
    expect(transcript).toMatch(/AC-3/);
    expect(transcript).toMatch(/Linked tests: \(none\)/); // AC-2 + AC-3
  });

  it('accepts shorthand verdicts (p/f/s) and blank = skip', async () => {
    const prompter = new ScriptedPrompter(['p', 'ok', 'f', 'broken', '']);
    const result = await walkAcsInteractively(baseInput, prompter, {
      write: () => {},
    });
    expect(result['AC-1']?.verdict).toBe('pass');
    expect(result['AC-2']?.verdict).toBe('fail');
    expect(result['AC-3']).toBeUndefined();
  });

  it('treats blank note as undefined', async () => {
    const prompter = new ScriptedPrompter(['pass', '', 'skip', 'skip']);
    const result = await walkAcsInteractively(baseInput, prompter, {
      write: () => {},
    });
    expect(result['AC-1']).toEqual({ verdict: 'pass' });
    expect(result['AC-1']?.note).toBeUndefined();
  });

  it('throws if user gives invalid input 3 times for one AC', async () => {
    const prompter = new ScriptedPrompter(['yes', 'maybe', 'sure']);
    await expect(
      walkAcsInteractively(
        { acs: [{ id: 'AC-1', given: '', when: '', then: '' }], tests: {}, files: [] },
        prompter,
        { write: () => {} },
      ),
    ).rejects.toThrow(/failed to read a valid verdict/);
  });

  it('handles an empty AC list cleanly', async () => {
    const prompter = new ScriptedPrompter([]);
    const result = await walkAcsInteractively(
      { acs: [], tests: {}, files: [] },
      prompter,
      { write: () => {} },
    );
    expect(result).toEqual({});
  });
});
