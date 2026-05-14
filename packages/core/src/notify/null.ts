import type { AnomalyEvent } from '@cadence/types';
import type { Notifier } from './notifier.js';

/**
 * Drop-on-the-floor notifier. Used for `transport: 'none'` and tests that
 * want to verify silence.
 */
export class NullNotifier implements Notifier {
  readonly name = 'null';
  async notify(_events: AnomalyEvent[]): Promise<void> {
    // intentional no-op
  }
}
