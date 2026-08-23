// Phase 292 (292-01, T2) — end-to-end proof that a pack's `gates[].add`
// delta actually ENFORCES at a real `effectiveGateSet` call site, not just
// that `effectiveGateSet` unions it in isolation (that's engine.test.ts's
// job, T1). Direct-call style against the services, matching this
// directory's existing `draft-new.test.ts` / `spec-approve.test.ts`
// fixtures rather than the CLI-spawn style — no `dist` dependency.
//
// Site chosen for the AC-1 end-to-end: `draft-approve.ts`, because its
// gate set drives a *refusal* (the manual approve gate), so "the pack's
// gate fired" is observable as a binary exit-code + state-mutation
// difference rather than a log line.
//
// Site chosen for the AC-2 explicit-`[]` case: `notify/loop-violation.ts`,
// whose config load is `loadConfig(cwd).catch(() => null)`. When that
// yields `null` there is no `config.packs` to resolve against at all, so
// `[]` is forced rather than chosen — the genuine AC-2 shape.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState, defaultConfig } from '@thomas-powers-jr/cadence-types';
import { draftApproveService } from '../../src/services/draft-approve.js';
import { emitLoopViolation } from '../../src/notify/loop-violation.js';
import { LoopViolationError } from '../../src/errors.js';
import { SimpleStateBackend } from '../../src/state/simple.js';
import type { CommandIO } from '../../src/services/io.js';

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

let root: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
    root = undefined;
  }
});

const PHASE = '01-foundation';
const DRAFT_ID = '01-01';

/**
 * A DRAFT that is coherence-clean (no PROJECT.md, so no `PROJECT_FORBIDDEN`
 * blocker) and `tier: standard`. With the fixture config's `profile: auto`
 * the effective cell is auto × standard — whose DELTAS are
 * `test-coverage, anomaly-notify, task-verify-required`, deliberately
 * WITHOUT `approve`. That absence is what the pack under test supplies.
 */
const DRAFT_MD = `---
phase: ${PHASE}
id: ${DRAFT_ID}
tier: standard
status: PENDING
---

# ${DRAFT_ID} — Pack gate enforcement fixture

## Objective

Prove a pack-contributed gate reaches a real call site.

## Acceptance Criteria

### AC-1: It enforces
Given a pack When approve runs Then the gate fires.

## Tasks

### T1: Do the thing
- files: \`src/foo.ts\`
- action: do the thing
- verify: run the test
- stop: the test is green
- done: AC-1

## Boundaries

- DO NOT touch anything else.
`;

/** A minimal cadence repo with an IDLE state, a DRAFT, and a config. */
async function mktemp(configPatch: Record<string, unknown>): Promise<string> {
  const r = await mkdtemp(join(tmpdir(), 'cadence-packs-slice3-'));
  await mkdir(join(r, '.cadence', 'phases', PHASE), { recursive: true });
  const state = emptyState('packs-slice3-test');
  state.loopPosition = 'DRAFT';
  await new SimpleStateBackend(r).commit(state);
  await writeFile(
    join(r, '.cadence', 'phases', PHASE, `${DRAFT_ID}-DRAFT.md`),
    DRAFT_MD,
    'utf8',
  );
  await writeFile(
    join(r, '.cadence', 'config.json'),
    JSON.stringify({ ...defaultConfig, ...configPatch }, null, 2),
    'utf8',
  );
  return r;
}

/** Drop a local pack manifest at `.cadence/packs/<id>/pack.json`. */
async function writePack(r: string, id: string, manifest: unknown): Promise<void> {
  const dir = join(r, '.cadence', 'packs', id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'pack.json'), JSON.stringify(manifest), 'utf8');
}

const GATE_PACK = {
  id: 'cadence/approve-pack',
  version: '1.0.0',
  gates: [{ profile: 'auto', tier: 'standard', add: ['approve'] }],
};

describe('292-01/AC-1 — a pack-contributed gate enforces at the draft-approve call site', () => {
  it('292-01/AC-1: control — with NO pack enabled, auto × standard carries no `approve` gate, so draft approve succeeds and transitions to BUILD', async () => {
    root = await mktemp({ profile: 'auto', packs: { enabled: [], disabled: [] } });
    // The pack manifest is present ON DISK but not enabled — resolution must
    // ignore it, so this control also proves enablement (not mere presence)
    // is what contributes.
    await writePack(root, 'cadence/approve-pack', GATE_PACK);
    // Would answer "no" to the manual approve prompt — but the gate must not
    // fire at all here, so the scripted answer is never consumed.
    vi.stubEnv('CADENCE_PROMPTER_SCRIPT', 'n\n');

    const { io, out } = captureIO();
    const res = await draftApproveService(root, { phase: PHASE, num: '01' }, io);

    expect(res.exitCode).toBe(0);
    expect(out.join('')).toContain(`Approved ${DRAFT_ID}; loopPosition=BUILD`);
    const after = await new SimpleStateBackend(root).readState();
    expect(after.loopPosition).toBe('BUILD');
  });

  it('292-01/AC-1: enabled pack adding `approve` for the active (auto, standard) cell makes the manual approve gate fire — draft approve refuses and state is NOT mutated', async () => {
    root = await mktemp({
      profile: 'auto',
      packs: { enabled: ['cadence/approve-pack'], disabled: [] },
    });
    await writePack(root, 'cadence/approve-pack', GATE_PACK);
    vi.stubEnv('CADENCE_PROMPTER_SCRIPT', 'n\n');

    const { io } = captureIO();
    const res = await draftApproveService(root, { phase: PHASE, num: '01' }, io);

    // The gate the pack added is the ONLY reason this refuses: the control
    // above is byte-identical apart from `packs.enabled`.
    expect(res.exitCode).toBe(1);
    const after = await new SimpleStateBackend(root).readState();
    expect(after.loopPosition).toBe('DRAFT');
    expect(after.activeDraft).toBeNull();
  });

  it('292-01/AC-1: a pack delta targeting a DIFFERENT (profile, tier) cell contributes nothing at this call site — draft approve still succeeds', async () => {
    root = await mktemp({
      profile: 'auto',
      packs: { enabled: ['cadence/approve-pack'], disabled: [] },
    });
    await writePack(root, 'cadence/approve-pack', {
      ...GATE_PACK,
      // strict × complex — not the active cell (auto × standard).
      gates: [{ profile: 'strict', tier: 'complex', add: ['approve'] }],
    });
    vi.stubEnv('CADENCE_PROMPTER_SCRIPT', 'n\n');

    const { io } = captureIO();
    const res = await draftApproveService(root, { phase: PHASE, num: '01' }, io);

    expect(res.exitCode).toBe(0);
    const after = await new SimpleStateBackend(root).readState();
    expect(after.loopPosition).toBe('BUILD');
  });

  it('292-01/AC-1: a disabled id wins over enabled (tighten-only resolution), so the pack gate does not fire and draft approve succeeds', async () => {
    root = await mktemp({
      profile: 'auto',
      packs: { enabled: ['cadence/approve-pack'], disabled: ['cadence/approve-pack'] },
    });
    await writePack(root, 'cadence/approve-pack', GATE_PACK);
    vi.stubEnv('CADENCE_PROMPTER_SCRIPT', 'n\n');

    const { io } = captureIO();
    const res = await draftApproveService(root, { phase: PHASE, num: '01' }, io);

    expect(res.exitCode).toBe(0);
    const after = await new SimpleStateBackend(root).readState();
    expect(after.loopPosition).toBe('BUILD');
  });
});

describe('292-01/AC-2 — the forced explicit-`[]` call site behaves exactly as before', () => {
  it('292-01/AC-2: emitLoopViolation with an unreadable config passes `[]` (no config ⇒ no `config.packs` to resolve against): an on-disk pack manifest contributes nothing, notification falls back to stderr, and nothing throws', async () => {
    // Config that would have selected the FILE transport, plus a pack that
    // would have added `anomaly-notify` — both are on disk...
    root = await mktemp({
      profile: 'strict',
      notify: { transport: 'file', file: '.cadence/anomalies.log' },
      packs: { enabled: ['cadence/notify-pack'], disabled: [] },
    });
    await writePack(root, 'cadence/notify-pack', {
      id: 'cadence/notify-pack',
      version: '1.0.0',
      gates: [{ profile: 'strict', tier: 'standard', add: ['anomaly-notify'] }],
    });
    // ...but the config is corrupt, so `loadConfig(cwd).catch(() => null)`
    // yields null and the site passes `[]` explicitly.
    await writeFile(join(root, '.cadence', 'config.json'), '{ not json', 'utf8');

    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      await expect(
        emitLoopViolation(root, new LoopViolationError('boom'), 'test.source'),
      ).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }

    // Unchanged pre-phase behavior: null config ⇒ profile falls back to
    // 'auto' (which already carries anomaly-notify) and the transport falls
    // back to stderr. The pack's file-transport-era manifest is never read.
    expect(writes.join('')).toContain('loop-violation');
    expect(existsSync(join(root, '.cadence', 'anomalies.log'))).toBe(false);
    // And the corrupt config really is corrupt (guards against the fixture
    // silently repairing itself).
    await expect(readFile(join(root, '.cadence', 'config.json'), 'utf8')).resolves.toBe(
      '{ not json',
    );
  });
});
