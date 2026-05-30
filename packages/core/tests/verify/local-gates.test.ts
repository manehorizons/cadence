/**
 * AC-4, AC-5 — Local<Gate>Verifier happy-path + empty-input tests.
 * Uses an injected transport so no real network calls are made.
 */
import { describe, it, expect } from 'vitest';
import type { Draft } from '@manehorizons/cadence-types';
import {
  LocalCodeReviewVerifier,
} from '../../src/verify/code-review.js';
import {
  LocalPerTaskVerifier,
} from '../../src/verify/per-task.js';
import {
  LocalPlanReviewVerifier,
} from '../../src/verify/plan-review.js';
import {
  LocalSecurityAuditVerifier,
} from '../../src/verify/security-audit.js';

/** Build a fake fetch that returns the given JSON string as the model's content. */
const fetchJson = (content: string) =>
  (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content } }],
      }),
    } as Response)) as unknown as typeof fetch;

/** Minimal valid Draft for plan-review tests. */
function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    schemaVersion: 1,
    id: '25-01',
    phase: '25-local-plan-review',
    tier: 'complex',
    title: 'demo',
    objective: 'do the thing',
    acceptanceCriteria: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
    tasks: [
      {
        id: 'T1',
        name: 'task',
        files: ['src/foo.ts'],
        action: 'do',
        verify: 'check',
        done: 'AC-1',
      },
    ],
    boundaries: ['DO NOT widen scope'],
    status: 'PENDING',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC-4: LocalCodeReviewVerifier
// ---------------------------------------------------------------------------
describe('LocalCodeReviewVerifier (AC-4)', () => {
  it('AC-4: maps findings from model output, provider=local', async () => {
    const modelContent = JSON.stringify({
      findings: [
        { file: 'src/foo.ts', severity: 'high', message: 'console.log left in source', line: 3 },
        { file: 'src/bar.ts', severity: 'medium', message: 'missing null check' },
      ],
    });
    const v = new LocalCodeReviewVerifier({
      baseURL: 'http://localhost:11434/v1',
      model: 'qwen2.5-coder',
      transport: fetchJson(modelContent),
    });
    const r = await v.verify({
      files: ['src/foo.ts', 'src/bar.ts'],
      diff: '+console.log("debug")',
    });
    expect(r.provider).toBe('local');
    expect(r.model).toBe('qwen2.5-coder');
    expect(r.findings['src/foo.ts']).toEqual([
      { severity: 'high', message: 'console.log left in source', line: 3 },
    ]);
    expect(r.findings['src/bar.ts']).toEqual([
      { severity: 'medium', message: 'missing null check' },
    ]);
  });

  it('AC-4: empty-input short-circuits with no network call', async () => {
    let called = false;
    const t = (async () => {
      called = true;
      return {} as Response;
    }) as unknown as typeof fetch;
    const v = new LocalCodeReviewVerifier({
      baseURL: 'http://localhost:11434/v1',
      model: 'qwen2.5-coder',
      transport: t,
    });
    const r = await v.verify({ files: [], diff: '  ' });
    expect(called).toBe(false);
    expect(r).toEqual({ findings: {}, provider: 'local', model: 'qwen2.5-coder' });
  });
});

// ---------------------------------------------------------------------------
// AC-5: LocalPerTaskVerifier
// ---------------------------------------------------------------------------
describe('LocalPerTaskVerifier (AC-5)', () => {
  it('AC-5: maps verdict+reason from model output, provider=local', async () => {
    const modelContent = JSON.stringify({
      verdict: 'pass',
      reason: 'looks good',
    });
    const v = new LocalPerTaskVerifier({
      baseURL: 'http://localhost:11434/v1',
      model: 'mistral',
      transport: fetchJson(modelContent),
    });
    const r = await v.verify({
      taskId: 'T1',
      files: ['src/foo.ts'],
      diff: '+const x = 1;',
    });
    expect(r.provider).toBe('local');
    expect(r.model).toBe('mistral');
    expect(r.verdict).toBe('pass');
    expect(r.reason).toBe('looks good');
  });
});

// ---------------------------------------------------------------------------
// AC-5: LocalPlanReviewVerifier
// ---------------------------------------------------------------------------
describe('LocalPlanReviewVerifier (AC-5)', () => {
  it('AC-5: maps pass+findings from model output, provider=local', async () => {
    const modelContent = JSON.stringify({
      pass: true,
      findings: [
        { severity: 'low', message: 'minor nit', suggestedEdit: 'reword' },
      ],
    });
    const v = new LocalPlanReviewVerifier({
      baseURL: 'http://localhost:11434/v1',
      model: 'llama3',
      transport: fetchJson(modelContent),
    });
    const r = await v.verify({ draft: makeDraft() });
    expect(r.provider).toBe('local');
    expect(r.model).toBe('llama3');
    expect(r.pass).toBe(true);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toEqual({
      severity: 'low',
      message: 'minor nit',
      suggestedEdit: 'reword',
    });
  });
});

// ---------------------------------------------------------------------------
// AC-5: LocalSecurityAuditVerifier
// ---------------------------------------------------------------------------
describe('LocalSecurityAuditVerifier (AC-5)', () => {
  it('AC-5: maps findings array from model output, provider=local', async () => {
    const modelContent = JSON.stringify({
      findings: [
        { severity: 'critical', message: 'hardcoded secret', line: 5 },
        { severity: 'high', message: 'missing auth check' },
      ],
    });
    const v = new LocalSecurityAuditVerifier({
      baseURL: 'http://localhost:11434/v1',
      model: 'deepseek-coder',
      transport: fetchJson(modelContent),
    });
    const r = await v.verify({
      files: ['src/api.ts'],
      diff: '+const token = "s3cr3t";',
    });
    expect(r.provider).toBe('local');
    expect(r.model).toBe('deepseek-coder');
    expect(r.findings).toHaveLength(2);
    expect(r.findings[0]).toEqual({ severity: 'critical', message: 'hardcoded secret', line: 5 });
    expect(r.findings[1]).toEqual({ severity: 'high', message: 'missing auth check' });
  });

  it('AC-5: empty-input short-circuits with no network call', async () => {
    let called = false;
    const t = (async () => {
      called = true;
      return {} as Response;
    }) as unknown as typeof fetch;
    const v = new LocalSecurityAuditVerifier({
      baseURL: 'http://localhost:11434/v1',
      model: 'deepseek-coder',
      transport: t,
    });
    const r = await v.verify({ files: [], diff: '' });
    expect(called).toBe(false);
    expect(r).toEqual({ findings: [], provider: 'local', model: 'deepseek-coder' });
  });
});
