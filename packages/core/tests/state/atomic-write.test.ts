import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFile, stat } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { atomicWriteJSON, atomicWriteText } from '../../src/state/atomic-write.js';

// Wraps the real `writeFile` in a spy (behavior unchanged) so we can assert
// *how* atomicWrite invoked it — specifically, that `mode` travels in on the
// same call that creates the tmp file rather than via a later `chmod`. A
// real chmod-after-write race can't be observed deterministically (it's a
// timing window), but asserting the create call itself carries `mode`
// proves the window is closed by construction.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

const readFileP = promisify(readFile);
const statP = promisify(stat);
let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
  vi.mocked(writeFile).mockClear();
});

describe('atomicWriteJSON', () => {
  it('writes JSON to the target path', async () => {
    active = await tempRepo();
    const path = join(active.root, 'a.json');
    await atomicWriteJSON(path, { x: 1 });
    const contents = await readFileP(path, 'utf8');
    expect(JSON.parse(contents)).toEqual({ x: 1 });
  });

  it('leaves no temp file after successful rename', async () => {
    active = await tempRepo();
    const path = join(active.root, 'a.json');
    await atomicWriteJSON(path, { x: 1 });
    const leftover = (await readdir(active.root)).filter((f) =>
      f.endsWith('.tmp'),
    );
    expect(leftover).toEqual([]);
  });

  it('AC-4: with no mode passed, still writes successfully with default permissions', async () => {
    active = await tempRepo();
    const path = join(active.root, 'default.json');
    await atomicWriteJSON(path, { x: 1 });
    const contents = await readFileP(path, 'utf8');
    expect(JSON.parse(contents)).toEqual({ x: 1 });
  });

  it.skipIf(process.platform === 'win32')(
    'AC-4: with { mode: 0o600 } produces a file mode of 0o600 on POSIX',
    async () => {
      active = await tempRepo();
      const path = join(active.root, 'secret.json');
      await atomicWriteJSON(path, { x: 1 }, { mode: 0o600 });
      const st = await statP(path);
      expect(st.mode & 0o777).toBe(0o600);
    },
  );

  it(
    'AC-4: passes mode into the writeFile create call directly (no chmod-after-write race)',
    async () => {
      active = await tempRepo();
      const path = join(active.root, 'secret-create.json');
      await atomicWriteJSON(path, { x: 1 }, { mode: 0o600 });

      const mockWriteFile = vi.mocked(writeFile);
      const tmpCall = mockWriteFile.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].startsWith(`${path}.`),
      );
      expect(tmpCall).toBeDefined();
      // The tmp file's creation call itself must carry the mode — never a
      // separate chmod() after the fact, which would leave a window where
      // the file exists on disk at the process-default (umask) mode.
      expect(tmpCall?.[2]).toMatchObject({ mode: 0o600 });
    },
  );
});

describe('atomicWriteText', () => {
  it('with no mode passed, still writes successfully with default permissions', async () => {
    active = await tempRepo();
    const path = join(active.root, 'default.txt');
    await atomicWriteText(path, 'hello');
    const contents = await readFileP(path, 'utf8');
    expect(contents).toBe('hello');
  });

  it.skipIf(process.platform === 'win32')(
    'AC-4: with { mode: 0o600 } produces a file mode of 0o600 on POSIX',
    async () => {
      active = await tempRepo();
      const path = join(active.root, 'secret.txt');
      await atomicWriteText(path, 'hello', { mode: 0o600 });
      const st = await statP(path);
      expect(st.mode & 0o777).toBe(0o600);
    },
  );
});
