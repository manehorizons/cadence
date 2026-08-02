// packages/core/tests/handoff/locate.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { locateFreshestHandoff } from '../../src/handoff/locate.js';

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

async function writeSession(root: string, name: string, generatedAt: string, loopPosition = 'IDLE'): Promise<void> {
  const dir = join(root, '.cadence', 'handoff');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name),
    `---\ncadence_handoff: 1\ngenerated_at: ${generatedAt}\nloop_position: ${loopPosition}\n---\n# x\n`);
}

describe('locateFreshestHandoff', () => {
  it('AC-9: returns null when the handoff dir is empty', async () => {
    active = await tempRepo({ initialized: true });
    expect(await locateFreshestHandoff(active.root, null)).toBeNull();
  });

  it('AC-10: picks the newest by generated_at when no pointer is given', async () => {
    active = await tempRepo({ initialized: true });
    await writeSession(active.root, 'SESSION-2026-06-01.md', '2026-06-01T10:00:00.000Z');
    await writeSession(active.root, 'SESSION-2026-06-03.md', '2026-06-03T10:00:00.000Z', 'BUILD');
    const found = await locateFreshestHandoff(active.root, null);
    expect(found?.path.endsWith('SESSION-2026-06-03.md')).toBe(true);
    expect(found?.loopPosition).toBe('BUILD');
  });

  it('AC-11: prefers the lastHandoff pointer when its file exists', async () => {
    active = await tempRepo({ initialized: true });
    await writeSession(active.root, 'SESSION-2026-06-01.md', '2026-06-01T10:00:00.000Z');
    await writeSession(active.root, 'SESSION-2026-06-03.md', '2026-06-03T10:00:00.000Z');
    const found = await locateFreshestHandoff(active.root, 'SESSION-2026-06-01.md');
    expect(found?.path.endsWith('SESSION-2026-06-01.md')).toBe(true);
  });

  it('AC-12: falls back to globbing when the pointer file is missing', async () => {
    active = await tempRepo({ initialized: true });
    await writeSession(active.root, 'SESSION-2026-06-03.md', '2026-06-03T10:00:00.000Z');
    const found = await locateFreshestHandoff(active.root, 'SESSION-gone.md');
    expect(found?.path.endsWith('SESSION-2026-06-03.md')).toBe(true);
  });
});
