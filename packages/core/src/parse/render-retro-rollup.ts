import type { RetroFrequencyBuckets, RetroRollup } from '@thomas-powers-jr/cadence-types';

// deja:new distinct renderer for RetroRollup (cross-phase aggregate), not
// retro-writer.ts's single-phase RetroDigest renderer — mirrors its
// section-per-field Markdown shape and render-intelligence-stats.ts's
// heading-per-section / `(count)` style (phase 186 T3).
function renderDimension(lines: string[], title: string, buckets: RetroFrequencyBuckets): void {
  if (buckets.recurring.length === 0 && buckets.oneOff.length === 0) return;

  lines.push(`## ${title}`, '');

  if (buckets.recurring.length > 0) {
    lines.push('### Recurring', '');
    for (const entry of buckets.recurring) {
      const noun = entry.count === 1 ? 'phase' : 'phases';
      lines.push(`- ${entry.key} (${entry.count} ${noun}: ${entry.phaseIds.join(', ')})`);
    }
    lines.push('');
  }

  if (buckets.oneOff.length > 0) {
    lines.push('### One-off', '');
    for (const entry of buckets.oneOff) {
      const noun = entry.count === 1 ? 'phase' : 'phases';
      lines.push(`- ${entry.key} (${entry.count} ${noun}: ${entry.phaseIds.join(', ')})`);
    }
    lines.push('');
  }
}

export function renderRetroRollup(rollup: RetroRollup): string {
  const allDimensionsEmpty =
    rollup.bypasses.recurring.length === 0 &&
    rollup.bypasses.oneOff.length === 0 &&
    rollup.roughTaskStatuses.recurring.length === 0 &&
    rollup.roughTaskStatuses.oneOff.length === 0 &&
    rollup.findingCategories.recurring.length === 0 &&
    rollup.findingCategories.oneOff.length === 0;

  if (rollup.totalPhases === 0) {
    return (
      '# Retro Rollup\n\n' +
      'No settled phases yet — there is nothing for retro to scan. ' +
      "Run `cadence progress` to check the current loop position, then settle at least one phase before retrying `cadence retro`.\n"
    );
  }

  if (allDimensionsEmpty) {
    return `# Retro Rollup\n\n${rollup.totalPhases} phase(s) scanned, no friction found — clean result.\n`;
  }

  const lines: string[] = ['# Retro Rollup', ''];
  lines.push(
    `${rollup.totalPhases} phase(s) scanned, ${rollup.phasesWithFriction} with friction.`,
    '',
  );

  renderDimension(lines, 'Gate bypasses', rollup.bypasses);
  renderDimension(lines, 'Rough task statuses', rollup.roughTaskStatuses);
  renderDimension(lines, 'Finding categories', rollup.findingCategories);

  return lines.join('\n');
}
