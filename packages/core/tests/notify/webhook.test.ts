import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AnomalyEvent } from '@manehorizons/cadence-types';
import { WebhookNotifier } from '../../src/notify/webhook.js';
import { selectNotifier } from '../../src/notify/factory.js';

// AC-2, AC-3, AC-4: WebhookNotifier POSTs {events}, degrades gracefully,
// factory routes transport=webhook to it.

interface Captured {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

interface ServerHarness {
  port: number;
  url: string;
  captured: Captured[];
  setStatus: (code: number) => void;
  setDelay: (ms: number) => void;
  close: () => Promise<void>;
}

async function startServer(): Promise<ServerHarness> {
  const captured: Captured[] = [];
  let status = 200;
  let delay = 0;
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      captured.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers as Record<string, string | string[] | undefined>,
        body,
      });
      const send = () => {
        res.statusCode = status;
        res.end();
      };
      if (delay > 0) setTimeout(send, delay);
      else send();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    url: `http://127.0.0.1:${port}/hook`,
    captured,
    setStatus: (code: number) => { status = code; },
    setDelay: (ms: number) => { delay = ms; },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const sampleEvent: AnomalyEvent = {
  type: 'ac-blocked',
  severity: 'warn',
  message: 'T1 BLOCKED (AC-1)',
  context: { taskId: 'T1' },
};

let harness: ServerHarness | null = null;
afterEach(async () => {
  if (harness) {
    await harness.close();
    harness = null;
  }
});

describe('WebhookNotifier', () => {
  it('POSTs {events:[...]} JSON to the configured URL (AC-2)', async () => {
    harness = await startServer();
    const n = new WebhookNotifier({ url: harness.url });
    await n.notify([sampleEvent]);
    expect(harness.captured).toHaveLength(1);
    const r = harness.captured[0]!;
    expect(r.method).toBe('POST');
    expect(r.url).toBe('/hook');
    expect(r.headers['content-type']).toBe('application/json');
    const parsed = JSON.parse(r.body);
    expect(parsed).toEqual({ events: [sampleEvent] });
  });

  it('passes caller-provided headers (e.g., Authorization) (AC-2)', async () => {
    harness = await startServer();
    const n = new WebhookNotifier({
      url: harness.url,
      headers: { Authorization: 'Bearer abc-123' },
    });
    await n.notify([sampleEvent]);
    expect(harness.captured[0]!.headers['authorization']).toBe('Bearer abc-123');
    // Content-Type is still application/json (caller cannot override).
    expect(harness.captured[0]!.headers['content-type']).toBe('application/json');
  });

  it('non-2xx response → stderr warn + resolves (AC-3)', async () => {
    harness = await startServer();
    harness.setStatus(503);
    const warned: string[] = [];
    const n = new WebhookNotifier({
      url: harness.url,
      stderrWrite: (s) => warned.push(s),
    });
    await expect(n.notify([sampleEvent])).resolves.toBeUndefined();
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/^cadence-notify: webhook transport failed — HTTP 503/);
    // URL must NOT appear in the warning (sensitive).
    expect(warned[0]).not.toContain(harness.url);
    expect(warned[0]).not.toContain('127.0.0.1');
  });

  it('timeout → stderr warn + resolves (AC-3)', async () => {
    harness = await startServer();
    harness.setDelay(200);
    const warned: string[] = [];
    const n = new WebhookNotifier({
      url: harness.url,
      timeoutMs: 50,
      stderrWrite: (s) => warned.push(s),
    });
    await expect(n.notify([sampleEvent])).resolves.toBeUndefined();
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/webhook transport failed/);
  });

  it('empty events array → no network call (AC-2)', async () => {
    harness = await startServer();
    const n = new WebhookNotifier({ url: harness.url });
    await n.notify([]);
    expect(harness.captured).toHaveLength(0);
  });

  it('does not log URL or auth header on failure (AC-3 secret-safety)', async () => {
    const warned: string[] = [];
    const fakeFetch: typeof fetch = async () => {
      throw new Error('synthetic network error');
    };
    const n = new WebhookNotifier({
      url: 'https://hooks.slack.com/services/SECRET/TOKEN/abc',
      headers: { Authorization: 'Bearer SECRET' },
      stderrWrite: (s) => warned.push(s),
      fetchImpl: fakeFetch,
    });
    await n.notify([sampleEvent]);
    expect(warned).toHaveLength(1);
    expect(warned[0]).not.toContain('SECRET');
    expect(warned[0]).not.toContain('TOKEN');
    expect(warned[0]).not.toContain('hooks.slack.com');
    expect(warned[0]).toContain('synthetic network error');
  });
});

describe('selectNotifier transport=webhook (AC-4)', () => {
  it('returns a WebhookNotifier for transport=webhook', async () => {
    harness = await startServer();
    const n = selectNotifier({
      notify: {
        transport: 'webhook',
        webhook: { url: harness.url },
      },
    });
    expect(n).toBeInstanceOf(WebhookNotifier);
    expect(n.name).toBe('webhook');
    await n.notify([sampleEvent]);
    expect(harness.captured).toHaveLength(1);
  });
});
