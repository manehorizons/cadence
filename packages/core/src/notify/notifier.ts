import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';

/**
 * Transport for anomaly events emitted by settle (Phase 17).
 *
 * Implementations must:
 *  - be safe to construct without I/O beyond their target stream/path,
 *  - never block settle on failure — callers convert exceptions to warnings.
 */
export interface Notifier {
  readonly name: string;
  notify(events: AnomalyEvent[]): Promise<void>;
}
