import type { AnomalyEvent } from '@cadence/types';
import type { Notifier } from './notifier.js';

export interface StderrNotifierOptions {
  /** Test seam: stand in for `process.stderr.write`. */
  write?: (chunk: string) => void;
}

/**
 * Renders one line per event to stderr (or an injected writer) in the form:
 *   `cadence anomaly [severity] type: message`
 */
export class StderrNotifier implements Notifier {
  readonly name = 'stderr';
  private readonly write: (chunk: string) => void;

  constructor(opts: StderrNotifierOptions = {}) {
    this.write = opts.write ?? ((c) => process.stderr.write(c));
  }

  async notify(events: AnomalyEvent[]): Promise<void> {
    for (const e of events) {
      this.write(`cadence anomaly [${e.severity}] ${e.type}: ${e.message}\n`);
    }
  }
}
