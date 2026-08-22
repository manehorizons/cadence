import { describe, it, expect } from 'vitest';
import { renderPacket, renderPacketBase, recommendIsolation } from '../../src/dispatch/packet.js';
import type { ExecutionVerdict } from '../../src/dispatch/policy.js';
import type { Draft, Task } from '@thomas-powers-jr/cadence-types';

const draft: Draft = {
  schemaVersion: 1,
  id: '01-01',
  phase: '01-foundation',
  tier: 'standard',
  title: 't',
  objective: 'Make the widget glow.',
  acceptanceCriteria: [],
  tasks: [],
  boundaries: [],
  status: 'IN_PROGRESS',
};

const task: Task = {
  id: 'T1',
  name: 'Add glow flag',
  files: ['src/widget.ts', 'tests/widget.test.ts'],
  action: 'add a boolean glow prop',
  verify: 'vitest passes',
  done: 'AC-1',
};

const dispatchVerdict: ExecutionVerdict = {
  execution: 'dispatch',
  modelClass: 'complex',
  model: 'claude-opus',
  reasons: ['largeTaskTokens: estimated weight ~5000 tokens (threshold 4000)'],
};

const inlineVerdict: ExecutionVerdict = {
  execution: 'inline',
  modelClass: 'mechanical',
  model: 'claude-haiku',
  reasons: [],
};

describe('renderPacketBase', () => {
  it('includes the phase objective', () => {
    expect(renderPacketBase(task, draft)).toContain('Make the widget glow.');
  });

  it('includes the task id, action, verify, and done fields', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet).toContain('T1');
    expect(packet).toContain('add a boolean glow prop');
    expect(packet).toContain('vitest passes');
    expect(packet).toContain('AC-1');
  });

  it('states the files boundary explicitly', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet).toContain('src/widget.ts');
    expect(packet).toContain('tests/widget.test.ts');
  });

  it('reminds the subagent about redundant-work monitoring instead of silently redoing finished work', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet.toLowerCase()).toContain('redundant');
  });

  it('tells the subagent to stop and report to the orchestrator instead of recording its own outcome', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet.toLowerCase()).toContain('stop');
    expect(packet.toLowerCase()).toContain('orchestrat');
    expect(packet).not.toContain('cadence build task T1');
  });

  it('includes a mandatory prohibition block naming forbidden action classes', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet).toContain('cadence build');
    expect(packet).toContain('cadence settle');
    expect(packet).toContain('git commit');
    expect(packet).toContain('git push');
    expect(packet).toContain('gh ');
    expect(packet).toContain('AskUserQuestion');
  });

  it('handles a task with no declared files', () => {
    const noFiles: Task = { ...task, files: [] };
    expect(() => renderPacketBase(noFiles, draft)).not.toThrow();
  });

  it('recommends worktree isolation in the packet text for a task with declared files', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet.toLowerCase()).toContain('worktree');
  });

  it('recommends no isolation in the packet text for a task with no declared files', () => {
    const noFiles: Task = { ...task, files: [] };
    const packet = renderPacketBase(noFiles, draft);
    expect(packet).toContain('**Recommended isolation:** none');
    expect(packet).not.toContain('**Recommended isolation:** worktree');
  });
});

describe('renderPacket', () => {
  it('includes both the Execution and Model lines when the verdict is dispatch', () => {
    const packet = renderPacket(task, draft, dispatchVerdict);
    expect(packet).toContain(
      '**Execution:** dispatch — largeTaskTokens: estimated weight ~5000 tokens (threshold 4000)',
    );
    expect(packet).toContain('**Model:** claude-opus (complex)');
  });

  it('includes only the Execution line, with no Model line, when the verdict is inline', () => {
    const packet = renderPacket(task, draft, inlineVerdict);
    expect(packet).toContain('**Execution:** inline — no dispatch trigger met');
    expect(packet).not.toContain('**Model:**');
  });

  it('stripping the Execution/Model lines from a dispatch-verdict packet reproduces renderPacketBase byte-for-byte', () => {
    const withVerdict = renderPacket(task, draft, dispatchVerdict);
    const stripped = withVerdict
      .split('\n')
      .filter((line) => !/^\*\*Execution:\*\* /.test(line) && !/^\*\*Model:\*\* /.test(line))
      .join('\n');
    expect(stripped).toBe(renderPacketBase(task, draft));
  });

  it('stripping the Execution/Model lines from an inline-verdict packet reproduces renderPacketBase byte-for-byte', () => {
    const withVerdict = renderPacket(task, draft, inlineVerdict);
    const stripped = withVerdict
      .split('\n')
      .filter((line) => !/^\*\*Execution:\*\* /.test(line) && !/^\*\*Model:\*\* /.test(line))
      .join('\n');
    expect(stripped).toBe(renderPacketBase(task, draft));
  });
});

describe('recommendIsolation', () => {
  it('returns worktree when the task declares one or more files', () => {
    expect(recommendIsolation(task)).toBe('worktree');
  });

  it('returns none when the task declares no files', () => {
    const noFiles: Task = { ...task, files: [] };
    expect(recommendIsolation(noFiles)).toBe('none');
  });
});

// Phase 280-dispatch-contract, DRAFT 280-01 (DP-B), T4 — Stop condition line.
describe('Stop condition line — 280-01/AC-1', () => {
  // Captured verbatim (via a one-off script invoking renderPacketBase with
  // this exact file's `task`/`draft` fixtures) before packet.ts gained any
  // stop:-line logic. `task` above declares no `stop`, so this string is the
  // pre-DP-B baseline AC-1 requires renderPacketBase to keep reproducing
  // byte-for-byte when a task has no stop: declared.
  //
  // Updated for phase 289 (289-01/AC-6, T3): packet.ts's forbidden-actions
  // block gained a fixed `CADENCE_READ_ONLY` note describing read-only
  // mode's now-real, store-layer enforcement. This fixture is re-pinned to
  // include that note verbatim — the invariant this describe block actually
  // guards (a declared `stop:` renders as a bold-label line, not a heading,
  // and an absent one adds nothing) is unaffected by that unrelated prose
  // change.
  const PRE_DP_B_FIXTURE =
    '# Task T1: Add glow flag\n' +
    '\n' +
    '**Phase objective:** Make the widget glow.\n' +
    '\n' +
    '**Action:** add a boolean glow prop\n' +
    '**Verify:** vitest passes\n' +
    '**Done when:** AC-1\n' +
    '\n' +
    '**Files (stay within these):** `src/widget.ts`, `tests/widget.test.ts`\n' +
    '**Recommended isolation:** worktree — this task mutates files; dispatch it into its own git worktree if you are running multiple tasks concurrently.\n' +
    '\n' +
    'Do not touch files declared under any other task. If a task already marked\n' +
    'DONE or DONE_WITH_CONCERNS genuinely needs revisiting, say so explicitly\n' +
    "rather than silently redoing it — CADENCE's redundant-work monitoring will\n" +
    "flag an edit to an already-finished task's files.\n" +
    '\n' +
    '**You are forbidden from taking the following actions, with no exceptions:**\n' +
    '- Any state-mutating `cadence` subcommand — including but not limited to\n' +
    '  `cadence build` and `cadence settle` — or any other command that mutates\n' +
    '  `.cadence/` state.\n' +
    '- `git commit` or `git push`.\n' +
    '- gh (the GitHub CLI) or any other command that reaches a network or\n' +
    '  external service.\n' +
    '- Invoking `AskUserQuestion` or any other mechanism to prompt a human\n' +
    '  interactively.\n' +
    '\n' +
    "If `CADENCE_READ_ONLY` is active for this dispatch, ledger-mutating\n" +
    'operations (e.g. `decision add`, `assumption add`) are structurally\n' +
    "refused at the intelligence store's write layer — not merely requested\n" +
    'against by this prompt. See `docs/reference/commands.md` for how it is\n' +
    'activated and its scoping limits.\n' +
    '\n' +
    'The moment your Verify condition is met — or the moment you are genuinely\n' +
    'blocked or need more context — STOP. Do not record the outcome yourself.\n' +
    'Report back to the orchestrating session with what you did, the exact\n' +
    'commands you ran and their real output, and the resulting diff. The\n' +
    'orchestrator alone runs `cadence build task` (or `cadence settle`) and\n' +
    'records the outcome.';

  it('280-01/AC-1, 289-01/AC-6: renders byte-identical to the pre-DP-B fixture when no stop: is declared, including the CADENCE_READ_ONLY paragraph\'s exact accurate wording', () => {
    expect(renderPacketBase(task, draft)).toBe(PRE_DP_B_FIXTURE);
  });

  it('280-01/AC-1: a declared stop: condition appears verbatim as a bold-label line, not a heading', () => {
    const withStop: Task = {
      ...task,
      stop: 'If the migration touches more than 3 tables, halt and ask a human before continuing',
    };
    const packet = renderPacketBase(withStop, draft);
    expect(packet).toContain(
      '**Stop condition:** If the migration touches more than 3 tables, halt and ask a human before continuing',
    );
    expect(packet).not.toContain('## Stop condition');
    expect(packet).not.toContain('# Stop condition');
  });

  it('280-01/AC-1: task with no stop: declared has no Stop condition line at all', () => {
    expect(renderPacketBase(task, draft)).not.toContain('Stop condition');
  });
});
