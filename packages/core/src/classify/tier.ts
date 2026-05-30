import type { Tier, CadenceConfig } from '@manehorizons/cadence-types';

export interface DraftSignals {
  tasks: { files: string[] }[];
  acceptanceCriteria: unknown[];
}

export function classifyTier(d: DraftSignals, tierConfig: CadenceConfig['tier']): Tier {
  const taskCount = d.tasks.length;
  const fileCount = new Set(d.tasks.flatMap((t) => t.files)).size;

  if (
    taskCount <= tierConfig.quickFix.maxTasks &&
    fileCount <= tierConfig.quickFix.maxFiles
  ) {
    return 'quick-fix';
  }
  if (
    taskCount <= tierConfig.standard.maxTasks &&
    fileCount <= tierConfig.standard.maxFiles &&
    taskCount < tierConfig.complex.minTasks
  ) {
    return 'standard';
  }
  return 'complex';
}
