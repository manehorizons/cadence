import { z } from 'zod';
import { ProfileZ } from './profile.js';
import { LogLevelZ, LogFormatZ } from './logging.js';

/**
 * Config-facing shape for a custom assertion-coverage profile
 * (`verification.coverageProfiles`, phase 167 T7). Mirrors
 * `@manehorizons/cadence-core`'s `LanguageProfile`
 * (`packages/core/src/verify/coverage-profiles/types.ts`) as a
 * JSON-serializable, string-pattern shape: `openerPattern`/`assertionPattern`
 * are regex SOURCE STRINGS here, compiled into real `RegExp`s at
 * config-load time by core's `compileCustomProfile`
 * (`packages/core/src/verify/coverage-profiles/custom.ts`) — never by this
 * schema — since a native `RegExp` cannot round-trip through
 * `.cadence/config.json`. This package has no dependency on core (pure data
 * layer), so `strategy` below is a hand-kept mirror of core's `BlockStrategy`
 * union, not an import; core's `compileCustomProfile` is the single bridge
 * between this JSON shape and the runtime `LanguageProfile`.
 *
 * Deliberately narrower than the full `LanguageProfile` surface — two field
 * groups are scoped OUT of config entirely for this task (see
 * `custom.ts`'s module docstring for the full rationale, repeated in brief
 * here since this is the schema an operator actually reads):
 *  - `openerRequiredLiteral`: an advanced, easy-to-misuse field whose own
 *    docstring (`LanguageProfile.openerRequiredLiteral`) requires
 *    `openerPattern` to end at one exact position (immediately after the
 *    triggering `(`) for its paren-depth-aware extraction to be safe at
 *    all — go's own module docstring documents three real false-positive
 *    bugs this field's misuse can reintroduce. Built-in profiles that don't
 *    need it (php's PHPUnit opener, python, most shapes) prove a custom
 *    profile can be fully functional without it.
 *  - `fencedStrings` / `heredocs`: advanced dynamic-fence string forms
 *    (Rust's `r#"..."#`, PHP's heredoc/nowdoc) needed by only one or two
 *    built-ins each. Plain `strings` (fixed open/close delimiters) plus
 *    line/block `comments` cover ordinary language grammars, including the
 *    Ruby do-end-keyword fixture this task ships end-to-end.
 */
export const CoverageProfileStringDelimiterZ = z.object({
  open: z.string().min(1),
  /** Defaults to `open` (symmetric quote) when omitted. */
  close: z.string().min(1).optional(),
  /** `null` disables escape handling entirely (e.g. raw strings). Omit for
   * the default `\`. */
  escape: z.union([z.string().length(1), z.null()]).optional(),
});

export const CoverageProfileSyntaxZ = z.object({
  comments: z
    .object({
      /** Line-comment openers, e.g. `['#']`. */
      line: z.array(z.string().min(1)).default([]),
      /** Block-comment `[open, close]` pairs, e.g. `[['/*', '*\/']]`. */
      block: z.array(z.tuple([z.string().min(1), z.string().min(1)])).default([]),
    })
    .default({ line: [], block: [] }),
  strings: z.array(CoverageProfileStringDelimiterZ).default([]),
});

/** Hand-kept mirror of core's `BlockStrategy` union — see module docstring
 * above for why this package can't import it directly. */
export const CoverageProfileStrategyZ = z.enum([
  'call-expression',
  'brace-delimited',
  'indentation-delimited',
  'do-end-keyword',
]);

export const CoverageProfileKeywordZ = z.object({
  /** Keywords that open a further nested block needing its own closer. */
  blockOpenKeywords: z.array(z.string().min(1)).min(1),
  /** The keyword that closes the innermost currently-open block. */
  endKeyword: z.string().min(1),
});

export const CoverageProfileConfigZ = z.object({
  /** Unique profile id, e.g. `'ruby-rspec'`. Named in load-time refusal
   * messages, so pick something identifiable. */
  id: z.string().min(1),
  /** Lowercase file extensions this profile claims, e.g. `['.rb']`.
   * Refused at load time if any extension is already owned by a built-in
   * profile (add-only — custom profiles may not override a built-in). */
  extensions: z.array(z.string().min(1)).min(1),
  /** Regex SOURCE STRING, compiled with the sticky `y` flag at load time.
   * A string that throws when passed to `new RegExp(...)` is refused at
   * load time, naming this profile's `id` and the field. */
  openerPattern: z.string().min(1),
  /** Regex SOURCE STRING, compiled (no sticky flag needed) at load time.
   * Same invalid-regex refusal as `openerPattern`. */
  assertionPattern: z.string().min(1),
  strategy: CoverageProfileStrategyZ,
  /** Required (not defaulted) — an operator must explicitly declare a
   * comment/string table, even an empty one, rather than silently getting
   * no masking at all. */
  syntax: CoverageProfileSyntaxZ,
  /** Required iff `strategy === 'do-end-keyword'`; refused at load time
   * when missing for that strategy. Deliberately left unenforced by a Zod
   * cross-field refinement here — core's `compileCustomProfile` is the
   * single place that produces the refuse+suggest message naming the
   * profile id and the fix, matching this codebase's other load-time
   * validation (`packages/core/src/config/loader.ts`). */
  keyword: CoverageProfileKeywordZ.optional(),
  /** See `LanguageProfile.openerMatchesStrings` (core `types.ts`) for the
   * full tradeoff. Default `false`. */
  openerMatchesStrings: z.boolean().optional(),
});

export type CoverageProfileConfig = z.infer<typeof CoverageProfileConfigZ>;

/**
 * Phase 140 evidence ladder, ranked strongest to weakest:
 * `ai-verified` > `executed` > `assertion` > `mention` > `unverified`. Hand-kept
 * mirror of `AcEvidenceZ` (`packages/types/src/summary.ts`) rather than an
 * import — `summary.ts` is a sibling task's file for this phase, and this
 * package already establishes the hand-kept-enum-mirror pattern above
 * (`CoverageProfileStrategyZ` mirroring core's `BlockStrategy`) for exactly
 * this situation.
 */
export const EvidenceFloorZ = z.enum(['ai-verified', 'executed', 'assertion', 'mention', 'unverified']);

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
  skillAudit: z
    .object({
      required: z.array(z.string()).default([]),
    })
    .default({ required: [] }),
  convergence: z
    .object({
      maxAttempts: z.number().int().positive().default(3),
    })
    .default({ maxAttempts: 3 }),
  specReview: z
    .object({
      provider: z.enum(['mock', 'anthropic', 'local', 'host-cli']).default('mock'),
      model: z.string().optional(),
    })
    .default({ provider: 'mock' }),
  uiSpecReview: z
    .object({
      provider: z.enum(['mock', 'anthropic', 'local', 'host-cli']).default('mock'),
      model: z.string().optional(),
    })
    .default({ provider: 'mock' }),
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
      /**
       * How strictly an AC token must be referenced by a test (phase 108).
       * `mention` (default) — any `AC-N` occurrence anywhere in a matched file
       * counts (whole-file string search; unchanged historical behavior).
       * `assertion` — the token must appear inside an `it()`/`test()` block that
       * contains at least one assertion (`expect(` / `assert` / `.should`).
       */
      coverageMode: z.enum(['mention', 'assertion']).default('mention'),
      /**
       * Shell command the `build-test-must-pass` gate runs at settle time
       * (Phase 39.2). When set, settle runs it and refuses on a non-zero exit
       * unless `--allow-failing-build` / `--force`. When absent, the gate is
       * evaluated but cannot enforce — it passes with a one-time note.
       */
      testCommand: z.string().optional(),
      /**
       * Operator-extensible assertion-coverage profiles for languages no
       * built-in profile claims (phase 167, T7). Add-only: an entry
       * claiming an extension a BUILT-IN profile already owns (`.ts`,
       * `.py`, `.go`, `.rs`, `.php`, ...) is refused loudly at config-load
       * time, naming the collision and suggesting a fix — overriding a
       * built-in is not supported. Validated (regex compiles, required
       * fields present, no collision) by
       * `packages/core/src/config/loader.ts` via
       * `mergeCustomProfiles` (`packages/core/src/verify/coverage-profiles/
       * registry.ts`), never silently accepted or ignored.
       */
      coverageProfiles: z.array(CoverageProfileConfigZ).default([]),
    })
    .default({
      testGlobs: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
      coverageMode: 'mention',
      coverageProfiles: [],
    }),
  verifier: z
    .object({
      /**
       * `--deep` verifier provider selection (Phase 15). `mock` always works
       * offline; `anthropic` requires ANTHROPIC_API_KEY in env.
       */
      provider: z.enum(['mock', 'anthropic', 'local', 'host-cli']).default('mock'),
      /** Optional model override for the Anthropic provider. */
      model: z.string().optional(),
      /**
       * Byte budget for the unified diff sent to the `--deep` verifier
       * (Phase 70). Oversized diffs are truncated with an explicit marker so
       * the verifier knows it saw a partial picture. Default 256KB.
       */
      diffCapBytes: z.number().int().positive().default(262144),
      /**
       * Phase 72: request timeout (ms) for the `anthropic` provider. Omitted →
       * the Anthropic SDK default holds. A transient slow call in a settle gate
       * should time out and retry, not hang.
       */
      timeoutMs: z.number().int().positive().optional(),
      /**
       * Phase 72: retry budget for the `anthropic` provider on transient
       * (429/5xx/network) errors. Omitted → the SDK default holds; `0` disables
       * retries explicitly.
       */
      maxRetries: z.number().int().nonnegative().optional(),
      /**
       * Phase 72: extra HTTP headers for the `local` provider (e.g. an
       * `Authorization` bearer for a token-gated OpenAI-compatible proxy).
       * Merged over the base `content-type`. Prefer the `CADENCE_LOCAL_API_KEY`
       * env var for the bearer; use this for arbitrary headers. Never logged.
       */
      localHeaders: z.record(z.string(), z.string()).optional(),
    })
    .default({ provider: 'mock', diffCapBytes: 262144 }),
  perTaskVerifier: z
    .object({
      /**
       * Per-task verifier provider selection (Phase 24.2). Fires at
       * `cadence build task <id> --status=DONE` when `'per-task-verify'`
       * is in the effective gate set (strict×standard, strict×complex).
       */
      provider: z.enum(['mock', 'anthropic', 'local', 'host-cli']).default('mock'),
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
      provider: z.enum(['mock', 'anthropic', 'local', 'host-cli']).default('mock'),
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
      provider: z.enum(['mock', 'anthropic', 'local', 'host-cli']).default('mock'),
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
      provider: z.enum(['mock', 'anthropic', 'local', 'host-cli']).default('mock'),
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
          headers: z.record(z.string(), z.string()).optional(),
          timeoutMs: z.number().int().positive().optional(),
        })
        .optional(),
    })
    .refine(
      (n) => n.transport !== 'webhook' || (n.webhook !== undefined && n.webhook.url.length > 0),
      { message: "notify.webhook.url is required when notify.transport === 'webhook'" },
    )
    .default({ transport: 'stderr' }),
  /**
   * Phase-collision guard (Phase 83, v1.18 worktree-safety). Refuses to
   * scaffold a phase number already claimed by a sibling git worktree or by
   * `origin/<integrationRef>`, so a cross-worktree collision fails loud before
   * wasted work instead of silently dual-merging. Observes ground truth (the
   * worktree list + upstream tree) — no reservation registry. `enabled: false`
   * disables the guard entirely; omitting the block applies the defaults.
   */
  phaseGuard: z
    .object({
      enabled: z.boolean().default(true),
      integrationRef: z.string().default('main'),
    })
    .default({ enabled: true, integrationRef: 'main' }),
  /**
   * Operational diagnostic logging (Phase 80, Post-v1.0 observability).
   * Persistent default for the structured stderr logger. Env vars override
   * these at runtime: `CADENCE_LOG_LEVEL` > `logging.level`, and
   * `CADENCE_LOG_FORMAT` > `logging.format`. `format` omitted → the logger
   * picks `pretty` on a TTY, else `json`. Default level `silent` = off.
   * Distinct from `telemetry`/`skillAudit` (user-behavior tracking).
   */
  logging: z
    .object({
      level: LogLevelZ.default('silent'),
      format: LogFormatZ.optional(),
    })
    .default({ level: 'silent' }),
  /**
   * Handoff retention (Phase 88, v1.20). Opt-in, count-based pruning of dated
   * `SESSION-*.md` docs under `.cadence/handoff/`, applied at handoff-write
   * time (not settle — settle fires per-phase and would race the `lastHandoff`
   * pointer). `retain: N` keeps the N most-recent docs (the just-written
   * `lastHandoff` is always newest, so never deleted) and hard-deletes the
   * rest, best-effort. Omitting `retain` (the default empty block) disables
   * pruning entirely — same non-destructive-by-default posture the manual
   * dated archive relies on.
   */
  handoff: z
    .object({
      retain: z.number().int().min(1).optional(),
    })
    .default({}),
  /**
   * Recommendation retention (Phase 102, v1.24). `autoArchive` (default `true`)
   * soft-archives a rec the moment it reaches a terminal state: `shipped`/`rejected`
   * immediately on `promote`, and a `converted` rec when its phase completes SETTLE.
   * Archival is recoverable (`recommendation unarchive`), so unlike `handoff.retain`
   * (a hard delete, opt-in) this defaults on. Set `false` to keep terminal recs in
   * the active ledger; manual `recommendation archive` still works either way.
   */
  recommendations: z
    .object({
      autoArchive: z.boolean().default(true),
    })
    .default({ autoArchive: true }),
  /**
   * Post-settle retro artifact (Phase 174, rec-20260712-001). `enabled`
   * (default `true`) is the master switch: on every successful settle,
   * synthesize a friction digest from the SUMMARY already assembled and
   * write `<draftId>-RETRO.json`/`.md` alongside it. `offerGithubIssue`
   * (default `true`) is a sub-toggle — when the digest is non-empty and the
   * run is interactive, offer to file a GitHub issue via `gh`. Setting
   * `enabled: false` disables both the artifact and the offer; setting only
   * `offerGithubIssue: false` keeps the artifact but never prompts.
   */
  retro: z
    .object({
      enabled: z.boolean().default(true),
      offerGithubIssue: z.boolean().default(true),
    })
    .default({ enabled: true, offerGithubIssue: true }),
  /**
   * Gate behavior control (Phase 141, rec-20260701-009). `sealed` gate ids
   * ignore `--force` and their own `--allow-*` flag at settle time, implementing
   * the locked-in enforcement gate protocol.
   */
  gates: z
    .object({
      sealed: z.array(z.string()).default([]),
      /**
       * Evidence floor per AC (Phase 214, closes the visibility-only Phase
       * 108/140 evidence-ladder enforcement gap). Settle refuses when any
       * AC's PASS verdict rests on evidence weaker than this floor on the
       * `ai-verified > executed > assertion > mention > unverified` ladder.
       * Schema-level default `mention` is the back-compat floor (today's
       * behavior — nothing newly refuses for pre-existing configs); the
       * `presets` export below sets the actually-decided per-preset floors
       * (solo → `assertion`, team/production → `executed`) so only a fresh
       * init or an explicit override sees the stricter behavior. `mention`
       * is reachable only via explicit config override or a named,
       * reason-required per-AC bypass — never as a preset default.
       */
      evidenceFloor: EvidenceFloorZ.default('mention'),
    })
    .default({ sealed: [], evidenceFloor: 'mention' }),
  /**
   * Resume cross-worktree discovery (Phase 142/143, v1.38 cross-worktree-handoff-discovery).
   * Configures `cadence resume` behavior when multiple handoff candidates exist across git
   * worktrees. `crossWorktree: false` disables discovery entirely (today's exact behavior).
   * `autoList: true` means when 2+ candidates exist, the interactive picker opens
   * automatically instead of just nudging. Omitting the block applies the defaults.
   */
  resume: z
    .object({
      crossWorktree: z.boolean().default(true),
      autoList: z.boolean().default(false),
      /** Origin-freshness probe on resume (fetch + behind-count). The fetch
       *  touches remote-tracking refs only. `false` = never probe. */
      remoteCheck: z.boolean().default(true),
    })
    .default({ crossWorktree: true, autoList: false, remoteCheck: true }),
  /**
   * Boundary enforcement mode (Phase 155). `warn` (default, back-compat) —
   * an out-of-boundary edit is only notified via `anomaly-notify`, never
   * blocked. `block` — `handlePreToolEdit` refuses an out-of-boundary edit at
   * edit time, wherever the host surfaces the touched files. Top-level (not
   * nested under `hooks`, which is boolean-only gate toggles) because a
   * settle-time counterpart is planned as a follow-on (rec-20260704-001).
   * Overridable per-phase via DRAFT frontmatter, mirroring `profile`.
   */
  boundaryEnforcement: z.enum(['warn', 'block']).default('warn'),
  /**
   * Redundant-work enforcement mode (subagent task-redundancy monitoring).
   * `off` — the check never runs. `warn` (default) — an edit touching a file
   * owned by an already-terminal (`DONE`/`DONE_WITH_CONCERNS`) task is only
   * notified via `anomaly-notify`. `block` — `handlePreToolEdit` refuses the
   * edit, and the `SubagentStop` safety net hard-blocks the subagent's stop.
   * A third `off` value exists (unlike `boundaryEnforcement`) because
   * re-touching finished work is a more subjective, more commonly legitimate
   * signal than an out-of-boundary edit. Overridable per-phase via DRAFT
   * frontmatter, mirroring `boundaryEnforcement`.
   */
  redundantWorkEnforcement: z.enum(['off', 'warn', 'block']).default('warn'),
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
  skillAudit: { required: [] },
  convergence: { maxAttempts: 3 },
  specReview: { provider: 'mock' },
  uiSpecReview: { provider: 'mock' },
  tier: {
    quickFix: { maxTasks: 1, maxFiles: 1 },
    standard: { maxTasks: 5, maxFiles: 8 },
    complex: { maxTasks: 999, minTasks: 6 },
  },
  verification: {
    testGlobs: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    /** Phase 139: new inits default to 'assertion' — a comment-only AC-N
     *  mention no longer counts as tested. The Zod-level `.default('mention')`
     *  above is unchanged — it's the backward-compat fallback for configs
     *  that predate this field, not what a fresh init writes. */
    coverageMode: 'assertion' as const,
    /** Phase 167 T7: no custom profiles by default — every fresh init and
     *  every pre-existing config predating this field gets the empty list. */
    coverageProfiles: [],
  },
  verifier: { provider: 'mock' as const, diffCapBytes: 262144 },
  perTaskVerifier: { provider: 'mock' as const },
  codeReview: { provider: 'mock' as const },
  planReview: { provider: 'mock' as const },
  securityAudit: { provider: 'mock' as const },
  notify: { transport: 'stderr' as const },
  phaseGuard: { enabled: true, integrationRef: 'main' },
  logging: { level: 'silent' as const },
  handoff: {},
  recommendations: { autoArchive: true },
  retro: { enabled: true, offerGithubIssue: true },
  gates: { sealed: [], evidenceFloor: 'mention' as const },
  resume: { crossWorktree: true, autoList: false, remoteCheck: true },
  boundaryEnforcement: 'warn',
  redundantWorkEnforcement: 'warn',
};

export const presets = {
  solo: {
    ...defaultConfig,
    loopEnforcement: 'reminder' as const,
    acDiscipline: 'optional' as const,
    commitCadence: 'manual' as const,
    // Phase 214 (ev-20260724-010): solo's evidence floor is 'assertion' —
    // stricter than the schema's back-compat 'mention' default, but looser
    // than team/production since solo has no reviewer in the loop.
    gates: { ...defaultConfig.gates, evidenceFloor: 'assertion' as const },
  },
  team: {
    ...defaultConfig,
    // Phase 214 (ev-20260724-010): team's evidence floor is 'executed'.
    gates: { ...defaultConfig.gates, evidenceFloor: 'executed' as const },
  },
  production: {
    ...defaultConfig,
    loopEnforcement: 'strict' as const,
    acDiscipline: 'strict' as const,
    hooks: { ...defaultConfig.hooks, preToolUseBuildGate: true },
    // Phase 214 (ev-20260724-010): production's evidence floor is
    // 'executed' (not 'ai-verified' — independent review found no preset
    // should default to requiring a real, non-mock verifier just to pass
    // the floor; that's enforced separately as a refusal/warning when the
    // active verifier isn't a real provider, not via a stricter floor here).
    gates: {
      sealed: ['test-coverage', 'build-test-must-pass'],
      evidenceFloor: 'executed' as const,
    },
  },
} satisfies Record<string, CadenceConfig>;
