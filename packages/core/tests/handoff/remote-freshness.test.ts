import { afterEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { checkRemoteFreshness } from '../../src/handoff/remote-freshness.js';

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

function gitInit(root: string): void {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
}

describe(
  'checkRemoteFreshness',
  // AC-2 sets up a bare remote, clones it, pushes a new commit, and then runs
  // git fetch. On Windows CI the series of git operations can take ~95s due to
  // FS + AV overhead. 150s gives headroom; non-win32 keeps the 20s global default.
  { timeout: process.platform === 'win32' ? 150_000 : 20_000 },
() => {
  it('AC-2: reports behind>0 when origin has commits this clone lacks', async () => {
    active = await tempRepo({ initialized: true });
    gitInit(active.root);
    execSync('git add -A && git commit -q -m init', { cwd: active.root, stdio: 'ignore' });
    // bare remote + a second clone scoped to this fixture's own unique tmp
    // path (never a literal "../origin.git" — that resolves to a shared,
    // collision-prone path one level above every tempRepo root).
    const originPath = `${active.root}-origin.git`;
    const pc2Path = `${active.root}-pc2`;
    execSync(`git init -q --bare "${originPath}" && git remote add origin "${originPath}" && git push -q -u origin HEAD`,
      { cwd: active.root, stdio: 'ignore' });
    // second clone pushes a commit "from the other PC" — separate execSync
    // calls with `cwd` (not a `cd &&`-chained command) so this runs the same
    // under cmd.exe on Windows CI as under bash elsewhere (no /bin/bash dep).
    execSync(`git clone -q "${originPath}" "${pc2Path}"`, { cwd: active.root, stdio: 'ignore' });
    execSync('git config user.email t@t', { cwd: pc2Path, stdio: 'ignore' });
    execSync('git config user.name t', { cwd: pc2Path, stdio: 'ignore' });
    execSync('git config commit.gpgsign false', { cwd: pc2Path, stdio: 'ignore' });
    execSync('git commit -q --allow-empty -m from-pc2', { cwd: pc2Path, stdio: 'ignore' });
    execSync('git push -q', { cwd: pc2Path, stdio: 'ignore' });

    const r = await checkRemoteFreshness(active.root);
    expect(r.checked).toBe(true);
    expect(r.behind).toBe(1);
  });

  it('AC-2: is soft when there is no upstream', async () => {
    active = await tempRepo({ initialized: true });
    gitInit(active.root);
    execSync('git add -A && git commit -q -m init', { cwd: active.root, stdio: 'ignore' });
    const r = await checkRemoteFreshness(active.root);
    expect(r.checked).toBe(false);
    expect(['fetch-failed', 'no-upstream']).toContain(r.reason);
  });

  it('AC-2: is soft in a non-repo', async () => {
    active = await tempRepo({ initialized: true }); // no git init
    const r = await checkRemoteFreshness(active.root);
    expect(r).toEqual({ checked: false, reason: 'not-a-repo' });
  });
});
