// packages/core/src/config-edit/parse.ts
import type { EditableField } from './fields.js';

/** Result of parsing one prompt answer. */
export type Choice = { value: string } | { keep: true } | { error: string };

/**
 * Parse a single numbered-choice answer against a field. Empty input keeps the
 * current value; a 1-based index selects; anything else is an error (re-prompt).
 * Pure — the unit-testable heart of the wizard loop.
 */
export function parseChoice(input: string, field: EditableField): Choice {
  const trimmed = input.trim();
  if (trimmed === '') return { keep: true };
  if (!/^\d+$/.test(trimmed)) {
    return { error: `Enter a number 1–${field.choices.length}, or press Enter to keep current.` };
  }
  const n = Number(trimmed);
  if (n < 1 || n > field.choices.length) {
    return { error: `Out of range — enter 1–${field.choices.length}, or Enter to keep current.` };
  }
  return { value: field.choices[n - 1]!.value };
}
