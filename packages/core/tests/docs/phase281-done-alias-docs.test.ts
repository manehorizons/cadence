import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('281-01 done docs (gate parity and bypass path)', () => {
  it('281-01/AC-5: commands.md states done carries all three inherited gates and names the bypass path', () => {
    const commands = readFileSync(join(REPO_ROOT, 'docs/reference/commands.md'), 'utf8');
    const doneSection = commands.slice(
      commands.indexOf('### done'),
      commands.indexOf('### block'),
    );

    expect(doneSection).toContain('true alias');
    expect(doneSection).toContain('per-task verifier gate');
    expect(doneSection).toContain('record-time boundary/redundancy check');
    expect(doneSection).toContain('unknown-task-id guard');
    expect(doneSection).toContain('--allow-per-task-failure');
    expect(doneSection).toContain('--allow-boundary-breach');
    expect(doneSection).toContain('no bypass flag');
  });

  it('281-01/AC-5: cli.md no longer claims done skips task-id validation', () => {
    const cli = readFileSync(join(REPO_ROOT, 'docs/cli.md'), 'utf8');
    const calloutStart = cli.indexOf('> **Carry-forward:**');
    const calloutEnd = cli.indexOf('\n\n', calloutStart);
    const callout = cli.slice(calloutStart, calloutEnd === -1 ? undefined : calloutEnd);

    expect(callout).toContain('`block` and `needs-context` accept any string');
    expect(callout).not.toMatch(/`done`, `block`, and `needs-context` accept any string/);
    expect(callout).toContain('`done` is unaffected');
  });
});
