import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState } from '@thomas-powers-jr/cadence-types';

/**
 * T5 (phase 164): `buildDraftContext`'s `planReview.verify` closure threads
 * its `cwd` argument into `selectPlanReviewVerifier(config, { cwd })` so a key
 * discoverable only via a `.env` file AT THAT CWD is found — regardless of
 * the test process's own `process.cwd()`. The selection is memoized and only
 * runs on the first `.verify()` call, so — mirroring
 * `spec-approve.test.ts` — we spy on the real factory to capture which
 * concrete verifier it constructed (`.name`), then swap in a stubbed
 * `.verify` so no real network call is ever made.
 */
const constructedNames = vi.hoisted(() => [] as string[]);

vi.mock('../../src/verify/plan-review-factory.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/verify/plan-review-factory.js')>();
  return {
    ...actual,
    selectPlanReviewVerifier: (
      cfg: Parameters<typeof actual.selectPlanReviewVerifier>[0],
      opts: Parameters<typeof actual.selectPlanReviewVerifier>[1],
    ) => {
      const real = actual.selectPlanReviewVerifier(cfg, opts);
      constructedNames.push(real.name);
      return {
        name: real.name,
        verify: async () => ({ pass: true, findings: [], provider: real.name }),
      };
    },
  };
});

const { buildDraftContext } = await import('../../src/gates/draft-context.js');
const { parseDraftMd } = await import('../../src/parse/draft-parser.js');

const DRAFT = `---
phase: 61-draft-context-cwd
id: 61-01
tier: complex
status: PENDING
---

# 61-01 — demo

## Objective

Prove cwd threading.

## Acceptance Criteria

### AC-1: it works
Given a precondition
When an action
Then an observable outcome

## Tasks

### T1: do the thing
- files: \`src/foo.ts\`
- action: do it
- verify: it works
- done: AC-1

## Boundaries

- none
`;

async function mktemp(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), 'cadence-draft-context-cwd-')));
}

let root: string | null = null;
const origKey = process.env.ANTHROPIC_API_KEY;

afterEach(async () => {
  constructedNames.length = 0;
  if (origKey !== undefined) {
    process.env.ANTHROPIC_API_KEY = origKey;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
  if (root) {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    root = null;
  }
});

describe('buildDraftContext threads cwd to selectPlanReviewVerifier (T5)', () => {
  it('AC-1: resolves a real anthropic plan-review verifier from a key discoverable only via .env at cwd, not process.cwd() (AC-3)', async () => {
    root = await mktemp();
    // The key lives ONLY here — a cwd distinct from process.cwd() — and ONLY
    // as a .env file, never exported into process.env (AC-1).
    await writeFile(join(root, '.env'), 'ANTHROPIC_API_KEY=from-dotenv-draft-context-test\n');
    delete process.env.ANTHROPIC_API_KEY;

    const draft = parseDraftMd(DRAFT);
    const state = {
      ...emptyState('draft-context-cwd'),
      loopPosition: 'DRAFT' as const,
      activePhase: '61-draft-context-cwd',
      activeDraft: '61-01',
    };
    const config = {
      ...defaultConfig,
      planReview: { provider: 'anthropic' as const },
    };

    const ctx = buildDraftContext({
      cwd: root,
      state,
      draft,
      config,
      gateSet: { gates: [], softCap: false },
      phase: '61-draft-context-cwd',
      id: '61-01',
      projectMd: '',
      opts: {},
    });

    const result = await ctx.verifiers.planReview.verify({ draft });

    // Before the fix, selectPlanReviewVerifier defaulted `cwd` to the real
    // process.cwd() (this test's own working directory, which has neither the
    // env var nor a .env with the key) and would have constructed the 'mock'
    // verifier instead.
    expect(constructedNames).toEqual(['anthropic']);
    expect(result.provider).toBe('anthropic');
  });
});
