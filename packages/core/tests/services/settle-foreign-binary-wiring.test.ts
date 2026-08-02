import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState, type CadenceConfig } from '@thomas-powers-jr/cadence-types';
import type { CommandIO } from '../../src/services/io.js';
import { settleService, resolveForeignBinaryFacts } from '../../src/services/settle.js';

// Phase 244 T2 (second and third acceptance criteria of 244-01): wiring of T1's pure
// `detectForeignCadenceBinary` into `settleService` — the banner + SUMMARY
// provenance field. `settle-binary-guard.test.ts` (T1, untouched here)
// covers the pure detector directly; this file covers the impure-shell
// resolver (`resolveForeignBinaryFacts`) plus the full settle call site.

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

async function mktemp(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), 'cadence-settle-foreign-binary-')));
}

function draftMd(phase: string, id: string): string {
  return `---
phase: ${phase}
id: ${id}
tier: standard
status: APPROVED
---

# ${id} — demo

## Objective

Prove foreign-binary guard wiring.

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
}

/** A BUILD-state cadence repo with a single DONE task — mirrors
 *  `settle.test.ts`'s `setupBuildRepo` (same fixture shape), trimmed to
 *  what this file needs (no tier param — always standard). */
async function setupBuildRepo(args: {
  root: string;
  phase: string;
  id: string;
  config: CadenceConfig;
}): Promise<void> {
  const { root, phase, id, config } = args;
  const phaseDir = join(root, '.cadence', 'phases', phase);
  await mkdir(phaseDir, { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'foo.ts'), 'export const x = 1;\n', 'utf8');
  await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(config, null, 2));
  const state = {
    ...emptyState('settle-foreign-binary'),
    loopPosition: 'BUILD' as const,
    activePhase: phase,
    activeDraft: id,
  };
  await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
  await writeFile(join(phaseDir, `${id}-DRAFT.md`), draftMd(phase, id));
  await writeFile(
    join(phaseDir, `${id}-PROGRESS.json`),
    JSON.stringify({ draftId: id, tasks: { T1: { status: 'DONE' } } }, null, 2),
  );
}

/** Scaffolds enough of "this repo's own CADENCE build" for
 *  `repoHasOwnCadenceBuild` to read true: `packages/core/bin/cadence.cjs`
 *  under `root` (`.cadence/` already exists via `setupBuildRepo`). */
async function scaffoldOwnCadenceBuild(root: string): Promise<string> {
  const binDir = join(root, 'packages', 'core', 'bin');
  await mkdir(binDir, { recursive: true });
  const binPath = join(binDir, 'cadence.cjs');
  await writeFile(binPath, '// stub cadence.cjs for phase 244 T2 tests\n');
  return binPath;
}

const CONFIG: CadenceConfig = {
  ...defaultConfig,
  // Phase 214 (T4) precedent (see settle-ship-ref.test.ts): these fixtures
  // have no real AC-1 coverage and predate gates.evidenceFloor — relax it so
  // the unrelated evidence-floor gate never refuses these settles.
  gates: { sealed: [], evidenceFloor: 'unverified' as const },
};

let root: string | null = null;
afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    root = null;
  }
});

describe('settleService wires the foreign-binary guard into the settle pipeline (phase 244 T2)', () => {
  it('244-01/AC-2: a repo with its own local build, settled by a binary resolving outside it, emits the banner on stderr and records foreignBinaryMismatch on the written SUMMARY', async () => {
    root = await mktemp();
    await setupBuildRepo({ root, phase: '244-fb-mismatch', id: '244-01', config: CONFIG });
    await scaffoldOwnCadenceBuild(root);
    // No argv/fs mocking needed: the real vitest worker process executing
    // this test is genuinely NOT inside this freshly minted tempdir, so
    // `settleService`'s real `process.argv[1]` resolution produces a true
    // mismatch here on its own.

    const { io, err } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);
    const errText = err.join('');
    expect(errText).toContain('SETTLING VIA A FOREIGN CADENCE BINARY');
    expect(errText).toContain('repo toplevel:');
    expect(errText).toContain(root);

    const summaryPath = join(
      root, '.cadence', 'phases', '244-fb-mismatch', '244-01-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as {
      foreignBinaryMismatch?: { runningBinaryPath: string; repoToplevel: string };
    };
    expect(summary.foreignBinaryMismatch).toBeDefined();
    expect(summary.foreignBinaryMismatch?.repoToplevel).toBe(root);
    expect(summary.foreignBinaryMismatch?.runningBinaryPath).not.toBe('');
    expect(summary.foreignBinaryMismatch?.runningBinaryPath.startsWith(root)).toBe(false);
  });

  it('settleService integration regression: without a scaffolded local build (the ordinary shape of every other settle fixture in this suite, so repoHasOwnCadenceBuild is false), no banner is printed and foreignBinaryMismatch is genuinely absent (not false/null) from the written SUMMARY — AC-3\'s specific "matched, own local build" no-mismatch case is covered directly by resolveForeignBinaryFacts\'s unit tests below', async () => {
    root = await mktemp();
    await setupBuildRepo({ root, phase: '244-fb-clean', id: '244-02', config: CONFIG });
    // Deliberately do NOT scaffold packages/core/bin/cadence.cjs.

    const { io, err } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);
    expect(err.join('')).not.toContain('FOREIGN CADENCE BINARY');

    const summaryPath = join(
      root, '.cadence', 'phases', '244-fb-clean', '244-02-SUMMARY.json',
    );
    const raw = await readFile(summaryPath, 'utf8');
    const summary = JSON.parse(raw) as Record<string, unknown>;
    // exactOptionalPropertyTypes' omit-the-key contract: genuinely absent,
    // not present-and-falsy.
    expect(Object.prototype.hasOwnProperty.call(summary, 'foreignBinaryMismatch')).toBe(false);
    expect(raw).not.toContain('foreignBinaryMismatch');
  });
});

describe('resolveForeignBinaryFacts (phase 244 T2)', () => {
  it("244-01/AC-3: reports no mismatch (null) when the running binary genuinely resolves inside the repo toplevel — 'this very phase must be settled that way' (244-01 Objective)", async () => {
    root = await mktemp();
    const binPath = await scaffoldOwnCadenceBuild(root);
    await mkdir(join(root, '.cadence'), { recursive: true });

    expect(resolveForeignBinaryFacts(root, binPath)).toBeNull();
  });

  it('244-01/AC-2: reports a mismatch when the running binary genuinely resolves outside the repo toplevel and the repo has its own build', async () => {
    root = await mktemp();
    await scaffoldOwnCadenceBuild(root);
    await mkdir(join(root, '.cadence'), { recursive: true });

    // process.execPath (the real node binary) always exists on disk and is
    // never inside a freshly minted tempdir — realpathSync it ourselves for
    // the expected value since execPath may itself be a symlink (e.g. nvm).
    const expectedRealBin = realpathSync(process.execPath);
    const result = resolveForeignBinaryFacts(root, process.execPath);
    expect(result).toEqual({ runningBinaryPath: expectedRealBin, repoToplevel: root });
  });

  it('degrades to no mismatch (never throws) when argv1 does not resolve on disk', async () => {
    root = await mktemp();
    await scaffoldOwnCadenceBuild(root);
    await mkdir(join(root, '.cadence'), { recursive: true });

    expect(resolveForeignBinaryFacts(root, join(root, 'does-not-exist.js'))).toBeNull();
  });

  it('degrades to no mismatch when argv1 is undefined', () => {
    expect(resolveForeignBinaryFacts('/does/not/matter', undefined)).toBeNull();
  });
});
