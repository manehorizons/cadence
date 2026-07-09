// packages/core/tests/handoff/git-facts.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { readGitFacts } from '../../src/handoff/git-facts.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) { await active.cleanup(); active = null; }
});

function gitInit(root: string): void {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
}

describe('readGitFacts', () => {
  it('AC-3: returns available facts with branch + head in a git repo', async () => {
    active = await tempRepo({ initialized: true });
    gitInit(active.root);
    execSync('git add -A', { cwd: active.root, stdio: 'ignore' });
    execSync('git commit -q -m init', { cwd: active.root, stdio: 'ignore' });

    const facts = await readGitFacts(active.root);
    expect(facts.available).toBe(true);
    if (facts.available) {
      expect(facts.branch.length).toBeGreaterThan(0);
      expect(facts.head.length).toBeGreaterThan(0);
      expect(facts.dirty).toBe(false);
    }
  });

  it('AC-4: reports dirty when there are uncommitted changes', async () => {
    active = await tempRepo({ initialized: true });
    gitInit(active.root);
    execSync('git add -A', { cwd: active.root, stdio: 'ignore' });
    execSync('git commit -q -m init', { cwd: active.root, stdio: 'ignore' });
    execSync('git rm --cached -q .cadence/state.json', { cwd: active.root, stdio: 'ignore' });

    const facts = await readGitFacts(active.root);
    expect(facts.available && facts.dirty).toBe(true);
  });

  it('AC-5: returns { available: false } in a non-git directory and never throws', async () => {
    active = await tempRepo({ initialized: true }); // no git init
    const facts = await readGitFacts(active.root);
    expect(facts).toEqual({ available: false });
  });

  it('fetches from origin before reading facts and reports fetched=true', async () => {
    active = await tempRepo({ initialized: true });
    gitInit(active.root);
    execSync('git add -A && git commit -q -m init', { cwd: active.root, stdio: 'ignore' });
    // bare remote scoped to this fixture's own unique tmp path (never a
    // literal "../origin.git" — that resolves to a shared, collision-prone
    // path one level above every tempRepo root).
    const originPath = `${active.root}-origin.git`;
    execSync(`git init -q --bare "${originPath}" && git remote add origin "${originPath}" && git push -q -u origin HEAD`,
      { cwd: active.root, stdio: 'ignore' });

    const facts = await readGitFacts(active.root, { fetch: true });
    expect(facts.available && facts.fetched).toBe(true);
  });

  it('fetch failure is soft: facts still available, fetched=false', async () => {
    active = await tempRepo({ initialized: true });
    gitInit(active.root);
    execSync('git add -A && git commit -q -m init', { cwd: active.root, stdio: 'ignore' });
    // a remote pointing nowhere → fetch genuinely fails (a bare "no remote
    // configured" repo is not enough: git fetch with zero remotes is a
    // silent no-op that exits 0 on this git version).
    execSync('git remote add origin /nonexistent/path/origin.git', { cwd: active.root, stdio: 'ignore' });
    const facts = await readGitFacts(active.root, { fetch: true });
    expect(facts.available).toBe(true);
    if (facts.available) expect(facts.fetched).toBe(false);
  });

  it('default is no fetch: fetched=false without a fetch attempt', async () => {
    active = await tempRepo({ initialized: true });
    gitInit(active.root);
    execSync('git add -A && git commit -q -m init', { cwd: active.root, stdio: 'ignore' });
    const facts = await readGitFacts(active.root);
    expect(facts.available && !facts.fetched).toBe(true);
  });
});
