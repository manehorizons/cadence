import type { Command } from 'commander';
import { draftNewService } from '../../services/draft-new.js';
import { processIO } from '../../services/io.js';

/** Registers `draft new [phase] [num]` on the parent `draft` command. */
export function registerDraftNew(cmd: Command): void {
  cmd
    .command('new [phase] [num]')
    .description('Scaffold a new DRAFT.md under .cadence/phases/<phase>/')
    .option('--title <t>', 'Draft title', 'Untitled')
    .option('--tier <t>', 'Tier (quick-fix | standard | complex)', 'standard')
    .option('--from-rec <recId>', 'Praxis recommendation id; on success the rec is auto-converted to this phase (Slice 34.3)')
    .option('--allow-phase-collision', 'bypass the worktree phase-collision guard (Phase 83); the local same-dir existsSync refusal still applies')
    .action(async (phase: string | undefined, num: string | undefined, opts: { title: string; tier: string; fromRec?: string; allowPhaseCollision?: boolean }) => {
      const { exitCode } = await draftNewService(
        process.cwd(),
        {
          ...(phase !== undefined ? { phase } : {}),
          ...(num !== undefined ? { num } : {}),
          title: opts.title,
          tier: opts.tier,
          ...(opts.fromRec !== undefined ? { fromRec: opts.fromRec } : {}),
          ...(opts.allowPhaseCollision !== undefined ? { allowPhaseCollision: opts.allowPhaseCollision } : {}),
        },
        processIO(),
      );
      if (exitCode) process.exitCode = exitCode;
    });
}
