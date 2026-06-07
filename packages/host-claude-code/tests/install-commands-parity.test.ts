import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { installCommands } from '../src/install-commands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(__dirname, 'fixtures/golden-root/.claude/commands');

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

/**
 * Phase 77 regression guard: extracting the guidance prose into the shared
 * `@manehorizons/cadence-types` module must leave the rendered slash-command
 * files BYTE-IDENTICAL. The golden fixtures were captured from the
 * pre-extraction renderer; this test fails if any byte drifts. (AC-1)
 */
describe('install-commands parity after guidance extraction (phase 77)', () => {
  it('AC-1: rendered command files are byte-identical to the golden fixtures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cadence-parity-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    await installCommands(root);
    const dir = join(root, '.claude/commands');

    const got = (await readdir(dir)).sort();
    const expected = (await readdir(GOLDEN)).sort();
    expect(got).toEqual(expected);

    for (const name of expected) {
      const a = await readFile(join(dir, name), 'utf8');
      const b = await readFile(join(GOLDEN, name), 'utf8');
      expect(a, `byte mismatch in ${name}`).toBe(b);
    }
  });
});
