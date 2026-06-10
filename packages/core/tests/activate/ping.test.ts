import { describe, it, expect } from 'vitest';
import { pingProvider } from '../../src/activate/ping.js';

// A minimal fake matching the `messages.create` shape pingProvider calls.
const fakeClient = (impl: () => Promise<unknown>) =>
  ({ messages: { create: impl } }) as unknown as import('@anthropic-ai/sdk').default;

describe('pingProvider (AC-4, AC-6)', () => {
  it('returns ok when the client call resolves', async () => {
    const r = await pingProvider('anthropic', { ANTHROPIC_API_KEY: 'sk' }, {
      client: fakeClient(async () => ({ id: 'msg_1' })),
    });
    expect(r).toEqual({ ok: true });
  });

  it('maps a rejected call to ok:false with a reason', async () => {
    const r = await pingProvider('anthropic', { ANTHROPIC_API_KEY: 'sk' }, {
      client: fakeClient(async () => { throw new Error('boom'); }),
    });
    expect(r).toMatchObject({ ok: false });
  });

  it('fails fast when the key is unset', async () => {
    const r = await pingProvider('anthropic', {});
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/ANTHROPIC_API_KEY/) });
  });

  it('skips non-anthropic providers', async () => {
    expect(await pingProvider('local', {})).toMatchObject({ skipped: true });
    expect(await pingProvider('mock', {})).toMatchObject({ skipped: true });
  });
});
