import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root docs from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const COMMANDS_MD = join(ROOT, 'docs', 'reference', 'commands.md');
const CONFIG_MD = join(ROOT, 'docs', 'reference', 'config.md');
const CONCEPTS_MD = join(ROOT, 'docs', 'concepts.md');

function resumeSection(md: string): string {
  const m = md.match(/### resume\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error('commands.md: could not isolate the ### resume section');
  return m[1]!;
}

function configResumeSection(md: string): string {
  const m = md.match(/## resume\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error('config.md: could not isolate the ## resume section');
  return m[1]!;
}

function worktreeSection(md: string): string {
  const m = md.match(
    /## Worktrees & the single-writer assumption\n([\s\S]*?)\n---\n/
  );
  if (!m) throw new Error('concepts.md: could not isolate the worktree section');
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

describe('resume config.md docs (AC-2)', () => {
  it('has a ## resume section documenting both fields with their defaults', () => {
    const md = readFileSync(CONFIG_MD, 'utf8');
    const section = configResumeSection(md);

    expect(section).toContain('resume.crossWorktree');
    expect(section).toContain('resume.autoList');
    // Defaults, per packages/types/src/config.ts.
    expect(section).toMatch(/`resume\.crossWorktree`[^\n]*`true`/);
    expect(section).toMatch(/`resume\.autoList`[^\n]*`false`/);
  });

  it('includes a .cadence/config.json example', () => {
    const md = readFileSync(CONFIG_MD, 'utf8');
    const section = configResumeSection(md);
    expect(section).toMatch(/```(jsonc|json|bash)/);
    expect(section).toContain('.cadence/config.json');
  });

  it('discloses the block is schema-only and absent from config edit/config explain', () => {
    const md = readFileSync(CONFIG_MD, 'utf8');
    const section = configResumeSection(md);
    expect(section.toLowerCase()).toContain('schema-only');
    expect(section).toContain('config edit');
    expect(section).toContain('config explain');
    // Matches the same precedent as phaseGuard/handoff/logging.
    expect(section).toContain('phaseGuard');
    expect(section).toContain('handoff');
  });
});

describe('concepts.md worktree section cross-worktree-resume addendum (AC-3)', () => {
  it('describes cadence resume candidate discovery as ground-truth, no cached index', () => {
    const md = readFileSync(CONCEPTS_MD, 'utf8');
    const section = worktreeSection(md);
    expect(section).toContain('cadence resume');
    expect(section).toMatch(/git worktree list/);
    expect(section.toLowerCase()).toMatch(/no cached|not cached|no shared index|no cache/);
  });

  it('links to the new resume config.md section', () => {
    const md = readFileSync(CONCEPTS_MD, 'utf8');
    const section = worktreeSection(md);
    expect(section).toContain('reference/config.md#resume');
  });

  it('names the default nudge-not-auto-picker UX', () => {
    const md = readFileSync(CONCEPTS_MD, 'utf8');
    const section = worktreeSection(md);
    expect(section.toLowerCase()).toContain('nudge');
    expect(section).toContain('autoList');
  });
});
