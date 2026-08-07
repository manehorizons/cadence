import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import {
  checkRoadmapCurrency,
  runDoctor,
  ROADMAP_DRIFT_WARN_THRESHOLD,
} from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const ENV = { nodeVersion: 'v22.11.0', platform: 'linux' as const };

/** Creates an (empty) phase directory under `.cadence/phases/<dirName>` so
 *  `checkRoadmapCurrency` sees an on-disk phase to compute against. */
async function addPhaseDir(root: string, dirName: string): Promise<void> {
  await mkdir(join(root, '.cadence', 'phases', dirName), { recursive: true });
}

async function writeRoadmap(root: string, content: string): Promise<void> {
  await writeFile(join(root, '.cadence', 'ROADMAP.md'), content);
}

async function writeMilestones(root: string, content: string): Promise<void> {
  await writeFile(join(root, '.cadence', 'MILESTONES.md'), content);
}

describe('checkRoadmapCurrency', () => {
  it('drift > 10 -> severity warning, fixId null, detail names the on-disk max and the included-files min (259-01/AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await addPhaseDir(active.root, '260-some-phase');
    await writeRoadmap(active.root, '# Roadmap\n\n### Phase 240 - Something\n');
    await writeMilestones(
      active.root,
      '# Milestones\n\n- **Phase 235** - Landed something.\n',
    );

    const check = await checkRoadmapCurrency(active.root);
    expect(check.name).toBe('roadmap-currency');
    expect(check.severity).toBe('warning');
    expect(check.fixId).toBeNull();
    // on-disk max (260) and the lower of the two included references (235,
    // from MILESTONES.md, not ROADMAP.md's 240) must both be named.
    expect(check.detail).toMatch(/\b260\b/);
    expect(check.detail).toMatch(/\b235\b/);
    expect(check.remediation).toMatch(/manual/i);
  });

  it('drift <= 10 -> severity ok', async () => {
    active = await tempRepo({ initialized: true });
    await addPhaseDir(active.root, '256-some-phase');
    await writeRoadmap(active.root, '# Roadmap\n\n### Phase 250 - Something\n');
    await writeMilestones(active.root, '# Milestones\n\n- **Phase 248** - Landed.\n');

    const check = await checkRoadmapCurrency(active.root);
    expect(check.severity).toBe('ok');
    expect(check.fixId).toBeNull();
    // drift = 256 - 248 = 8, within the threshold.
    expect(check.detail).toMatch(/\b8\b/);
  });

  it('a genuinely lagging MILESTONES.md pulls the min down even when ROADMAP.md is fully current', async () => {
    active = await tempRepo({ initialized: true });
    // ROADMAP.md references up through the same phase as the on-disk max —
    // a well-maintained ROADMAP.md, drift-from-ROADMAP-alone would be 0.
    await addPhaseDir(active.root, '256-some-phase');
    await writeRoadmap(active.root, '# Roadmap\n\n### Phase 256 - Something\n');
    // MILESTONES.md has real entries, just fewer/lower than ROADMAP.md.
    await writeMilestones(active.root, '# Milestones\n\n- **Phase 230** - Landed.\n');

    const check = await checkRoadmapCurrency(active.root);
    // A current ROADMAP.md must NOT suppress the warning caused by a
    // genuinely-lagging MILESTONES.md.
    expect(check.severity).toBe('warning');
    expect(check.detail).toMatch(/\b230\b/);
  });

  it('MILESTONES.md with zero Phase N headings is excluded from the min (never counted as 0) -> ok, not warning (259-01/AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    await addPhaseDir(active.root, '256-some-phase');
    // A well-kept ROADMAP.md, current with the on-disk max.
    await writeRoadmap(active.root, '# Roadmap\n\n### Phase 256 - Something\n');
    // MILESTONES.md is still just its fresh-init stub: zero `Phase N`
    // headings. If this were (wrongly) counted as 0, drift would be
    // 256 - 0 = 256, which would warn permanently. It must instead be
    // excluded from the min entirely, leaving drift = 256 - 256 = 0.
    await writeMilestones(active.root, '# Milestones\n');

    const check = await checkRoadmapCurrency(active.root);
    expect(check.severity).toBe('ok');
    expect(check.severity).not.toBe('warning');
    expect(check.fixId).toBeNull();
  });

  it('no phase directories under .cadence/phases/ -> silent ok (259-01/AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    // tempRepo({ initialized: true }) already creates an EMPTY
    // .cadence/phases/ directory — no phase subdirectories yet.

    const check = await checkRoadmapCurrency(active.root);
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/no phase director/i);
  });

  it('ROADMAP.md with zero ### Phase N headings -> silent ok regardless of MILESTONES.md content', async () => {
    active = await tempRepo({ initialized: true });
    await addPhaseDir(active.root, '260-some-phase');
    // ROADMAP.md left as the default fresh-init stub (`# Roadmap\n`) — zero
    // `### Phase N` headings.
    // MILESTONES.md has real, much-lower content — must NOT be consulted or
    // cause a warning once ROADMAP.md itself is the fresh-init stub.
    await writeMilestones(active.root, '# Milestones\n\n- **Phase 5** - Landed.\n');

    const check = await checkRoadmapCurrency(active.root);
    expect(check.severity).toBe('ok');
    // Pin this to the specific ROADMAP.md-is-the-fresh-stub short-circuit
    // (not just any path that happens to also land on 'ok').
    expect(check.detail).toMatch(/references no phases yet|fresh-init stub/i);
  });

  it('a read failure (ROADMAP.md missing after phases already exist) degrades to ok, never throws (259-01/AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    await addPhaseDir(active.root, '260-some-phase');
    await unlink(join(active.root, '.cadence', 'ROADMAP.md'));

    const check = await checkRoadmapCurrency(active.root);
    expect(check.severity).toBe('ok');
    expect(check.fixId).toBeNull();
    expect(check.detail).toMatch(/not determinable/i);
  });

  it('exports a documented 10-phase drift threshold constant', () => {
    expect(ROADMAP_DRIFT_WARN_THRESHOLD).toBe(10);
  });

  it('wired into runDoctor full check list, without ever producing severity error', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'roadmap-currency');
    expect(check).toBeDefined();
    expect(check?.severity).not.toBe('error');
  });
});
