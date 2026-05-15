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
  verification: z
    .object({
      /**
       * Glob patterns the test-coverage scanner walks. Supports `**` and `*`.
       * Default scans the workspace `packages/**\/*.test.ts(x)`.
       */
      testGlobs: z.array(z.string()).default(['packages/**/*.test.ts', 'packages/**/*.test.tsx']),
    })
    .default({ testGlobs: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'] }),
  verifier: z
    .object({
      /**
       * `--deep` verifier provider selection (Phase 15). `mock` always works
       * offline; `anthropic` requires ANTHROPIC_API_KEY in env.
       */
      provider: z.enum(['mock', 'anthropic']).default('mock'),
      /** Optional model override for the Anthropic provider. */
      model: z.string().optional(),
    })
    .default({ provider: 'mock' }),
  perTaskVerifier: z
    .object({
      /**
       * Per-task verifier provider selection (Phase 24.2). Fires at
       * `cadence build task <id> --status=DONE` when `'per-task-verify'`
       * is in the effective gate set (strict×standard, strict×complex).
       */
      provider: z.enum(['mock', 'anthropic']).default('mock'),
      /** Optional model override for the Anthropic provider. */
      model: z.string().optional(),
    })
    .default({ provider: 'mock' }),
  codeReview: z
    .object({
      /**
       * Code-review verifier provider selection (Phase 24.3). Fires at
       * `cadence settle run` when `'code-review'` is in the effective
       * gate set. HIGH findings refuse settle unless `--force` /
       * `--allow-code-review-failure`.
       */
      provider: z.enum(['mock', 'anthropic']).default('mock'),
      /** Optional model override for the Anthropic provider. */
      model: z.string().optional(),
    })
    .default({ provider: 'mock' }),
  planReview: z
    .object({
      /**
       * Plan-review verifier provider selection (Phase 25.1). Fires at
       * `cadence draft approve` when `'plan-review'` is in the effective
       * gate set (strict×complex). `pass=false` refuses approve unless
       * `--allow-plan-review-failure`.
       */
      provider: z.enum(['mock', 'anthropic']).default('mock'),
      /** Optional model override for the Anthropic provider. */
      model: z.string().optional(),
    })
    .default({ provider: 'mock' }),
  securityAudit: z
    .object({
      /**
       * Security-audit verifier provider selection (Phase 25.2). Fires at
       * `cadence settle run` (after code-review, before SUMMARY write)
       * when `'security-audit'` is in the effective gate set
       * (strict×complex only). CRITICAL findings refuse settle unless
       * `--force` / `--allow-security-audit-failure`.
       */
      provider: z.enum(['mock', 'anthropic']).default('mock'),
      /** Optional model override for the Anthropic provider. */
      model: z.string().optional(),
    })
    .default({ provider: 'mock' }),
  notify: z
    .object({
      /**
       * Anomaly-event transport. `stderr` (default) writes one line per event;
       * `file` appends NDJSON to `notify.file`; `none` drops events;
       * `webhook` POSTs `{events: [...]}` JSON to `notify.webhook.url`
       * (Phase 19.1). Only fires when `'anomaly-notify'` is in the
       * effective gate set.
       */
      transport: z.enum(['stderr', 'file', 'none', 'webhook']).default('stderr'),
      /** Path for the `file` transport. Defaults to `.cadence/anomalies.log`. */
      file: z.string().optional(),
      /**
       * Webhook target for the `webhook` transport (Phase 19.1). Required
       * when transport === 'webhook'; ignored otherwise. URL is sensitive
       * (may carry a token); never logged on failure.
       */
      webhook: z
        .object({
          url: z.string().url(),
          headers: z.record(z.string()).optional(),
          timeoutMs: z.number().int().positive().optional(),
        })
        .optional(),
    })
    .refine(
      (n) => n.transport !== 'webhook' || (n.webhook !== undefined && n.webhook.url.length > 0),
      { message: "notify.webhook.url is required when notify.transport === 'webhook'" },
    )
    .default({ transport: 'stderr' }),
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
  verification: {
    testGlobs: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
  },
  verifier: { provider: 'mock' as const },
  perTaskVerifier: { provider: 'mock' as const },
  codeReview: { provider: 'mock' as const },
  planReview: { provider: 'mock' as const },
  securityAudit: { provider: 'mock' as const },
  notify: { transport: 'stderr' as const },
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
