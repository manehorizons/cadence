import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import { SimpleStateBackend } from '../state/simple.js';
import { loadConfig } from '../config/loader.js';
import { effectiveGateSet } from '../gates/engine.js';
import type { LoopViolationError } from '../errors.js';
import { selectNotifier } from './factory.js';

/**
 * Best-effort `loop-violation` anomaly dispatch from a CLI command's catch
 * block. Loads config + state + gate set; emits when `'anomaly-notify'` is
 * gated on; swallows any error along the way (the loop violation itself is
 * already being surfaced via the existing stderr message + exit 1, and
 * notification must never make things worse). Phase 23.3.
 */
export async function emitLoopViolation(
  cwd: string,
  err: LoopViolationError,
  source: string,
): Promise<void> {
  try {
    const backend = new SimpleStateBackend(cwd);
    const state = await backend.readState();
    const cfg = await loadConfig(cwd).catch(() => null);
    // No draft is reliably available in a loop-violation context — pass null
    // so the gate set uses the (state.tier, profile-from-config) signal.
    const gateSet = effectiveGateSet(state, cfg, null);
    if (!gateSet.gates.includes('anomaly-notify')) return;
    const ev: AnomalyEvent = {
      type: 'loop-violation',
      severity: 'error',
      message: err.message,
      context: {
        ...(err.expected !== undefined ? { expected: err.expected } : {}),
        ...(err.actual !== undefined ? { actual: err.actual } : {}),
        source,
      },
      ts: new Date().toISOString(),
    };
    const notifier = selectNotifier(cfg);
    try {
      await notifier.notify([ev]);
    } catch (notifyErr) {
      const msg = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
      process.stderr.write(
        `cadence-notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
      );
    }
  } catch {
    /* best-effort — never escalate from loop-violation emission */
  }
}
