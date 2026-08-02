import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import type { Notifier } from './notifier.js';

export interface WebhookNotifierOptions {
  url: string;
  headers?: Record<string, string>;
  /** Per-request timeout in ms. Defaults to 5000. */
  timeoutMs?: number;
  /** Test seam: stand in for `process.stderr.write`. */
  stderrWrite?: (chunk: string) => void;
  /** Test seam: stand in for global `fetch`. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * POSTs the batched anomaly events to a user-provided URL as
 * `{events: AnomalyEvent[]}` JSON. Phase 19.1 generic webhook primitive —
 * bring your own bridge (Slack incoming, Discord webhook, Zapier catch,
 * n8n hook, continuity-runtime ingester, etc.). On any transport failure
 * (network / non-2xx / timeout) the notifier writes one stderr warning and
 * resolves — settle never breaks on transport errors. The URL is sensitive
 * (may carry a token) and is NEVER included in the failure message.
 */
export class WebhookNotifier implements Notifier {
  readonly name = 'webhook';
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly stderrWrite: (chunk: string) => void;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: WebhookNotifierOptions) {
    this.url = opts.url;
    this.headers = opts.headers ?? {};
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.stderrWrite = opts.stderrWrite ?? ((c) => process.stderr.write(c));
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async notify(events: AnomalyEvent[]): Promise<void> {
    if (events.length === 0) return;
    const body = JSON.stringify({ events });
    const headers: Record<string, string> = {
      ...this.headers,
      // Content-Type is fixed — overlaying caller headers ensures application/json wins.
      'Content-Type': 'application/json',
    };
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        this.warn(`HTTP ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.warn(msg);
    }
  }

  private warn(message: string): void {
    // Intentionally never log the URL or headers (URL may carry a secret).
    this.stderrWrite(`cadence-notify: webhook transport failed — ${message} (continuing)\n`);
  }
}
