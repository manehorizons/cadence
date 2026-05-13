import { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { presets, emptyState } from '@keel/types';
import { atomicWriteJSON } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new .keel/ directory in the current working tree')
    .option('--name <project>', 'Project name', 'unnamed')
    .option('--profile <preset>', 'Config preset: solo | team | production', 'team')
    .action(async (opts: { name: string; profile: 'solo' | 'team' | 'production' }) => {
      const cwd = process.cwd();
      const keelDir = join(cwd, '.keel');
      if (existsSync(keelDir)) {
        console.error('.keel/ already initialized in this directory');
        process.exit(2);
      }
      const cfg = presets[opts.profile];
      if (!cfg) {
        console.error(`Unknown profile: ${opts.profile}`);
        process.exit(2);
      }
      await mkdir(join(keelDir, 'phases'), { recursive: true });
      await mkdir(join(keelDir, 'handoff'), { recursive: true });
      await mkdir(join(keelDir, 'research'), { recursive: true });
      await mkdir(join(keelDir, 'archive'), { recursive: true });
      await atomicWriteJSON(join(keelDir, 'config.json'), cfg);
      const state = emptyState(opts.name);
      await atomicWriteJSON(join(keelDir, 'state.json'), state);
      await writeFile(join(keelDir, 'PROJECT.md'), `# ${opts.name}\n\n> KEEL project. See .keel/ROADMAP.md for phases.\n`);
      await writeFile(join(keelDir, 'ROADMAP.md'), '# Roadmap\n\n_(no phases yet)_\n');
      await writeFile(join(keelDir, 'MILESTONES.md'), '# Milestones\n');
      await writeFile(join(keelDir, 'SPECIAL-FLOWS.md'), '# Special Flows\n\n_(none yet)_\n');
      await writeFile(join(keelDir, 'STATE.md'), renderStateMd(state));
      console.log(`Initialized KEEL in ${keelDir} (profile=${opts.profile})`);
    });
}
