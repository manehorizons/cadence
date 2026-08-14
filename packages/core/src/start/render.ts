import { START_OPTIONS, type StartOption } from './menu.js';

const INIT_OPTION_NUMBER = 2;
const ANNOTATION = '(already set up — re-runs are safe)';

export interface StartRecommendation {
  command: string;
  reason: string;
}

/**
 * Render the menu as terminal text. `initialized` annotates the init option.
 * `options` defaults to the full `START_OPTIONS` catalog; `cadence start`
 * (`cli/commands/start.ts`) passes a stage-filtered subset for progressive
 * disclosure (278-01/AC-11) — this stays additive so every other caller
 * (including existing `start/render.test.ts` coverage) is unaffected.
 */
export function renderMenu(
  initialized: boolean,
  recommendation?: StartRecommendation,
  options: StartOption[] = START_OPTIONS,
): string {
  const width = Math.max(...options.map((o) => o.label.length));
  const lines: string[] = ['What are you doing?', ''];
  if (recommendation !== undefined) {
    lines.push(`  Recommended: ${recommendation.command}`);
    lines.push(`  ${recommendation.reason}`);
    lines.push('');
  }
  for (const o of options) {
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
  options: StartOption[] = START_OPTIONS,
): StartMenuJson {
  return {
    options,
    initialized,
    ...(recommendation !== undefined ? { recommendation } : {}),
  };
}

/** The confirm prompt line for a chosen option. */
export function renderConfirm(option: StartOption): string {
  return `This will run \`${option.display}\`. Run it now? [Y/n] `;
}
