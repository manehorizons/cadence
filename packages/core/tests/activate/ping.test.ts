import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pingProvider } from '../../src/activate/ping.js';

// A minimal fake matching the `messages.create` shape pingProvider calls.
const fakeClient = (impl: () => Promise<unknown>) =>
  ({ messages: { create: impl } }) as unknown as import('@anthropic-ai/sdk').default;

const dirs: string[] = [];
const makeTmpDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cadence-ping-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

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

  it('attempts the live call using a key discoverable only via .env (AC-1)', async () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), 'ANTHROPIC_API_KEY=from-dotenv\n');
    let calledWith: unknown;
    const r = await pingProvider(
      'anthropic',
      {},
      {
        client: fakeClient(async () => {
          calledWith = 'called';
          return { id: 'msg_1' };
        }),
        cwd,
      },
    );
    expect(r).toEqual({ ok: true });
    expect(calledWith).toBe('called');
  });

  it('still fails fast when the key is absent from both env and .env, even with a cwd given (AC-1)', async () => {
    const cwd = makeTmpDir();
    const r = await pingProvider('anthropic', {}, { cwd });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/ANTHROPIC_API_KEY/) });
  });
});
