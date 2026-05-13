import { writeFile, rename, unlink } from 'node:fs/promises';

export async function atomicWriteJSON(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  const data = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tmp, data, { encoding: 'utf8' });
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function atomicWriteText(path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, text, { encoding: 'utf8' });
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}
