import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v4';
import type * as JsonRepairModule from '../../src/verify/json-repair.js';

// Mocked (hoisted above the imports below by Vitest) so that EVERY consumer
// of json-repair.js in this module graph — including local-client.ts and
// host-cli-client.ts, imported further down — resolves the exact same
// spied `runWithRepair`. This is what lets the "single shared harness"
// describe block below prove AC-4 deterministically: a manually-applied
// `vi.spyOn` after the fact is order-dependent on module evaluation and
// unreliable across sibling imports, whereas `vi.mock` with `importOriginal`
// rewrites the module record itself before anything else loads it.
vi.mock('../../src/verify/json-repair.js', async (importOriginal) => {
  const actual = await importOriginal<typeof JsonRepairModule>();
  return {
    ...actual,
    runWithRepair: vi.fn(actual.runWithRepair),
  };
});

import { extractJson, safeJson, runWithRepair } from '../../src/verify/json-repair.js';
import { localChatJSON } from '../../src/verify/local-client.js';
import { hostCliJSON, type SpawnFn, type SpawnedProcessLike } from '../../src/verify/host-cli-client.js';

// Phase 165 T1/T4 — direct coverage of the transport-agnostic repair-retry
// harness itself (AC-4), plus a cross-module proof that `local-client.ts`
// and `host-cli-client.ts` both route through the *same* `runWithRepair`
// function rather than each independently implementing their own
// extract/parse/retry loop that merely happens to look similar.

const Schema = z.object({ ok: z.boolean() });

describe('extractJson (AC-4)', () => {
  it('slices from the first { to the last }', () => {
    expect(extractJson('prose before {"ok":true} prose after')).toBe('{"ok":true}');
  });

  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it('strips bare ``` fences', () => {
    expect(extractJson('```\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it('returns the trimmed input unchanged when no braces are present', () => {
    expect(extractJson('  no braces here  ')).toBe('no braces here');
  });
});

describe('safeJson (AC-4)', () => {
  it('parses valid JSON', () => {
    expect(safeJson('{"ok":true}')).toEqual({ ok: true });
  });

  it('returns undefined (not a throw) on invalid JSON', () => {
    expect(safeJson('not json')).toBeUndefined();
  });
});

describe('runWithRepair (AC-4) — transport-agnostic harness behavior', () => {
  it('builds the initial system/user turn and returns on first success without any repair turn', async () => {
    const seenCalls: Array<Array<{ role: string; content: string }>> = [];
    const transport = async (messages: Array<{ role: string; content: string }>) => {
      seenCalls.push(messages);
      return '{"ok":true}';
    };

    const r = await runWithRepair({
      system: 'sys',
      user: 'usr',
      schema: Schema,
      transport,
      buildError: (lastError, retries) => `failed after ${retries}: ${lastError}`,
    });

    expect(r).toEqual({ ok: true });
    expect(seenCalls).toHaveLength(1);
    expect(seenCalls[0]).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
  });

  it('appends assistant/user repair turns, in order, carrying the bad output + validation error', async () => {
    const seenCalls: Array<Array<{ role: string; content: string }>> = [];
    let call = 0;
    const transport = async (messages: Array<{ role: string; content: string }>) => {
      seenCalls.push(messages);
      call++;
      return call === 1 ? 'not json' : '{"ok":true}';
    };

    const r = await runWithRepair({
      system: 'sys',
      user: 'usr',
      schema: Schema,
      transport,
      buildError: (lastError, retries) => `failed after ${retries}: ${lastError}`,
    });

    expect(r).toEqual({ ok: true });
    expect(seenCalls).toHaveLength(2);
    // Second call carries the full conversation: original system/user, then
    // the bad assistant reply, then a user repair instruction.
    expect(seenCalls[1]).toHaveLength(4);
    expect(seenCalls[1]![0]).toEqual({ role: 'system', content: 'sys' });
    expect(seenCalls[1]![1]).toEqual({ role: 'user', content: 'usr' });
    expect(seenCalls[1]![2]).toEqual({ role: 'assistant', content: 'not json' });
    expect(seenCalls[1]![3]!.role).toBe('user');
    expect(seenCalls[1]![3]!.content).toMatch(/not valid/);
  });

  it('honors a custom maxRepairRetries budget and calls buildError with the actual retry count', async () => {
    const transport = async () => 'still not json';

    await expect(
      runWithRepair({
        system: 'sys',
        user: 'usr',
        schema: Schema,
        transport,
        maxRepairRetries: 1,
        buildError: (lastError, retries) => `failed after ${retries} retries: ${lastError}`,
      }),
    ).rejects.toThrow(/failed after 1 retries/);
  });
});

describe('runWithRepair is the single shared harness used by both local and host-cli (AC-4)', () => {
  const runWithRepairSpy = vi.mocked(runWithRepair);

  beforeEach(() => {
    runWithRepairSpy.mockClear();
  });

  function fakeFetch(body: string): typeof fetch {
    return (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: body } }] }),
    })) as unknown as typeof fetch;
  }

  function fakeSpawn(stdout: string): SpawnFn {
    return () => {
      const stdoutListeners: Array<(chunk: Buffer) => void> = [];
      let closeListener: ((code: number | null) => void) | undefined;
      const proc: SpawnedProcessLike = {
        stdout: {
          on: (event: string, cb: (chunk: Buffer) => void) => {
            if (event === 'data') stdoutListeners.push(cb);
            return proc.stdout as NodeJS.ReadableStream;
          },
        } as unknown as NodeJS.ReadableStream,
        stderr: { on: () => proc.stderr } as unknown as NodeJS.ReadableStream,
        on: (event: 'error' | 'close', cb: unknown) => {
          if (event === 'close') closeListener = cb as (code: number | null) => void;
          return proc;
        },
      };
      queueMicrotask(() => {
        stdoutListeners.forEach((l) => l(Buffer.from(stdout)));
        closeListener?.(0);
      });
      return proc;
    };
  }

  it('localChatJSON calls the shared runWithRepair export', async () => {
    const r = await localChatJSON({
      baseURL: 'http://x/v1',
      model: 'm',
      system: 's',
      user: 'u',
      schema: Schema,
      transport: fakeFetch('{"ok":true}'),
    });

    expect(r).toEqual({ ok: true });
    expect(runWithRepairSpy).toHaveBeenCalledTimes(1);
  });

  it('hostCliJSON calls the exact same shared runWithRepair export — not an independent copy', async () => {
    const r = await hostCliJSON({
      system: 's',
      user: 'u',
      schema: Schema,
      spawnImpl: fakeSpawn(JSON.stringify({ is_error: false, result: '{"ok":true}' })),
    });

    expect(r).toEqual({ ok: true });
    expect(runWithRepairSpy).toHaveBeenCalledTimes(1);
  });

  it('both transports funnel through the identical function reference within one test run', async () => {
    await localChatJSON({
      baseURL: 'http://x/v1',
      model: 'm',
      system: 's',
      user: 'u',
      schema: Schema,
      transport: fakeFetch('{"ok":true}'),
    });
    await hostCliJSON({
      system: 's',
      user: 'u',
      schema: Schema,
      spawnImpl: fakeSpawn(JSON.stringify({ is_error: false, result: '{"ok":true}' })),
    });

    // Same spy (bound to one export) observed both calls — proves a single
    // shared harness, not two independently-implemented lookalikes.
    expect(runWithRepairSpy).toHaveBeenCalledTimes(2);
  });
});
