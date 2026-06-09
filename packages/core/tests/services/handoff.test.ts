// packages/core/tests/services/handoff.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultConfig } from '@manehorizons/cadence-types';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { handoffService } from '../../src/services/handoff.js';
import { bufferIO } from '../../src/services/io.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('handoffService retention reporting (AC-5)', () => {
  it('AC-5: prints a pruned line listing removed docs when retention deletes docs', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.cadence', 'handoff');
    await mkdir(dir, { recursive: true });
    for (const n of ['SESSION-2026-06-05.md', 'SESSION-2026-06-06.md', 'SESSION-2026-06-07.md']) {
      await writeFile(join(dir, n), '# seeded\n');
    }
    await writeFile(
      join(active.root, '.cadence', 'config.json'),
      JSON.stringify({ ...defaultConfig, handoff: { retain: 1 } }, null, 2),
    );

    const io = bufferIO();
    const res = await handoffService(active.root, { label: 'svc' }, io);

    expect(res.exitCode).toBe(0);
    expect((res.data as { pruned: string[] }).pruned.length).toBeGreaterThan(0);
    expect(io.stdout()).toMatch(/handoff: pruned \d+ stale doc\(s\):/);
  });

  it('AC-5: prints no pruned line when retention is disabled', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.cadence', 'handoff');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SESSION-2026-06-05.md'), '# seeded\n');

    const io = bufferIO();
    const res = await handoffService(active.root, { label: 'svc' }, io);

    expect(res.exitCode).toBe(0);
    expect(io.stdout()).not.toMatch(/pruned/);
  });
});
