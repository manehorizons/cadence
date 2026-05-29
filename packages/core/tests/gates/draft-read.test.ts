import { describe, it, expect } from 'vitest';
import { runDraftReadGate } from '../../src/gates/draft-read.js';
import type { SettleContext } from '../../src/gates/types.js';

const BASELINE = '2026-05-20T10:00:00.000Z';
const BASELINE_MS = Date.parse(BASELINE);

function ctx(over: {
  draftReadAt?: string | null;
  mtimeMs?: number | null;
  allowStaleDraft?: boolean;
  errs?: string[];
}): SettleContext {
  const errs = over.errs ?? [];
  return {
    cwd: '/x',
    state: { draftReadAt: over.draftReadAt ?? null } as never,
    draft: { acceptanceCriteria: [], tasks: [] } as never,
    progress: { draftId: 'd', tasks: {} },
    config: null,
    gateSet: { gates: ['draft-read'], softCap: false } as never,
    opts: over.allowStaleDraft ? { allowStaleDraft: true } : {},
    explicitIds: new Set<string>(),
    touchedFiles: [],
    coverage: async () => new Map(),
    draftMtimeMs: async () => over.mtimeMs ?? null,
    verifiers: { deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) } },
    emit: { anomalies: async () => {} },
    runner: { test: async () => ({ ran: false, ok: true }) },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runDraftReadGate', () => {
  // AC-1: DRAFT edited after approve (mtime > baseline), no bypass → refuse with exact message
  it('refuses when DRAFT.md mtime is newer than draftReadAt', async () => {
    const errs: string[] = [];
    const res = await runDraftReadGate(
      ctx({ draftReadAt: BASELINE, mtimeMs: BASELINE_MS + 1000, errs }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toBe(
      `settle run refused: DRAFT.md was edited after approve (mtime ${new Date(
        BASELINE_MS + 1000,
      ).toISOString()} > draftReadAt ${BASELINE}). Re-read it then re-approve, or pass --allow-stale-draft to override.\n`,
    );
  });

  // AC-1: --allow-stale-draft → pass with the exact bypass note
  it('passes with the bypass note when allowStaleDraft is set', async () => {
    const errs: string[] = [];
    const res = await runDraftReadGate(
      ctx({ draftReadAt: BASELINE, mtimeMs: BASELINE_MS + 1000, allowStaleDraft: true, errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toBe(
      'settle: --allow-stale-draft set; proceeding past draft-read gate (DRAFT.md mtime newer than draftReadAt).\n',
    );
  });

  // AC-1: mtime not newer than baseline → pass, no stderr
  it('passes when DRAFT.md mtime is not newer than the baseline', async () => {
    const errs: string[] = [];
    const res = await runDraftReadGate(
      ctx({ draftReadAt: BASELINE, mtimeMs: BASELINE_MS - 1, errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-1: no draftReadAt baseline → pass (guard preserved from settle.ts)
  it('passes when draftReadAt is null', async () => {
    const errs: string[] = [];
    const res = await runDraftReadGate(ctx({ draftReadAt: null, mtimeMs: Date.now(), errs }));
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-1: stat unavailable (null mtime) → pass, no stderr
  it('passes when the DRAFT mtime is unavailable', async () => {
    const errs: string[] = [];
    const res = await runDraftReadGate(ctx({ draftReadAt: BASELINE, mtimeMs: null, errs }));
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });
});
