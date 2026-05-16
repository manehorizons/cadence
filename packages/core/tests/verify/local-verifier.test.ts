import { describe, it, expect } from 'vitest';
import { LocalVerifier } from '../../src/verify/verifier.js';

const fetchJson = (content: string) =>
  (async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) } as Response)) as unknown as typeof fetch;

describe('LocalVerifier', () => {
  it('AC-4: maps model verdicts into VerifyResult, provider=local', async () => {
    const v = new LocalVerifier({
      baseURL: 'http://x/v1', model: 'qwen',
      transport: fetchJson('{"verdicts":[{"id":"AC-1","pass":true,"reason":"ok"}]}'),
    });
    const r = await v.verify({
      acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      tests: {}, diff: '', files: [],
    });
    expect(r.provider).toBe('local');
    expect(r.model).toBe('qwen');
    expect(r.verdicts['AC-1']).toEqual({ pass: true, reason: 'ok' });
  });

  it('AC-4: empty ACs short-circuits with no network call', async () => {
    let called = false;
    const t = (async () => { called = true; return {} as Response; }) as unknown as typeof fetch;
    const v = new LocalVerifier({ baseURL: 'http://x/v1', model: 'm', transport: t });
    const r = await v.verify({ acs: [], tests: {}, diff: '', files: [] });
    expect(called).toBe(false);
    expect(r).toEqual({ verdicts: {}, provider: 'local', model: 'm' });
  });
});
