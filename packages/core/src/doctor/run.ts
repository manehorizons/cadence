import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checkNodeMajor } from '../cli/node-guard.js';
import { loadConfig } from '../config/loader.js';
import { gatherOccupancy } from '../phases/occupancy.js';
import { detectPhaseCollision, type Occupancy } from '../phases/collision.js';
import {
  pass,
  fail,
  rollup,
  type DoctorCheck,
  type DoctorEnv,
  type DoctorReport,
} from './model.js';

function checkNode(env: DoctorEnv): DoctorCheck {
  const r = checkNodeMajor(env.nodeVersion);
  return r.ok
    ? pass('node', `Node ${env.nodeVersion} satisfies the >=20 floor.`)
    : fail('node', 'error', r.message, 'Upgrade Node to >=20 and retry.');
}

async function checkInitialized(root: string): Promise<DoctorCheck> {
  if (!existsSync(join(root, '.cadence'))) {
    return fail(
      'initialized',
      'error',
      'No .cadence/ directory found here.',
      'Run `cadence init` to initialize CADENCE in this project.',
    );
  }
  try {
    await loadConfig(root);
    return pass('initialized', '.cadence/ present and config.json is valid.');
  } catch (err) {
    return fail(
      'initialized',
      'error',
      `config.json is invalid: ${err instanceof Error ? err.message : String(err)}`,
      'Fix or regenerate .cadence/config.json (see docs/reference/config.md).',
    );
  }
}

async function checkState(root: string): Promise<DoctorCheck> {
  // Only meaningful once initialized; the `initialized` check owns the
  // not-initialized error, so skip cleanly here to avoid double-reporting.
  if (!existsSync(join(root, '.cadence'))) {
    return pass('state', 'Not applicable — project is not initialized.');
  }
  const stateJson = join(root, '.cadence', 'state.json');
  if (!existsSync(stateJson)) {
    return fail(
      'state',
      'error',
      'state.json is missing.',
      'Run any cadence command (e.g. `cadence progress`) to regenerate state, or `cadence init`.',
    );
  }
  try {
    JSON.parse(await readFile(stateJson, 'utf8'));
  } catch (err) {
    return fail(
      'state',
      'error',
      `state.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      'Restore .cadence/state.json from version control, or re-init.',
    );
  }
  if (!existsSync(join(root, '.cadence', 'STATE.md'))) {
    return fail(
      'state',
      'warning',
      'STATE.md (the derived human view) is missing.',
      'Run any cadence command to regenerate STATE.md.',
    );
  }
  return pass('state', 'state.json parses and STATE.md is present.');
}

// A run-line is non-portable if it contains an absolute path token: a POSIX
// root (`/abs/...`) or a Windows drive (`C:\...`). The portable managed form is
// `!cadence <sub>`, which has neither.
const ABS_PATH_TOKEN = /(?:^|\s)(?:[A-Za-z]:[\\/]|\/)/;

/** The first `!`-prefixed run-line in a managed command file, minus the `!`. */
function runLineOf(content: string): string | null {
  for (const line of content.split('\n')) {
    if (line.startsWith('!')) return line.slice(1).trim();
  }
  return null;
}

async function checkHostCommands(root: string): Promise<DoctorCheck> {
  const dir = join(root, '.claude', 'commands');
  if (!existsSync(dir)) {
    return pass('host-commands', 'Not applicable — no .claude/commands/ here.');
  }
  const files = (await readdir(dir)).filter(
    (f) => f.startsWith('cadence-') && f.endsWith('.md'),
  );
  const offenders: string[] = [];
  let checked = 0;
  for (const f of files) {
    const content = await readFile(join(dir, f), 'utf8');
    if (!content.includes('<!-- managed-by: cadence -->')) continue; // user-owned
    checked++;
    const run = runLineOf(content);
    if (run !== null && ABS_PATH_TOKEN.test(run)) offenders.push(f);
  }
  if (offenders.length > 0) {
    return fail(
      'host-commands',
      'warning',
      `Machine-absolute run-line in ${offenders.join(', ')} — not portable across clones/machines.`,
      'Regenerate with `cadence-host-claude-code install` (without --local) to write the portable `cadence` form.',
    );
  }
  return pass(
    'host-commands',
    `All ${checked} managed slash command(s) use portable run-lines.`,
  );
}

/** Local `core.hooksPath` value from a `.git/config` body, or null if unset. */
function gitHooksPath(configText: string): string | null {
  const m = configText.match(/^\s*hooksPath\s*=\s*(.+?)\s*$/m);
  if (!m || m[1] === undefined) return null;
  return m[1];
}

async function checkGitHooks(root: string): Promise<DoctorCheck> {
  if (!existsSync(join(root, '.git'))) {
    return pass('git-hooks', 'Not applicable — not a git repository.');
  }
  const cfgPath = join(root, '.git', 'config');
  const cfg = existsSync(cfgPath) ? await readFile(cfgPath, 'utf8') : '';
  const hp = gitHooksPath(cfg);
  if (hp === '.githooks') {
    return pass(
      'git-hooks',
      'core.hooksPath points at .githooks (the pre-push gate is wired).',
    );
  }
  return fail(
    'git-hooks',
    'warning',
    hp === null
      ? 'core.hooksPath is unset — the .githooks pre-push gate will not run.'
      : `core.hooksPath is "${hp}", not ".githooks" — the pre-push gate may not run.`,
    'Run `git config core.hooksPath .githooks` to enable the pre-push gate.',
  );
}

/** Deep-scan a parsed settings object for any `_managedBy: "cadence"` entry. */
function hasManagedCadence(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasManagedCadence);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o['_managedBy'] === 'cadence') return true;
    return Object.values(o).some(hasManagedCadence);
  }
  return false;
}

async function checkHostHooks(root: string): Promise<DoctorCheck> {
  const settings = join(root, '.claude', 'settings.json');
  if (!existsSync(settings)) {
    return pass('host-hooks', 'Not applicable — no .claude/settings.json here.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(settings, 'utf8'));
  } catch (err) {
    return fail(
      'host-hooks',
      'warning',
      `.claude/settings.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      'Fix or regenerate it with `cadence-host-claude-code install`.',
    );
  }
  if (hasManagedCadence(parsed)) {
    return pass(
      'host-hooks',
      'CADENCE-managed hook entries are present in settings.json.',
    );
  }
  return fail(
    'host-hooks',
    'warning',
    'No CADENCE-managed (_managedBy: "cadence") hook entries found in settings.json.',
    'Run `cadence-host-claude-code install` to (re)write the lifecycle hooks.',
  );
}

/** Human label for where a cross-worktree claim was observed. */
function whereClaimed(o: Occupancy): string {
  return o.source === 'upstream' ? o.location : `worktree ${o.location}`;
}

/**
 * Read-only cross-worktree phase-usage line (v1.19, phase 85). Reuses the v1.18
 * `gatherOccupancy` collector + pure `detectPhaseCollision` to surface phase
 * numbers claimed by sibling worktrees + the upstream integration ref, and warns
 * when one collides with a local phase number — the silent-dual-merge
 * precondition the v1.18 guard refuses at scaffold time. Best-effort: any
 * failure degrades to `ok` (never throws), matching the guard's contract.
 * The collector is injectable for deterministic, offline tests.
 */
export async function checkWorktreePhases(
  root: string,
  gather: (
    repoRoot: string,
    opts: { integrationRef: string },
  ) => Promise<Occupancy[]> = gatherOccupancy,
): Promise<DoctorCheck> {
  try {
    let integrationRef = 'main';
    try {
      integrationRef = (await loadConfig(root)).phaseGuard.integrationRef;
    } catch {
      /* config unreadable — fall back to the default ref */
    }

    const occupancies = await gather(root, { integrationRef });
    const localNumbers = new Set(
      occupancies.filter((o) => o.source === 'local').map((o) => o.number),
    );
    // Collisions are SIBLING-vs-local only — two live worktrees holding the same
    // number is the silent-dual-merge risk. Upstream is the merged baseline: a
    // local phase being present on origin/<ref> just means "merged", which is
    // normal, so upstream is NOT matched here (that's the guard's scaffold-time
    // concern). Upstream still feeds the suggested next free number below.
    const siblings = occupancies.filter((o) => o.source === 'sibling');

    if (siblings.length === 0) {
      return pass(
        'worktree-phases',
        'No sibling worktrees with phase claims observed.',
      );
    }

    const collisions = siblings.filter((o) => localNumbers.has(o.number));
    if (collisions.length > 0) {
      // nextFree is independent of target here (every observed number counts);
      // target 0 yields max(observed)+1 over local + sibling + upstream —
      // monotonic, lowest-gap was dropped.
      const { nextFree } = detectPhaseCollision(0, occupancies);
      const detail =
        'phase number collision across worktrees: ' +
        collisions
          .map((c) => `${c.number} also claimed by ${whereClaimed(c)}`)
          .join('; ') +
        '.';
      return fail(
        'worktree-phases',
        'warning',
        detail,
        `Renumber one side; the next free phase number is ${nextFree}.`,
      );
    }

    const inventory = siblings
      .map((o) => `${o.number} (${whereClaimed(o)})`)
      .join(', ');
    return pass(
      'worktree-phases',
      `Sibling worktree phase claims observed, none colliding with local: ${inventory}.`,
    );
  } catch {
    // Best-effort: the collector should never throw, but if anything does,
    // a diagnostic line must not break `doctor`.
    return pass(
      'worktree-phases',
      'Cross-worktree phase usage not determinable (best-effort) — skipped.',
    );
  }
}

/** Warn when this many SESSION docs accumulate with retention disabled. */
const HANDOFF_WARN_THRESHOLD = 10;

/**
 * Make SESSION-doc accumulation visible (Phase 89, v1.20). Read-only and
 * best-effort: counts `SESSION-*.md` under `.cadence/handoff/` against
 * `config.handoff.retain`. With retention configured the docs self-heal on the
 * next handoff write, so the check only *warns* when retention is unset and the
 * archive has grown past the threshold. Never throws — a diagnostic must not
 * break `doctor` (mirrors `worktree-phases`).
 */
export async function checkHandoffRetention(root: string): Promise<DoctorCheck> {
  try {
    const dir = join(root, '.cadence', 'handoff');
    let count = 0;
    if (existsSync(dir)) {
      count = (await readdir(dir)).filter((n) => /^SESSION-.*\.md$/.test(n)).length;
    }

    let retain: number | undefined;
    try {
      retain = (await loadConfig(root)).handoff.retain;
    } catch {
      /* config unreadable — treat retention as unset */
    }

    if (retain !== undefined) {
      if (count <= retain) {
        return pass(
          'handoff-retention',
          `${count} handoff doc(s) within the retain budget of ${retain}.`,
        );
      }
      return pass(
        'handoff-retention',
        `${count} handoff doc(s) exceed retain=${retain}; the next handoff write will prune ${count - retain}.`,
      );
    }

    if (count >= HANDOFF_WARN_THRESHOLD) {
      return fail(
        'handoff-retention',
        'warning',
        `${count} handoff docs are accumulating under .cadence/handoff/ with retention disabled.`,
        'Set handoff.retain (suggested 10) to auto-prune stale SESSION docs on handoff write.',
      );
    }
    return pass(
      'handoff-retention',
      `${count} handoff doc(s); retention disabled (set handoff.retain to cap growth).`,
    );
  } catch {
    return pass(
      'handoff-retention',
      'Handoff retention not determinable (best-effort) — skipped.',
    );
  }
}

export async function runDoctor(
  root: string,
  env: DoctorEnv,
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [
    checkNode(env),
    await checkInitialized(root),
    await checkState(root),
    await checkGitHooks(root),
    await checkHostHooks(root),
    await checkHostCommands(root),
    await checkWorktreePhases(root),
    await checkHandoffRetention(root),
  ];
  return rollup(checks);
}
