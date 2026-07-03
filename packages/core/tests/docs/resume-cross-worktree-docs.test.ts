import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root docs from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const COMMANDS_MD = join(ROOT, 'docs', 'reference', 'commands.md');

function resumeSection(md: string): string {
  const m = md.match(/### resume\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error('commands.md: could not isolate the ### resume section');
  return m[1]!;
}

describe('resume cross-worktree docs (AC-1)', () => {
  it('AC-1: commands.md documents every current resume flag', () => {
    const md = readFileSync(COMMANDS_MD, 'utf8');
    const section = resumeSection(md);

    // Pre-existing flags that predate phases 142/143 (regression guard).
    expect(section).toContain('--json');
    expect(section).toContain('--full');
    expect(section).toContain('--brief');

    // New cross-worktree flags (phases 142/143) — the actual gap this task closes.
    expect(section).toContain('--list');
    expect(section).toContain('--pick');
    expect(section).toContain('--path');
    expect(section).toContain('--local');
  });

  it('documents the default 2+ candidate stderr nudge', () => {
    const md = readFileSync(COMMANDS_MD, 'utf8');
    const section = resumeSection(md);
    expect(section).toMatch(/resumable handoffs/);
    expect(section).toContain('cadence resume --list');
  });

  it('documents sibling worktree pick as read-only with its text markers', () => {
    const md = readFileSync(COMMANDS_MD, 'utf8');
    const section = resumeSection(md);
    expect(section.toLowerCase()).toContain('sibling worktree');
    expect(section).toContain('read-only');
    expect(section).toContain('--- from sibling worktree:');
    expect(section).toMatch(/live context recompute skipped/);
  });

  it('documents the two flag-conflict refusals', () => {
    const md = readFileSync(COMMANDS_MD, 'utf8');
    const section = resumeSection(md);
    // multiple selectors (--list/--pick/--path) together
    expect(section).toMatch(/mutually exclusive/);
    // --local combined with an explicit selector
    expect(section).toMatch(/--local/);
  });

  it('documents resume.crossWorktree and resume.autoList config knobs', () => {
    const md = readFileSync(COMMANDS_MD, 'utf8');
    const section = resumeSection(md);
    expect(section).toContain('crossWorktree');
    expect(section).toContain('autoList');
  });
});
