import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CadenceStateZ } from '@thomas-powers-jr/cadence-types';
import { renderStateMd } from '../render/state-md.js';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteText, atomicWriteJSON } from '../state/atomic-write.js';
import { loadConfig, writeConfig } from '../config/loader.js';
import { renderAgentsMd } from '../init/claude-md-template.js';
import { pruneHandoffDir } from '../handoff/retention.js';
import { ensureGitignoreEntries } from '../init/gitignore.js';
import { HANDOFF_WARN_THRESHOLD, listTrackedCadenceOwnedPaths, parseConflictMarkers } from './run.js';
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
  'handoff-retention': 'auto',
  'untrack-state': 'auto',
};

const TITLES: Record<string, string> = {
  'git-hooks': 'Set core.hooksPath to .githooks',
  'state-md': 'Regenerate STATE.md from state.json',
  'host-install': 'Re-run the Claude Code host install',
  'codex-host-install': 'Re-run the Codex host install',
  'agents-md': 'Regenerate AGENTS.md',
  'handoff-retention': 'Set handoff.retain and prune excess SESSION docs',
  'untrack-state': 'Untrack CADENCE-owned ephemeral state and gitignore it',
};

/** Repair id for the conflict-resolution repair — deliberately kept OUT of
 *  `FIX_KIND`'s auto/wire-host map (see `planFixes`'s special-case below). */
const RESOLVE_STATE_CONFLICT_FIX_ID = 'resolve-state-conflict';

/**
 * Pure: classify every *failing* check into a fix action. A check with a known
 * repair `fixId` becomes an `auto`/`wire-host` action; anything else (no fixId,
 * or an unknown id) becomes a `manual` action carrying the check's remediation.
 * Report order is preserved.
 *
 * `resolve-state-conflict` (T5, phase 196, issue #177) is special-cased ahead
 * of the generic lookup: it is ALWAYS classified `manual` here — never `auto`
 * — because picking the wrong side of a state.json conflict is actively
 * harmful, unlike every other repair in this file. `fixId` is still
 * preserved (unlike a normal manual/unknown-fixId action, which nulls it
 * out), so `applyFixes` can recognize this specific action and, only when
 * the caller's `opts.resolveStateConflict` supplies a side, actually run the
 * repair — driven by the CLI flag, never by the blanket "run every auto
 * action" path `untrack-state` uses.
 */
export function planFixes(report: DoctorReport): FixPlan {
  const actions: FixAction[] = [];
  for (const check of report.checks) {
    if (check.severity === 'ok') continue;
    if (check.fixId === RESOLVE_STATE_CONFLICT_FIX_ID) {
      actions.push({
        check: check.name,
        kind: 'manual',
        fixId: check.fixId,
        title: 'Resolve the state.json conflict (requires --resolve-state-conflict=local|incoming)',
        detail: check.detail,
      });
      continue;
    }
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

/**
 * Set `handoff.retain` (when unset) to `HANDOFF_WARN_THRESHOLD` and prune the
 * SESSION-doc archive down to budget (the handoff-retention repair). Reuses
 * `pruneHandoffDir`/`selectPrunable` as-is — never reimplements pruning. If
 * `handoff.retain` is already set (defensive: `checkHandoffRetention` only
 * fails when it's unset, so this branch shouldn't normally run), the repair
 * still prunes using that existing value rather than overwriting a user's
 * explicit setting.
 */
async function pruneHandoffRetention(root: string): Promise<void> {
  const config = await loadConfig(root);
  let retain = config.handoff.retain;
  if (retain === undefined) {
    retain = HANDOFF_WARN_THRESHOLD;
    await writeConfig(root, { ...config, handoff: { ...config.handoff, retain } });
  }
  const state = await new SimpleStateBackend(root).readState();
  await pruneHandoffDir(join(root, '.cadence', 'handoff'), retain, state.session.lastHandoff ?? '');
}

/** `git rm --cached -- <paths>` in `root` (the untrack-state repair). Stages
 *  removal from the index only — never touches the working tree files and
 *  never commits. Mirrors `setGitHooksPath`'s injectable-`spawn`-free,
 *  fixed-arg-array shape (never a shell string). */
function gitRmCached(root: string, paths: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['rm', '--cached', '--', ...paths], { cwd: root });
    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `git exited ${code}`)),
    );
  });
}

/**
 * The `untrack-state` repair (phase 196, issue #177): write the four
 * CADENCE-owned entries into `.gitignore` (idempotent — `ensureGitignoreEntries`
 * no-ops when they're already present), then `git rm --cached` only whichever
 * of those four paths are actually currently tracked. Nothing is committed —
 * `git rm --cached` only stages the removal; the operator commits
 * deliberately. Re-derives the tracked set rather than trusting the doctor
 * report's detail string, so it stays correct even if the check's finding is
 * stale by the time `--fix` runs.
 */
async function untrackCadenceOwnedState(root: string): Promise<void> {
  await ensureGitignoreEntries(root);
  const tracked = await listTrackedCadenceOwnedPaths(root);
  if (tracked === null || tracked.length === 0) return;
  await gitRmCached(root, tracked);
}

export interface ConflictRepairResult {
  status: FixStatus;
  message: string;
}

/**
 * The `resolve-state-conflict` repair (T5, phase 196, issue #177): re-split
 * the raw `state.json` (reusing `parseConflictMarkers` — the one place the
 * marker-detection logic lives — never re-derived here), pick `side`,
 * re-validate it fresh with `JSON.parse` + `CadenceStateZ.safeParse` (defense
 * in depth: a `doctor --fix` invocation may run in a different process than
 * the `checkState` that diagnosed the conflict, so the file could have
 * changed in between), and write it through the state backend.
 *
 * Never throws for an expected failure mode (no markers / bad JSON / bad
 * schema) — those come back as `skipped`/`failed` outcomes so a single bad
 * repair doesn't take the rest of `--fix` down.
 *
 * `SimpleStateBackend.commit()` is the codebase's single public write path
 * for `state.json` + `STATE.md` (see `StateBackend.commit`'s doc comment),
 * but it unconditionally re-reads the CURRENT on-disk `state.json` to
 * enforce optimistic concurrency — which would itself throw here, since the
 * file is still conflict-marker text, not valid JSON, before `force` even
 * comes into play. So the resolved JSON is written directly first (so
 * `commit()` can read it back cleanly), then `commit()` performs the real,
 * authoritative write — bumping `revision` and regenerating `STATE.md`.
 * `force: true` because there is no meaningful "expected revision" to
 * compare a conflict recovery against.
 */
async function resolveStateConflict(
  root: string,
  side: 'local' | 'incoming',
): Promise<ConflictRepairResult> {
  const statePath = join(root, '.cadence', 'state.json');
  const raw = await readFile(statePath, 'utf8');
  const split = parseConflictMarkers(raw);
  if (split === null) {
    return {
      status: 'skipped',
      message: 'state.json has no unresolved conflict markers — nothing to resolve.',
    };
  }
  const chosenRaw = side === 'local' ? split.local : split.incoming;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(chosenRaw);
  } catch (err) {
    return {
      status: 'failed',
      message: `the ${side} side of the conflict is not valid JSON: ${errMessage(err)}`,
    };
  }
  const result = CadenceStateZ.safeParse(parsedJson);
  if (!result.success) {
    return {
      status: 'failed',
      message: `the ${side} side of the conflict failed schema validation: ${result.error.message}`,
    };
  }
  const chosen = result.data;
  await atomicWriteJSON(statePath, chosen);
  await new SimpleStateBackend(root).commit(chosen, { force: true });
  return { status: 'applied', message: `resolved state.json using the ${side} side` };
}

const HOST_WIRE_DISPLAY = 'npx @thomas-powers-jr/cadence-host-claude-code install';
const CODEX_HOST_WIRE_DISPLAY = 'npx -y @thomas-powers-jr/cadence-host-codex install';

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
    args = ['@thomas-powers-jr/cadence-host-claude-code', 'install'];
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
    args = ['-y', '@thomas-powers-jr/cadence-host-codex', 'install'];
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
    case 'handoff-retention':
      return pruneHandoffRetention(root);
    case 'untrack-state':
      return untrackCadenceOwnedState(root);
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
 * guidance) — EXCEPT the `resolve-state-conflict` fixId (classified `manual` in
 * the plan on purpose, see `planFixes`), which this loop intercepts before the
 * generic manual handling: it runs only when `opts.resolveStateConflict`
 * supplies a side, and is skipped-with-guidance otherwise — driven by the CLI
 * flag, never by a check's `kind`. Repairs sharing a `fixId` (e.g. host-install
 * for both host checks) run at most once — subsequent actions report as
 * covered/skipped. A repair that throws is reported `failed`; the rest still
 * run.
 */
export async function applyFixes(
  root: string,
  plan: FixPlan,
  opts: { wireHost: boolean; resolveStateConflict?: 'local' | 'incoming' },
  deps: ApplyDeps = {},
): Promise<FixOutcome[]> {
  const outcomes: FixOutcome[] = [];
  const attempted = new Map<string, FixStatus>();
  for (const action of plan.actions) {
    const base = { check: action.check, fixId: action.fixId, kind: action.kind };
    if (action.fixId === RESOLVE_STATE_CONFLICT_FIX_ID) {
      if (opts.resolveStateConflict === undefined) {
        outcomes.push({
          ...base,
          status: 'skipped',
          message: `not applied — re-run with --resolve-state-conflict=local|incoming (${action.detail})`,
        });
        continue;
      }
      try {
        const repaired = await resolveStateConflict(root, opts.resolveStateConflict);
        outcomes.push({ ...base, status: repaired.status, message: repaired.message });
      } catch (err) {
        outcomes.push({ ...base, status: 'failed', message: errMessage(err) });
      }
      continue;
    }
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
