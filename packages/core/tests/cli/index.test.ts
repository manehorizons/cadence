import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { StateCorruptError } from '../../src/errors.js';
// `cli/index.ts` is a script: importing it for real would immediately run
// `program.parseAsync(process.argv)` against whatever argv this test runner
// happens to have (dangerous — it can call `process.exit`). The module
// guards that side effect behind an entry-point check
// (`process.argv[1] === fileURLToPath(import.meta.url)`), which is false
// when imported here, so this static import only picks up the re-exported
// `formatTopLevelError` — the exact function the real `.catch(...)` handler
// calls — with none of the side effects.
import { formatTopLevelError } from '../../src/cli/index.js';

// AC-6 (issue #177) — a StateCorruptError's printed error points at the
// `cadence doctor --fix` repair path instead of a bare error with no
// guidance.
//
// As-built note (196-01-DRAFT.md T6): the original design putting this
// entirely behind `cli/index.ts`'s top-level `.catch` turned out to be
// unreachable — every command that calls `readState()` catches and
// reformats its own error inside its **service** function
// (`packages/core/src/services/*.ts`), never letting it propagate that far.
// The fix now lives in `services/format-command-error.ts`, used by both the
// 9 services' own catches and (as a defense-in-depth backstop for any
// future command that forgets to catch) `cli/index.ts`'s top-level handler.
// This file covers both: a direct unit test of the top-level handler's
// formatting function, and a real end-to-end spawn of the built CLI proving
// the pointer text actually reaches stderr through a real, reachable
// command.

describe('CLI top-level error formatting (AC-6)', () => {
  it('a StateCorruptError gets a doctor --fix pointer appended', () => {
    const err = new StateCorruptError('state.json is not valid JSON: Unexpected token');
    const formatted = formatTopLevelError(err);
    expect(formatted).toBe(
      "state.json is not valid JSON: Unexpected token\nRun 'cadence doctor --fix' to diagnose and repair.",
    );
  });

  it("a plain Error keeps just its message, unchanged (today's behavior)", () => {
    const err = new Error('something else went wrong');
    expect(formatTopLevelError(err)).toBe('something else went wrong');
  });

  it("a non-Error thrown value is stringified, unchanged (today's behavior)", () => {
    expect(formatTopLevelError('raw string throw')).toBe('raw string throw');
  });

  it('a different CadenceError subclass (e.g. NotInitializedError) is not treated as state-corrupt', () => {
    // Guards against a too-broad check (e.g. matching on `.code` instead of
    // `instanceof StateCorruptError`) that would misfire for sibling error
    // classes sharing the CadenceError base.
    class OtherError extends Error {}
    const err = new OtherError('unrelated failure');
    expect(formatTopLevelError(err)).toBe('unrelated failure');
  });
});

describe('CLI top-level error formatting — end to end (AC-6)', () => {
  const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

  function run(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
      let stdout = '';
      let stderr = '';
      p.stdout.on('data', (d) => (stdout += d.toString()));
      p.stderr.on('data', (d) => (stderr += d.toString()));
      p.on('exit', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    });
  }

  let active: Fixture | null = null;
  afterEach(async () => {
    if (active) {
      await active.cleanup();
      active = null;
    }
  });

  it('cadence progress against a conflict-marker-corrupted state.json prints the doctor --fix pointer (real, reachable path)', async () => {
    active = await tempRepo({ initialized: true });
    // The real-world trigger for issue #177: two CADENCE worktrees on
    // different phases sync, leaving an unresolved git merge conflict —
    // literal conflict markers — in the tracked state.json.
    await writeFile(
      join(active.root, '.cadence/state.json'),
      '<<<<<<< HEAD\n{"loopPosition":"IDLE"}\n=======\n{"loopPosition":"BUILD"}\n>>>>>>> other-branch\n',
    );
    const r = await run(['progress'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^progress failed: state\.json is not valid JSON/);
    expect(r.stderr).toMatch(/Run 'cadence doctor --fix' to diagnose and repair\./);
  });
});
