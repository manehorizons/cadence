import { z } from 'zod';
import { ProfileZ } from './profile.js';

export const CadenceConfigZ = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.literal(1),
  /** User-involvement profile per DESIGN.md Section 3.1. Defaults to `auto`. */
  profile: ProfileZ.default('auto'),
  loopEnforcement: z.enum(['strict', 'soft', 'reminder']),
  acDiscipline: z.enum(['strict', 'tier-scaled', 'optional']),
  workstreamBackend: z.union([
    z.enum(['simple', 'multi-branch']),
    z.string().regex(/^custom:/),
  ]),
  ruleProvider: z.union([
    z.enum(['trigger-taxonomy', 'carl']),
    z.string().regex(/^custom:/),
  ]),
  subagentPolicy: z.object({
    contextBudgetThreshold: z.number().min(0.3).max(0.95),
    largeTaskTokens: z.number().int().positive(),
    mechanicalBatchMin: z.number().int().positive(),
  }),
  modelPerClass: z.object({
    mechanical: z.string(),
    standard: z.string(),
    complex: z.string(),
    drafting: z.string(),
  }),
  commitCadence: z.enum(['task', 'draft', 'manual']),
  templates: z.object({
    dir: z.string(),
    overrides: z.array(z.string()),
  }),
  hooks: z.object({
    sessionStart: z.boolean(),
    stopReminder: z.boolean(),
    preToolUseBuildGate: z.boolean(),
    userPromptSubmit: z.boolean(),
  }),
  packs: z.object({
    enabled: z.array(z.string()),
    disabled: z.array(z.string()),
  }),
  telemetry: z.object({
    tokenUtilization: z.boolean(),
    skillInvocations: z.boolean(),
    remoteOptIn: z.boolean(),
  }),
  tier: z.object({
    quickFix: z.object({ maxTasks: z.number().int(), maxFiles: z.number().int() }),
    standard: z.object({ maxTasks: z.number().int(), maxFiles: z.number().int() }),
    complex: z.object({ maxTasks: z.number().int(), minTasks: z.number().int() }),
  }),
});

export type CadenceConfig = z.infer<typeof CadenceConfigZ>;

export const defaultConfig: CadenceConfig = {
  schemaVersion: 1,
  profile: 'auto',
  loopEnforcement: 'soft',
  acDiscipline: 'tier-scaled',
  workstreamBackend: 'simple',
  ruleProvider: 'trigger-taxonomy',
  subagentPolicy: { contextBudgetThreshold: 0.7, largeTaskTokens: 8000, mechanicalBatchMin: 3 },
  modelPerClass: {
    mechanical: 'claude-haiku-4-5-20251001',
    standard: 'claude-sonnet-4-6',
    complex: 'claude-opus-4-7',
    drafting: 'claude-opus-4-7',
  },
  commitCadence: 'draft',
  templates: { dir: '.cadence/templates', overrides: [] },
  hooks: {
    sessionStart: true,
    stopReminder: true,
    preToolUseBuildGate: false,
    userPromptSubmit: true,
  },
  packs: { enabled: [], disabled: [] },
  telemetry: { tokenUtilization: true, skillInvocations: true, remoteOptIn: false },
  tier: {
    quickFix: { maxTasks: 1, maxFiles: 1 },
    standard: { maxTasks: 5, maxFiles: 8 },
    complex: { maxTasks: 999, minTasks: 6 },
  },
};

export const presets = {
  solo: {
    ...defaultConfig,
    loopEnforcement: 'reminder' as const,
    acDiscipline: 'optional' as const,
    commitCadence: 'manual' as const,
  },
  team: { ...defaultConfig },
  production: {
    ...defaultConfig,
    loopEnforcement: 'strict' as const,
    acDiscipline: 'strict' as const,
    hooks: { ...defaultConfig.hooks, preToolUseBuildGate: true },
  },
} satisfies Record<string, CadenceConfig>;
