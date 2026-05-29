import { describe, it, expect } from 'vitest';
import { runApproveGate, askApproveVerdict } from '../../src/gates/approve.js';
import type { DraftGateContext } from '../../src/gates/draft-types.js';
import type { Prompter } from '../../src/verify/prompter.js';

function scriptedPrompter(answers: string[]): Prompter {
  let i = 0;
  return { ask: async () => answers[i++] ?? '', close: async () => {} };
}

function ctx(over: {
  gates?: string[];
  approve?: boolean;
  prompter?: () => Prompter;
  errs?: string[];
}): DraftGateContext {
  const errs = over.errs ?? [];
  return {
    cwd: '/x',
    state: {} as never,
    draft: {} as never,
    config: null,
    gateSet: { gates: over.gates ?? ['approve'], softCap: false } as never,
    phase: '01-foundation',
    id: '01-01',
    opts: over.approve === undefined ? {} : { approve: over.approve },
    coherence: () => ({ issues: [] }),
    verifiers: { planReview: { verify: async () => ({ pass: true, findings: [], provider: 'mock' }) } },
    emit: { coherenceWarn: async () => {}, planReviewUnconverged: async () => {} },
    prompter: { create: over.prompter ?? (() => scriptedPrompter(['y'])) },
    planReviewSidecar: { read: async () => ({ attemptsSoFar: 0, history: [] }), write: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as DraftGateContext;
}

describe('runApproveGate', () => {
  it('passes inertly when approve is not in the gate set', async () => {
    const res = await runApproveGate(ctx({ gates: [] }));
    expect(res.outcome).toBe('pass');
  });

  it('passes inertly when --no-approve (approve === false)', async () => {
    const res = await runApproveGate(ctx({ approve: false }));
    expect(res.outcome).toBe('pass');
  });

  it('passes when the user answers yes', async () => {
    const res = await runApproveGate(ctx({ prompter: () => scriptedPrompter(['yes']) }));
    expect(res.outcome).toBe('pass');
  });

  it('refuses when the user declines', async () => {
    const errs: string[] = [];
    const res = await runApproveGate(ctx({ prompter: () => scriptedPrompter(['n']), errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('user declined manual approve gate');
  });

  it('refuses with the manual-approve line when the prompter throws (non-TTY)', async () => {
    const errs: string[] = [];
    const res = await runApproveGate(
      ctx({
        prompter: () => {
          throw new Error('no TTY available.');
        },
        errs,
      }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('manual-approve: no TTY available. Pass --no-approve');
  });
});

describe('askApproveVerdict', () => {
  it('accepts y/yes/n/no case-insensitively and refuses after 3 bad tries', async () => {
    expect(await askApproveVerdict(scriptedPrompter(['Y']))).toBe('yes');
    expect(await askApproveVerdict(scriptedPrompter(['NO']))).toBe('no');
    expect(await askApproveVerdict(scriptedPrompter(['?', '??', '???']))).toBe('no');
    expect(await askApproveVerdict(scriptedPrompter(['x', 'yes']))).toBe('yes');
  });
});
