import { describe, it, expect } from 'vitest';
import { checkUnresolvablePacks } from '../../src/checks/pack-resolution.js';
import type { ResolvedPack } from '../../src/packs/resolve.js';

/** A successfully resolved pack (manifest branch of the `ResolvedPack` union). */
function resolved(id: string): ResolvedPack {
  return { id, source: 'local', manifest: { id, version: '1.0.0' } };
}

/** An unresolvable pack (error branch of the `ResolvedPack` union). */
function unresolvable(id: string, error: string): ResolvedPack {
  return { id, source: 'local', error };
}

/** Capturing stderr seam, mirroring the `io` shape settle passes in. */
function captureIo(): { err: (s: string) => void; text: () => string } {
  let buf = '';
  return {
    err: (s: string) => {
      buf += s;
    },
    text: () => buf,
  };
}

describe('checkUnresolvablePacks — settle-time refusal for an enabled-but-unresolvable pack (phase 291, Slice 2)', () => {
  it('291-01/AC-4: every enabled pack resolved → pass, nothing written to stderr', () => {
    const io = captureIo();
    const res = checkUnresolvablePacks(
      [resolved('cadence/one'), resolved('cadence/two')],
      {},
      io,
    );
    expect(res.outcome).toBe('pass');
    expect(res.bypassed).toBeUndefined();
    expect(io.text()).toBe('');
  });

  it('291-01/AC-4: zero enabled packs → pass (inert, nothing written to stderr)', () => {
    const io = captureIo();
    const res = checkUnresolvablePacks([], {}, io);
    expect(res.outcome).toBe('pass');
    expect(res.bypassed).toBeUndefined();
    expect(io.text()).toBe('');
  });

  it('291-01/AC-4: any entry carrying an `error` → refuse, naming every unresolvable id and its reason on stderr', () => {
    const io = captureIo();
    const res = checkUnresolvablePacks(
      [
        resolved('cadence/ok'),
        unresolvable('cadence/missing', 'Failed to read pack manifest for cadence/missing'),
        unresolvable('cadence/bad-json', 'Invalid JSON in pack.json: Unexpected token'),
      ],
      {},
      io,
    );
    expect(res.outcome).toBe('refuse');
    expect(res.bypassed).toBeUndefined();
    const text = io.text();
    expect(text).toMatch(/settle run refused/);
    expect(text).toContain('cadence/missing');
    expect(text).toContain('Failed to read pack manifest for cadence/missing');
    expect(text).toContain('cadence/bad-json');
    expect(text).toContain('Invalid JSON in pack.json: Unexpected token');
    // Names the dedicated bypass flag, mirroring skill-audit's refusal line.
    expect(text).toContain('--allow-unresolvable-pack');
    // A resolved sibling is never named in the refusal.
    expect(text).not.toContain('cadence/ok');
    // The reason is returned (not only printed) so settle can record it into
    // `SUMMARY.gateBypasses` without re-deriving the message.
    expect(res.reason).toContain('cadence/missing');
    expect(res.reason).toContain('cadence/bad-json');
  });

  it('291-01/AC-4: allowUnresolvablePack: true → pass with `bypassed: true`, a loud stderr notice, and a reason for SUMMARY.gateBypasses', () => {
    const io = captureIo();
    const res = checkUnresolvablePacks(
      [unresolvable('cadence/missing', 'Failed to read pack manifest for cadence/missing')],
      { allowUnresolvablePack: true },
      io,
    );
    expect(res.outcome).toBe('pass');
    expect(res.bypassed).toBe(true);
    expect(res.reason).toContain('cadence/missing');
    const text = io.text();
    expect(text).toContain('pack-resolution: --allow-unresolvable-pack set');
    expect(text).toContain('1 unresolvable pack(s)');
    expect(text).not.toMatch(/settle run refused/);
  });

  it('291-01/AC-4: the bypass flag is inert when every pack resolved — no bypass recorded, no notice', () => {
    const io = captureIo();
    const res = checkUnresolvablePacks(
      [resolved('cadence/one')],
      { allowUnresolvablePack: true },
      io,
    );
    expect(res.outcome).toBe('pass');
    expect(res.bypassed).toBeUndefined();
    expect(res.reason).toBeUndefined();
    expect(io.text()).toBe('');
  });
});
