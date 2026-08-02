// packages/core/src/cli/prompt.ts
import * as readline from 'node:readline/promises';
import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';
import type { Ask, Confirm } from '../config-edit/wizard.js';
import { renderPrompt, renderChanges } from '../config-edit/render.js';

/**
 * Build the real readline-backed `ask`/`confirm` callbacks for the wizard.
 * `ask` prints the rendered prompt and reads one line; `confirm` prints the
 * change summary and reads a y/N. Caller is responsible for the TTY guard.
 */
export function makeReadlinePrompts(config: CadenceConfig): {
  ask: Ask;
  confirm: Confirm;
  close(): void;
} {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask: Ask = async (field) => {
    process.stdout.write(renderPrompt(field, config));
    return rl.question('> ');
  };
  const confirm: Confirm = async (changes) => {
    process.stdout.write(renderChanges(changes));
    const answer = await rl.question(`Apply these ${changes.length} change(s)? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  };
  return { ask, confirm, close: () => rl.close() };
}
