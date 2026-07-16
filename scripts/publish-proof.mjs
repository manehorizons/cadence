#!/usr/bin/env node
// Reversible publish proof: ephemeral verdaccio -> real pnpm publish of the 3
// publishable @manehorizons/cadence-* packages -> clean-dir install -> assert no
// workspace: leak + both bins run -> exercise the real init->draft->approve->
// build->settle loop against the installed CLI -> unconditional Windows-safe
// teardown. NO non-localhost registry is contacted for *publish* (transitive
// deps proxy npmjs for *install* only).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REG = 'http://localhost:4873';
const REPO = process.cwd();
const PKGS = ['types', 'core', 'host-claude-code']; // publish order: types first (dep of the others)
const WIN = process.platform === 'win32';
const tmps = [];
function tmp(p) { const d = mkdtempSync(join(tmpdir(), p)); tmps.push(d); return d; }
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: WIN, ...opts });
}
export function must(r, label) {
  if (!r || r.status !== 0) {
    console.error(`FAIL ${label}\n--- stdout ---\n${(r && r.stdout) || ''}\n--- stderr ---\n${(r && r.stderr) || ''}`);
    throw new Error(label);
  }
}
// Kill the whole child tree. With shell:true on Windows, vc.pid is cmd.exe —
// its npx->node->verdaccio descendants survive a plain process.kill(pid).
// taskkill /T kills the tree; POSIX gets SIGTERM. This is the AC-3 fix.
function killTree(pid) {
  if (pid == null) return;
  if (WIN) { try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
  else { try { process.kill(pid, 'SIGTERM'); } catch {} }
}
async function ping() { try { const r = await fetch(REG + '/-/ping'); return r.ok || r.status === 404; } catch { return false; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Exercise the real DRAFT->BUILD->SETTLE loop against the just-installed
// `cadence` bin inside the clean temp project, so a broken published
// artifact (missing dist files, bad bin shebang/dispatch, ESM resolution
// failure) is caught here, not just by `--help` printing. Uses the
// deterministic `01-smoke-loop` phase slug that `cadence draft new
// --title=smoke-loop` always derives in a fresh project, a `quick-fix` tier
// draft (no test-coverage gate under the `auto` gate profile a git-less temp
// project resolves to), and `--allow-failing-build` because the temp
// project's `npm init -y` package.json ships a placeholder `npm test` script
// that always exits 1 — unrelated to whether the published cadence bins work.
// Pure description of exerciseLoop's step sequence — single source of truth
// for both the runtime loop below and the unit test, so the two can never
// drift apart. Each tuple is [cmd, args, label, opts].
export function exerciseLoopSteps(proj) {
  const opts = { cwd: proj };
  return [
    ['npx', ['cadence', 'init', '--name=publish-proof'], 'loop: cadence init', opts],
    ['npx', ['cadence', 'draft', 'new', '--title=smoke-loop', '--tier=quick-fix'], 'loop: cadence draft new', opts],
    ['npx', ['cadence', 'draft', 'approve', '01-smoke-loop', '01'], 'loop: cadence draft approve', opts],
    ['npx', ['cadence', 'build', 'task', 'T1', '--status=DONE'], 'loop: cadence build task T1 DONE', opts],
    ['npx', ['cadence', 'settle', 'run', '--auto', '--allow-failing-build'], 'loop: cadence settle run --auto', opts],
  ];
}

function exerciseLoop(proj) {
  for (const [cmd, args, label, opts] of exerciseLoopSteps(proj)) {
    must(run(cmd, args, opts), label);
  }
}

// deja:new structural false positive against readCoreChangelogEntry (changelog-file extraction, scripts/release-integrity.mjs:147) — unrelated; this is a generic throw-safe teardown wrapper (AC-3), made unit-testable in isolation from the real verdaccio process
export async function withUnconditionalTeardown(fn, teardown) {
  try {
    return await fn();
  } finally {
    await teardown();
  }
}

async function main() {
  const storage = tmp('vc-store-');
  const vcConfig = join(tmp('vc-conf-'), 'config.yaml');
  writeFileSync(vcConfig, `
storage: ${storage.replace(/\\/g, '/')}
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@manehorizons/cadence-*':
    access: $all
    publish: $all
    unpublish: $all
  '@*/*':
    access: $all
    publish: $all
    proxy: npmjs
  '**':
    access: $all
    publish: $all
    proxy: npmjs
log: { type: stdout, format: pretty, level: warn }
`);
  // userconfig token lives in an OS-temp dir — NEVER written into the repo
  // (no repo-root .npmrc artifact to leak/commit on interrupt).
  const npmrc = join(tmp('vc-rc-'), '.npmrc');
  writeFileSync(npmrc, `@manehorizons:registry=${REG}\n//localhost:4873/:_authToken=publishproof\n`);

  let vc;
  await withUnconditionalTeardown(
    async () => {
      // pre-flight: a live :4873 BEFORE we start means a leaked prior verdaccio.
      // Fail fast — never silently test against stale storage (false green).
      if (await ping()) throw new Error(':4873 already serving before start — a previous verdaccio is orphaned. Kill it (Windows: taskkill /F /IM node.exe, or the verdaccio PID) and re-run.');
      // pre-fetch verdaccio so a cold npx download is NOT inside the timed wait
      must(run('npx', ['--yes', 'verdaccio@^6', '--version'], { timeout: 120000 }), 'prefetch verdaccio (120s cap — a cold npx download stall fails clearly here, not as an opaque hang)');

      vc = spawn('npx', ['--yes', 'verdaccio@^6', '--config', vcConfig, '--listen', '4873'],
        { stdio: 'inherit', shell: WIN });
      let up = false;
      for (let i = 0; i < 120; i++) { if (await ping()) { up = true; break; } await sleep(500); }
      if (!up) throw new Error('verdaccio did not start on :4873 within 60s');

      // publish the 3 packages to verdaccio (pnpm rewrites workspace:* -> 1.0.0).
      // pnpm has no --userconfig flag (that's npm-only); it reads the npm-style
      // `npm_config_userconfig` env var, so point it at our OS-temp .npmrc token.
      const pubEnv = { ...process.env, npm_config_userconfig: npmrc, npm_config_registry: REG };
      for (const p of PKGS) {
        must(run('pnpm', ['publish', '--registry', REG, '--no-git-checks', '--no-provenance'],
          { cwd: join(REPO, 'packages', p), env: pubEnv }), `publish @manehorizons/cadence-${p}`);
      }

      const proj = tmp('vc-proj-');
      must(run('npm', ['init', '-y'], { cwd: proj }), 'npm init');
      must(run('npm', ['i', '@manehorizons/cadence-core', '@manehorizons/cadence-host-claude-code', '--registry', REG], { cwd: proj }),
        'clean install @manehorizons/cadence-core + host');
      const scoped = join(proj, 'node_modules', '@manehorizons');
      for (const name of readdirSync(scoped)) {
        const pj = JSON.parse(readFileSync(join(scoped, name, 'package.json'), 'utf8'));
        for (const [d, v] of Object.entries({ ...pj.dependencies })) {
          if (d.startsWith('@manehorizons/cadence-') && /workspace:/.test(String(v))) {
            throw new Error(`workspace: leak in @manehorizons/cadence-${name} -> ${d}@${v}`);
          }
        }
      }
      must(run('npx', ['cadence', '--help'], { cwd: proj }), 'bin: cadence --help');
      must(run('npx', ['cadence-host-claude-code', '--help'], { cwd: proj }), 'bin: cadence-host-claude-code --help');

      exerciseLoop(proj);

      console.log('\nPUBLISH-PROOF: PASS — 3 packages published to verdaccio, clean install resolved, no workspace: leak, both bins run, loop: init->draft->settle: PASS.');
    },
    async () => {
      killTree(vc && vc.pid);            // Windows-safe process-tree kill (AC-3)
      await sleep(1000);                 // let the OS release file handles before delete (Windows)
      // npmrc lived under an OS-temp dir tracked in `tmps` — removed here too;
      // nothing was ever written into the repo.
      for (const d of tmps) { try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} }
    },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`PUBLISH-PROOF: FAIL — ${err.message}`);
    process.exitCode = 1;
  });
}
