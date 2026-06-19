import { START_OPTIONS, type StartOption } from './menu.js';

const INIT_OPTION_NUMBER = 2;
const ANNOTATION = '(already set up — re-runs are safe)';

export interface StartRecommendation {
  command: string;
  reason: string;
}

/** Render the menu as terminal text. `initialized` annotates the init option. */
export function renderMenu(
  initialized: boolean,
  recommendation?: StartRecommendation,
): string {
  const width = Math.max(...START_OPTIONS.map((o) => o.label.length));
  const lines: string[] = ['What are you doing?', ''];
  if (recommendation !== undefined) {
    lines.push(`  Recommended: ${recommendation.command}`);
    lines.push(`  ${recommendation.reason}`);
    lines.push('');
  }
  for (const o of START_OPTIONS) {
    let line = `  ${o.number}. ${o.label.padEnd(width)}  → ${o.display}`;
    if (initialized && o.number === INIT_OPTION_NUMBER) line += `  ${ANNOTATION}`;
    lines.push(line);
  }
  lines.push('', '  q. Quit', '');
  return lines.join('\n');
}

/** The structured menu for `--json`. */
export interface StartMenuJson {
  options: StartOption[];
  initialized: boolean;
  recommendation?: StartRecommendation;
}

export function renderJson(
  initialized: boolean,
  recommendation?: StartRecommendation,
): StartMenuJson {
  return {
    options: START_OPTIONS,
    initialized,
    ...(recommendation !== undefined ? { recommendation } : {}),
  };
}

/** The confirm prompt line for a chosen option. */
export function renderConfirm(option: StartOption): string {
  return `This will run \`${option.display}\`. Run it now? [Y/n] `;
}
