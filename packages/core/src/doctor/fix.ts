import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { renderStateMd } from '../render/state-md.js';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { loadConfig } from '../config/loader.js';
import { renderAgentsMd } from '../init/claude-md-template.js';
import type { DoctorReport } from './model.js';

/**
 * `cadence doctor --fix` repair planning + application (phase 131). The planner
 * is pure (report → classified actions); the applier is the only part that
 * touches the repo, and each repair is best-effort. Safety comes from this
 * classification — only deterministic, low-blast-radius repairs are `auto`.
 */
export type FixKind = 'auto' | 'wire-host' | 'manual';

export interface FixAction {
  /** The doctor check this action addresses. */
  check: string;
  kind: FixKind;
  /** The check's repair id, or null for a manual action. */
  fixId: string | null;
  title: string;
  detail: string;
}

export interface FixPlan {
  actions: FixAction[];
}

/** Repair-id → kind for the deterministic repairs doctor can apply itself. */
const FIX_KIND: Record<string, Exclude<FixKind, 'manual'>> = {
  'git-hooks': 'auto',
  'state-md': 'auto',
  'host-install': 'wire-host',
  'codex-host-install': 'wire-host',
  'agents-md': 'auto',
};

const TITLES: Record<string, string> = {
  'git-hooks': 'Set core.hooksPath to .githooks',
  'state-md': 'Regenerate STATE.md from state.json',
  'host-install': 'Re-run the Claude Code host install',
  'codex-host-install': 'Re-run the Codex host install',
  'agents-md': 'Regenerate AGENTS.md',
};

/**
 * Pure: classify every *failing* check into a fix action. A check with a known
 * repair `fixId` becomes an `auto`/`wire-host` action; anything else (no fixId,
 * or an unknown id) becomes a `manual` action carrying the check's remediation.
 * Report order is preserved.
 */
export function planFixes(report: DoctorReport): FixPlan {
  const actions: FixAction[] = [];
  for (const check of report.checks) {
    if (check.severity === 'ok') continue;
    const kind = check.fixId !== null ? FIX_KIND[check.fixId] : undefined;
    if (check.fixId !== null && kind !== undefined) {
      actions.push({
        check: check.name,
        kind,
        fixId: check.fixId,
        title: TITLES[check.fixId] ?? check.fixId,
        detail: check.detail,
      });
    } else {
      actions.push({
        check: check.name,
        kind: 'manual',
        fixId: null,
        title: 'Manual fix required',
        detail: check.remediation ?? check.detail,
      });
    }
  }
  return { actions };
}

export type FixStatus = 'applied' | 'failed' | 'skipped';

export interface FixOutcome {
  check: string;
  fixId: string | null;
  kind: FixKind;
  status: FixStatus;
  message: string;
}

/** Injectable side-effects, so the applier is deterministic + offline in tests. */
export interface ApplyDeps {
  /** Run the Claude Code host install in `root`; resolves with its exit code. */
  hostInstall?: (root: string) => Promise<number>;
  /** Run the Codex host install in `root`; resolves with its exit code. */
  codexHostInstall?: (root: string) => Promise<number>;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `git config --local core.hooksPath .githooks` in `root` (the git-hooks repair). */
function setGitHooksPath(root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
      cwd: root,
    });
    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `git exited ${code}`)),
    );
  });
}

/** Regenerate `STATE.md` from the valid `state.json`, never rewriting `state.json`. */
async function regenerateStateMd(root: string): Promise<void> {
  const state = await new SimpleStateBackend(root).readState();
  await atomicWriteText(join(root, '.cadence', 'STATE.md'), renderStateMd(state));
}

async function regenerateAgentsMd(root: string): Promise<void> {
  const state = await new SimpleStateBackend(root).readState();
  const config = await loadConfig(root);
  await atomicWriteText(
    join(root, 'AGENTS.md'),
    renderAgentsMd({
      projectName: state.project.name,
      gateProfile: config.profile,
      preset: 'team',
    }),
  );
}

const HOST_WIRE_DISPLAY = 'npx @manehorizons/cadence-host-claude-code install';
const CODEX_HOST_WIRE_DISPLAY = 'npx -y @manehorizons/cadence-host-codex install';

/**
 * Spawn the Claude Code host install (the host-install repair). Core never
 * imports host code — it shells out, mirroring `init --wire-host`. Overridable
 * for tests via `CADENCE_HOST_WIRE_CMD` (a JSON array or a bare shell string).
 */
function defaultHostInstall(root: string): Promise<number> {
  const override = process.env.CADENCE_HOST_WIRE_CMD;
  let cmd: string;
  let args: string[];
  let useShell = false;
  if (override !== undefined && override.length > 0) {
    if (override.trimStart().startsWith('[')) {
      const parsed = JSON.parse(override) as string[];
      cmd = parsed[0] as string;
      args = parsed.slice(1);
    } else {
      cmd = override;
      args = [];
      useShell = true;
    }
  } else {
    cmd = 'npx';
    args = ['@manehorizons/cadence-host-claude-code', 'install'];
    // npx is npx.cmd on Windows; spawn() needs a shell to resolve it. Args are
    // static literals (no user input), so shell is safe here (as in init.ts).
    useShell = process.platform === 'win32';
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: useShell });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', () => resolve(1));
  });
}

function defaultCodexHostInstall(root: string): Promise<number> {
  const override = process.env.CADENCE_HOST_CODEX_WIRE_CMD ?? process.env.CADENCE_HOST_WIRE_CMD;
  let cmd: string;
  let args: string[];
  let useShell = false;
  if (override !== undefined && override.length > 0) {
    if (override.trimStart().startsWith('[')) {
      const parsed = JSON.parse(override) as string[];
      cmd = parsed[0] as string;
      args = parsed.slice(1);
    } else {
      cmd = override;
      args = [];
      useShell = true;
    }
  } else {
    cmd = 'npx';
    args = ['-y', '@manehorizons/cadence-host-codex', 'install'];
    useShell = process.platform === 'win32';
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: useShell });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', () => resolve(1));
  });
}

async function runRepair(root: string, fixId: string, deps: ApplyDeps): Promise<void> {
  switch (fixId) {
    case 'git-hooks':
      return setGitHooksPath(root);
    case 'state-md':
      return regenerateStateMd(root);
    case 'agents-md':
      return regenerateAgentsMd(root);
    case 'host-install': {
      const code = await (deps.hostInstall ?? defaultHostInstall)(root);
      if (code !== 0) throw new Error(`${HOST_WIRE_DISPLAY} exited ${code}`);
      return;
    }
    case 'codex-host-install': {
      const code = await (deps.codexHostInstall ?? defaultCodexHostInstall)(root);
      if (code !== 0) throw new Error(`${CODEX_HOST_WIRE_DISPLAY} exited ${code}`);
      return;
    }
    default:
      throw new Error(`no repair registered for '${fixId}'`);
  }
}

/**
 * Apply a fix plan, best-effort. `auto` actions always run; `wire-host` actions
 * run only when `opts.wireHost`; `manual` actions are never executed (reported as
 * guidance). Repairs sharing a `fixId` (e.g. host-install for both host checks)
 * run at most once — subsequent actions report as covered/skipped. A repair that
 * throws is reported `failed`; the rest still run.
 */
export async function applyFixes(
  root: string,
  plan: FixPlan,
  opts: { wireHost: boolean },
  deps: ApplyDeps = {},
): Promise<FixOutcome[]> {
  const outcomes: FixOutcome[] = [];
  const attempted = new Map<string, FixStatus>();
  for (const action of plan.actions) {
    const base = { check: action.check, fixId: action.fixId, kind: action.kind };
    if (action.kind === 'manual') {
      outcomes.push({ ...base, status: 'skipped', message: action.detail });
      continue;
    }
    if (action.kind === 'wire-host' && !opts.wireHost) {
      outcomes.push({
        ...base,
        status: 'skipped',
        message: `not applied — re-run with --wire-host (${action.detail})`,
      });
      continue;
    }
    // Dedupe by fixId: run a shared repair at most once.
    if (action.fixId !== null && attempted.has(action.fixId)) {
      const first = attempted.get(action.fixId);
      outcomes.push(
        first === 'applied'
          ? { ...base, status: 'applied', message: `covered by the ${action.fixId} repair` }
          : { ...base, status: 'skipped', message: `${action.fixId} repair failed` },
      );
      continue;
    }
    try {
      await runRepair(root, action.fixId as string, deps);
      if (action.fixId !== null) attempted.set(action.fixId, 'applied');
      outcomes.push({ ...base, status: 'applied', message: action.title });
    } catch (err) {
      if (action.fixId !== null) attempted.set(action.fixId, 'failed');
      outcomes.push({ ...base, status: 'failed', message: errMessage(err) });
    }
  }
  return outcomes;
}
