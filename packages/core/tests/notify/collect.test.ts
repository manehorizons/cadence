import { describe, it, expect } from 'vitest';
import type { Draft } from '@thomas-powers-jr/cadence-types';
import { AnomalyEventZ } from '@thomas-powers-jr/cadence-types';
import { collectAnomalies, type CollectAnomaliesContext } from '../../src/notify/collect.js';
import type { ProgressFile } from '../../src/status.js';

const baseDraft: Draft = {
  schemaVersion: 1,
  id: '17-01',
  phase: '17-anomaly-notify',
  tier: 'standard',
  title: 'anomaly notify transport',
  objective: 'x',
  acceptanceCriteria: [
    { id: 'AC-1', given: 'g', when: 'w', then: 't' },
    { id: 'AC-2', given: 'g', when: 'w', then: 't' },
  ],
  tasks: [
    {
      id: 'T1',
      name: 'first',
      files: ['a.ts'],
      action: 'a',
      verify: 'v',
      done: 'AC-1',
    },
    {
      id: 'T2',
      name: 'second',
      files: ['b.ts'],
      action: 'a',
      verify: 'v',
      done: 'AC-2',
    },
  ],
  boundaries: [],
  status: 'IN_PROGRESS',
};

const baseProgress: ProgressFile = {
  draftId: '17-01',
  tasks: {
    T1: { status: 'DONE', notes: '', touchedFiles: ['a.ts'], updatedAt: 't' },
    T2: { status: 'DONE', notes: '', touchedFiles: ['b.ts'], updatedAt: 't' },
  },
};

const ctx = (over: Partial<CollectAnomaliesContext> = {}): CollectAnomaliesContext => ({
  draft: baseDraft,
  progress: baseProgress,
  coverageBypassed: false,
  force: false,
  ...over,
});

describe('collectAnomalies (AC-3)', () => {
  it('emits ac-blocked for BLOCKED tasks', () => {
    const progress: ProgressFile = {
      draftId: '17-01',
      tasks: {
        ...baseProgress.tasks,
        T2: { ...baseProgress.tasks.T2!, status: 'BLOCKED' },
      },
    };
    const events = collectAnomalies(ctx({ progress }));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('ac-blocked');
    expect(events[0]!.severity).toBe('warn');
    expect(events[0]!.context.taskId).toBe('T2');
    expect(events[0]!.context.acs).toEqual(['AC-2']);
  });

  it('emits ac-needs-context for NEEDS_CONTEXT tasks', () => {
    const progress: ProgressFile = {
      draftId: '17-01',
      tasks: {
        T1: { ...baseProgress.tasks.T1!, status: 'NEEDS_CONTEXT', notes: 'where is X?' },
        T2: { ...baseProgress.tasks.T2! },
      },
    };
    const events = collectAnomalies(ctx({ progress }));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('ac-needs-context');
    expect(events[0]!.context.taskId).toBe('T1');
    expect(events[0]!.context.notes).toBe('where is X?');
  });

  it('emits coverage-bypassed when flag is set', () => {
    const events = collectAnomalies(ctx({ coverageBypassed: true }));
    expect(events.map((e) => e.type)).toEqual(['coverage-bypassed']);
  });

  it('emits files-outside-boundary per stray touched file', () => {
    const progress: ProgressFile = {
      draftId: '17-01',
      tasks: {
        T1: { ...baseProgress.tasks.T1!, touchedFiles: ['a.ts', 'stray.ts'] },
        T2: { ...baseProgress.tasks.T2!, touchedFiles: ['b.ts', 'other.ts'] },
      },
    };
    const events = collectAnomalies(ctx({ progress }));
    const files = events
      .filter((e) => e.type === 'files-outside-boundary')
      .map((e) => e.context.file);
    expect(files.sort()).toEqual(['other.ts', 'stray.ts']);
  });

  it('AC-4: with root, absolute touchedFiles matching relative declared files emit zero boundary anomalies', () => {
    const ROOT = '/home/u/repo';
    const progress: ProgressFile = {
      draftId: '17-01',
      tasks: {
        T1: { ...baseProgress.tasks.T1!, touchedFiles: [`${ROOT}/a.ts`] },
        T2: { ...baseProgress.tasks.T2!, touchedFiles: [`${ROOT}/b.ts`] },
      },
    };
    const events = collectAnomalies(ctx({ progress, root: ROOT }));
    expect(events.filter((e) => e.type === 'files-outside-boundary')).toEqual([]);
  });

  it('emits verifier-failure when transport failed', () => {
    const events = collectAnomalies(
      ctx({ verifierFailure: { message: 'ECONNRESET', provider: 'anthropic' } }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('verifier-failure');
    expect(events[0]!.severity).toBe('error');
    expect(events[0]!.context.provider).toBe('anthropic');
  });

  it('emits force-used when --force bypassed a failing deep verdict', () => {
    const events = collectAnomalies(
      ctx({
        force: true,
        deepVerify: {
          'AC-1': { pass: true, reason: 'ok', provider: 'mock' },
          'AC-2': { pass: false, reason: 'no test', provider: 'mock' },
        },
      }),
    );
    const forceEvent = events.find((e) => e.type === 'force-used');
    expect(forceEvent).toBeDefined();
    expect(forceEvent!.severity).toBe('error');
    expect((forceEvent!.context.reasons as string[]).some((r) => r.includes('deep'))).toBe(true);
  });

  it('emits force-used when --force bypassed a failing interactive verdict', () => {
    const events = collectAnomalies(
      ctx({
        force: true,
        interactiveVerify: {
          'AC-1': { verdict: 'fail', note: 'looks off' },
        },
      }),
    );
    const forceEvent = events.find((e) => e.type === 'force-used');
    expect(forceEvent).toBeDefined();
    expect((forceEvent!.context.reasons as string[]).some((r) => r.includes('interactive'))).toBe(true);
  });

  it('emits force-used when --force bypassed structural failures', () => {
    const progress: ProgressFile = {
      draftId: '17-01',
      tasks: {
        T1: { ...baseProgress.tasks.T1!, status: 'BLOCKED' },
        T2: { ...baseProgress.tasks.T2! },
      },
    };
    const events = collectAnomalies(ctx({ progress, force: true }));
    // expect both ac-blocked AND force-used
    expect(events.find((e) => e.type === 'ac-blocked')).toBeDefined();
    const forceEvent = events.find((e) => e.type === 'force-used');
    expect(forceEvent).toBeDefined();
    expect((forceEvent!.context.reasons as string[]).some((r) => r.startsWith('structural'))).toBe(true);
  });

  it('does NOT emit force-used when --force was set but nothing failed', () => {
    const events = collectAnomalies(ctx({ force: true }));
    expect(events.find((e) => e.type === 'force-used')).toBeUndefined();
  });

  it('AC-1: emits auto-complex-override (severity warn) when --allow-auto-complex bypassed the soft cap', () => {
    const events = collectAnomalies(ctx({ autoComplexOverride: true }));
    const event = events.find((e) => e.type === 'auto-complex-override');
    expect(event).toBeDefined();
    expect(event!.severity).toBe('warn');
  });

  it('AC-1: does NOT emit auto-complex-override when the flag is false/absent', () => {
    expect(
      collectAnomalies(ctx()).find((e) => e.type === 'auto-complex-override'),
    ).toBeUndefined();
    expect(
      collectAnomalies(ctx({ autoComplexOverride: false })).find(
        (e) => e.type === 'auto-complex-override',
      ),
    ).toBeUndefined();
  });

  it('returns no events for a clean settle', () => {
    expect(collectAnomalies(ctx())).toEqual([]);
  });

  it('mixed scenario produces all relevant events', () => {
    const progress: ProgressFile = {
      draftId: '17-01',
      tasks: {
        T1: { ...baseProgress.tasks.T1!, status: 'BLOCKED', touchedFiles: ['a.ts', 'extra.ts'] },
        T2: { ...baseProgress.tasks.T2!, status: 'NEEDS_CONTEXT', notes: 'help' },
      },
    };
    const events = collectAnomalies(
      ctx({
        progress,
        coverageBypassed: true,
        force: true,
        verifierFailure: { message: 'timeout' },
      }),
    );
    const types = events.map((e) => e.type).sort();
    expect(types).toContain('ac-blocked');
    expect(types).toContain('ac-needs-context');
    expect(types).toContain('coverage-bypassed');
    expect(types).toContain('files-outside-boundary');
    expect(types).toContain('verifier-failure');
    expect(types).toContain('force-used');
  });

  // AC-1 + AC-2 (Phase 17.3) — events carry a schema-valid ts; emitters can pin
  // the clock via opts.now for deterministic tests.
  it('stamps a valid ts on every emitted event', () => {
    const progress: ProgressFile = {
      draftId: '17-01',
      tasks: {
        T1: { ...baseProgress.tasks.T1!, status: 'BLOCKED', touchedFiles: ['a.ts', 'stray.ts'] },
        T2: { ...baseProgress.tasks.T2!, status: 'NEEDS_CONTEXT' },
      },
    };
    const events = collectAnomalies(
      ctx({ progress, coverageBypassed: true, force: true, verifierFailure: { message: 'x' } }),
    );
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(typeof e.ts).toBe('string');
      expect(Number.isNaN(Date.parse(e.ts))).toBe(false);
      // Every event must satisfy the strict schema.
      const parsed = AnomalyEventZ.safeParse(e);
      expect(parsed.success).toBe(true);
    }
  });

  it('honors injected now() so tests can pin event timestamps (AC-2)', () => {
    const fixed = new Date('2026-05-14T22:30:00.000Z');
    const progress: ProgressFile = {
      draftId: '17-01',
      tasks: {
        T1: { ...baseProgress.tasks.T1!, status: 'BLOCKED' },
        T2: { ...baseProgress.tasks.T2! },
      },
    };
    const events = collectAnomalies(ctx({ progress, coverageBypassed: true }), { now: () => fixed });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.ts).toBe(fixed.toISOString());
    }
  });
});
