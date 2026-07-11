import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the repo root from this test file's location:
// packages/core/tests/docs → ../../../.. → repo root
const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);

const DEMO_DIR = join(REPO_ROOT, 'examples', 'demo-test-gutting');
const RUN_DEMO_SH = join(DEMO_DIR, 'run-demo.sh');
const README_MD = join(DEMO_DIR, 'README.md');
const ZIP_PATH = join(REPO_ROOT, 'docs', 'demo-test-gutting.zip');
const DEMO_MD_DUPLICATE = join(DEMO_DIR, 'DEMO.md');
const PACKAGE_JSON = join(DEMO_DIR, 'package.json');
const NODE_MODULES = join(DEMO_DIR, 'node_modules');

// Phase 168 — examples/demo-test-gutting/ is a committed, runnable demo of
// the test-coverage gate catching a gutted test suite. This repo's own
// CADENCE config runs in assertion coverage mode, so this phase's ACs (about
// a shell script + doc reconciliation, not unit-testable app logic) need a
// qualifying test to let `settle run --auto` find coverage for AC-1..AC-3.
describe('demo-test-gutting example (phase 168)', () => {
  it('run-demo.sh is present and executable, and no stray zip is committed (AC-1)', () => {
    expect(existsSync(RUN_DEMO_SH)).toBe(true);
    // Windows/NTFS has no POSIX executable bit — fs.stat always reports 0 for
    // the execute bits there regardless of git's recorded file mode, so this
    // check is meaningful only on POSIX platforms (matches the doc-sync-hook
    // test's `isWindows` pattern for the same class of platform limitation).
    if (process.platform !== 'win32') {
      const mode = statSync(RUN_DEMO_SH).mode;
      expect(mode & 0o111).toBeTruthy();
    }
    expect(existsSync(ZIP_PATH)).toBe(false);
  });

  it('README points at docs/DEMO.md as the single transcript copy (AC-2)', () => {
    expect(existsSync(README_MD)).toBe(true);
    const readme = readFileSync(README_MD, 'utf8');
    expect(readme).toMatch(/DEMO\.md/);
    expect(existsSync(DEMO_MD_DUPLICATE)).toBe(false);
  });

  it('demo directory has zero deps beyond node:test/node:assert (AC-3)', () => {
    expect(existsSync(PACKAGE_JSON)).toBe(false);
    expect(existsSync(NODE_MODULES)).toBe(false);
  });
});
