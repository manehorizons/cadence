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

describe('checkRemoteFreshness', () => {
  it('reports behind>0 when origin has commits this clone lacks', async () => {
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
    // second clone pushes a commit "from the other PC"
    execSync(
      `git clone -q "${originPath}" "${pc2Path}" && cd "${pc2Path}" && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m from-pc2 && git push -q`,
      { cwd: active.root, stdio: 'ignore', shell: '/bin/bash' },
    );

    const r = await checkRemoteFreshness(active.root);
    expect(r.checked).toBe(true);
    expect(r.behind).toBe(1);
  });

  it('is soft when there is no upstream', async () => {
    active = await tempRepo({ initialized: true });
    gitInit(active.root);
    execSync('git add -A && git commit -q -m init', { cwd: active.root, stdio: 'ignore' });
    const r = await checkRemoteFreshness(active.root);
    expect(r.checked).toBe(false);
    expect(['fetch-failed', 'no-upstream']).toContain(r.reason);
  });

  it('is soft in a non-repo', async () => {
    active = await tempRepo({ initialized: true }); // no git init
    const r = await checkRemoteFreshness(active.root);
    expect(r).toEqual({ checked: false, reason: 'not-a-repo' });
  });
});
