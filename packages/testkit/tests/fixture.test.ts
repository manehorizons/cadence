import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '../src/fixture.js';

let active: Fixture | null = null;

afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('tempRepo', () => {
  it('creates an empty repo with no .cadence/ by default', async () => {
    active = await tempRepo();
    expect(existsSync(active.root)).toBe(true);
    expect(existsSync(join(active.root, '.cadence'))).toBe(false);
  });

  it('scaffolds .cadence/ when initialized=true', async () => {
    active = await tempRepo({ initialized: true, projectName: 'myproj' });
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.schemaVersion).toBe(1);
    const state = JSON.parse(readFileSync(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.project.name).toBe('myproj');
  });

  it('returns a canonical (realpath-resolved) root (AC-1)', async () => {
    // On macOS, mkdtemp(tmpdir()) yields /tmp/... while a spawned child's
    // process.cwd() reports the realpath'd /private/tmp/... — tests that read
    // back files at fixture.root then mismatch. The fixture must hand out the
    // OS-canonical path so root === realpath(root) on every platform.
    active = await tempRepo({ initialized: true });
    expect(active.root).toBe(await realpath(active.root));
    // Scaffolding still lands under the canonical root.
    expect(existsSync(join(active.root, '.cadence/config.json'))).toBe(true);
  });

  it('cleanup() removes the temp dir (AC-2)', async () => {
    active = await tempRepo();
    const path = active.root;
    await active.cleanup();
    active = null;
    expect(existsSync(path)).toBe(false);
  });

  it('cleanup() resolves (does not throw) on the happy path (AC-2)', async () => {
    // The win32 best-effort swallow path (EBUSY on a held handle) is exercised
    // on the windows-latest CI leg; here we lock the off-Windows contract that
    // a normal cleanup completes without throwing.
    const fx = await tempRepo({ initialized: true });
    await expect(fx.cleanup()).resolves.toBeUndefined();
  });
});
