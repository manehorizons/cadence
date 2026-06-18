import { describe, it, expect } from 'vitest';
import { runInteractiveGate } from '../../src/gates/interactive.js';
import type { SettleContext } from '../../src/gates/types.js';
import {
  SETTLE_BYPASS_NOTICE,
  type Interactivity,
} from '../../src/gates/interactivity.js';
import { ScriptedPrompter, type Prompter } from '../../src/verify/prompter.js';

const AC1 = { id: 'AC-1', given: 'g', when: 'w', then: 't' };

function ctx(over: {
  acs?: typeof AC1[];
  answers?: string[]; // scripted prompter answers; omit → create() throws
  createThrows?: boolean;
  interactive?: boolean; // opts.interactive
  inGateSet?: boolean; // 'interactive-verdict' membership
  interactivity?: Interactivity;
  auto?: boolean;
  force?: boolean;
  explicitIds?: Set<string>;
  errs?: string[];
}): SettleContext {
  const errs = over.errs ?? [];
  const opts: Record<string, boolean> = {};
  if (over.interactive !== undefined) opts.interactive = over.interactive;
  if (over.auto !== undefined) opts.auto = over.auto;
  if (over.force) opts.force = true;
  const gates = over.inGateSet ? ['interactive-verdict'] : [];
  return {
    cwd: '/x',
    state: { draftReadAt: null } as never,
    draft: { acceptanceCriteria: over.acs ?? [AC1], tasks: [] } as never,
    progress: { draftId: 'd', tasks: {} },
    config: null,
    gateSet: { gates, softCap: false } as never,
    opts,
    interactivity: over.interactivity,
    explicitIds: over.explicitIds ?? new Set<string>(),
    touchedFiles: [],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    verifiers: { deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) } },
    emit: { anomalies: async () => {} },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: {
      create: (): Prompter => {
        if (over.createThrows) throw new Error('stdin is not a TTY');
        return new ScriptedPrompter(over.answers ?? []);
      },
    },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runInteractiveGate', () => {
  // AC-3: not requested (no flag, not in gate set) → pass, prompter untouched
  it('passes without prompting when not requested', async () => {
    const res = await runInteractiveGate(ctx({}));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch).toBeUndefined();
  });

  // AC-3: --auto=false short-circuits even when requested
  it('passes when auto is false', async () => {
    const res = await runInteractiveGate(ctx({ interactive: true, auto: false }));
    expect(res.outcome).toBe('pass');
  });

  // AC-3: all-pass verdicts → pass + interactiveVerify patch
  it('passes and records verdicts when all ACs pass', async () => {
    const res = await runInteractiveGate(ctx({ interactive: true, answers: ['pass', ''] }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.interactiveVerify).toEqual({ 'AC-1': { verdict: 'pass' } });
  });

  // AC-3 (membership path): fires from 'interactive-verdict' gate set membership
  it('fires from gate-set membership and records a note', async () => {
    const res = await runInteractiveGate(ctx({ inGateSet: true, answers: ['fail', 'broke'] }));
    expect(res.outcome).toBe('refuse');
    expect(res.summaryPatch?.interactiveVerify).toEqual({ 'AC-1': { verdict: 'fail', note: 'broke' } });
  });

  // AC-3: a fail verdict (not overridden) → refuse with exact stderr
  it('refuses on a fail verdict', async () => {
    const errs: string[] = [];
    const res = await runInteractiveGate(ctx({ interactive: true, answers: ['fail', ''], errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs).toContain('interactive: AC-1 fail\n');
    expect(errs.join('')).toContain(
      'settle run --interactive refused: one or more ACs verdicted as fail.',
    );
  });

  // AC-3: fail under --force → pass
  it('passes a fail verdict under --force', async () => {
    const res = await runInteractiveGate(
      ctx({ interactive: true, force: true, answers: ['fail', ''] }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.interactiveVerify).toEqual({ 'AC-1': { verdict: 'fail' } });
  });

  // AC-3: a fail on an explicitly-verdicted AC does not refuse (explicit wins)
  it('does not refuse when the failing AC is in explicitIds', async () => {
    const res = await runInteractiveGate(
      ctx({ interactive: true, answers: ['fail', ''], explicitIds: new Set(['AC-1']) }),
    );
    expect(res.outcome).toBe('pass');
  });

  // AC-2: prompter.create() throwing (non-TTY) → refuse with interactive: <msg>
  it('refuses when the prompter cannot be constructed', async () => {
    const errs: string[] = [];
    const res = await runInteractiveGate(ctx({ interactive: true, createThrows: true, errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs).toEqual(['interactive: stdin is not a TTY\n']);
  });

  // AC-4: bypass mode skips the walker, passes, and marks the SUMMARY skipped.
  it('skips the walker and passes with a skipped marker in bypass mode (non-TTY)', async () => {
    const errs: string[] = [];
    const res = await runInteractiveGate(
      ctx({ interactive: true, createThrows: true, interactivity: 'bypass', errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.interactiveVerifySkipped).toBe('non-tty');
    expect(res.summaryPatch?.interactiveVerify).toBeUndefined();
    expect(errs.join('')).toContain(SETTLE_BYPASS_NOTICE);
  });

  // AC-4: bypass only applies when the gate is actually requested.
  it('does not emit a skipped marker when interactive is not requested (bypass, no request)', async () => {
    const res = await runInteractiveGate(ctx({ interactivity: 'bypass' }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch).toBeUndefined();
  });

  // AC-5: require-tty preserves today's refuse when the prompter throws.
  it('still refuses under require-tty in non-TTY', async () => {
    const errs: string[] = [];
    const res = await runInteractiveGate(
      ctx({ interactive: true, createThrows: true, interactivity: 'require-tty', errs }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs).toEqual(['interactive: stdin is not a TTY\n']);
  });
});
