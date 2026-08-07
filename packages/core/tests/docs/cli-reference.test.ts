import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerAllCommands } from '../../src/cli/register.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function documentedCommands(): Set<string> {
  const md = readFileSync(join(REPO_ROOT, 'docs/reference/commands.md'), 'utf8');
  const m = md.match(
    /<!-- cadence:commands:start -->\s*([\s\S]*?)\s*<!-- cadence:commands:end -->/,
  );
  if (!m) throw new Error('commands.md: drift-guard marker block missing');
  return new Set(
    m[1]!.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('<!--')),
  );
}

function cliCommands(): Set<string> {
  const program = new Command();
  registerAllCommands(program);
  return new Set(program.commands.map((c) => c.name()).filter((n) => n !== 'help'));
}

/**
 * Long-flag names (e.g. `--json`) registered directly on each top-level
 * Commander command, keyed by command name. `cmd.options` only reflects
 * options declared on that command itself — never on its subcommands — so
 * commands that exist purely to group subcommands (`config`, `draft`,
 * `recommendation`, ...) legitimately map to an empty array here. Scope
 * note: this intentionally checks only *top-level* commands' own flags, not
 * subcommand flags (`cadence config get --json` vs `cadence config`) — that
 * is a much larger surface (dozens of filter flags across `recommendation`
 * /`decision`/`assumption` subcommands) and is left for a future slice per
 * the DRAFT's "first useful slice" boundary.
 */
function commandFlags(): Map<string, string[]> {
  const program = new Command();
  registerAllCommands(program);
  const map = new Map<string, string[]>();
  for (const cmd of program.commands) {
    if (cmd.name() === 'help') continue;
    const flags = cmd.options.map((o) => o.long).filter((l): l is string => Boolean(l));
    map.set(cmd.name(), flags);
  }
  return map;
}

/**
 * Extracts a top-level command's own prose section from `commands.md`: the
 * text between its `### <name>` heading and the next level-2 (`## `) or
 * level-3 (`### `) heading. Stops before a sibling `### ` section but NOT
 * before a nested `#### <name> <subcommand>` heading (four hashes), which
 * documents a *subcommand's* flags rather than this command's own — those
 * must stay inside the section since a command's own flags (e.g. `status`'s
 * `--json`) are sometimes documented above a nested subcommand block (e.g.
 * `#### status anomalies`).
 */
function commandSection(md: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // No `m` flag: a bare `$` must mean true end-of-document here, not
  // end-of-line (which it would under `m`, wrongly stopping the capture
  // right after the heading). Start/end-of-heading-line anchors are spelled
  // out explicitly with `\n`/`^` instead.
  const re = new RegExp(`(?:^|\\n)### ${escaped}(?=\\n|$)\\n([\\s\\S]*?)(?=\\n(?:## |### )|$)`);
  const m = md.match(re);
  if (!m) throw new Error(`commands.md: no "### ${name}" section heading found`);
  return m[1]!;
}

describe('docs/reference/commands.md drift guard', () => {
  it('documents exactly the CLI top-level command set', () => {
    expect([...documentedCommands()].sort()).toEqual([...cliCommands()].sort());
  });

  it('documents every top-level command\'s registered long-flags in its own section (AC-1)', () => {
    const md = readFileSync(join(REPO_ROOT, 'docs/reference/commands.md'), 'utf8');
    const missing: string[] = [];
    for (const [name, flags] of commandFlags()) {
      if (flags.length === 0) continue;
      const section = commandSection(md, name);
      for (const flag of flags) {
        // Word-boundary-anchored, not a bare substring check: a bare
        // `section.includes('--json')` would spuriously pass for an
        // undocumented `--js` flag matching inside documented `--json`, or
        // an undocumented `--pat` matching inside documented `--path`. `-`
        // isn't a `\w` character, so `\b` alone won't stop at it — require
        // the character after the flag to be absent or non-flag-continuing
        // (whitespace, punctuation, backtick, end of string), not another
        // `-`/word character that would mean it's actually a longer flag.
        const escapedFlag = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flagRe = new RegExp(`${escapedFlag}(?![\\w-])`);
        if (!flagRe.test(section)) missing.push(`${name} ${flag}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('251-01/AC-4: doctor section documents the conduction-reachability check in both the v1 check set table and the --fix manual-classification passage', () => {
    const md = readFileSync(join(REPO_ROOT, 'docs/reference/commands.md'), 'utf8');
    const section = commandSection(md, 'doctor');

    // The "v1 check set" table row naming the check.
    expect(section).toMatch(/\|\s*`conduction-reachability`\s*\|/);

    // The `--fix` classification passage's `manual` list.
    const manualRow = section.match(/\|\s*\*\*manual\*\*\s*\|([^|]*)\|/);
    if (!manualRow) throw new Error('commands.md: --fix manual-classification row not found');
    expect(manualRow[1]).toContain('conduction-reachability');
  });

  it('259-01/AC-5: doctor section documents the roadmap-currency check in the v1 check set table', () => {
    const md = readFileSync(join(REPO_ROOT, 'docs/reference/commands.md'), 'utf8');
    const section = commandSection(md, 'doctor');

    // The "v1 check set" table row naming the check.
    expect(section).toMatch(/\|\s*`roadmap-currency`\s*\|/);

    // The `--fix` classification passage's `manual` list.
    const manualRow = section.match(/\|\s*\*\*manual\*\*\s*\|([^|]*)\|/);
    if (!manualRow) throw new Error('commands.md: --fix manual-classification row not found');
    expect(manualRow[1]).toContain('roadmap-currency');
  });
});
