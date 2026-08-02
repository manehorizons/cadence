// packages/core/tests/handoff/pick.test.ts
import { describe, expect, it } from 'vitest';
import type { HandoffCandidate } from '@thomas-powers-jr/cadence-types';
import { renderCandidateMenu, resolvePick, promptForPick } from '../../src/handoff/pick.js';
import { ScriptedPrompter } from '../../src/verify/prompter.js';
import type { CommandIO } from '../../src/services/io.js';

function candidate(overrides: Partial<HandoffCandidate> = {}): HandoffCandidate {
  return {
    path: '/repo/.cadence/handoff/SESSION-2026-07-03.md',
    fileName: 'SESSION-2026-07-03.md',
    source: 'local',
    worktreePath: '/repo',
    worktreeBranch: 'main',
    generatedAt: '2026-07-03T10:00:00.000Z',
    label: 'phase-143',
    loopPosition: 'BUILD',
    activePhase: '143-01',
    liveLoopPosition: 'BUILD',
    ...overrides,
  };
}

function fakeIo(): CommandIO & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    outLines,
    errLines,
    out: (s: string) => void outLines.push(s),
    err: (s: string) => void errLines.push(s),
  };
}

describe('renderCandidateMenu (AC-3)', () => {
  it('renders a one-line notice for an empty candidate list', () => {
    const text = renderCandidateMenu([]);
    expect(text).toMatch(/no handoff candidates/i);
  });

  it('renders every candidate, numbered from 1', () => {
    const candidates = [
      candidate({ fileName: 'SESSION-a.md', worktreeBranch: 'main', source: 'local' }),
      candidate({ fileName: 'SESSION-b.md', worktreeBranch: 'feat/x', source: 'sibling', worktreePath: '/sibling' }),
    ];
    const text = renderCandidateMenu(candidates);
    expect(text).toContain('1.');
    expect(text).toContain('2.');
    expect(text).toContain('main');
    expect(text).toContain('feat/x');
    expect(text).toContain('/sibling');
  });

  it('degrades gracefully when nullable fields are null', () => {
    const c = candidate({
      worktreeBranch: null,
      generatedAt: null,
      label: null,
      loopPosition: null,
      activePhase: null,
      liveLoopPosition: null,
    });
    const text = renderCandidateMenu([c]);
    // Must not throw and must still render something identifying the candidate.
    expect(text).toContain(c.fileName);
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });
});

describe('resolvePick (AC-4)', () => {
  const candidates = [candidate({ fileName: 'a.md' }), candidate({ fileName: 'b.md' })];

  it('resolves a valid 1-based pick', () => {
    expect(resolvePick(candidates, 1)).toMatchObject({ fileName: 'a.md' });
    expect(resolvePick(candidates, 2)).toMatchObject({ fileName: 'b.md' });
  });

  it('returns undefined for an out-of-range pick', () => {
    expect(resolvePick(candidates, 0)).toBeUndefined();
    expect(resolvePick(candidates, 3)).toBeUndefined();
    expect(resolvePick(candidates, -1)).toBeUndefined();
  });

  it('returns undefined for any pick against an empty candidate list', () => {
    expect(resolvePick([], 1)).toBeUndefined();
  });
});

describe('promptForPick (AC-3, AC-4, AC-7)', () => {
  const candidates = [candidate({ fileName: 'a.md' }), candidate({ fileName: 'b.md' })];

  it('returns null immediately for an empty candidate list, without printing a menu', async () => {
    const io = fakeIo();
    const result = await promptForPick([], 'interactive', io);
    expect(result).toBeNull();
    expect(io.outLines).toHaveLength(0);
  });

  it('bypass (non-TTY): prints the menu and returns null without prompting (AC-7)', async () => {
    const io = fakeIo();
    let created = false;
    const result = await promptForPick(candidates, 'bypass', io, {
      createPrompter: () => {
        created = true;
        return new ScriptedPrompter([]);
      },
    });
    expect(result).toBeNull();
    expect(created).toBe(false);
    expect(io.outLines.join('')).toMatch(/a\.md|1\./);
  });

  it('interactive: prompts and resolves a valid pick', async () => {
    const io = fakeIo();
    const result = await promptForPick(candidates, 'interactive', io, {
      createPrompter: () => new ScriptedPrompter(['2']),
    });
    expect(result).toMatchObject({ fileName: 'b.md' });
  });

  it('interactive: reprompts on an invalid answer, then resolves', async () => {
    const io = fakeIo();
    const result = await promptForPick(candidates, 'interactive', io, {
      createPrompter: () => new ScriptedPrompter(['9', 'not-a-number', '1']),
    });
    expect(result).toMatchObject({ fileName: 'a.md' });
    expect(io.errLines.length).toBeGreaterThanOrEqual(2);
  });

  it('interactive: "q" quits and returns null', async () => {
    const io = fakeIo();
    const result = await promptForPick(candidates, 'interactive', io, {
      createPrompter: () => new ScriptedPrompter(['q']),
    });
    expect(result).toBeNull();
  });

  it('interactive: empty answer quits and returns null', async () => {
    const io = fakeIo();
    const result = await promptForPick(candidates, 'interactive', io, {
      createPrompter: () => new ScriptedPrompter(['']),
    });
    expect(result).toBeNull();
  });

  it('require-tty: a prompter construction failure is caught and reported, not thrown', async () => {
    const io = fakeIo();
    const result = await promptForPick(candidates, 'require-tty', io, {
      createPrompter: () => {
        throw new Error('StdinPrompter: stdin is not a TTY.');
      },
    });
    expect(result).toBeNull();
    expect(io.errLines.join('')).toMatch(/not a tty/i);
  });
});
