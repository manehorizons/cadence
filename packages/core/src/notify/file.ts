import { mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import type { Notifier } from './notifier.js';

/**
 * Appends NDJSON lines (one event per line) to a file. Creates parent
 * directories if needed. Operator owns rotation/truncation.
 */
export class FileNotifier implements Notifier {
  readonly name = 'file';
  constructor(private readonly path: string) {}

  async notify(events: AnomalyEvent[]): Promise<void> {
    if (events.length === 0) return;
    await mkdir(dirname(this.path), { recursive: true });
    const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await appendFile(this.path, body, 'utf8');
  }
}
