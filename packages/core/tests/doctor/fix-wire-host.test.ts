import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { runDoctor } from '../../src/doctor/run.js';
import { planFixes, applyFixes } from '../../src/doctor/fix.js';

const ENV = { nodeVersion: process.versions.node, platform: process.platform };
let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

// A repo where BOTH host checks fail → two actions sharing fixId host-install.
async function repoWithHostFindings(): Promise<Fixture> {
  const fx = await tempRepo({ initialized: true });
  await mkdir(join(fx.root, '.claude', 'commands'), { recursive: true });
  await writeFile(join(fx.root, '.claude', 'settings.json'), '{}'); // host-hooks
  await writeFile(
    join(fx.root, '.claude', 'commands', 'cadence-progress.md'),
    '<!-- managed-by: cadence -->\n\n!node /abs/path/cli/index.js progress\n', // host-commands
  );
  return fx;
}

// Phase 131 AC-4: host repairs are opt-in (--wire-host) and the shared install
// runs at most once even though two findings request it.
describe('applyFixes wire-host gating + dedupe (131 AC-4)', () => {
  it('AC-4: --wire-host invokes the host install exactly once though two checks request it', async () => {
    active = await repoWithHostFindings();
    const plan = planFixes(await runDoctor(active.root, ENV));
    expect(plan.actions.filter((a) => a.fixId === 'host-install').length).toBe(2);

    let calls = 0;
    const outcomes = await applyFixes(active.root, plan, { wireHost: true }, {
      hostInstall: async () => {
        calls++;
        return 0;
      },
    });
    expect(calls).toBe(1);
    const hostOutcomes = outcomes.filter((o) => o.fixId === 'host-install');
    expect(hostOutcomes).toHaveLength(2);
    expect(hostOutcomes.every((o) => o.status === 'applied')).toBe(true);
  });

  it('AC-4: plain --fix does not invoke the host install and reports it not-applied', async () => {
    active = await repoWithHostFindings();
    const plan = planFixes(await runDoctor(active.root, ENV));

    let calls = 0;
    const outcomes = await applyFixes(active.root, plan, { wireHost: false }, {
      hostInstall: async () => {
        calls++;
        return 0;
      },
    });
    expect(calls).toBe(0);
    const hostOutcomes = outcomes.filter((o) => o.fixId === 'host-install');
    expect(hostOutcomes).toHaveLength(2);
    expect(hostOutcomes.every((o) => o.status === 'skipped')).toBe(true);
  });

  it('runs the Codex host install once for shared Codex host findings', async () => {
    const plan = {
      actions: [
        {
          check: 'codex-hooks',
          kind: 'wire-host' as const,
          fixId: 'codex-host-install',
          title: 't',
          detail: 'd',
        },
        {
          check: 'codex-prompts',
          kind: 'wire-host' as const,
          fixId: 'codex-host-install',
          title: 't',
          detail: 'd',
        },
      ],
    };
    let calls = 0;
    const outcomes = await applyFixes('/repo', plan, { wireHost: true }, {
      codexHostInstall: async () => {
        calls++;
        return 0;
      },
    });
    expect(calls).toBe(1);
    expect(outcomes.every((o) => o.status === 'applied')).toBe(true);
  });
});
