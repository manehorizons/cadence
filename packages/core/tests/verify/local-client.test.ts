import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';
import { localChatJSON } from '../../src/verify/local-client.js';

const Schema = z.object({ ok: z.boolean() });

function fakeFetch(bodies: string[]): typeof fetch {
  let i = 0;
  return (async () => {
    const content = bodies[Math.min(i++, bodies.length - 1)];
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    } as Response;
  }) as unknown as typeof fetch;
}

describe('localChatJSON', () => {
  const base = { baseURL: 'http://x/v1', model: 'm', system: 's', user: 'u', schema: Schema };

  it('AC-1: parses clean JSON', async () => {
    const r = await localChatJSON({ ...base, transport: fakeFetch(['{"ok":true}']) });
    expect(r.ok).toBe(true);
  });

  it('AC-1: strips code fences and prose', async () => {
    const r = await localChatJSON({ ...base, transport: fakeFetch(['Sure:\n```json\n{"ok":true}\n```']) });
    expect(r.ok).toBe(true);
  });

  it('AC-2: repairs once then succeeds', async () => {
    const r = await localChatJSON({ ...base, transport: fakeFetch(['not json', '{"ok":false}']) });
    expect(r.ok).toBe(false);
  });

  it('AC-2: throws after failed repair', async () => {
    await expect(
      localChatJSON({ ...base, transport: fakeFetch(['nope', 'still nope']) }),
    ).rejects.toThrow(/parse|JSON|schema/i);
  });

  it('AC-3: throws naming base URL on network reject', async () => {
    const t = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    await expect(
      localChatJSON({ ...base, transport: t }),
    ).rejects.toThrow(/http:\/\/x\/v1/);
  });

  it('AC-3: throws on non-2xx', async () => {
    const t = (async () => ({ ok: false, status: 500, json: async () => ({}) } as Response)) as unknown as typeof fetch;
    await expect(localChatJSON({ ...base, transport: t })).rejects.toThrow(/500/);
  });
});
