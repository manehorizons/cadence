import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
const specVerifyResult = vi.hoisted(() => ({ pass: true }));

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
        verify: async () => ({
          pass: specVerifyResult.pass,
          findings: specVerifyResult.pass
            ? []
            : [{ severity: 'high', message: 'stub spec-review finding' }],
          provider: real.name,
        }),
      };
    },
  };
});

const uiConstructedNames = vi.hoisted(() => [] as string[]);
const uiVerifyResult = vi.hoisted(() => ({ pass: true }));

vi.mock('../../src/verify/ui-spec-review-factory.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/verify/ui-spec-review-factory.js')>();
  return {
    ...actual,
    selectUiSpecReviewVerifier: (
      cfg: Parameters<typeof actual.selectUiSpecReviewVerifier>[0],
      opts: Parameters<typeof actual.selectUiSpecReviewVerifier>[1],
    ) => {
      const real = actual.selectUiSpecReviewVerifier(cfg, opts);
      uiConstructedNames.push(real.name);
      return {
        name: real.name,
        verify: async () => ({
          pass: uiVerifyResult.pass,
          findings: uiVerifyResult.pass ? [] : [{ severity: 'high', message: 'stub finding' }],
          provider: real.name,
        }),
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

const UI_SPEC = `---
phase: 40-verifier-cwd
id: 40-01
status: PENDING
---

# 40-01 — demo

## Components

### X
- new

#### Layout & Tokens
- spacing-4

#### Precedent References
- (none)

## Responsive & Interaction

- collapses below 768px
`;

let root: string | null = null;
afterEach(async () => {
  constructedNames.length = 0;
  specVerifyResult.pass = true;
  uiConstructedNames.length = 0;
  uiVerifyResult.pass = true;
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

describe('specApproveService — ui-spec-review (rec-20260711-004)', () => {
  it('AC-2: no UI-SPEC present — unchanged behavior, no ui-spec-review sidecar written', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '40-verifier-cwd');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '40-01-SPEC.md'), SPEC);
    await writeFile(
      join(root, '.cadence', 'state.json'),
      JSON.stringify({ ...emptyState(), loopPosition: 'SPEC', activeSpec: '40-01' }),
    );
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '40-verifier-cwd', num: '1' }, io);
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(phaseDir, '40-01-UI-SPEC-REVIEW.json'))).toBe(false);
    // No UI-SPEC on disk at all — ui-spec-review must never even construct a verifier.
    expect(uiConstructedNames).toEqual([]);
  });

  it('AC-4a: spec-review fails un-bypassed refuses; ui-spec-review never even runs (no sidecar written)', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '40-verifier-cwd');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '40-01-SPEC.md'), SPEC);
    await writeFile(join(phaseDir, '40-01-UI-SPEC.md'), UI_SPEC);
    await writeFile(
      join(root, '.cadence', 'state.json'),
      JSON.stringify({ ...emptyState(), loopPosition: 'SPEC', activeSpec: '40-01' }),
    );
    specVerifyResult.pass = false;
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '40-verifier-cwd', num: '1' }, io);
    expect(res.exitCode).not.toBe(0);
    expect(existsSync(join(phaseDir, '40-01-UI-SPEC-REVIEW.json'))).toBe(false);
    expect(uiConstructedNames).toEqual([]);
  });

  it('AC-4b: spec-review passes + ui-spec-review fails un-bypassed refuses; --allow-ui-spec-review-failure proceeds', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '40-verifier-cwd');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '40-01-SPEC.md'), SPEC);
    await writeFile(join(phaseDir, '40-01-UI-SPEC.md'), UI_SPEC);
    await writeFile(
      join(root, '.cadence', 'state.json'),
      JSON.stringify({ ...emptyState(), loopPosition: 'SPEC', activeSpec: '40-01' }),
    );
    uiVerifyResult.pass = false;
    const { io: io1 } = captureIO();
    const refused = await specApproveService(root, { phase: '40-verifier-cwd', num: '1' }, io1);
    expect(refused.exitCode).not.toBe(0);

    const { io: io2 } = captureIO();
    const bypassed = await specApproveService(
      root,
      { phase: '40-verifier-cwd', num: '1', allowUiSpecReviewFailure: true },
      io2,
    );
    expect(bypassed.exitCode).toBe(0);
  });

  it('AC-4c: spec-review bypassed + ui-spec-review fails un-bypassed STILL refuses', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '40-verifier-cwd');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '40-01-SPEC.md'), SPEC);
    await writeFile(join(phaseDir, '40-01-UI-SPEC.md'), UI_SPEC);
    await writeFile(
      join(root, '.cadence', 'state.json'),
      JSON.stringify({ ...emptyState(), loopPosition: 'SPEC', activeSpec: '40-01' }),
    );
    specVerifyResult.pass = false;
    uiVerifyResult.pass = false;
    const { io } = captureIO();
    const res = await specApproveService(
      root,
      { phase: '40-verifier-cwd', num: '1', allowSpecReviewFailure: true },
      io,
    );
    expect(res.exitCode).not.toBe(0);
    // spec-review's bypass let execution fall through, so ui-spec-review DID run
    // and is evaluated (and refuses) on its own merits.
    expect(uiConstructedNames).toEqual(['mock']);
    expect(existsSync(join(phaseDir, '40-01-UI-SPEC-REVIEW.json'))).toBe(true);
  });

  it('AC-4d: both spec-review and ui-spec-review bypassed proceeds to APPROVED, both files marked APPROVED', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '40-verifier-cwd');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '40-01-SPEC.md'), SPEC);
    await writeFile(join(phaseDir, '40-01-UI-SPEC.md'), UI_SPEC);
    await writeFile(
      join(root, '.cadence', 'state.json'),
      JSON.stringify({ ...emptyState(), loopPosition: 'SPEC', activeSpec: '40-01' }),
    );
    specVerifyResult.pass = false;
    uiVerifyResult.pass = false;
    const { io } = captureIO();
    const res = await specApproveService(
      root,
      {
        phase: '40-verifier-cwd',
        num: '1',
        allowSpecReviewFailure: true,
        allowUiSpecReviewFailure: true,
      },
      io,
    );
    expect(res.exitCode).toBe(0);
    const specOnDisk = await readFile(join(phaseDir, '40-01-SPEC.md'), 'utf8');
    const uiSpecOnDisk = await readFile(join(phaseDir, '40-01-UI-SPEC.md'), 'utf8');
    expect(specOnDisk).toMatch(/^status: APPROVED$/m);
    expect(uiSpecOnDisk).toMatch(/^status: APPROVED$/m);
  });

  it('AC-5: ui-spec-review hard-escalates after maxAttempts un-bypassed attempts', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '40-verifier-cwd');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '40-01-SPEC.md'), SPEC);
    await writeFile(join(phaseDir, '40-01-UI-SPEC.md'), UI_SPEC);
    await writeFile(
      join(root, '.cadence', 'state.json'),
      JSON.stringify({ ...emptyState(), loopPosition: 'SPEC', activeSpec: '40-01' }),
    );
    uiVerifyResult.pass = false;

    const { io: io1, err: err1 } = captureIO();
    const attempt1 = await specApproveService(root, { phase: '40-verifier-cwd', num: '1' }, io1);
    expect(attempt1.exitCode).not.toBe(0);
    expect(err1.join('')).toMatch(/attempt 1\/3 did not pass/);

    const { io: io2, err: err2 } = captureIO();
    const attempt2 = await specApproveService(root, { phase: '40-verifier-cwd', num: '1' }, io2);
    expect(attempt2.exitCode).not.toBe(0);
    expect(err2.join('')).toMatch(/attempt 2\/3 did not pass/);

    const { io: io3, err: err3 } = captureIO();
    const attempt3 = await specApproveService(root, { phase: '40-verifier-cwd', num: '1' }, io3);
    expect(attempt3.exitCode).not.toBe(0);
    expect(err3.join('')).toMatch(
      /spec approve refused: ui-spec-review did NOT converge after 3 attempts/,
    );

    const { io: io4 } = captureIO();
    const bypassed = await specApproveService(
      root,
      { phase: '40-verifier-cwd', num: '1', allowUiSpecReviewFailure: true },
      io4,
    );
    expect(bypassed.exitCode).toBe(0);
  });

  it('AC-9: sidecar present but UI-SPEC.md absent prints a loud notice and does not refuse', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '40-verifier-cwd');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '40-01-SPEC.md'), SPEC);
    await writeFile(
      join(phaseDir, '40-01-UI-SPEC-REVIEW.json'),
      JSON.stringify({ specId: '40-01', converged: true, attempts: 0, maxAttempts: 3, history: [] }),
    );
    await writeFile(
      join(root, '.cadence', 'state.json'),
      JSON.stringify({ ...emptyState(), loopPosition: 'SPEC', activeSpec: '40-01' }),
    );
    uiVerifyResult.pass = true;
    const { io, err } = captureIO();
    const res = await specApproveService(root, { phase: '40-verifier-cwd', num: '1' }, io);
    expect(res.exitCode).toBe(0);
    expect(err.join('')).toMatch(/UI-SPEC-REVIEW sidecar present but UI-SPEC\.md absent/);
    // The stub verifier must never be constructed in this skip path.
    expect(uiConstructedNames).toEqual([]);
  });
});

async function mktemp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cadence-spec-approve-cwd-'));
}
