import { execSync } from 'node:child_process';
import type {
  AnomalyEvent,
  CadenceConfig,
  CadenceState,
  Draft,
  GateSet,
} from '@manehorizons/cadence-types';
import { selectNotifier } from '../notify/factory.js';
import { selectPerTaskVerifier } from '../verify/per-task-factory.js';
import type { BuildGateContext, BuildGateOpts } from './build-types.js';

/**
 * Build the `BuildGateContext` the per-task-verify gate consumes (Phase 39.7).
 * The build command router owns construction; the gate reaches git/verifier/
 * notifier only through the ports built here.
 */
export function buildBuildContext(args: {
  cwd: string;
  state: CadenceState;
  draft: Draft;
  config: CadenceConfig | null;
  gateSet: GateSet;
  taskId: string;
  opts: BuildGateOpts;
}): BuildGateContext {
  const { cwd, state, draft, config, gateSet, taskId, opts } = args;
  return {
    cwd,
    state,
    draft,
    config,
    gateSet,
    taskId,
    opts,
    diff: (files) => collectDiff(cwd, files),
    verifiers: { perTask: selectPerTaskVerifier(config) },
    emit: { perTaskFail: (info) => emitPerTaskFail(config, info) },
    io: { err: (s) => process.stderr.write(s) },
  };
}

/**
 * `git diff HEAD -- <files>` via execSync. Empty string when the repo isn't a
 * git workdir, when there's no diff, or on error — the mock verifier reads an
 * empty diff as `'concerns'`, the right conservative default for non-git.
 */
function collectDiff(cwd: string, files: string[]): string {
  if (files.length === 0) return '';
  try {
    const args = ['diff', '--no-color', 'HEAD', '--', ...files];
    return execSync(`git ${args.map(shellQuote).join(' ')}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9._/=:@+-]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["\\$`])/g, '\\$1')}"`;
}

/**
 * Emit a `per-task-fail` anomaly. Mirrors the Phase 24.2 inline emitter:
 * returns early on a null config (degraded path), dispatches unconditionally
 * otherwise (the notifier transport drops it on opted-out profiles), and turns
 * a transport failure into one stderr warning rather than throwing.
 */
async function emitPerTaskFail(
  config: CadenceConfig | null,
  info: { taskId: string; provider: string; reason: string; bypassed: boolean },
): Promise<void> {
  if (!config) return;
  const notifier = selectNotifier(config);
  const event: AnomalyEvent = {
    type: 'per-task-fail',
    severity: 'error',
    message: `per-task-verify ${info.bypassed ? 'bypassed' : 'refused'} for ${info.taskId}: ${info.reason}`,
    context: {
      taskId: info.taskId,
      provider: info.provider,
      reason: info.reason,
      bypassed: info.bypassed,
    },
    ts: new Date().toISOString(),
  };
  try {
    await notifier.notify([event]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `cadence-notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
    );
  }
}
