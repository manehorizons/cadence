// packages/core/src/config-edit/wizard.ts
import type { CadenceConfig } from '@manehorizons/cadence-types';
import type { CommandIO } from '../services/io.js';
import type { EditableField } from './fields.js';
import { parseChoice } from './parse.js';
import { assembleConfig, diffConfig, validateCandidate, type ConfigChange } from './apply.js';

/** Render+read one field's answer (raw line). The CLI supplies the readline impl. */
export type Ask = (field: EditableField) => Promise<string>;
/** Show the change summary and read a yes/no. The CLI supplies the readline impl. */
export type Confirm = (changes: ConfigChange[]) => Promise<boolean>;

/** Outcome of the wizard — the impure CLI does the actual write on `apply`. */
export type WizardResult =
  | { status: 'noop' }
  | { status: 'apply'; config: CadenceConfig; changes: ConfigChange[] }
  | { status: 'invalid'; field: string; message: string };

/**
 * Drive the curated wizard over `fields`, collecting answers via the injected
 * `ask`, then assemble → validate → diff → confirm. Pure of real I/O: all
 * prompting is delegated to `ask`/`confirm`, so the flow is fully testable with
 * scripted callbacks. The single write is the CLI's job (on `status: 'apply'`).
 */
export async function runWizard(
  config: CadenceConfig,
  fields: EditableField[],
  io: CommandIO,
  hooks: { ask: Ask; confirm: Confirm },
): Promise<WizardResult> {
  const answers = new Map<string, string>();
  for (const field of fields) {
    // Re-prompt the same field until a keep or a valid value.
    for (;;) {
      const raw = await hooks.ask(field);
      const choice = parseChoice(raw, field);
      if ('keep' in choice) break;
      if ('value' in choice) {
        answers.set(field.dottedKey, choice.value);
        break;
      }
      io.err(`  ${choice.error}\n`);
    }
  }

  const candidate = assembleConfig(config, answers);
  const validation = validateCandidate(candidate);
  if (!validation.ok) return { status: 'invalid', field: validation.field, message: validation.message };

  const changes = diffConfig(config, candidate, fields);
  if (changes.length === 0) return { status: 'noop' };

  const ok = await hooks.confirm(changes);
  if (!ok) return { status: 'noop' };

  return { status: 'apply', config: validation.config, changes };
}
