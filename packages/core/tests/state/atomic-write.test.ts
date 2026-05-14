import { describe, it, expect, afterEach } from 'vitest';
import { readFile, existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { atomicWriteJSON } from '../../src/state/atomic-write.js';

const readFileP = promisify(readFile);
let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('atomicWriteJSON', () => {
  it('writes JSON to the target path', async () => {
    active = await tempRepo();
    const path = join(active.root, 'a.json');
    await atomicWriteJSON(path, { x: 1 });
    const contents = await readFileP(path, 'utf8');
    expect(JSON.parse(contents)).toEqual({ x: 1 });
  });

  it('removes the temp file after successful rename', async () => {
    active = await tempRepo();
    const path = join(active.root, 'a.json');
    await atomicWriteJSON(path, { x: 1 });
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });
});
