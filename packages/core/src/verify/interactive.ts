import type { Prompter } from './prompter.js';
import type { VerifyAc, VerifyTestRef } from './verifier.js';

export interface InteractiveVerdict {
  verdict: 'pass' | 'fail';
  note?: string;
}

export interface InteractiveInput {
  acs: VerifyAc[];
  tests: Record<string, VerifyTestRef[]>;
  files: string[];
}

export interface WalkOptions {
  /** Test seam — defaults to `process.stdout.write`. */
  write?: (chunk: string) => void;
}

/**
 * Walk each AC in order, render its context, and prompt the user for a verdict.
 * Returns one entry per AC the user verdicted on (`pass` or `fail`). Skipped
 * ACs are omitted from the result so they can fall through to other gates.
 */
export async function walkAcsInteractively(
  input: InteractiveInput,
  prompter: Prompter,
  opts: WalkOptions = {},
): Promise<Record<string, InteractiveVerdict>> {
  const write = opts.write ?? ((c: string) => process.stdout.write(c));
  const out: Record<string, InteractiveVerdict> = {};

  write(`\nCADENCE — interactive verdict (${input.acs.length} AC${input.acs.length === 1 ? '' : 's'})\n`);
  write('Answer per AC: pass | fail | skip. Skip falls through to other gates.\n');

  for (const ac of input.acs) {
    write(`\n──── ${ac.id} ────────────────────────────────────────────────\n`);
    write(`Given: ${ac.given}\n`);
    write(`When:  ${ac.when}\n`);
    write(`Then:  ${ac.then}\n`);

    const linked = input.tests[ac.id] ?? [];
    if (linked.length > 0) {
      write(`Linked tests (${linked.length}):\n`);
      for (const t of linked.slice(0, 5)) {
        write(`  - ${t.file}:${t.line}\n`);
      }
      if (linked.length > 5) write(`  … and ${linked.length - 5} more\n`);
    } else {
      write('Linked tests: (none)\n');
    }

    if (input.files.length > 0) {
      write(`Touched files: ${input.files.slice(0, 5).join(', ')}`);
      if (input.files.length > 5) write(` (+${input.files.length - 5} more)`);
      write('\n');
    }

    const verdict = await askVerdict(prompter, ac.id);
    if (verdict === 'skip') {
      write(`→ ${ac.id}: skipped\n`);
      continue;
    }

    const note = await askNote(prompter);
    out[ac.id] = note ? { verdict, note } : { verdict };
    write(`→ ${ac.id}: ${verdict}${note ? ` — ${note}` : ''}\n`);
  }

  return out;
}

async function askVerdict(
  prompter: Prompter,
  acId: string,
): Promise<'pass' | 'fail' | 'skip'> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = (await prompter.ask(`${acId} verdict [pass/fail/skip]: `)).trim().toLowerCase();
    if (raw === 'pass' || raw === 'p') return 'pass';
    if (raw === 'fail' || raw === 'f') return 'fail';
    if (raw === 'skip' || raw === 's' || raw === '') return 'skip';
  }
  throw new Error(
    `walker: failed to read a valid verdict for ${acId} after 3 attempts`,
  );
}

async function askNote(prompter: Prompter): Promise<string | undefined> {
  const raw = (await prompter.ask('Note (optional, one line, blank to skip): ')).trim();
  return raw.length > 0 ? raw : undefined;
}
