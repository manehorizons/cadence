import { describe, it, expect, afterEach } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { cadenceBackend } from '../../src/intelligence/backend/cadence.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadenceBackend legalActions — occupancy-aware IDLE suggestion', () => {
  it('AC-4: the IDLE legal action prints the simplified auto-derived draft command', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.cadence', 'phases', '40-foo'), { recursive: true });

    const status = await cadenceBackend.readStatus(active.root);
    expect(status.loopPosition).toBe('IDLE');
    expect(status.legalActions).toHaveLength(1);
    expect(status.legalActions[0]).toBe('cadence draft new --title "..."');
    expect(status.legalActions[0]).not.toContain('<num>');
  });

  it('AC-4: with no phases the IDLE legal action still avoids positional placeholders', async () => {
    active = await tempRepo({ initialized: true });
    const status = await cadenceBackend.readStatus(active.root);
    expect(status.legalActions[0]).toBe('cadence draft new --title "..."');
  });
});
