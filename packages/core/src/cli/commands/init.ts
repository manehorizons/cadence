import type { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { presets, emptyState } from '@cadence/types';
import { atomicWriteJSON } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new .cadence/ directory in the current working tree')
    .option('--name <project>', 'Project name', 'unnamed')
    .option('--profile <preset>', 'Config preset: solo | team | production', 'team')
    .action(async (opts: { name: string; profile: 'solo' | 'team' | 'production' }) => {
      const cwd = process.cwd();
      const cadenceDir = join(cwd, '.cadence');
      if (existsSync(cadenceDir)) {
        console.error('.cadence/ already initialized in this directory');
        process.exit(2);
      }
      const cfg = presets[opts.profile];
      if (!cfg) {
        console.error(`Unknown profile: ${opts.profile}`);
        process.exit(2);
      }
      await mkdir(join(cadenceDir, 'phases'), { recursive: true });
      await mkdir(join(cadenceDir, 'handoff'), { recursive: true });
      await mkdir(join(cadenceDir, 'research'), { recursive: true });
      await mkdir(join(cadenceDir, 'archive'), { recursive: true });
      await atomicWriteJSON(join(cadenceDir, 'config.json'), cfg);
      const state = emptyState(opts.name);
      await atomicWriteJSON(join(cadenceDir, 'state.json'), state);
      await writeFile(join(cadenceDir, 'PROJECT.md'), `# ${opts.name}\n\n> CADENCE project. See .cadence/ROADMAP.md for phases.\n`);
      await writeFile(join(cadenceDir, 'ROADMAP.md'), '# Roadmap\n\n_(no phases yet)_\n');
      await writeFile(join(cadenceDir, 'MILESTONES.md'), '# Milestones\n');
      await writeFile(join(cadenceDir, 'SPECIAL-FLOWS.md'), '# Special Flows\n\n_(none yet)_\n');
      await writeFile(join(cadenceDir, 'STATE.md'), renderStateMd(state));
      console.log(`Initialized CADENCE in ${cadenceDir} (profile=${opts.profile})`);
    });
}
