import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
  it('creates an empty repo with no .keel/ by default', async () => {
    active = await tempRepo();
    expect(existsSync(active.root)).toBe(true);
    expect(existsSync(join(active.root, '.keel'))).toBe(false);
  });

  it('scaffolds .keel/ when initialized=true', async () => {
    active = await tempRepo({ initialized: true, projectName: 'myproj' });
    const cfg = JSON.parse(readFileSync(join(active.root, '.keel/config.json'), 'utf8'));
    expect(cfg.schemaVersion).toBe(1);
    const state = JSON.parse(readFileSync(join(active.root, '.keel/state.json'), 'utf8'));
    expect(state.project.name).toBe('myproj');
  });

  it('cleanup() removes the temp dir', async () => {
    active = await tempRepo();
    const path = active.root;
    await active.cleanup();
    active = null;
    expect(existsSync(path)).toBe(false);
  });
});
