import { writeFile, rename as fsRename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

/**
 * Windows transiently fails `rename` over an existing file with EPERM /
 * EACCES / EBUSY when another handle (antivirus, indexer, a concurrent
 * reader) is briefly open on the target. Retry a few times with an
 * escalating backoff before giving up — this is the root cause of
 * intermittent state-write flakes under parallel test load. The backoff base
 * is sized to give slow Windows CI runners ample headroom (see
 * `renameBackoffBudgetMs`).
 */
const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
export const RENAME_MAX_ATTEMPTS = 10;
export const RENAME_BACKOFF_MS = 25;

/**
 * Total wall-clock the retry loop will wait across all attempts before giving
 * up: the backoff escalates linearly (base × attempt#), so the budget is
 * base × triangular(maxAttempts). With base=25, attempts=10 → 25×55 = 1375ms.
 */
export function renameBackoffBudgetMs(base = RENAME_BACKOFF_MS): number {
  const n = RENAME_MAX_ATTEMPTS;
  return base * ((n * (n + 1)) / 2);
}

export interface RenameRetryOptions {
  /** Injectable rename impl (defaults to node:fs/promises rename). */
  rename?: (oldPath: string, newPath: string) => Promise<void>;
  /** Backoff base in ms (defaults to RENAME_BACKOFF_MS; pass 0 in tests). */
  backoffMs?: number;
}

function tmpPath(path: string): string {
  // Unique per write so concurrent writers to the same target never share a
  // temp file (and a failed unlink can't clobber another write's temp).
  return `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
}

export async function renameWithRetry(
  tmp: string,
  path: string,
  opts: RenameRetryOptions = {},
): Promise<void> {
  const rename = opts.rename ?? fsRename;
  const backoff = opts.backoffMs ?? RENAME_BACKOFF_MS;
  let lastErr: unknown;
  for (let attempt = 0; attempt < RENAME_MAX_ATTEMPTS; attempt++) {
    try {
      await rename(tmp, path);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === undefined || !RENAME_RETRY_CODES.has(code)) throw err;
      await new Promise((r) => setTimeout(r, backoff * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function atomicWrite(path: string, data: string): Promise<void> {
  const tmp = tmpPath(path);
  await writeFile(tmp, data, { encoding: 'utf8' });
  try {
    await renameWithRetry(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function atomicWriteJSON(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function atomicWriteText(path: string, text: string): Promise<void> {
  await atomicWrite(path, text);
}
