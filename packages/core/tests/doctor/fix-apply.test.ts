import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFile, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { emptyState } from '@manehorizons/cadence-types';
import { runDoctor, HANDOFF_WARN_THRESHOLD } from '../../src/doctor/run.js';
import { planFixes, applyFixes, type FixPlan } from '../../src/doctor/fix.js';

/** Seed `count` dated SESSION docs under `.cadence/handoff/` (mirrors handoff-retention.test.ts). */
async function seedHandoffDocs(root: string, count: number): Promise<void> {
  const dir = join(root, '.cadence', 'handoff');
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const day = String(10 + i).padStart(2, '0');
    await writeFile(join(dir, `SESSION-2026-06-${day}.md`), '# seeded\n');
  }
}

const ENV = { nodeVersion: process.versions.node, platform: process.platform };
let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

// Phase 131 AC-2: the in-process auto repairs actually change the repo and the
// finding clears on a fresh run; failures are best-effort (reported, not thrown).
describe('applyFixes auto repairs (131 AC-2)', () => {
  it('AC-2: git-hooks repair sets core.hooksPath=.githooks and clears the finding', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    // Phase 133: the git-hooks check is only auto-fixable when .githooks/ exists.
    await mkdir(join(active.root, '.githooks'), { recursive: true });

    const plan = planFixes(await runDoctor(active.root, ENV));
    const outcomes = await applyFixes(active.root, plan, { wireHost: false });

    const hooksPath = execFileSync('git', ['config', '--local', 'core.hooksPath'], {
      cwd: active.root,
    })
      .toString()
      .trim();
    expect(hooksPath).toBe('.githooks');
    expect(outcomes.find((o) => o.fixId === 'git-hooks')?.status).toBe('applied');

    const after = await runDoctor(active.root, ENV);
    expect(after.checks.find((c) => c.name === 'git-hooks')?.severity).toBe('ok');
  });

  it('AC-2: state-md repair regenerates STATE.md without rewriting state.json', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.cadence', 'state.json');
    const stateBefore = await readFile(statePath, 'utf8');
    await rm(join(active.root, '.cadence', 'STATE.md'));

    const plan = planFixes(await runDoctor(active.root, ENV));
    const outcomes = await applyFixes(active.root, plan, { wireHost: false });

    expect(existsSync(join(active.root, '.cadence', 'STATE.md'))).toBe(true);
    expect(outcomes.find((o) => o.fixId === 'state-md')?.status).toBe('applied');
    expect(await readFile(statePath, 'utf8')).toBe(stateBefore);

    const after = await runDoctor(active.root, ENV);
    expect(after.checks.find((c) => c.name === 'state')?.severity).toBe('ok');
  });

  it('AC-2: a failing repair is reported best-effort without throwing', async () => {
    active = await tempRepo({ initialized: true }); // no .git → git config fails
    const plan: FixPlan = {
      actions: [
        { check: 'git-hooks', kind: 'auto', fixId: 'git-hooks', title: 't', detail: 'd' },
      ],
    };
    const outcomes = await applyFixes(active.root, plan, { wireHost: false });
    expect(outcomes[0]?.status).toBe('failed');
    expect(outcomes[0]?.message.length).toBeGreaterThan(0);
  });

  it('AC-2 (phase 190): handoff-retention repair sets handoff.retain and prunes to budget, keeping lastHandoff', async () => {
    active = await tempRepo({ initialized: true }); // config.json has handoff.retain unset
    await seedHandoffDocs(active.root, 12); // days 10..21 → 12 docs, threshold is 10

    // The oldest doc (day 10) would normally be pruned by keep-newest-10 —
    // point state.session.lastHandoff at it so the test also exercises the
    // "current is always retained" invariant.
    const oldest = 'SESSION-2026-06-10.md';
    const state = emptyState('fix-apply-handoff-retention');
    state.session = { ...state.session, lastHandoff: oldest };
    await writeFile(join(active.root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));

    const before = await runDoctor(active.root, ENV);
    expect(before.checks.find((c) => c.name === 'handoff-retention')?.severity).toBe('warning');

    const plan = planFixes(before);
    const outcomes = await applyFixes(active.root, plan, { wireHost: false });
    expect(outcomes.find((o) => o.fixId === 'handoff-retention')?.status).toBe('applied');

    const config = JSON.parse(
      await readFile(join(active.root, '.cadence', 'config.json'), 'utf8'),
    ) as { handoff?: { retain?: number } };
    expect(config.handoff?.retain).toBe(HANDOFF_WARN_THRESHOLD);

    const dir = join(active.root, '.cadence', 'handoff');
    const remaining = (await readdir(dir)).filter((n) => /^SESSION-.*\.md$/.test(n));
    // The newest 10 (days 12..21) are always kept; `current` (day 10) is
    // force-retained per `selectPrunable`'s invariant even though it would
    // otherwise fall outside that window — only day 11 gets pruned, so the
    // dir settles at 11, one over budget, by design of that invariant.
    expect(remaining.length).toBeLessThanOrEqual(HANDOFF_WARN_THRESHOLD + 1);
    expect(remaining).toContain(oldest); // current lastHandoff always survives
    expect(remaining).not.toContain('SESSION-2026-06-11.md');

    const after = await runDoctor(active.root, ENV);
    expect(after.checks.find((c) => c.name === 'handoff-retention')?.severity).toBe('ok');
  });

  it('AC-3 (phase 190): handoff-retention repair is a true no-op when the check already passes', async () => {
    active = await tempRepo({ initialized: true }); // handoff.retain unset by default
    await seedHandoffDocs(active.root, 3); // below HANDOFF_WARN_THRESHOLD (10) → check passes

    const configPath = join(active.root, '.cadence', 'config.json');
    const dir = join(active.root, '.cadence', 'handoff');
    const configBefore = await readFile(configPath, 'utf8');
    const filesBefore = (await readdir(dir)).sort();

    const before = await runDoctor(active.root, ENV);
    expect(before.checks.find((c) => c.name === 'handoff-retention')?.severity).toBe('ok');

    const plan = planFixes(before);
    expect(plan.actions.some((a) => a.check === 'handoff-retention')).toBe(false);

    const outcomes = await applyFixes(active.root, plan, { wireHost: false });
    expect(outcomes.some((o) => o.fixId === 'handoff-retention')).toBe(false);

    expect(await readFile(configPath, 'utf8')).toBe(configBefore);
    expect((await readdir(dir)).sort()).toEqual(filesBefore);
  });
});
