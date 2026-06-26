import { describe, it, expect } from 'vitest';
import { renderAgentPrompt } from '../../src/agent-prompt/render.js';

describe('renderAgentPrompt', () => {
  // AC-1: no goal → the literal <your goal> placeholder, and the load-bearing tokens are present.
  it('AC-1: emits the <your goal> placeholder when no goal is given', () => {
    const out = renderAgentPrompt();
    expect(out).toContain('<your goal>');
    expect(out.endsWith('\n')).toBe(true);
    for (const token of ['cadence draft new', '--template', 'AC-1', 'Do not approve', 'cadence settle']) {
      expect(out).toContain(token);
    }
  });

  // AC-1: a goal is substituted into both the goal line and the --title value; placeholder gone.
  it('AC-1: substitutes the goal into the goal line and the --title value', () => {
    const out = renderAgentPrompt('fix login timeout');
    expect(out).not.toContain('<your goal>');
    expect(out).toContain('Scaffold the first phase for this goal:');
    expect(out).toContain('fix login timeout');
    expect(out).toContain('cadence draft new --title "fix login timeout"');
  });

  // AC-1: empty / whitespace goal falls back to the placeholder.
  it('AC-1: blank goal falls back to the placeholder', () => {
    expect(renderAgentPrompt('   ')).toContain('<your goal>');
    expect(renderAgentPrompt('')).toContain('<your goal>');
  });

  // AC-4: the prompt instructs CLI draft-new, AC-N tagging, and stop-at-approval (no self-approve).
  it('AC-4: instructs draft new --template, AC-N tagging, and stop at approval', () => {
    const out = renderAgentPrompt();
    expect(out).toMatch(/cadence draft new --title .* --template <bugfix\|feature\|refactor>/);
    expect(out).toMatch(/tagged AC-1, AC-2/);
    expect(out).toMatch(/Do not approve/);
    expect(out).not.toMatch(/cadence draft approve/); // the agent must NOT self-approve
  });
});
