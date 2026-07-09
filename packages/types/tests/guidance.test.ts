import { describe, expect, it } from 'vitest';
import { COMMAND_GUIDANCE, DISPATCH_DIALOGUE, MOCK_VERIFIER_NOTICE } from '../src/guidance.js';

// AC-1 (phase 104): one source-of-truth "mock = not real verification" message.
describe('MOCK_VERIFIER_NOTICE', () => {
  it('names mock a placeholder that is NOT real verification', () => {
    const msg = MOCK_VERIFIER_NOTICE.message.toLowerCase();
    expect(msg).toContain('not real verification');
    expect(msg).toContain('placeholder');
  });

  it('points the operator at `cadence activate`', () => {
    expect(MOCK_VERIFIER_NOTICE.activateHint).toBe('cadence activate');
    expect(MOCK_VERIFIER_NOTICE.message).toContain('cadence activate');
  });

  it('exposes a short non-empty inline label', () => {
    expect(MOCK_VERIFIER_NOTICE.label.length).toBeGreaterThan(0);
  });
});

describe('cadence-dispatch guidance', () => {
  it('has a non-empty description', () => {
    expect(COMMAND_GUIDANCE['cadence-dispatch'].description.length).toBeGreaterThan(0);
  });

  it('DISPATCH_DIALOGUE encodes the wave-complete halt contract', () => {
    expect(DISPATCH_DIALOGUE).toMatch(/HALT/);
    expect(DISPATCH_DIALOGUE).toMatch(/DONE_WITH_CONCERNS/);
    expect(DISPATCH_DIALOGUE).toMatch(/Task-tool/);
    expect(DISPATCH_DIALOGUE).toMatch(/cadence build task/);
    expect(DISPATCH_DIALOGUE).toMatch(/cadence settle run/);
  });

  it('never tells the agent to invoke settle itself', () => {
    expect(DISPATCH_DIALOGUE).not.toMatch(/^!.*settle run/m);
  });
});

describe('AC-7: cadence-handoff/cadence-resume guidance teaches the new gates', () => {
  it('cadence-handoff instructs running --check before finishing', () => {
    const text = COMMAND_GUIDANCE['cadence-handoff'].trailing;
    expect(text).toMatch(/cadence handoff --check/);
    expect(text.toLowerCase()).toContain('complete');
  });

  it('cadence-resume instructs honoring the origin-ahead banner and unfilled-section warning', () => {
    const text = COMMAND_GUIDANCE['cadence-resume'].trailing;
    expect(text).toMatch(/origin\/… ahead/);
    expect(text.toLowerCase()).toContain('unfilled sections');
  });
});
