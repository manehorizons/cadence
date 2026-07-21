import type { AnomalyEvent, AnomalyType } from '@manehorizons/cadence-types';
import type { selectNotifier } from './factory.js';

/**
 * Phase 42.1 — the shared transport spine for the three convergence
 * "unconverged" emitters (`plan-review`, `spec-review`, `code-review@settle`).
 * Builds the single `*-unconverged` anomaly from a kind + payload, stamps `ts`,
 * dispatches it, and degrades a transport failure to one stderr warning (never
 * throws — the refusal/exit is computed independently by the caller).
 *
 * All three are UNCONDITIONAL by design (no `anomaly-notify` guard): a hard
 * human-escalation must leave an audit trail. The three differ only in the
 * anomaly `type`, the `context` entity key (`draftId`/`specId`), and the
 * message prefix word — which is the `kind` verbatim.
 */
export type UnconvergedKind = 'plan-review' | 'spec-review' | 'ui-spec-review' | 'code-review';

interface UnconvergedMeta {
  type: AnomalyType;
  entityKey: 'draftId' | 'specId';
}

const KIND_META: Record<UnconvergedKind, UnconvergedMeta> = {
  'plan-review': { type: 'plan-review-unconverged', entityKey: 'draftId' },
  'spec-review': { type: 'spec-review-unconverged', entityKey: 'specId' },
  'ui-spec-review': { type: 'ui-spec-review-unconverged', entityKey: 'specId' },
  'code-review': { type: 'code-review-unconverged', entityKey: 'draftId' },
};

export interface UnconvergedPayload {
  /** The draft id (plan/code-review) or spec id (spec-review). */
  entityId: string;
  attempts: number;
  maxAttempts: number;
  findings: number;
  provider: string;
  model?: string;
  bypassed?: boolean;
}

export async function emitUnconverged(
  notifier: ReturnType<typeof selectNotifier>,
  kind: UnconvergedKind,
  payload: UnconvergedPayload,
): Promise<void> {
  const meta = KIND_META[kind];
  const event: AnomalyEvent = {
    type: meta.type,
    severity: 'error',
    message: `${kind} did not converge for ${payload.entityId} after ${payload.attempts}/${payload.maxAttempts} attempts (${payload.findings} finding(s))`,
    context: {
      [meta.entityKey]: payload.entityId,
      attempts: payload.attempts,
      maxAttempts: payload.maxAttempts,
      findings: payload.findings,
      provider: payload.provider,
      ...(payload.model !== undefined ? { model: payload.model } : {}),
      ...(payload.bypassed !== undefined ? { bypassed: payload.bypassed } : {}),
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
