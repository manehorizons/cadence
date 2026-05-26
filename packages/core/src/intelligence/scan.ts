import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoScan } from '@cadence/types';

function git(root: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const p = spawn('git', args, { cwd: root });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', () => resolve({ ok: false, out: '' }));
    p.on('exit', (code) => resolve({ ok: code === 0, out: out.trim() || err.trim() }));
  });
}

async function scanGit(root: string): Promise<RepoScan['git']> {
  const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.out !== 'true') return { available: false };

  const branch = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const porcelain = await git(root, ['status', '--porcelain']);
  const counts = await git(root, [
    'rev-list',
    '--left-right',
    '--count',
    'origin/main...HEAD',
  ]);
  const log = await git(root, ['log', '--oneline', '-5']);

  const result: RepoScan['git'] = {
    available: true,
    branch: branch.ok ? branch.out : undefined,
    dirty: porcelain.ok ? porcelain.out.length > 0 : undefined,
    recentCommits: log.ok && log.out.length > 0 ? log.out.split('\n') : undefined,
  };
  if (counts.ok) {
    // `git rev-list --left-right --count origin/main...HEAD` → "<left>\t<right>";
    // left = commits only in origin/main (behind), right = commits only in HEAD (ahead).
    const [behindStr, aheadStr] = counts.out.split(/\s+/);
    const behind = Number.parseInt(behindStr ?? '', 10);
    const ahead = Number.parseInt(aheadStr ?? '', 10);
    if (Number.isFinite(behind)) result.behind = behind;
    if (Number.isFinite(ahead)) result.ahead = ahead;
  }
  return result;
}

async function scanPkg(root: string): Promise<RepoScan['pkg']> {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return { scripts: {} };
  try {
    const pkg = JSON.parse(await readFile(path, 'utf8')) as {
      name?: string;
      version?: string;
      workspaces?: unknown;
      scripts?: Record<string, unknown>;
    };
    const s = pkg.scripts ?? {};
    return {
      name: typeof pkg.name === 'string' ? pkg.name : undefined,
      version: typeof pkg.version === 'string' ? pkg.version : undefined,
      workspaces: pkg.workspaces !== undefined ? true : undefined,
      scripts: {
        test: 'test' in s ? true : undefined,
        build: 'build' in s ? true : undefined,
        lint: 'lint' in s ? true : undefined,
        typecheck: 'typecheck' in s ? true : undefined,
      },
    };
  } catch {
    return { scripts: {} };
  }
}

async function scanPhases(root: string): Promise<RepoScan['phases']> {
  const dir = join(root, '.cadence', 'phases');
  if (!existsSync(dir)) return { count: 0 };
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const phaseDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    return {
      count: phaseDirs.length,
      latestId: phaseDirs.length > 0 ? phaseDirs[phaseDirs.length - 1] : undefined,
    };
  } catch {
    return { count: 0 };
  }
}

export async function scanRepo(root: string): Promise<RepoScan> {
  const has = (rel: string): boolean => existsSync(join(root, rel));
  return {
    git: await scanGit(root),
    pkg: await scanPkg(root),
    docs: {
      readme: has('README.md'),
      design: has('DESIGN.md'),
      roadmap: has(join('.cadence', 'ROADMAP.md')),
      changelog: has('CHANGELOG.md'),
      docsDir: has('docs'),
    },
    surfaces: { turbo: has('turbo.json') },
    phases: await scanPhases(root),
  };
}
