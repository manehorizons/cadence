import { describe, it, expect } from 'vitest';
import {
  heuristicTaskClass,
  resolveTaskClass,
  classifyTaskExecution,
  FILE_BYTES_CAP,
} from '../../src/dispatch/policy.js';
import type { DispatchSignals, WaveExecutionContext } from '../../src/dispatch/policy.js';
import { CadenceConfigZ, defaultConfig } from '@thomas-powers-jr/cadence-types';
import type { CadenceConfig, Task } from '@thomas-powers-jr/cadence-types';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    files: [],
    action: 'do it',
    verify: 'check it',
    done: 'AC-1',
    ...overrides,
  };
}

function config(overrides: Partial<CadenceConfig> = {}): CadenceConfig {
  return CadenceConfigZ.parse({ ...defaultConfig, ...overrides });
}

describe('FILE_BYTES_CAP', () => {
  it('is 500000', () => {
    expect(FILE_BYTES_CAP).toBe(500_000);
  });
});

describe('heuristicTaskClass', () => {
  it('LOAD-BEARING: 1 file + 2 depends is complex — depends-based rule checked before file-count mechanical rule', () => {
    expect(heuristicTaskClass(task('T1', { files: ['a.ts'], depends: ['T1', 'T2'] }))).toBe('complex');
  });

  it('1 file, 0 depends is mechanical', () => {
    expect(heuristicTaskClass(task('T1', { files: ['a.ts'], depends: [] }))).toBe('mechanical');
  });

  it('4 files, 0 depends is complex', () => {
    expect(
      heuristicTaskClass(task('T1', { files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'], depends: [] })),
    ).toBe('complex');
  });

  it('2 files, 1 depend is standard', () => {
    expect(heuristicTaskClass(task('T1', { files: ['a.ts', 'b.ts'], depends: ['T1'] }))).toBe('standard');
  });
});

describe('resolveTaskClass', () => {
  it('D-DQ1: declared class wins over the heuristic even when they disagree', () => {
    const t = task('T1', { files: ['a.ts'], depends: ['T1', 'T2'], class: 'mechanical' });
    expect(heuristicTaskClass(t)).toBe('complex');
    expect(resolveTaskClass(t)).toBe('mechanical');
  });

  it('falls back to the heuristic when no class is declared', () => {
    const t = task('T1', { files: ['a.ts'], depends: [] });
    expect(resolveTaskClass(t)).toBe(heuristicTaskClass(t));
  });
});

const NO_SIGNALS: DispatchSignals = {
  packetChars: 0,
  declaredFileBytes: 0,
  contextUtilization: null,
};

describe('classifyTaskExecution — batch trigger', () => {
  it('fires with a mechanicalBatchMin reason for a mechanical task in a wave with >= threshold mechanical siblings', () => {
    const cfg = config({ subagentPolicy: { contextBudgetThreshold: 0.7, largeTaskTokens: 8000, mechanicalBatchMin: 3 } });
    const waveCtx: WaveExecutionContext = {
      wave: 1,
      waveClasses: { T1: 'mechanical', T2: 'mechanical', T3: 'mechanical' },
    };
    const verdict = classifyTaskExecution(task('T1', { files: ['a.ts'] }), waveCtx, cfg, NO_SIGNALS);
    expect(verdict.execution).toBe('dispatch');
    expect(verdict.modelClass).toBe('mechanical');
    expect(verdict.reasons.some((r) => r.includes('mechanicalBatchMin'))).toBe(true);
  });

  it('does NOT fire for a mechanical task when mechanicalCount is below mechanicalBatchMin', () => {
    const cfg = config({ subagentPolicy: { contextBudgetThreshold: 0.7, largeTaskTokens: 8000, mechanicalBatchMin: 3 } });
    const waveCtx: WaveExecutionContext = {
      wave: 1,
      waveClasses: { T1: 'mechanical', T2: 'mechanical' },
    };
    const verdict = classifyTaskExecution(task('T1', { files: ['a.ts'] }), waveCtx, cfg, NO_SIGNALS);
    expect(verdict.modelClass).toBe('mechanical');
    expect(verdict.reasons).toEqual([]);
    expect(verdict.execution).toBe('inline');
  });

  it('does NOT fire for a complex/standard task sharing the same mechanical-heavy wave', () => {
    const cfg = config({ subagentPolicy: { contextBudgetThreshold: 0.7, largeTaskTokens: 8000, mechanicalBatchMin: 3 } });
    const waveCtx: WaveExecutionContext = {
      wave: 1,
      waveClasses: { T1: 'mechanical', T2: 'mechanical', T3: 'mechanical', T4: 'complex' },
    };
    const complexVerdict = classifyTaskExecution(
      task('T4', { files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] }),
      waveCtx,
      cfg,
      NO_SIGNALS,
    );
    expect(complexVerdict.execution).toBe('inline');
    expect(complexVerdict.reasons.some((r) => r.includes('mechanicalBatchMin'))).toBe(false);

    const standardWaveCtx: WaveExecutionContext = {
      wave: 1,
      waveClasses: { T1: 'mechanical', T2: 'mechanical', T3: 'mechanical', T5: 'standard' },
    };
    const standardVerdict = classifyTaskExecution(
      task('T5', { files: ['a.ts', 'b.ts'], depends: ['T1'] }),
      standardWaveCtx,
      cfg,
      NO_SIGNALS,
    );
    expect(standardVerdict.execution).toBe('inline');
    expect(standardVerdict.reasons.some((r) => r.includes('mechanicalBatchMin'))).toBe(false);
  });

  it('a lone complex task with no batch/size/budget trigger stays inline — model class alone is not a trigger', () => {
    const cfg = config();
    const waveCtx: WaveExecutionContext = { wave: 1, waveClasses: { T1: 'complex' } };
    const verdict = classifyTaskExecution(
      task('T1', { files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] }),
      waveCtx,
      cfg,
      NO_SIGNALS,
    );
    expect(verdict.execution).toBe('inline');
    expect(verdict.reasons).toEqual([]);
  });
});

describe('classifyTaskExecution — size trigger', () => {
  it('fires with a largeTaskTokens reason when packetChars/4 + declaredFileBytes/4 exceeds threshold', () => {
    const cfg = config({ subagentPolicy: { contextBudgetThreshold: 0.7, largeTaskTokens: 100, mechanicalBatchMin: 3 } });
    const waveCtx: WaveExecutionContext = { wave: 1, waveClasses: { T1: 'standard' } };
    const signals: DispatchSignals = { packetChars: 200, declaredFileBytes: 800, contextUtilization: null };
    // weight = floor(200/4) + floor(800/4) = 50 + 200 = 250 > 100
    const verdict = classifyTaskExecution(task('T1', { files: ['a.ts', 'b.ts'], depends: ['T0'] }), waveCtx, cfg, signals);
    expect(verdict.execution).toBe('dispatch');
    expect(verdict.reasons.some((r) => r.includes('largeTaskTokens'))).toBe(true);
  });

  it('a lower-weight signal set stays inline', () => {
    const cfg = config({ subagentPolicy: { contextBudgetThreshold: 0.7, largeTaskTokens: 8000, mechanicalBatchMin: 3 } });
    const waveCtx: WaveExecutionContext = { wave: 1, waveClasses: { T1: 'standard' } };
    const signals: DispatchSignals = { packetChars: 40, declaredFileBytes: 40, contextUtilization: null };
    const verdict = classifyTaskExecution(task('T1', { files: ['a.ts', 'b.ts'], depends: ['T0'] }), waveCtx, cfg, signals);
    expect(verdict.execution).toBe('inline');
    expect(verdict.reasons.some((r) => r.includes('largeTaskTokens'))).toBe(false);
  });
});

describe('classifyTaskExecution — budget trigger (D-DQ3)', () => {
  it('never fires when contextUtilization is null, regardless of threshold — even at the minimum 0.3', () => {
    const cfg = config({ subagentPolicy: { contextBudgetThreshold: 0.3, largeTaskTokens: 8000, mechanicalBatchMin: 3 } });
    const waveCtx: WaveExecutionContext = { wave: 1, waveClasses: { T1: 'standard' } };
    const verdict = classifyTaskExecution(task('T1', { files: ['a.ts'] }), waveCtx, cfg, NO_SIGNALS);
    expect(verdict.reasons.some((r) => r.includes('contextBudgetThreshold'))).toBe(false);
  });

  it('fires when an explicit non-null contextUtilization is at or above threshold', () => {
    const cfg = config({ subagentPolicy: { contextBudgetThreshold: 0.7, largeTaskTokens: 8000, mechanicalBatchMin: 3 } });
    const waveCtx: WaveExecutionContext = { wave: 1, waveClasses: { T1: 'standard' } };
    const signals: DispatchSignals = { packetChars: 0, declaredFileBytes: 0, contextUtilization: 0.7 };
    const verdict = classifyTaskExecution(task('T1', { files: ['a.ts'] }), waveCtx, cfg, signals);
    expect(verdict.execution).toBe('dispatch');
    expect(verdict.reasons.some((r) => r.includes('contextBudgetThreshold'))).toBe(true);
  });
});

describe('classifyTaskExecution — model routing', () => {
  it('routes modelClass to config.modelPerClass[modelClass] for all three classes', () => {
    const cfg = config({
      modelPerClass: {
        mechanical: 'claude-haiku-4-5-20251001',
        standard: 'claude-sonnet-4-6',
        complex: 'claude-opus-4-7',
        drafting: 'claude-opus-4-7',
      },
    });
    const waveCtx: WaveExecutionContext = { wave: 1, waveClasses: {} };

    const mechVerdict = classifyTaskExecution(task('T1', { files: ['a.ts'] }), waveCtx, cfg, NO_SIGNALS);
    expect(mechVerdict.modelClass).toBe('mechanical');
    expect(mechVerdict.model).toBe(cfg.modelPerClass.mechanical);

    const stdVerdict = classifyTaskExecution(
      task('T2', { files: ['a.ts', 'b.ts'], depends: ['T0'] }),
      waveCtx,
      cfg,
      NO_SIGNALS,
    );
    expect(stdVerdict.modelClass).toBe('standard');
    expect(stdVerdict.model).toBe(cfg.modelPerClass.standard);

    const complexVerdict = classifyTaskExecution(
      task('T3', { files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] }),
      waveCtx,
      cfg,
      NO_SIGNALS,
    );
    expect(complexVerdict.modelClass).toBe('complex');
    expect(complexVerdict.model).toBe(cfg.modelPerClass.complex);
  });
});
