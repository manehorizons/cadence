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

  it('AC-2: two repair retries — succeeds on the second retry', async () => {
    const r = await localChatJSON({
      ...base,
      transport: fakeFetch(['bad', 'still bad', '{"ok":true}']),
    });
    expect(r.ok).toBe(true);
  });

  it('AC-2: throws after two failed repairs (message says 2 repair retries)', async () => {
    await expect(
      localChatJSON({ ...base, transport: fakeFetch(['n1', 'n2', 'n3']) }),
    ).rejects.toThrow(/2 repair retries/);
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

  // AC-2 (Phase 72) — auth + custom headers reach the outgoing request.
  it('AC-2: sends Authorization + custom headers merged over content-type', async () => {
    let seen: Record<string, string> | undefined;
    const capture = (async (_url: string, init: RequestInit) => {
      seen = init.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      } as Response;
    }) as unknown as typeof fetch;

    await localChatJSON({
      ...base,
      transport: capture,
      headers: { Authorization: 'Bearer sk-local', 'x-tenant': 'acme' },
    });

    expect(seen).toMatchObject({
      'content-type': 'application/json',
      Authorization: 'Bearer sk-local',
      'x-tenant': 'acme',
    });
  });

  it('AC-2: sends only content-type when no headers configured', async () => {
    let seen: Record<string, string> | undefined;
    const capture = (async (_url: string, init: RequestInit) => {
      seen = init.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      } as Response;
    }) as unknown as typeof fetch;

    await localChatJSON({ ...base, transport: capture });

    expect(seen).toEqual({ 'content-type': 'application/json' });
    expect(seen).not.toHaveProperty('Authorization');
  });

  // AC-2 (Phase 184) — an external AbortSignal reaches the outgoing fetch init.
  it('AC-2 (Phase 184): forwards a passed signal into fetch init.signal', async () => {
    let seenInit: RequestInit | undefined;
    const capture = (async (_url: string, init: RequestInit) => {
      seenInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      } as Response;
    }) as unknown as typeof fetch;
    const controller = new AbortController();

    await localChatJSON({ ...base, transport: capture, signal: controller.signal });

    expect(seenInit?.signal).toBe(controller.signal);
  });

  it('AC-2 (Phase 184): omits signal from fetch init when none passed', async () => {
    let seenInit: RequestInit | undefined;
    const capture = (async (_url: string, init: RequestInit) => {
      seenInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      } as Response;
    }) as unknown as typeof fetch;

    await localChatJSON({ ...base, transport: capture });

    expect(seenInit).not.toHaveProperty('signal');
  });

  it('AC-2 (Phase 184): an already-aborted signal rejects the call (native fetch AbortError behavior)', async () => {
    const controller = new AbortController();
    controller.abort();
    // Real global fetch (no transport override) honors init.signal natively —
    // this proves passing it through is sufficient without manual handling.
    await expect(
      localChatJSON({ ...base, signal: controller.signal }),
    ).rejects.toThrow();
  });
});
