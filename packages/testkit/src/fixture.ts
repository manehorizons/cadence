import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState } from '@keel/types';

export interface Fixture {
  root: string;
  cleanup: () => Promise<void>;
}

export interface FixtureOptions {
  initialized?: boolean;
  projectName?: string;
}

export async function tempRepo(opts: FixtureOptions = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'keel-test-'));
  if (opts.initialized) {
    const keelDir = join(root, '.keel');
    await mkdir(join(keelDir, 'phases'), { recursive: true });
    await mkdir(join(keelDir, 'handoff'), { recursive: true });
    await writeFile(join(keelDir, 'config.json'), JSON.stringify(defaultConfig, null, 2));
    await writeFile(
      join(keelDir, 'state.json'),
      JSON.stringify(emptyState(opts.projectName ?? 'unnamed'), null, 2),
    );
    await writeFile(join(keelDir, 'PROJECT.md'), `# ${opts.projectName ?? 'unnamed'}\n`);
    await writeFile(join(keelDir, 'ROADMAP.md'), `# Roadmap\n`);
    await writeFile(join(keelDir, 'STATE.md'), `# State\n\nLoop position: IDLE\n`);
    await writeFile(join(keelDir, 'MILESTONES.md'), `# Milestones\n`);
  }
  return {
    root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}
