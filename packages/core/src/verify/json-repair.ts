import type { ZodType } from 'zod/v4';

/** A single chat-style message in the transport-agnostic repair conversation. */
export interface RepairMessage {
  role: string;
  content: string;
}

export interface RunWithRepairOptions<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  /**
   * Transport-specific call: given the full message list, return the raw
   * (possibly non-JSON, possibly fenced) response content. Implementations
   * own their own error handling/logging for the underlying call; this
   * harness only orchestrates the repair-retry loop and JSON/schema
   * extraction on top of whatever string comes back.
   */
  transport: (messages: RepairMessage[]) => Promise<string>;
  /** Initial call + this many repair retries before throwing. Defaults to 2. */
  maxRepairRetries?: number;
  /**
   * Builds the final error message when all retries are exhausted, given the
   * last schema/parse error and the retry count actually used. Lets each
   * transport keep its own provider-specific error phrasing.
   */
  buildError: (lastError: string, retries: number) => string;
}

/** Initial call + this many repair retries before throwing, when not overridden. */
export const DEFAULT_MAX_REPAIR_RETRIES = 2;

/** Extract a JSON object from model content: drop fences, slice first { … last }. */
export function extractJson(content: string): string {
  const noFence = content.replace(/```(?:json)?/gi, '');
  const start = noFence.indexOf('{');
  const end = noFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return noFence.trim();
  return noFence.slice(start, end + 1);
}

export function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined; // schema.safeParse(undefined) fails → triggers repair/throw
  }
}

/**
 * Transport-agnostic JSON-extraction + schema-repair-retry harness. Owns the
 * conversation shape (system/user, then assistant/user repair turns) and the
 * extract → parse → validate → retry loop; callers supply the actual
 * request/response transport (HTTP fetch, subprocess spawn, etc.) and how to
 * phrase the final error.
 */
export async function runWithRepair<T>(o: RunWithRepairOptions<T>): Promise<T> {
  const maxRetries = o.maxRepairRetries ?? DEFAULT_MAX_REPAIR_RETRIES;
  const messages: RepairMessage[] = [
    { role: 'system', content: o.system },
    { role: 'user', content: o.user },
  ];

  let raw = await o.transport(messages);
  let parsed = o.schema.safeParse(safeJson(extractJson(raw)));
  let lastError = parsed.success ? '' : parsed.error.message;

  for (let retry = 0; !parsed.success && retry < maxRetries; retry++) {
    // Repair retry: feed back the bad output + the validation error.
    const repairMessages = [
      ...messages,
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content:
          'That was not valid. Return ONLY strict JSON matching the required schema, no prose, no code fences. Error: ' +
          lastError,
      },
    ];
    raw = await o.transport(repairMessages);
    parsed = o.schema.safeParse(safeJson(extractJson(raw)));
    if (!parsed.success) lastError = parsed.error.message;
  }

  if (parsed.success) return parsed.data;

  throw new Error(o.buildError(lastError, maxRetries));
}
