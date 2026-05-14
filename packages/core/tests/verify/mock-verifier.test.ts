import { describe, it, expect } from 'vitest';
import { MockVerifier } from '../../src/verify/mock-verifier.js';
import type { VerifyInput } from '../../src/verify/verifier.js';

// AC-1: covered AC → pass; uncovered AC → fail; mixed; empty input

function makeInput(overrides: Partial<VerifyInput> = {}): VerifyInput {
  return {
    acs: [],
    tests: {},
    diff: '',
    files: [],
    ...overrides,
  };
}

describe('MockVerifier (AC-1)', () => {
  it('reports pass for ACs with linked tests', async () => {
    const v = new MockVerifier();
    const r = await v.verify(
      makeInput({
        acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
        tests: {
          'AC-1': [{ file: 'tests/foo.test.ts', line: 12, snippet: 'AC-1 path' }],
        },
      }),
    );
    expect(r.verdicts['AC-1']?.pass).toBe(true);
    expect(r.verdicts['AC-1']?.reason).toMatch(/1 linked test/);
    expect(r.verdicts['AC-1']?.reason).toMatch(/tests\/foo\.test\.ts:12/);
    expect(r.provider).toBe('mock');
  });

  it('reports fail for ACs without linked tests', async () => {
    const v = new MockVerifier();
    const r = await v.verify(
      makeInput({ acs: [{ id: 'AC-2', given: '', when: '', then: '' }] }),
    );
    expect(r.verdicts['AC-2']?.pass).toBe(false);
    expect(r.verdicts['AC-2']?.reason).toBe('no linked test found');
  });

  it('handles mixed coverage in one call', async () => {
    const v = new MockVerifier();
    const r = await v.verify(
      makeInput({
        acs: [
          { id: 'AC-1', given: '', when: '', then: '' },
          { id: 'AC-2', given: '', when: '', then: '' },
          { id: 'AC-3', given: '', when: '', then: '' },
        ],
        tests: {
          'AC-1': [{ file: 'a.test.ts', line: 1, snippet: '' }],
          'AC-3': [
            { file: 'b.test.ts', line: 2, snippet: '' },
            { file: 'c.test.ts', line: 3, snippet: '' },
          ],
        },
      }),
    );
    expect(r.verdicts['AC-1']?.pass).toBe(true);
    expect(r.verdicts['AC-2']?.pass).toBe(false);
    expect(r.verdicts['AC-3']?.pass).toBe(true);
    expect(r.verdicts['AC-3']?.reason).toMatch(/2 linked tests/);
  });

  it('returns empty verdict map for empty input', async () => {
    const v = new MockVerifier();
    const r = await v.verify(makeInput());
    expect(r.verdicts).toEqual({});
    expect(r.provider).toBe('mock');
  });

  it('is pure — same input yields byte-identical output', async () => {
    const v = new MockVerifier();
    const input = makeInput({
      acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      tests: { 'AC-1': [{ file: 'x.test.ts', line: 1, snippet: 's' }] },
    });
    const a = await v.verify(input);
    const b = await v.verify(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
