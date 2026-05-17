import { describe, expect, it, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { cadenceBackend } from '../../src/intelligence/backend/cadence.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadenceBackend', () => {
  it('detects an initialized repo and reports IDLE status + legal action', async () => {
    active = await tempRepo({ initialized: true, projectName: 'backend-fix' });

    expect((await cadenceBackend.detect(active.root)).present).toBe(true);

    const status = await cadenceBackend.readStatus(active.root);
    expect(status.present).toBe(true);
    expect(status.kind).toBe('cadence');
    expect(status.loopPosition).toBe('IDLE');
    expect(status.tier).toBeNull();
    expect(status.stateError).toBeUndefined();

    const legal = await cadenceBackend.listLegalActions(active.root);
    expect(legal).toHaveLength(1);
    expect(legal[0]).toMatch(/cadence draft new/);

    const artifacts = await cadenceBackend.readArtifacts(active.root);
    expect(artifacts.phaseCount).toBe(0);
    expect(typeof artifacts.roadmap).toBe('boolean');
  });

  it('surfaces a corrupt state.json as stateError without throwing', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, '.cadence', 'state.json'), '{ not json', 'utf8');

    const status = await cadenceBackend.readStatus(active.root);
    expect(status.present).toBe(true);
    expect(status.stateError).toBeTruthy();
    expect(status.loopPosition).toBeUndefined();
  });

  it('reports not present when .cadence is absent', async () => {
    active = await tempRepo({ initialized: false });
    expect((await cadenceBackend.detect(active.root)).present).toBe(false);
  });
});
