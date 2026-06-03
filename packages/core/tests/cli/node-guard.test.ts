import { describe, it, expect } from 'vitest';
import { checkNodeMajor } from '../../src/cli/node-guard.js';

// AC-2 — Node version floor enforced with a readable message
describe('checkNodeMajor', () => {
  it('accepts Node 20 and above', () => {
    expect(checkNodeMajor('20.0.0')).toEqual({ ok: true });
    expect(checkNodeMajor('22.11.0')).toEqual({ ok: true });
  });

  it('rejects Node below 20 with a readable message (AC-2)', () => {
    const r = checkNodeMajor('18.19.0');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/requires Node >=20/);
      expect(r.message).toMatch(/18\.19\.0/);
    }
  });

  it('tolerates a leading v and fails open on unparseable input', () => {
    expect(checkNodeMajor('v20.3.1')).toEqual({ ok: true });
    expect(checkNodeMajor('garbage')).toEqual({ ok: true });
  });
});
