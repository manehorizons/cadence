import type { CadenceConfig } from '@cadence/types';
import { FileNotifier } from './file.js';
import { NullNotifier } from './null.js';
import { StderrNotifier } from './stderr.js';
import type { Notifier } from './notifier.js';

export interface SelectNotifierOptions {
  /** Test seam: stand in for `process.stderr.write`. */
  stderrWrite?: (chunk: string) => void;
}

const DEFAULT_FILE = '.cadence/anomalies.log';

/**
 * Resolves the configured anomaly transport. Backward-compatible: a config
 * without a `notify` field parses with `transport: 'stderr'`.
 */
export function selectNotifier(
  config: Pick<CadenceConfig, 'notify'> | null,
  opts: SelectNotifierOptions = {},
): Notifier {
  const transport = config?.notify?.transport ?? 'stderr';
  if (transport === 'none') return new NullNotifier();
  if (transport === 'file') {
    return new FileNotifier(config?.notify?.file ?? DEFAULT_FILE);
  }
  return new StderrNotifier({ write: opts.stderrWrite ?? ((c) => process.stderr.write(c)) });
}
