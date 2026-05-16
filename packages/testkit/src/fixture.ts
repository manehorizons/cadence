import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState } from '@cadence/types';

export interface Fixture {
  root: string;
  cleanup: () => Promise<void>;
}

export interface FixtureOptions {
  initialized?: boolean;
  projectName?: string;
}

export async function tempRepo(opts: FixtureOptions = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'cadence-test-'));
  if (opts.initialized) {
    const cadenceDir = join(root, '.cadence');
    await mkdir(join(cadenceDir, 'phases'), { recursive: true });
    await mkdir(join(cadenceDir, 'handoff'), { recursive: true });
    await writeFile(join(cadenceDir, 'config.json'), JSON.stringify(defaultConfig, null, 2));
    await writeFile(
      join(cadenceDir, 'state.json'),
      JSON.stringify(emptyState(opts.projectName ?? 'unnamed'), null, 2),
    );
    await writeFile(join(cadenceDir, 'PROJECT.md'), `# ${opts.projectName ?? 'unnamed'}\n`);
    await writeFile(join(cadenceDir, 'ROADMAP.md'), `# Roadmap\n`);
    await writeFile(join(cadenceDir, 'STATE.md'), `# State\n\nLoop position: IDLE\n`);
    await writeFile(join(cadenceDir, 'MILESTONES.md'), `# Milestones\n`);
  }
  return {
    root,
    cleanup: async () =>
      rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
}
