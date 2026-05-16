import { describe, it, expect } from 'vitest';
import { askApproveVerdict } from '../../src/cli/commands/draft.js';
import type { Prompter } from '../../src/verify/prompter.js';

/** Prompter that replays scripted answers and records every question asked. */
class RecordingPrompter implements Prompter {
  questions: string[] = [];
  private i = 0;
  constructor(private readonly answers: string[]) {}
  async ask(question: string): Promise<string> {
    this.questions.push(question);
    return this.answers[this.i++] ?? '';
  }
}

describe('askApproveVerdict — T2 bad-input feedback (Phase 29.8, AC-1)', () => {
  it('explicit "n" resolves immediately (one question, no attempt suffix)', async () => {
    const p = new RecordingPrompter(['n']);
    expect(await askApproveVerdict(p)).toBe('no');
    expect(p.questions).toHaveLength(1);
    expect(p.questions[0]).toMatch(/Approve and enter BUILD\? \[y\/n\]:/);
    expect(p.questions[0]).not.toMatch(/attempt/);
  });

  it('explicit "y" resolves immediately', async () => {
    const p = new RecordingPrompter(['y']);
    expect(await askApproveVerdict(p)).toBe('yes');
    expect(p.questions).toHaveLength(1);
  });

  it('empty then garbage then "y": re-prompts with attempt count, then approves', async () => {
    const p = new RecordingPrompter(['', 'maybe', 'y']);
    expect(await askApproveVerdict(p)).toBe('yes');
    expect(p.questions).toHaveLength(3);
    expect(p.questions[1]).toMatch(/Please answer y or n \(attempt 2\/3\):/);
    expect(p.questions[2]).toMatch(/Please answer y or n \(attempt 3\/3\):/);
  });

  it('three unrecognized inputs → refuse (no), with feedback on retries', async () => {
    const p = new RecordingPrompter(['', 'x', 'huh']);
    expect(await askApproveVerdict(p)).toBe('no');
    expect(p.questions).toHaveLength(3);
    expect(p.questions[0]).not.toMatch(/attempt/);
    expect(p.questions[1]).toMatch(/attempt 2\/3/);
    expect(p.questions[2]).toMatch(/attempt 3\/3/);
  });
});
