import { describe, it, expect } from 'vitest';
import { checkNodeMajor } from '../../src/cli/node-guard.js';

// AC-2 — Node version floor enforced with a readable message
describe('checkNodeMajor', () => {
  it('accepts Node 22 and above', () => {
    expect(checkNodeMajor('22.0.0')).toEqual({ ok: true });
    expect(checkNodeMajor('24.11.0')).toEqual({ ok: true });
  });

  it('rejects Node below 22 with a readable message (AC-2)', () => {
    const r = checkNodeMajor('20.0.0');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/requires Node >=22/);
      expect(r.message).toMatch(/20\.0\.0/);
    }
  });

  it('tolerates a leading v and fails open on unparseable input', () => {
    expect(checkNodeMajor('v22.3.1')).toEqual({ ok: true });
    expect(checkNodeMajor('garbage')).toEqual({ ok: true });
  });
});
