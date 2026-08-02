import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import type { CommandIO } from '../../src/services/io.js';
import type {
  SpecReviewInput,
  SpecReviewResult,
  UiSpecReviewInput,
  UiSpecReviewResult,
  VerifierPort,
} from '../../src/contracts/index.js';

/**
 * T3 (phase 234) — `spec-review` / `ui-spec-review` are the only two
 * verifier-backed gates with no injection port; `services/spec-approve.ts`
 * called `selectSpecReviewVerifier` / `selectUiSpecReviewVerifier` directly.
 * These tests prove, about the new `SpecApproveVerifierPorts` seam (AC-2):
 *
 * - an injected fake `specReview`/`uiSpecReview` port genuinely replaces the
 *   real factory call (its own `.verify` runs, and the fake's `provider`
 *   lands in the sidecar) — NOT merely that the port object is *accepted*;
 * - omitting injection reproduces today's default resolution AND does so
 *   without emitting a provider-selection warning on the clean path
 *   (distinguishing "correctly resolved to the configured mock" from
 *   "silently fell back to mock after a misconfiguration");
 * - the real `selectUiSpecReviewVerifier` factory is never even constructed
 *   — on the DEFAULT (no-port-injected) path — when no UI-SPEC.md exists.
 *   This is the property that actually pins call-site laziness: a test that
 *   injects a port can never observe eager-vs-lazy resolution, because `??`
 *   short-circuits the factory call regardless of where the resolver sits.
 *   Observed via a spy on the real `ui-spec-review-factory.js` module
 *   (mirrors the `uiConstructedNames` technique in
 *   `tests/services/spec-approve.test.ts`), not by injecting a fake;
 * - `cwd` reaches `selectUiSpecReviewVerifier` as `repoRoot`, not
 *   `process.cwd()` — mirroring the Phase 164 T5 regression test for
 *   spec-review (`tests/services/spec-approve.test.ts:149`), proven via a
 *   repo-root-only `.env` key that only a correctly-threaded `cwd` can
 *   discover.
 */

const uiConstructedNames = vi.hoisted(() => [] as string[]);

vi.mock('../../src/verify/ui-spec-review-factory.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/verify/ui-spec-review-factory.js')>();
  return {
    ...actual,
    selectUiSpecReviewVerifier: (
      cfg: Parameters<typeof actual.selectUiSpecReviewVerifier>[0],
      opts: Parameters<typeof actual.selectUiSpecReviewVerifier>[1],
    ) => {
      // Real, synchronous selection — construction alone never makes a
      // network call (mirrors tests/services/spec-approve.test.ts's T5
      // technique). We record WHICH provider got constructed (proving
      // whether/when the factory ran at all), then swap in a deterministic
      // stub `.verify` so no real network call is ever made.
      const real = actual.selectUiSpecReviewVerifier(cfg, opts);
      uiConstructedNames.push(real.name);
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

/**
 * A provider-selection warning (e.g. `verifier-factory.ts`'s "falling back
 * to mock provider" message) is written by `createVerifierFactory`'s default
 * `warn` straight to `process.stderr` — a channel `captureIO()`'s `io.err`
 * never sees, since `io.err` only captures messages `spec-approve.ts` itself
 * writes (spec-review/ui-spec-review findings). Only a real `process.stderr`
 * spy can observe a factory-level warning, so this is what FIX 3's
 * assertions are built on. Always paired with `restore()` in a `finally`.
 */
function spyStderr(): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => {
    writes.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  return { writes, restore: () => spy.mockRestore() };
}

const PHASE = '40-spec-approve-ports';
const ID = '40-01';

const SPEC = `---
phase: ${PHASE}
id: ${ID}
status: PENDING
---

# ${ID} — demo

## Objective

Prove the injected port is used.

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
phase: ${PHASE}
id: ${ID}
status: PENDING
---

# ${ID} — demo

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

async function seedSpecOnly(root: string): Promise<string> {
  const phaseDir = join(root, '.cadence', 'phases', PHASE);
  await mkdir(phaseDir, { recursive: true });
  await writeFile(join(phaseDir, `${ID}-SPEC.md`), SPEC);
  const statePath = join(root, '.cadence', 'state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.loopPosition = 'SPEC';
  state.activeSpec = ID;
  await writeFile(statePath, JSON.stringify(state, null, 2));
  return phaseDir;
}

async function seedSpecAndUiSpec(root: string): Promise<string> {
  const phaseDir = await seedSpecOnly(root);
  await writeFile(join(phaseDir, `${ID}-UI-SPEC.md`), UI_SPEC);
  return phaseDir;
}

async function setUiSpecReviewProvider(root: string, provider: string): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.uiSpecReview = { provider };
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

function fakeSpecReviewPort(
  result: SpecReviewResult,
): { port: VerifierPort<SpecReviewInput, SpecReviewResult>; calls: SpecReviewInput[] } {
  const calls: SpecReviewInput[] = [];
  return {
    calls,
    port: {
      verify: async (input) => {
        calls.push(input);
        return result;
      },
    },
  };
}

function fakeUiSpecReviewPort(
  result: UiSpecReviewResult,
): { port: VerifierPort<UiSpecReviewInput, UiSpecReviewResult>; calls: UiSpecReviewInput[] } {
  const calls: UiSpecReviewInput[] = [];
  return {
    calls,
    port: {
      verify: async (input) => {
        calls.push(input);
        return result;
      },
    },
  };
}

let active: Fixture | null = null;
afterEach(async () => {
  uiConstructedNames.length = 0;
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('specApproveService — injected verifier ports (AC-2)', () => {
  it('AC-2: an injected specReview port is used instead of the real factory on the non-UI path', async () => {
    active = await tempRepo({ initialized: true, projectName: 'spec-approve-ports' });
    const { root } = active;
    await seedSpecOnly(root);

    const fake = fakeSpecReviewPort({
      pass: true,
      findings: [],
      provider: 'fake-injected-spec-review',
    });

    const { io } = captureIO();
    const res = await specApproveService(root, { phase: PHASE, num: '01' }, io, {
      specReview: fake.port,
    });

    expect(res.exitCode).toBe(0);
    // The injected fake actually ran, not the real (mock-provider) factory —
    // its call was recorded and its `provider` made it into the sidecar.
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.spec.objective).toContain('Prove the injected port is used');
    const sidecar = JSON.parse(
      await readFile(join(root, '.cadence', 'phases', PHASE, `${ID}-SPEC-REVIEW.json`), 'utf8'),
    );
    expect(sidecar.provider).toBe('fake-injected-spec-review');
  });

  it('AC-2: an injected uiSpecReview port is used instead of the real factory on the UI path', async () => {
    active = await tempRepo({ initialized: true, projectName: 'spec-approve-ports' });
    const { root } = active;
    await seedSpecAndUiSpec(root);

    const fakeSpec = fakeSpecReviewPort({ pass: true, findings: [], provider: 'fake-spec' });
    const fakeUi = fakeUiSpecReviewPort({
      pass: true,
      findings: [],
      provider: 'fake-injected-ui-spec-review',
    });

    const { io } = captureIO();
    const res = await specApproveService(root, { phase: PHASE, num: '01' }, io, {
      specReview: fakeSpec.port,
      uiSpecReview: fakeUi.port,
    });

    expect(res.exitCode).toBe(0);
    expect(fakeUi.calls).toHaveLength(1);
    expect(fakeUi.calls[0]?.uiSpec.components).toHaveLength(1);
    // The real factory must never even be constructed when a port is
    // injected — the fake fully displaced it.
    expect(uiConstructedNames).toEqual([]);
    const uiSidecar = JSON.parse(
      await readFile(
        join(root, '.cadence', 'phases', PHASE, `${ID}-UI-SPEC-REVIEW.json`),
        'utf8',
      ),
    );
    expect(uiSidecar.provider).toBe('fake-injected-ui-spec-review');
  });

  it("omitting injection preserves today's default (mock-provider) resolution on the non-UI path, with no UI-SPEC present — proving the ui-spec-review factory is never even constructed (laziness, FIX 1)", async () => {
    active = await tempRepo({ initialized: true, projectName: 'spec-approve-ports' });
    const { root } = active;
    await seedSpecOnly(root); // no UI-SPEC.md written, no ports injected

    const { io, err } = captureIO();
    const stderr = spyStderr();
    let res;
    try {
      // No 4th argument at all — the pre-Phase-234 call shape.
      res = await specApproveService(root, { phase: PHASE, num: '01' }, io);
    } finally {
      stderr.restore();
    }

    expect(res.exitCode).toBe(0);
    const sidecar = JSON.parse(
      await readFile(join(root, '.cadence', 'phases', PHASE, `${ID}-SPEC-REVIEW.json`), 'utf8'),
    );
    expect(sidecar.provider).toBe('mock');
    // spec-approve.ts itself never wrote a finding message.
    expect(err).toEqual([]);
    // A clean, explicitly-configured `mock` resolution never fires a
    // provider-selection warning. `createVerifierFactory`'s default `warn`
    // writes straight to real `process.stderr` (NOT through `io.err`), so
    // only a `process.stderr` spy can see it — this distinguishes
    // "resolved to mock on purpose" from "fell back to mock after a
    // misconfiguration" (FIX 3).
    expect(stderr.writes).toEqual([]);
    // The real ui-spec-review factory is observed (via the module spy)
    // NEVER to have been constructed — this is the property that pins
    // call-site laziness on the default (non-injected) path (FIX 1): if
    // `resolveUiSpecReviewPort(...)` were hoisted out of the
    // `existsSync(uiSpecPath)` branch, this array would be non-empty even
    // though no UI-SPEC.md exists.
    expect(uiConstructedNames).toEqual([]);
  });

  it('omitting injection preserves default resolution on the UI path too, with no provider-selection warning, and constructs the real factory exactly once', async () => {
    active = await tempRepo({ initialized: true, projectName: 'spec-approve-ports' });
    const { root } = active;
    await seedSpecAndUiSpec(root);

    const { io, err } = captureIO();
    const stderr = spyStderr();
    let res;
    try {
      res = await specApproveService(root, { phase: PHASE, num: '01' }, io);
    } finally {
      stderr.restore();
    }

    expect(res.exitCode).toBe(0);
    const uiSidecar = JSON.parse(
      await readFile(
        join(root, '.cadence', 'phases', PHASE, `${ID}-UI-SPEC-REVIEW.json`),
        'utf8',
      ),
    );
    expect(uiSidecar.provider).toBe('mock');
    expect(err).toEqual([]);
    expect(stderr.writes).toEqual([]);
    // Reached this time (UI-SPEC.md exists) — resolved exactly once, to
    // the configured `mock` provider.
    expect(uiConstructedNames).toEqual(['mock']);
  });

  it('FIX 2: default ui-spec-review resolution threads repoRoot as cwd, not process.cwd() (mirrors Phase 164 T5)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'spec-approve-ports' });
    const { root } = active;
    await seedSpecAndUiSpec(root);
    await setUiSpecReviewProvider(root, 'anthropic');
    // The key lives ONLY here — a repo root distinct from process.cwd() —
    // and ONLY as a .env file, never exported into process.env.
    await writeFile(join(root, '.env'), 'ANTHROPIC_API_KEY=from-dotenv-ui-spec-approve-test\n');

    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { io, err } = captureIO();
      const res = await specApproveService(root, { phase: PHASE, num: '01' }, io);
      expect(res.exitCode).toBe(0);
      // Before the fix, a `cwd` regression (e.g. defaulting to
      // `process.cwd()` — this test process's own working directory, which
      // has neither the env var nor a .env with the key) would construct
      // the 'mock' verifier instead of 'anthropic', silently breaking
      // repo-root .env discovery with NO test failure anywhere in the
      // suite.
      expect(uiConstructedNames).toEqual(['anthropic']);
      expect(err).toEqual([]);
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });

  it('laziness (injected-port case): an injected uiSpecReview port is never invoked when no UI-SPEC.md is present', async () => {
    active = await tempRepo({ initialized: true, projectName: 'spec-approve-ports' });
    const { root } = active;
    await seedSpecOnly(root); // no UI-SPEC.md written

    const uiVerify = vi.fn(async () => {
      throw new Error('uiSpecReview port must not be invoked when no UI-SPEC.md exists');
    });

    const { io } = captureIO();
    const res = await specApproveService(root, { phase: PHASE, num: '01' }, io, {
      uiSpecReview: { verify: uiVerify },
    });

    expect(res.exitCode).toBe(0);
    expect(uiVerify).not.toHaveBeenCalled();
    expect(
      existsSync(join(root, '.cadence', 'phases', PHASE, `${ID}-UI-SPEC-REVIEW.json`)),
    ).toBe(false);
  });
});
