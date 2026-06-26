import { describe, it, expect } from 'vitest';
import { runAgentPrompt } from '../../src/cli/commands/agent-prompt.js';
import { renderAgentPrompt } from '../../src/agent-prompt/render.js';
import { bufferIO } from '../../src/services/io.js';

describe('cadence agent-prompt', () => {
  // AC-2: bare invocation prints the placeholder prompt verbatim and exits 0.
  it('AC-2: prints the rendered prompt and exits 0', () => {
    const io = bufferIO();
    const res = runAgentPrompt({}, io);
    expect(res.exitCode).toBe(0);
    expect(io.stdout()).toBe(renderAgentPrompt());
  });

  // AC-2: --goal substitutes the goal.
  it('AC-2: --goal bakes the goal into the prompt', () => {
    const io = bufferIO();
    const res = runAgentPrompt({ goal: 'fix login timeout' }, io);
    expect(res.exitCode).toBe(0);
    expect(io.stdout()).toContain('cadence draft new --title "fix login timeout"');
    expect(io.stdout()).not.toContain('<your goal>');
  });

  // AC-2: --json emits { goal, prompt }, goal null when omitted.
  it('AC-2: --json emits { goal, prompt }', () => {
    const io = bufferIO();
    const res = runAgentPrompt({ json: true }, io);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(io.stdout());
    expect(parsed.goal).toBeNull();
    expect(parsed.prompt).toBe(renderAgentPrompt());

    const io2 = bufferIO();
    runAgentPrompt({ goal: 'add retry', json: true }, io2);
    const parsed2 = JSON.parse(io2.stdout());
    expect(parsed2.goal).toBe('add retry');
    expect(parsed2.prompt).toBe(renderAgentPrompt('add retry'));
  });
});
