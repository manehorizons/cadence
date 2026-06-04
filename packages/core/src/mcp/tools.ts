import { z } from 'zod';
import type { CommandIO, CommandResult } from '../services/io.js';
import { progressService } from '../services/progress.js';
import { statusService } from '../services/status.js';
import { recommendService } from '../services/recommend.js';
import { draftNewService } from '../services/draft-new.js';
import { draftCheckService } from '../services/draft-check.js';
import { draftApproveService } from '../services/draft-approve.js';
import { buildTaskService } from '../services/build-task.js';
import { settleService } from '../services/settle.js';
import { specNewService } from '../services/spec-new.js';
import { specApproveService } from '../services/spec-approve.js';

/**
 * One curated CADENCE command exposed as an MCP tool (phase 58). `run` calls the
 * shared service with a buffered `io`; the server serializes the captured text +
 * structured `data` into the tool result.
 *
 * Ambient edit-time gates (the `pre-tool-edit` boundary check) require host
 * hooks and are NOT available over MCP — but command-boundary gates (coherence,
 * the settle gate stack, spec-review) run exactly as they do from the CLI. The
 * write-tool descriptions say so.
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  run(repoRoot: string, args: Record<string, unknown>, io: CommandIO): Promise<CommandResult>;
}

const str = (v: unknown): string => String(v);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const isTrue = (v: unknown): boolean => v === true;

const TIER = z.enum(['quick-fix', 'standard', 'complex']);
const TASK_STATUS = z.enum(['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED']);

export const TOOLS: ToolDef[] = [
  {
    name: 'cadence_progress',
    description: 'Show the single recommended next action for the CADENCE loop (read-only).',
    inputSchema: {},
    run: (repoRoot, _args, io) => progressService(repoRoot, io),
  },
  {
    name: 'cadence_status',
    description:
      'Show full loop context: position, active phase/draft, tasks, AC results, next action (read-only).',
    inputSchema: {
      json: z.boolean().optional().describe('Return the raw status report instead of rendered text'),
    },
    run: (repoRoot, args, io) => statusService(repoRoot, isTrue(args.json) ? { json: true } : {}, io),
  },
  {
    name: 'cadence_recommend',
    description: 'Rank actionable strategic recommendations and advise the next move (read-only).',
    inputSchema: {
      json: z.boolean().optional().describe('Return the raw recommend report instead of rendered text'),
    },
    run: (repoRoot, args, io) => recommendService(repoRoot, isTrue(args.json) ? { json: true } : {}, io),
  },
  {
    name: 'cadence_draft_new',
    description:
      'Scaffold a new DRAFT for a phase task and enter the DRAFT stage (requires loop IDLE). ' +
      'With fromRec, the recommendation is auto-converted to this phase.',
    inputSchema: {
      phase: z.string().describe('Phase slug, e.g. "58-mcp-server"'),
      num: z.string().describe('Two-digit unit number within the phase, e.g. "01"'),
      title: z.string().optional().describe('Draft title'),
      tier: TIER.optional().describe('Work tier (default: standard)'),
      fromRec: z.string().optional().describe('Recommendation id to convert into this phase'),
    },
    run: (repoRoot, args, io) =>
      draftNewService(
        repoRoot,
        {
          phase: str(args.phase),
          num: str(args.num),
          ...(optStr(args.title) !== undefined ? { title: optStr(args.title)! } : {}),
          ...(optStr(args.tier) !== undefined ? { tier: optStr(args.tier)! } : {}),
          ...(optStr(args.fromRec) !== undefined ? { fromRec: optStr(args.fromRec)! } : {}),
        },
        io,
      ),
  },
  {
    name: 'cadence_draft_check',
    description:
      'Run the structural coherence check on a phase DRAFT.md against state + PROJECT.md. ' +
      'Reports blocking issues exactly as the CLI does (command-boundary gate).',
    inputSchema: {
      phase: z.string().describe('Phase slug'),
      num: z.string().describe('Two-digit unit number'),
    },
    run: (repoRoot, args, io) => {
      const id = `${str(args.phase).slice(0, 2)}-${str(args.num).padStart(2, '0')}`;
      const path = `.cadence/phases/${str(args.phase)}/${id}-DRAFT.md`;
      return draftCheckService(repoRoot, { path }, io);
    },
  },
  {
    name: 'cadence_draft_approve',
    description:
      'Approve a DRAFT and enter BUILD. Runs the coherence → soft-cap → plan-review gate ladder ' +
      '(the same command-boundary gates as the CLI). The interactive manual-approve prompt is ' +
      'bypassed over MCP — calling this tool IS the approval.',
    inputSchema: {
      phase: z.string().describe('Phase slug'),
      num: z.string().describe('Two-digit unit number'),
      allowAutoComplex: z
        .boolean()
        .optional()
        .describe('Override the DESIGN.md §4 M2 soft cap on auto × complex drafts'),
      allowPlanReviewFailure: z
        .boolean()
        .optional()
        .describe('Proceed past a failing plan-review gate (findings still reported)'),
    },
    run: (repoRoot, args, io) =>
      draftApproveService(
        repoRoot,
        {
          phase: str(args.phase),
          num: str(args.num),
          approve: false, // no TTY over MCP; the tool call is the approval
          ...(isTrue(args.allowAutoComplex) ? { allowAutoComplex: true } : {}),
          ...(isTrue(args.allowPlanReviewFailure) ? { allowPlanReviewFailure: true } : {}),
        },
        io,
      ),
  },
  {
    name: 'cadence_build_task',
    description: 'Record the outcome of a BUILD task (runs the per-task verifier gate on DONE).',
    inputSchema: {
      taskId: z.string().describe('Task id from the active DRAFT, e.g. "T1"'),
      status: TASK_STATUS.optional().describe('Outcome (default: DONE)'),
      notes: z.string().optional().describe('Free-text notes recorded with the outcome'),
      allowPerTaskFailure: z
        .boolean()
        .optional()
        .describe('Record DONE even if the per-task verifier refuses'),
    },
    run: (repoRoot, args, io) =>
      buildTaskService(
        repoRoot,
        {
          taskId: str(args.taskId),
          ...(optStr(args.status) !== undefined ? { status: optStr(args.status)! } : {}),
          ...(optStr(args.notes) !== undefined ? { notes: optStr(args.notes)! } : {}),
          ...(isTrue(args.allowPerTaskFailure) ? { allowPerTaskFailure: true } : {}),
        },
        io,
      ),
  },
  {
    name: 'cadence_settle',
    description:
      'Close the loop: run the settle gate stack, write SUMMARY.{json,md}, and return to IDLE. ' +
      'Runs the full command-boundary gate stack (coverage, structural verifier, etc.). The ' +
      'interactive verdict walker is disabled over MCP; supply AC verdicts via "ac" or use "auto".',
    inputSchema: {
      ac: z
        .array(z.string())
        .optional()
        .describe('AC verdicts, e.g. ["AC-1=pass", "AC-2=fail:reason"]'),
      auto: z.boolean().optional().describe('Derive AC verdicts from task statuses'),
      force: z.boolean().optional().describe('Settle even when --auto detects blocked/pending ACs'),
      deep: z.boolean().optional().describe('Run the independent verifier agent against each AC'),
      allowMissingCoverage: z.boolean().optional().describe('Skip the test-coverage gate'),
      allowOpenTasks: z.boolean().optional().describe('Skip the structural-verifier gate'),
      allowFailingBuild: z.boolean().optional().describe('Do not refuse on a failing test command'),
      allowStaleDraft: z.boolean().optional().describe('Skip the DRAFT-read mtime gate'),
      allowVerifierFailure: z.boolean().optional().describe('Do not refuse on verifier transport failure'),
      allowCodeReviewFailure: z.boolean().optional().describe('Do not refuse on HIGH code-review findings'),
      allowSecurityAuditFailure: z.boolean().optional().describe('Do not refuse on CRITICAL security findings'),
      allowSkillAuditMiss: z.boolean().optional().describe('Do not refuse when required skills were not invoked'),
      allowAutoComplex: z.boolean().optional().describe('Override the auto × complex soft cap'),
    },
    run: (repoRoot, args, io) => {
      const flags: Array<keyof typeof args> = [
        'auto', 'force', 'deep', 'allowMissingCoverage', 'allowOpenTasks', 'allowFailingBuild',
        'allowStaleDraft', 'allowVerifierFailure', 'allowCodeReviewFailure',
        'allowSecurityAuditFailure', 'allowSkillAuditMiss', 'allowAutoComplex',
      ];
      const opts: Record<string, unknown> = { interactive: false };
      if (Array.isArray(args.ac)) opts.ac = args.ac.map(String);
      for (const f of flags) if (isTrue(args[f])) opts[f] = true;
      return settleService(repoRoot, opts, io);
    },
  },
  {
    name: 'cadence_spec_new',
    description: 'Scaffold a new SPEC for a phase task and enter the SPEC stage (requires loop IDLE).',
    inputSchema: {
      phase: z.string().describe('Phase slug'),
      num: z.string().describe('Two-digit unit number'),
      title: z.string().optional().describe('Spec title'),
      fromRec: z.string().optional().describe('Recommendation id to convert into this phase'),
    },
    run: (repoRoot, args, io) =>
      specNewService(
        repoRoot,
        {
          phase: str(args.phase),
          num: str(args.num),
          ...(optStr(args.title) !== undefined ? { title: optStr(args.title)! } : {}),
          ...(optStr(args.fromRec) !== undefined ? { fromRec: optStr(args.fromRec)! } : {}),
        },
        io,
      ),
  },
  {
    name: 'cadence_spec_approve',
    description:
      'Run the convergent spec-review gate; on pass mark the SPEC APPROVED and leave the spec stage.',
    inputSchema: {
      phase: z.string().describe('Phase slug'),
      num: z.string().describe('Two-digit unit number'),
      allowSpecReviewFailure: z
        .boolean()
        .optional()
        .describe('Proceed past a failing/unconverged spec-review'),
    },
    run: (repoRoot, args, io) =>
      specApproveService(
        repoRoot,
        {
          phase: str(args.phase),
          num: str(args.num),
          ...(isTrue(args.allowSpecReviewFailure) ? { allowSpecReviewFailure: true } : {}),
        },
        io,
      ),
  },
];
