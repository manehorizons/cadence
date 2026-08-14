import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseDraftMd } from '../../src/parse/draft-parser.js';
import { scanTestCoverage, uncoveredAcs, weaklyLinkedAcs } from '../../src/verify/coverage.js';
import {
  DEMO_ID,
  IMPL_FILE,
  TEST_FILE,
  SANDBOX_CONFIG,
  GREET_IMPL,
  GUTTED_TEST,
  HONEST_TEST,
  renderGreetDraft,
} from '../../src/demo/fixtures.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-demo-fixtures-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

describe('demo fixtures (phase 278)', () => {
  it('renders a parseable draft linking T1 to AC-1', () => {
    const { id, content } = renderGreetDraft();
    expect(id).toBe(DEMO_ID);
    const draft = parseDraftMd(content);
    expect(draft.acceptanceCriteria.map((a) => a.id)).toContain('AC-1');
    const t1 = draft.tasks.find((t) => t.id === 'T1');
    expect(t1?.done).toMatch(/AC-1/);
    expect(t1?.files).toContain(IMPL_FILE);
  });

  it('sandbox config runs real assertion-mode coverage with a real test command and no bypass baked in', () => {
    expect(SANDBOX_CONFIG.profile).toBe('standard');
    expect(SANDBOX_CONFIG.verification?.coverageMode).toBe('assertion');
    expect(SANDBOX_CONFIG.verification?.coverageScheme).toBe('bare');
    expect(SANDBOX_CONFIG.verification?.testCommand).toBe('node --test');
    expect(SANDBOX_CONFIG.verification?.testGlobs).toContain('**/*.test.mjs');
    expect(JSON.stringify(SANDBOX_CONFIG)).not.toMatch(/allowMissingCoverage/);
  });

  // The gutted fixture is genuinely present-but-non-asserting -- the
  // assertion-mode coverage scan must flag its AC token as mentioned but not
  // inside a recognized asserting test block (the "weak link" bucket the
  // settle test-coverage gate refuses on and cites verbatim: "mentioned but
  // not inside a recognized asserting test block"). The AC token itself is
  // deliberately kept out of this comment: `scanTestCoverage` dedupes by
  // first occurrence per (id, file), and a bare comment mention here would
  // shadow the real, asserting-block-scoped occurrence in the `it()` title
  // below.
  it('278-01/AC-1: GUTTED_TEST calls greet() but the coverage scan finds no qualifying span for AC-1', async () => {
    expect(GUTTED_TEST).toMatch(/\bAC-1\b/);
    const root = tempRepo();
    await writeFile(join(root, IMPL_FILE), GREET_IMPL, 'utf8');
    await writeFile(join(root, TEST_FILE), GUTTED_TEST, 'utf8');
    const cov = await scanTestCoverage(root, {
      globs: SANDBOX_CONFIG.verification?.testGlobs,
      mode: 'assertion',
    });
    // Mentioned (has a ref) -- but not covered in the qualifying sense.
    expect(uncoveredAcs(['AC-1'], cov)).toEqual([]);
    // The gate's exact "weak link" bucket: mentioned, never qualifying.
    expect(weaklyLinkedAcs(['AC-1'], cov)).toEqual(['AC-1']);
    expect(cov.get('AC-1')?.every((r) => r.qualifying === false)).toBe(true);
    // The gutted test still runs cleanly under `node --test` -- it calls
    // greet(), it just never asserts on the result. The coverage gate is
    // what refuses this fixture, not a runtime crash.
    execFileSync(process.execPath, ['--test'], { cwd: root, stdio: 'ignore' });
  });

  // After the fix beat swaps in the honest assertion, the scan must find a
  // genuinely qualifying span for the AC token -- real coverage, never a
  // hand-waved pass -- and the test must actually pass under node --test.
  // (Same dedup-shadowing reason as above for keeping the token out of this
  // comment.)
  it('278-01/AC-2: HONEST_TEST asserts on greet() and the coverage scan finds a qualifying span for AC-1', async () => {
    expect(HONEST_TEST).toMatch(/\bAC-1\b/);
    const root = tempRepo();
    await writeFile(join(root, IMPL_FILE), GREET_IMPL, 'utf8');
    await writeFile(join(root, TEST_FILE), HONEST_TEST, 'utf8');
    const cov = await scanTestCoverage(root, {
      globs: SANDBOX_CONFIG.verification?.testGlobs,
      mode: 'assertion',
    });
    expect(uncoveredAcs(['AC-1'], cov)).toEqual([]);
    expect(weaklyLinkedAcs(['AC-1'], cov)).toEqual([]);
    expect(cov.get('AC-1')?.some((r) => r.qualifying === true)).toBe(true);
    // Throws (non-zero exit) if the test fails -- passing means no throw.
    execFileSync(process.execPath, ['--test'], { cwd: root, stdio: 'ignore' });
  });
});
