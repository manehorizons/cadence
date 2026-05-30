import { describe, it, expect, vi } from 'vitest';
import type { AnomalyEvent } from '@cadence/types';
import type { Notifier } from '../../src/notify/notifier.js';
import { emitUnconverged } from '../../src/notify/emit-unconverged.js';
import { emitPlanReviewUnconverged } from '../../src/notify/plan-review.js';
import { emitSpecReviewUnconverged } from '../../src/notify/spec-review.js';
import { emitCodeReviewUnconverged } from '../../src/notify/code-review.js';

/** Captures the single batch each emitter dispatches. */
function capture(): { notifier: Notifier; batches: AnomalyEvent[][] } {
  const batches: AnomalyEvent[][] = [];
  const notifier: Notifier = {
    name: 'capture',
    notify: async (events) => {
      batches.push(events);
    },
  };
  return { notifier, batches };
}

/** A notifier whose transport always throws — exercises the degrade path. */
function throwing(message: string): Notifier {
  return {
    name: 'boom',
    notify: async () => {
      throw new Error(message);
    },
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('emitUnconverged spine — plan-review (Phase 42.1)', () => {
  it('emits one plan-review-unconverged event with verbatim shape', async () => {
    const { notifier, batches } = capture();
    await emitPlanReviewUnconverged(notifier, {
      draftId: 'D-1',
      attempts: 3,
      maxAttempts: 3,
      findings: 2,
      provider: 'mock',
      model: 'sonnet',
      bypassed: true,
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    const ev = batches[0]![0]!;
    expect(ev.type).toBe('plan-review-unconverged');
    expect(ev.severity).toBe('error');
    expect(ev.message).toBe(
      'plan-review did not converge for D-1 after 3/3 attempts (2 finding(s))',
    );
    expect(ev.context).toEqual({
      draftId: 'D-1',
      attempts: 3,
      maxAttempts: 3,
      findings: 2,
      provider: 'mock',
      model: 'sonnet',
      bypassed: true,
    });
    expect(ev.ts).toMatch(ISO);
  });

  it('omits model + bypassed when not supplied', async () => {
    const { notifier, batches } = capture();
    await emitPlanReviewUnconverged(notifier, {
      draftId: 'D-2',
      attempts: 2,
      maxAttempts: 2,
      findings: 1,
      provider: 'mock',
    });
    const ev = batches[0]![0]!;
    expect(ev.context).toEqual({
      draftId: 'D-2',
      attempts: 2,
      maxAttempts: 2,
      findings: 1,
      provider: 'mock',
    });
    expect(ev.context).not.toHaveProperty('model');
    expect(ev.context).not.toHaveProperty('bypassed');
  });
});

describe('emitUnconverged spine — spec-review (Phase 42.1)', () => {
  it('emits one spec-review-unconverged event keyed by specId', async () => {
    const { notifier, batches } = capture();
    await emitSpecReviewUnconverged(notifier, {
      specId: 'S-7',
      attempts: 4,
      maxAttempts: 4,
      findings: 3,
      provider: 'mock',
    });
    const ev = batches[0]![0]!;
    expect(ev.type).toBe('spec-review-unconverged');
    expect(ev.severity).toBe('error');
    expect(ev.message).toBe(
      'spec-review did not converge for S-7 after 4/4 attempts (3 finding(s))',
    );
    expect(ev.context).toEqual({
      specId: 'S-7',
      attempts: 4,
      maxAttempts: 4,
      findings: 3,
      provider: 'mock',
    });
    expect(ev.ts).toMatch(ISO);
  });
});

describe('emitUnconverged spine — code-review (Phase 42.1)', () => {
  it('emits one code-review-unconverged event keyed by draftId', async () => {
    const { notifier, batches } = capture();
    await emitCodeReviewUnconverged(notifier, {
      draftId: 'D-9',
      attempts: 5,
      maxAttempts: 5,
      findings: 0,
      provider: 'mock',
      model: 'opus',
    });
    const ev = batches[0]![0]!;
    expect(ev.type).toBe('code-review-unconverged');
    expect(ev.message).toBe(
      'code-review did not converge for D-9 after 5/5 attempts (0 finding(s))',
    );
    expect(ev.context).toEqual({
      draftId: 'D-9',
      attempts: 5,
      maxAttempts: 5,
      findings: 0,
      provider: 'mock',
      model: 'opus',
    });
  });
});

describe('emitUnconverged spine — direct (Phase 42.1)', () => {
  it('maps kind → type + entityKey and renders the message template', async () => {
    const { notifier, batches } = capture();
    await emitUnconverged(notifier, 'spec-review', {
      entityId: 'S-1',
      attempts: 2,
      maxAttempts: 2,
      findings: 5,
      provider: 'mock',
    });
    const ev = batches[0]![0]!;
    expect(ev.type).toBe('spec-review-unconverged');
    expect(ev.message).toBe(
      'spec-review did not converge for S-1 after 2/2 attempts (5 finding(s))',
    );
    expect(ev.context).toEqual({
      specId: 'S-1',
      attempts: 2,
      maxAttempts: 2,
      findings: 5,
      provider: 'mock',
    });
  });
});

describe('emitUnconverged spine — stderr degrade (Phase 42.1)', () => {
  it('degrades a transport throw to one stderr warning, never throws', async () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      await expect(
        emitPlanReviewUnconverged(throwing('network down'), {
          draftId: 'D-3',
          attempts: 1,
          maxAttempts: 1,
          findings: 1,
          provider: 'mock',
        }),
      ).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toBe(
        'cadence-notify: boom transport failed — network down (continuing)\n',
      );
    } finally {
      spy.mockRestore();
    }
  });
});
