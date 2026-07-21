import { describe, it, expect } from 'vitest';
import { runTestCommand } from '../../src/verify/test-runner.js';

describe('runTestCommand', () => {
  it('reports ran:false, ok:true when no command is configured', async () => {
    const result = await runTestCommand(process.cwd(), undefined);
    expect(result).toEqual({ ran: false, ok: true });
  });

  it('reports ran:true, ok:true, exitCode:0 for a passing command', async () => {
    const result = await runTestCommand(process.cwd(), 'node -e "process.exit(0)"');
    expect(result.ran).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.command).toBe('node -e "process.exit(0)"');
  });

  it('reports ran:true, ok:false, and the real exit code for a failing command', async () => {
    const result = await runTestCommand(process.cwd(), 'node -e "process.exit(7)"');
    expect(result.ran).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(7);
  });
});
