import type { Quickstart } from './build.js';

/** Render the orientation as terminal-sized text. */
export function renderText(qs: Quickstart): string {
  const lines: string[] = [qs.header, ''];

  if (qs.status === 'uninitialized') {
    lines.push('Next:');
    qs.nextMoves.forEach((m, i) => {
      lines.push(`  ${i + 1}. ${m.command.padEnd(22)} ${m.note}`);
    });
    lines.push('');
  } else if (qs.next) {
    lines.push(`Next: ${qs.next.command}`);
    lines.push(`      ${qs.next.reason}`);
    lines.push('  (or `cadence progress` anytime)');
    lines.push('');
  }

  lines.push('Onboarding commands:');
  const width = Math.max(...qs.commandMap.map((e) => e.name.length));
  for (const e of qs.commandMap) {
    lines.push(`  cadence ${e.name.padEnd(width)}  ${e.note}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Render the structured form for `--json`. */
export function renderJson(qs: Quickstart): Quickstart {
  return qs;
}
