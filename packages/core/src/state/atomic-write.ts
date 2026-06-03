import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

/**
 * Windows transiently fails `rename` over an existing file with EPERM /
 * EACCES / EBUSY when another handle (antivirus, indexer, a concurrent
 * reader) is briefly open on the target. Retry a few times with a short
 * backoff before giving up — this is the root cause of intermittent
 * state-write flakes under parallel test load.
 */
const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_MAX_ATTEMPTS = 10;
const RENAME_BACKOFF_MS = 15;

function tmpPath(path: string): string {
  // Unique per write so concurrent writers to the same target never share a
  // temp file (and a failed unlink can't clobber another write's temp).
  return `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
}

async function renameWithRetry(tmp: string, path: string): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RENAME_MAX_ATTEMPTS; attempt++) {
    try {
      await rename(tmp, path);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === undefined || !RENAME_RETRY_CODES.has(code)) throw err;
      await new Promise((r) => setTimeout(r, RENAME_BACKOFF_MS * (attempt + 1)));
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
