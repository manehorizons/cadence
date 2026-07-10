import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState } from '@manehorizons/cadence-types';
import type { CommandIO } from '../../src/services/io.js';

/**
 * T5 (phase 164 amendment): `specApproveService` now forwards `repoRoot` as
 * `cwd` to `selectSpecReviewVerifier` so a key discoverable only via a `.env`
 * file AT THE REPO ROOT is found — regardless of the test process's own
 * `process.cwd()`. We spy on the real factory to capture which concrete
 * verifier it constructed (`.name`), then swap in a stubbed `.verify` so no
 * real network call is ever made (the repo's zero-live-provider-test rule).
 */
const constructedNames = vi.hoisted(() => [] as string[]);

vi.mock('../../src/verify/spec-review-factory.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/verify/spec-review-factory.js')>();
  return {
    ...actual,
    selectSpecReviewVerifier: (
      cfg: Parameters<typeof actual.selectSpecReviewVerifier>[0],
      opts: Parameters<typeof actual.selectSpecReviewVerifier>[1],
    ) => {
      // Real, synchronous selection — construction alone never makes a network
      // call (mirrors anthropic-verifier.test.ts's "construction is lazy" proof).
      const real = actual.selectSpecReviewVerifier(cfg, opts);
      constructedNames.push(real.name);
      return {
        name: real.name,
        verify: async () => ({ pass: true, findings: [], provider: real.name }),
      };
    },
  };
});

const { specApproveService } = await import('../../src/services/spec-approve.js');

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

const SPEC = `---
phase: 40-verifier-cwd
id: 40-01
status: PENDING
---

# 40-01 — demo

## Objective

Prove cwd threading.

## Acceptance Criteria

### AC-1: it works
Given a precondition
When an action
Then an observable outcome

## Constraints

- host-agnostic

## Open Questions

- none
`;

let root: string | null = null;
afterEach(async () => {
  constructedNames.length = 0;
  if (root) {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    root = null;
  }
});

describe('specApproveService threads repoRoot as cwd to selectSpecReviewVerifier (T5)', () => {
  it('AC-1: resolves a real anthropic verifier from a key discoverable only via .env at repoRoot, not process.cwd() (AC-3)', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '40-verifier-cwd');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(
      join(root, '.cadence', 'config.json'),
      JSON.stringify({ ...defaultConfig, specReview: { provider: 'anthropic' } }, null, 2),
    );
    const state = {
      ...emptyState('spec-approve-cwd'),
      loopPosition: 'SPEC' as const,
      activeSpec: '40-01',
    };
    await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
    await writeFile(join(phaseDir, '40-01-SPEC.md'), SPEC);
    // The key lives ONLY here — a repo root distinct from process.cwd() — and
    // ONLY as a .env file, never exported into process.env (AC-1).
    await writeFile(join(root, '.env'), 'ANTHROPIC_API_KEY=from-dotenv-spec-approve-test\n');

    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { io } = captureIO();
      const res = await specApproveService(root, { phase: '40-verifier-cwd', num: '01' }, io);
      expect(res.exitCode).toBe(0);
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }

    // Before the fix, selectSpecReviewVerifier defaulted `cwd` to the real
    // process.cwd() (this test's own working directory, which has neither the
    // env var nor a .env with the key) and would have constructed the 'mock'
    // verifier instead.
    expect(constructedNames).toEqual(['anthropic']);
  });
});

async function mktemp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cadence-spec-approve-cwd-'));
}
