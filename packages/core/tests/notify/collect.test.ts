import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Draft, DeepVerdict } from '@thomas-powers-jr/cadence-types';
import { AnomalyEventZ } from '@thomas-powers-jr/cadence-types';
import { collectAnomalies, type CollectAnomaliesContext } from '../../src/notify/collect.js';
import type { ProgressFile } from '../../src/status.js';
import { classifyAcObservability } from '../../src/verify/criteria-observability.js';
import { parseDraftMd } from '../../src/parse/draft-parser.js';
import type { TestRef } from '../../src/verify/coverage.js';

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

  it('274-01/AC-2: excludes a classifier-marked-unobservable AC from the "deep:" bucket, but still reports a genuine deep-verify failure alongside it', () => {
    const events = collectAnomalies(
      ctx({
        force: true,
        deepVerify: {
          'AC-1': {
            pass: false,
            reason: 'structurally unobservable: pasted into the SUMMARY',
            provider: 'mock',
            unobservable: true,
          },
          'AC-2': { pass: false, reason: 'no test found', provider: 'mock' },
        },
      }),
    );
    const forceEvent = events.find((e) => e.type === 'force-used');
    expect(forceEvent).toBeDefined();
    const reasons = forceEvent!.context.reasons as string[];
    const deepReason = reasons.find((r) => r.startsWith('deep:'));
    expect(deepReason).toBeDefined();
    const deepIds = deepReason!.replace(/^deep:\s*/, '').split(', ');
    expect(deepIds).toEqual(['AC-2']);
  });

  it('274-01/AC-2: does NOT emit force-used at all when the only deep-verify failure is classifier-marked-unobservable', () => {
    const events = collectAnomalies(
      ctx({
        force: true,
        deepVerify: {
          'AC-1': { pass: false, reason: 'unobservable', provider: 'mock', unobservable: true },
          'AC-2': { pass: true, reason: 'ok', provider: 'mock' },
        },
      }),
    );
    expect(events.find((e) => e.type === 'force-used')).toBeUndefined();
  });

  it('274-01/AC-2: the --allow-verifier-failure catch branch (no unobservable marker on any entry) still reports every AC in the "deep:" bucket — a transport failure is not evidence about observability', () => {
    // Mirrors gates/deep-verify.ts's catch-branch shape exactly: every AC
    // gets pass:false with a `verifier failed:` reason and NO `unobservable`
    // marker, because the verifier transport itself threw and nothing was
    // actually checked for any AC. This must NOT be silently swept by the
    // unobservable exclusion above — regression guard for the reviewer note
    // T3 punted to this task.
    const events = collectAnomalies(
      ctx({
        force: true,
        deepVerify: {
          'AC-1': { pass: false, reason: 'verifier failed: ECONNRESET', provider: 'mock' },
          'AC-2': { pass: false, reason: 'verifier failed: ECONNRESET', provider: 'mock' },
        },
        verifierFailure: { message: 'ECONNRESET', provider: 'mock' },
      }),
    );
    const forceEvent = events.find((e) => e.type === 'force-used');
    expect(forceEvent).toBeDefined();
    const reasons = forceEvent!.context.reasons as string[];
    const deepReason = reasons.find((r) => r.startsWith('deep:'));
    expect(deepReason).toBeDefined();
    const deepIds = deepReason!.replace(/^deep:\s*/, '').split(', ').sort();
    expect(deepIds).toEqual(['AC-1', 'AC-2']);
    // The distinct verifier-failure event still fires alongside it.
    expect(events.find((e) => e.type === 'verifier-failure')).toBeDefined();
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

// Phase 274 (T4) — end-to-end replay of the force-used honesty report's
// "deep:" bucket exclusion, using classifyAcObservability's REAL output on
// REAL, committed DRAFT text (phase 272's AC-1/AC-4/AC-7, phase
// 29-shakedown's AC-2 — the same replay set T2's criteria-observability.test
// .ts fixtures use), not hand-typed `unobservable: true` fixtures. This
// proves the exclusion works with the actual classifier wired in, not just
// against a synthetic deepVerify shape. Deliberately no phase-qualified
// `274-01/AC-N` token in this describe() title or any comment — only inside
// asserting it() titles (scanTestCoverage's assertion-mode dedup would
// silently drop later real occurrences otherwise; see the header comment on
// packages/core/tests/verify/criteria-observability.test.ts for the same
// discipline applied first).
describe('force-used honesty report — real-classifier replay of phase 272 / 29-shakedown ACs', () => {
  const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const PHASE_272_DRAFT_REL = '.cadence/phases/272-assurance-record-correctness/272-01-DRAFT.md';
  const SHAKEDOWN_DRAFT_REL = '.cadence/phases/29-shakedown/29-01-DRAFT.md';

  function realAcText(relDraftPath: string, acId: string): string {
    const raw = readFileSync(join(REPO_ROOT, relDraftPath), 'utf8');
    const draft = parseDraftMd(raw);
    const ac = draft.acceptanceCriteria.find((a) => a.id === acId);
    if (!ac) throw new Error(`${relDraftPath} has no ${acId} — fixture is stale`);
    return [ac.given, ac.when, ac.then].join('\n');
  }

  /**
   * Builds a `DeepVerdict` exactly as gates/deep-verify.ts (T3) does at its
   * call site: classify the real AC text first, then derive the
   * `unobservable` marker FROM the classifier's own verdict (never
   * hardcoded) — so this fixture breaks if the classifier's behavior on
   * these real ACs ever regresses, instead of silently staying green.
   */
  function realDeepVerdict(relDraftPath: string, acId: string, coverage: readonly TestRef[]): DeepVerdict {
    const text = realAcText(relDraftPath, acId);
    const verdict = classifyAcObservability({ id: acId, text }, coverage);
    return {
      pass: false,
      reason: verdict.observable ? 'placeholder — this fixture expects unobservable' : verdict.reason,
      provider: 'mock',
      ...(verdict.observable ? {} : { unobservable: true as const }),
    };
  }

  it('274-01/AC-2: real phase-272 AC-1/AC-4/AC-7 verdicts and real 29-shakedown AC-2 verdict all classify unobservable (sanity — matches T2\'s replay fixtures)', () => {
    const acs272: readonly ['AC-1', 'AC-4', 'AC-7'] = ['AC-1', 'AC-4', 'AC-7'];
    for (const id of acs272) {
      const text = realAcText(PHASE_272_DRAFT_REL, id);
      expect(classifyAcObservability({ id, text }, []).observable).toBe(false);
    }
    const shakedownText = realAcText(SHAKEDOWN_DRAFT_REL, 'AC-2');
    expect(classifyAcObservability({ id: 'AC-2', text: shakedownText }, []).observable).toBe(false);
  });

  it('274-01/AC-2: the real classifier verdicts for phase 272 AC-1/AC-4/AC-7 and 29-shakedown AC-2, fed through collectAnomalies with --force, are excluded from the "deep:" bucket while a genuine unrelated failure still appears', () => {
    // Synthetic draft AC ids are plain `AC-N` (parseAcRefs only recognizes
    // that shape) so every AC is cleanly task-linked and the structural
    // bucket stays silent — this test isolates the "deep:" bucket
    // specifically. AC-1/AC-2/AC-3/AC-4 are keyed to real phase-272
    // AC-1/AC-4/AC-7 and real 29-shakedown AC-2 text respectively (via
    // realDeepVerdict below); AC-5 is a synthetic, unrelated real failure.
    const draft: Draft = {
      schemaVersion: 1,
      id: 'replay-01',
      phase: 'replay',
      tier: 'standard',
      title: 'replay harness',
      objective: 'x',
      acceptanceCriteria: [
        { id: 'AC-1', given: 'g', when: 'w', then: 't' },
        { id: 'AC-2', given: 'g', when: 'w', then: 't' },
        { id: 'AC-3', given: 'g', when: 'w', then: 't' },
        { id: 'AC-4', given: 'g', when: 'w', then: 't' },
        { id: 'AC-5', given: 'g', when: 'w', then: 't' },
      ],
      tasks: [
        { id: 'T1', name: 't1', files: ['a.ts'], action: 'a', verify: 'v', done: 'AC-1, AC-2, AC-3, AC-4, AC-5' },
      ],
      boundaries: [],
      status: 'IN_PROGRESS',
    };
    const progress: ProgressFile = {
      draftId: 'replay-01',
      tasks: { T1: { status: 'DONE', notes: '', touchedFiles: ['a.ts'], updatedAt: 't' } },
    };

    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': realDeepVerdict(PHASE_272_DRAFT_REL, 'AC-1', [
        { file: 'packages/core/tests/gates/assurance-record-encoding.test.ts', line: 1, snippet: 'AC-1 regression' },
      ]),
      'AC-2': realDeepVerdict(PHASE_272_DRAFT_REL, 'AC-4', [
        { file: 'packages/core/tests/gates/assurance-record-encoding.test.ts', line: 1, snippet: 'AC-4 regression' },
      ]),
      'AC-3': realDeepVerdict(PHASE_272_DRAFT_REL, 'AC-7', []),
      'AC-4': realDeepVerdict(SHAKEDOWN_DRAFT_REL, 'AC-2', []),
      'AC-5': { pass: false, reason: 'no test found', provider: 'mock' },
    };

    // Sanity: every replayed verdict actually carries the unobservable
    // marker (i.e. the classifier really did classify all four as
    // unobservable) — if this ever goes false the test below would pass
    // vacuously for the wrong reason.
    for (const id of ['AC-1', 'AC-2', 'AC-3', 'AC-4']) {
      expect(deepVerify[id]!.unobservable).toBe(true);
    }
    expect(deepVerify['AC-5']!.unobservable).toBeUndefined();

    const events = collectAnomalies({
      draft,
      progress,
      coverageBypassed: false,
      force: true,
      deepVerify,
    });
    const forceEvent = events.find((e) => e.type === 'force-used');
    expect(forceEvent).toBeDefined();
    const reasons = forceEvent!.context.reasons as string[];
    // Structural bucket must stay silent — every AC is task-linked and DONE.
    expect(reasons.some((r) => r.startsWith('structural:'))).toBe(false);
    const deepReason = reasons.find((r) => r.startsWith('deep:'));
    expect(deepReason).toBeDefined();
    const deepIds = deepReason!.replace(/^deep:\s*/, '').split(', ');
    expect(deepIds).toEqual(['AC-5']);
  });
});
