import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { renderAgentPrompt } from '../../src/agent-prompt/render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd, env: { ...process.env } });
    let stdout = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.on('exit', (code) => resolve({ stdout, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence init — agent prompt block (phase 130, rec-20260619-006)', () => {
  // AC-3: init output includes the "Hand it to your AI agent" block with the
  // renderer's placeholder output verbatim, plus the reprint pointer.
  it('AC-3: init prints the agent-prompt block and reprint pointer', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Hand it to your AI agent/);
    expect(r.stdout).toContain(renderAgentPrompt());
    expect(r.stdout).toMatch(/cadence agent-prompt --goal/);
  });
});
