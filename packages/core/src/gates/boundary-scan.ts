import { collectUnscopedTouchedFiles } from '../git/boundary-diff.js';
import { runBoundaryCheck } from '../checks/boundary.js';
import { effectiveBoundaryEnforcement } from './engine.js';
import { isGateSealed } from './types.js';
import type { GateImpl, GateResult } from './types.js';

const CADENCE_DIR_PREFIX = '.cadence/';

/**
 * Settle-time boundary diff scan (Phase 156). Follow-on to phase 155's
 * edit-time `boundaryEnforcement: 'block'`, which cannot see a violation that
 * never passed through the host's pre-tool-edit hook (most notably a
 * subagent-driven edit). No-ops unless `effectiveBoundaryEnforcement` resolves
 * to `'block'`. Enumerates every file touched by the whole phase via an
 * UNSCOPED git diff (`collectUnscopedTouchedFiles`, not `ctx.touchedFiles`/
 * `ctx.diff()`, which are pre-scoped to the declared `files:` set and can
 * structurally never surface an out-of-boundary file), drops `.cadence/**`
 * self-writes, and refuses when a file outside the declared `files:` union is
 * found — unless bypassed via `--force`/`--allow-boundary-scan-failure` and
 * the gate is not sealed.
 */
export const runBoundaryScanGate: GateImpl = async (ctx): Promise<GateResult> => {
  if (effectiveBoundaryEnforcement(ctx.config, ctx.draft) !== 'block') {
    return { outcome: 'pass' };
  }

  const integrationRef = ctx.config?.phaseGuard?.integrationRef ?? 'main';
  const { files, baseRefResolved } = await collectUnscopedTouchedFiles(ctx.cwd, integrationRef);
  if (!baseRefResolved) {
    ctx.io.err(
      `boundary-scan: could not resolve a base ref against \`${integrationRef}\` — ` +
        'committed-file scan skipped, only working-tree changes were checked\n',
    );
  }

  const filtered = files.filter((f) => f !== '.cadence' && !f.startsWith(CADENCE_DIR_PREFIX));

  const declaredFiles = ctx.draft.tasks.flatMap((t) => t.files);
  if (declaredFiles.length === 0) {
    // Fail-open: an empty declared set means there is no boundary to enforce.
    return { outcome: 'pass' };
  }

  const events = runBoundaryCheck({
    declaredFiles,
    touchedFiles: filtered,
    stamp: () => new Date().toISOString(),
    root: ctx.cwd,
    severity: 'error',
  });

  if (events.length === 0) {
    return { outcome: 'pass' };
  }

  const offenders = events.map((e) => String(e.context.file));
  for (const file of offenders) {
    ctx.io.err(`boundary-scan: ${file} touched but not declared in any task's files:\n`);
  }

  const sealed = isGateSealed(ctx, 'boundary-scan');
  const bypassed = !sealed && (ctx.opts.force === true || ctx.opts.allowBoundaryScanFailure === true);
  if (!bypassed) {
    ctx.io.err(
      sealed
        ? 'settle run refused: boundary-scan found file(s) outside the declared boundary. ' +
            'This gate is sealed (gates.sealed) and cannot be bypassed with --force or ' +
            '--allow-boundary-scan-failure.\n'
        : 'settle run refused: boundary-scan found file(s) outside the declared boundary. ' +
            'Pass --allow-boundary-scan-failure to record them and settle anyway, or --force to bypass.\n',
    );
    return { outcome: 'refuse' };
  }

  const flag = ctx.opts.force === true ? '--force' : '--allow-boundary-scan-failure';
  ctx.io.err(`boundary-scan: ${flag} set; proceeding past ${offenders.length} offending file(s).\n`);
  return { outcome: 'pass', summaryPatch: { boundaryScan: { offenders } } };
};
