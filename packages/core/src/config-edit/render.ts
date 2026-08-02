// packages/core/src/config-edit/render.ts
import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';
import type { EditableField } from './fields.js';
import type { ConfigChange } from './apply.js';

/** Render one field's prompt: label, help, numbered choices, current marker. */
export function renderPrompt(field: EditableField, config: CadenceConfig): string {
  const current = field.current(config);
  const lines: string[] = [`${field.label} — current: ${current}`, `  ${field.help}`];
  field.choices.forEach((c, i) => {
    const mark = c.value === current ? '  (current)' : '';
    lines.push(`  ${i + 1}) ${c.value.padEnd(10)} ${c.blurb}${mark}`);
  });
  lines.push('');
  return lines.join('\n');
}

/** Render the change summary shown before the confirm prompt. */
export function renderChanges(changes: ConfigChange[]): string {
  const lines = ['Changes:'];
  for (const c of changes) lines.push(`  ${c.key}  ${c.from} → ${c.to}`);
  lines.push('');
  return lines.join('\n');
}
