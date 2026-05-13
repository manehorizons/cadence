import { Command } from 'commander';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { TaskStatusZ } from '@keel/types';
import { SimpleStateBackend } from '../../state/simple.js';
import { atomicWriteJSON } from '../../state/atomic-write.js';
import { LoopViolationError } from '../../errors.js';

interface ProgressJson {
  draftId: string;
  tasks: Record<string, { status: string; notes: string; touchedFiles: string[]; updatedAt: string }>;
}

export function registerBuildCommand(program: Command): void {
  const cmd = program.command('build').description('BUILD phase task tracking');

  cmd
    .command('task <id>')
    .description('Record outcome for task <id>')
    .option('--status <s>', 'DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED', 'DONE')
    .option('--notes <n>', 'Notes', '')
    .action(async (taskId: string, opts: { status: string; notes: string }) => {
      try {
        const cwd = process.cwd();
        const statusParse = TaskStatusZ.safeParse(opts.status);
        if (!statusParse.success || statusParse.data === 'PENDING' || statusParse.data === 'IN_PROGRESS') {
          process.stderr.write(
            `Invalid task status: ${opts.status}. Allowed: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED\n`,
          );
          process.exitCode = 2;
          return;
        }
        const backend = new SimpleStateBackend(cwd);
        const state = await backend.readState();
        if (state.loopPosition !== 'BUILD' || !state.activeDraft || !state.activePhase) {
          throw new LoopViolationError('keel build task requires loopPosition=BUILD with an active draft');
        }
        const progPath = join(cwd, '.keel/phases', state.activePhase, `${state.activeDraft}-PROGRESS.json`);
        let progress: ProgressJson;
        if (existsSync(progPath)) {
          progress = JSON.parse(await readFile(progPath, 'utf8')) as ProgressJson;
        } else {
          progress = { draftId: state.activeDraft, tasks: {} };
        }
        progress.tasks[taskId] = {
          status: statusParse.data,
          notes: opts.notes,
          touchedFiles: state.activeTask?.touchedFiles ?? [],
          updatedAt: new Date().toISOString(),
        };
        await atomicWriteJSON(progPath, progress);
        state.activeTask = { id: taskId, status: statusParse.data, touchedFiles: [] };
        await backend.writeState(state);
        console.log(`Recorded ${taskId}: ${statusParse.data}`);
      } catch (err) {
        process.stderr.write(`build task failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
