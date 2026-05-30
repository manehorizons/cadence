import { describe, it, expect } from 'vitest';
import { runBoundaryCheck, boundaryMessage } from '../../src/checks/boundary.js';

const FIXED = '2026-05-30T00:00:00.000Z';
const stampFixed = () => FIXED;

describe('runBoundaryCheck (Phase 43.1)', () => {
  it('emits one warn files-outside-boundary event per non-declared file', () => {
    const events = runBoundaryCheck({
      declaredFiles: ['a.ts', 'b.ts'],
      touchedFiles: ['a.ts', 'stray.ts', 'other.ts'],
      stamp: stampFixed,
    });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.type)).toEqual([
      'files-outside-boundary',
      'files-outside-boundary',
    ]);
    expect(events[0]).toEqual({
      type: 'files-outside-boundary',
      severity: 'warn',
      message: "stray.ts touched but not declared in any task's files:",
      context: { file: 'stray.ts' },
      ts: FIXED,
    });
    expect(events[1]!.context).toEqual({ file: 'other.ts' });
  });

  it('emits nothing when every touched file is declared', () => {
    expect(
      runBoundaryCheck({
        declaredFiles: ['a.ts', 'b.ts'],
        touchedFiles: ['a.ts', 'b.ts'],
        stamp: stampFixed,
      }),
    ).toEqual([]);
  });

  it('iterates the caller-supplied order and does NOT dedup (hook path keeps raw order + dups)', () => {
    const events = runBoundaryCheck({
      declaredFiles: ['a.ts'],
      touchedFiles: ['z.ts', 'z.ts', 'a.ts'],
      stamp: stampFixed,
    });
    expect(events.map((e) => e.context.file)).toEqual(['z.ts', 'z.ts']);
  });

  it('respects a deduped Set input (settle path), preserving first-seen order', () => {
    const events = runBoundaryCheck({
      declaredFiles: new Set(['a.ts', 'b.ts']),
      touchedFiles: new Set(['a.ts', 'stray.ts', 'b.ts', 'extra.ts']),
      stamp: stampFixed,
    });
    expect(events.map((e) => e.context.file)).toEqual(['stray.ts', 'extra.ts']);
  });

  it('merges extraContext after the file key (hook source marker)', () => {
    const events = runBoundaryCheck({
      declaredFiles: [],
      touchedFiles: ['x.ts'],
      stamp: stampFixed,
      extraContext: { source: 'hook.preToolEdit' },
    });
    expect(events[0]!.context).toEqual({ file: 'x.ts', source: 'hook.preToolEdit' });
  });

  it('calls stamp once per emitted event', () => {
    let calls = 0;
    runBoundaryCheck({
      declaredFiles: [],
      touchedFiles: ['p.ts', 'q.ts', 'r.ts'],
      stamp: () => {
        calls += 1;
        return FIXED;
      },
    });
    expect(calls).toBe(3);
  });

  it('exposes the shared message builder', () => {
    expect(boundaryMessage('foo.ts')).toBe(
      "foo.ts touched but not declared in any task's files:",
    );
  });
});
