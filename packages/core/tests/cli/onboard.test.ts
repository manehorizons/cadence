import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { defaultConfig } from '@manehorizons/cadence-types';
import { loadConfig, writeConfig } from '../../src/config/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

/** Writes a sentinel script + returns the CADENCE_HOST_WIRE_CMD override env
 * that makes `maybeWireHost`'s spawn write a WIRED marker file instead of
 * actually invoking the real host-install subprocess (same pattern as
 * init-full.test.ts's --wire-host coverage — T2 routes onboard through the
 * same T1 shared `maybeWireHost`/`spawnHostWire` seam). */
async function sentinelHostWireEnv(root: string): Promise<NodeJS.ProcessEnv> {
  const sentinel = join(root, 'sentinel.cjs');
  await writeFile(
    sentinel,
    "require('fs').writeFileSync(require('path').join(process.cwd(),'WIRED'),'ok');",
  );
  return { CADENCE_HOST_WIRE_CMD: JSON.stringify([process.execPath, sentinel]) };
}

const FAKE_KEY = 'sk-ant-test-DO-NOT-PERSIST-onboard';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence onboard', () => {
  it('AC-1: installs host hooks, reports project/profile/verifier readiness (key present), and leaves config.json + state.json byte-identical', async () => {
    active = await tempRepo({ initialized: true, projectName: 'acme-widgets' });
    const root = active.root;
    await mkdir(join(root, '.claude'), { recursive: true });
    const wireEnv = await sentinelHostWireEnv(root);

    // Flip the deep-verify seam to `anthropic` so the readiness report has a
    // real provider + real credential check to exercise (a fresh fixture
    // defaults every seam to `mock`, which trivially reports "present").
    const cfg = await loadConfig(root);
    cfg.verifier.provider = 'anthropic';
    await writeConfig(root, cfg);

    const configPath = join(root, '.cadence', 'config.json');
    const statePath = join(root, '.cadence', 'state.json');
    const configBefore = await readFile(configPath, 'utf8');
    const stateBefore = await readFile(statePath, 'utf8');

    const r = await run(['onboard', '--wire-host'], root, {
      ...wireEnv,
      ANTHROPIC_API_KEY: FAKE_KEY,
    });

    expect(r.code).toBe(0);
    // host hooks installed via the shared host-wire seam (T1).
    expect(existsSync(join(root, 'WIRED'))).toBe(true);
    expect(r.stdout).toMatch(/host hooks\s+wired/);
    // project name + gate profile read from .cadence/ (state.json name,
    // config.json profile — a fresh fixture defaults to the 'auto' profile).
    expect(r.stdout).toMatch(/acme-widgets/);
    expect(r.stdout).toMatch(/gate profile\s+auto/);
    // provider/credential readiness reported in prose, never the raw key value.
    expect(r.stdout).toMatch(/anthropic/);
    expect(r.stdout).toMatch(/credentials present/);
    expect(r.stdout).not.toContain(FAKE_KEY);
    expect(r.stderr).not.toContain(FAKE_KEY);

    // read-only against existing CADENCE state (Boundaries: no config/state mutation).
    const configAfter = await readFile(configPath, 'utf8');
    const stateAfter = await readFile(statePath, 'utf8');
    expect(configAfter).toBe(configBefore);
    expect(stateAfter).toBe(stateBefore);
  });

  it('AC-1: no .claude/ workspace + missing credentials — host hooks reported not applicable, verifier reason names missing credentials, no secret ever printed', async () => {
    active = await tempRepo({ initialized: true, projectName: 'no-workspace' });
    const root = active.root;
    // No .claude/ dir: maybeWireHost's target resolution short-circuits before
    // ever consulting CADENCE_HOST_WIRE_CMD, so no sentinel env is needed —
    // asserting WIRED never appears proves the skip path, not just that a
    // wire attempt happened to fail.

    const cfg = await loadConfig(root);
    cfg.verifier.provider = 'anthropic';
    await writeConfig(root, cfg);

    const r = await run(['onboard'], root, { ANTHROPIC_API_KEY: '' });

    expect(r.code).toBe(0);
    expect(existsSync(join(root, 'WIRED'))).toBe(false);
    expect(r.stdout).toMatch(/host hooks\s+not applicable \(no \.claude\/ workspace detected\)/);
    expect(r.stdout).toMatch(/no-workspace/);
    expect(r.stdout).toMatch(/gate profile\s+auto/);
    expect(r.stdout).toMatch(/credentials are missing/);
    expect(r.stdout).not.toContain(FAKE_KEY);
    expect(r.stdout).not.toMatch(/sk-ant/);
  });

  it('AC-1: --json emits a parseable payload with project/gateProfile/hostWire/verifier fields and never leaks a secret value', async () => {
    active = await tempRepo({ initialized: true, projectName: 'json-onboard' });
    const root = active.root;
    // Default fixture: every verifier seam is `mock` (credsPresent is
    // unconditionally true for mock), no .claude/ workspace present.

    const r = await run(['onboard', '--json'], root, { ANTHROPIC_API_KEY: FAKE_KEY });

    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout); // throws if not exactly one JSON value
    expect(parsed.ok).toBe(true);
    expect(parsed.project).toBe('json-onboard');
    expect(parsed.gateProfile).toBe('auto');
    expect(parsed.hostWire).toEqual({ wired: false, offered: false });
    expect(parsed.verifier.provider).toBe('mock');
    expect(parsed.verifier.keyPresent).toBe(true);
    expect(parsed.verifier.ready).toBe(false); // mock is never "ready" for deep-verify
    expect(typeof parsed.verifier.reason).toBe('string');
    expect(r.stdout).not.toContain(FAKE_KEY);
  });

  it('AC-2: no .cadence/ → exits 2 with a message pointing at cadence init, no scaffolding, no partial side effects', async () => {
    active = await tempRepo(); // uninitialized: no .cadence/ at all
    const root = active.root;
    const entriesBefore = readdirSync(root);

    const r = await run(['onboard'], root);

    expect(r.code).toBe(2);
    expect(r.stdout + r.stderr).toMatch(/cadence init/);
    expect(existsSync(join(root, '.cadence'))).toBe(false);
    // no partial side effects: the directory contents are unchanged.
    expect(readdirSync(root)).toEqual(entriesBefore);
  });

  it('AC-2: --json refusal path emits {ok:false, error} pointing at cadence init with the same exit code, no scaffolding', async () => {
    active = await tempRepo();
    const root = active.root;

    const r = await run(['onboard', '--json'], root);

    expect(r.code).toBe(2);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/cadence init/);
    expect(existsSync(join(root, '.cadence'))).toBe(false);
  });
});

describe('cadence onboard — regression: .cadence/ committed but state.json absent (issue #177 fallout)', () => {
  it('AC-1: onboard bootstraps state.json for a fresh worktree/clone so downstream commands work', async () => {
    // Mirrors a fresh `git worktree add` / fresh clone of a repo that already
    // has `.cadence/` committed, post phase-196 (state.json is gitignored and
    // per-worktree, so it simply does not exist yet on disk). Built by hand
    // (not `tempRepo({ initialized: true })`, which always writes state.json)
    // to reproduce exactly that state-less shape.
    active = await tempRepo();
    const root = active.root;
    const cadenceDir = join(root, '.cadence');
    await mkdir(join(cadenceDir, 'phases'), { recursive: true });
    await writeFile(join(cadenceDir, 'config.json'), JSON.stringify(defaultConfig, null, 2));
    await writeFile(join(cadenceDir, 'PROJECT.md'), '# regression-project\n');
    await writeFile(join(cadenceDir, 'ROADMAP.md'), '# Roadmap\n');
    const statePath = join(cadenceDir, 'state.json');
    expect(existsSync(statePath)).toBe(false);

    const r = await run(['onboard'], root);
    expect(r.code).toBe(0);

    // onboard bootstraps a fresh IDLE state.json, deriving the project name
    // from PROJECT.md's header, whenever one is missing.
    expect(existsSync(statePath)).toBe(true);

    // Confirms the downstream dead end this bug used to cause: `cadence
    // progress` threw NotInitializedError against the very .cadence/ onboard
    // just "handled". With state.json bootstrapped, this now succeeds.
    const progress = await run(['progress'], root);
    expect(progress.code).toBe(0);
  });

  it('AC-2: state.json already present with non-default values is left byte-for-byte unchanged by onboard', async () => {
    // tempRepo({ initialized: true }) always writes a fresh state.json — mutate
    // it afterward to distinctive, non-default values so a bootstrap-driven
    // overwrite (T2's bug-fix path firing when it should NOT) would be caught.
    active = await tempRepo({ initialized: true, projectName: 'existing-state-project' });
    const root = active.root;
    const statePath = join(root, '.cadence', 'state.json');
    const original = JSON.parse(await readFile(statePath, 'utf8'));
    const mutated = {
      ...original,
      loopPosition: 'BUILD',
      activePhase: '99-distinctive-marker',
      revision: 42,
    };
    await writeFile(statePath, JSON.stringify(mutated, null, 2));
    const stateBefore = await readFile(statePath, 'utf8');

    const r = await run(['onboard'], root);

    expect(r.code).toBe(0);
    const stateAfter = await readFile(statePath, 'utf8');
    expect(stateAfter).toBe(stateBefore);
    expect(JSON.parse(stateAfter)).toEqual(mutated);
    // no "bootstrapped" notice — the file was never touched.
    expect(r.stderr).not.toMatch(/bootstrapped/);
  });
});
