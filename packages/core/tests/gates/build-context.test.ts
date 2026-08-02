import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState } from '@thomas-powers-jr/cadence-types';
import { parseDraftMd } from '../../src/parse/draft-parser.js';
import { buildBuildContext } from '../../src/gates/build-context.js';

/**
 * T5 (phase 164): `buildBuildContext` threads its `cwd` argument into
 * `selectPerTaskVerifier(config, { cwd })` so a key discoverable only via a
 * `.env` file AT THAT CWD is found — regardless of the test process's own
 * `process.cwd()`. `selectPerTaskVerifier` constructs the verifier eagerly
 * (unlike settle.ts's memoized ports), and construction alone never makes a
 * network call (mirrors anthropic-verifier.test.ts's "construction is lazy"
 * proof + spec-approve.test.ts's rationale) — so we can assert on
 * `ctx.verifiers.perTask.name` directly without needing to call `.verify()`
 * or stub any factory module.
 */

const DRAFT = `---
phase: 60-build-context-cwd
id: 60-01
tier: standard
status: APPROVED
---

# 60-01 — demo

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
  return realpath(await mkdtemp(join(tmpdir(), 'cadence-build-context-cwd-')));
}

let root: string | null = null;
const origKey = process.env.ANTHROPIC_API_KEY;

afterEach(async () => {
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

describe('buildBuildContext threads cwd to selectPerTaskVerifier (T5)', () => {
  it('AC-1: resolves a real anthropic per-task verifier from a key discoverable only via .env at cwd, not process.cwd() (AC-3)', async () => {
    root = await mktemp();
    // The key lives ONLY here — a cwd distinct from process.cwd() — and ONLY
    // as a .env file, never exported into process.env (AC-1).
    await writeFile(join(root, '.env'), 'ANTHROPIC_API_KEY=from-dotenv-build-context-test\n');
    delete process.env.ANTHROPIC_API_KEY;

    const draft = parseDraftMd(DRAFT);
    const state = {
      ...emptyState('build-context-cwd'),
      loopPosition: 'BUILD' as const,
      activePhase: '60-build-context-cwd',
      activeDraft: '60-01',
    };
    const config = {
      ...defaultConfig,
      perTaskVerifier: { provider: 'anthropic' as const },
    };

    const ctx = buildBuildContext({
      cwd: root,
      state,
      draft,
      config,
      gateSet: { gates: [], softCap: false },
      taskId: 'T1',
      opts: {},
    });

    // Before the fix, selectPerTaskVerifier defaulted `cwd` to the real
    // process.cwd() (this test's own working directory, which has neither the
    // env var nor a .env with the key) and would have constructed the 'mock'
    // verifier instead.
    expect(ctx.verifiers.perTask.name).toBe('anthropic');
  });
});
