import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import { SimpleStateBackend } from '../state/simple.js';
import { loadConfig } from '../config/loader.js';
import { effectiveGateSet } from '../gates/engine.js';
import { resolvePacks, type ResolvedPack } from '../packs/resolve.js';
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
    // Phase 292 (Slice 3, T2) — REAL pack resolution when a config is
    // available, an explicit `[]` when it is not. The gate set here is only
    // probed for `anomaly-notify` membership, but that gate is pack-reachable:
    // `DELTAS` (`gates/engine.ts`) omits it from all three `strict` cells and
    // from `standard × quick-fix`, so a pack adding it there is the difference
    // between a loop violation being dispatched to the configured notifier and
    // being silently dropped.
    //
    // The `cfg === null` branch passes `[]` explicitly and unavoidably (AC-2):
    // `resolvePacks` needs `Pick<CadenceConfig, 'packs'>` to know which ids
    // are enabled, and a failed `loadConfig` leaves nothing to read that from
    // — an on-disk manifest is never self-enabling. Behavior on that branch is
    // byte-identical to pre-Slice-3.
    let resolvedPacks: ResolvedPack[] = [];
    if (cfg) {
      try {
        resolvedPacks = await resolvePacks(cwd, cfg);
      } catch {
        resolvedPacks = [];
      }
    }
    // No draft is reliably available in a loop-violation context — pass null
    // so the gate set uses the (state.tier, profile-from-config) signal.
    const gateSet = effectiveGateSet(state, cfg, null, resolvedPacks);
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
