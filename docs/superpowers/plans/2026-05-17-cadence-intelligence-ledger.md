# CADENCE Intelligence Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CADENCE-native strategic-intelligence storage and manual recommendation intake.

**Architecture:** This is the first Praxis-codename implementation slice inside the CADENCE repo. It adds shared recommendation/evidence/assumption/decision schemas in `@cadence/types`, a small `packages/core/src/intelligence` storage/rendering module, and a CLI command for adding/listing recommendations. It does not implement code analysis, milestone proposal, SPEC export, or agent orchestration.

**Tech Stack:** TypeScript, Zod, Commander, Vitest, existing CADENCE `atomicWriteJSON` / `atomicWriteText` helpers.

---

## Target Repo

Implement this plan in:

`C:\Users\digit\Documents\Projects\cadence`

The standalone `C:\Users\digit\Documents\Projects\synth` repo is only the design/planning scratchpad.

## Files

- Create: `packages/types/src/intelligence.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/tests/intelligence.test.ts`
- Create: `packages/core/src/intelligence/store.ts`
- Create: `packages/core/src/intelligence/render.ts`
- Test: `packages/core/tests/intelligence/store.test.ts`
- Create: `packages/core/src/cli/commands/recommendation.ts`
- Modify: `packages/core/src/cli/register.ts`
- Test: `packages/core/tests/cli/recommendation.test.ts`
- Modify: `docs/reference/commands.md`
- Modify: `docs/reference/config.md` only if this phase adds config. Preferred: do not add config in this phase.
- Modify: `CHANGELOG.md`

## Storage Contract

Use these CADENCE-native paths:

- `.cadence/intelligence/recommendations.json`
- `.cadence/intelligence/evidence.json`
- `.cadence/intelligence/assumptions.json`
- `.cadence/intelligence/decisions.json`
- `.cadence/intelligence/RECOMMENDATIONS.md`

Do not use `.synth/` in production code.

## Task 1: Add Intelligence Types

**Files:**
- Create: `packages/types/src/intelligence.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/tests/intelligence.test.ts`

- [ ] **Step 1: Write the failing type tests**

Create `packages/types/tests/intelligence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  RecommendationLedgerZ,
  RecommendationZ,
  emptyRecommendationLedger,
} from '../src/intelligence.js';

describe('intelligence schemas', () => {
  it('accepts a valid manual recommendation', () => {
    const parsed = RecommendationZ.parse({
      id: 'rec-20260517-001',
      title: 'Add project intelligence ledger',
      summary: 'Track strategic recommendations before they become CADENCE specs.',
      source: 'manual',
      status: 'candidate',
      readiness: 'ready-for-milestone',
      priority: 'high',
      leverageScore: 8,
      riskScore: 3,
      confidence: 0.8,
      decayState: 'fresh',
      affectedAreas: ['core', 'types'],
      affectedFiles: ['packages/types/src/intelligence.ts'],
      evidenceIds: [],
      assumptionIds: [],
      decisionIds: [],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });

    expect(parsed.source).toBe('manual');
    expect(parsed.readiness).toBe('ready-for-milestone');
  });

  it('rejects out-of-range scores', () => {
    const result = RecommendationZ.safeParse({
      id: 'rec-20260517-001',
      title: 'Bad score',
      summary: 'This should fail because confidence must be 0..1.',
      source: 'manual',
      status: 'candidate',
      readiness: 'raw-idea',
      priority: 'medium',
      leverageScore: 11,
      riskScore: 0,
      confidence: 2,
      decayState: 'fresh',
      affectedAreas: [],
      affectedFiles: [],
      evidenceIds: [],
      assumptionIds: [],
      decisionIds: [],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('creates an empty versioned ledger', () => {
    const ledger = emptyRecommendationLedger();
    expect(RecommendationLedgerZ.parse(ledger).schemaVersion).toBe(1);
    expect(ledger.recommendations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the failing type tests**

Run:

```bash
pnpm --filter @cadence/types test -- intelligence
```

Expected: FAIL because `../src/intelligence.js` does not exist.

- [ ] **Step 3: Implement the schemas**

Create `packages/types/src/intelligence.ts`:

```ts
import { z } from 'zod';

export const RecommendationSourceZ = z.enum([
  'manual',
  'code-analysis',
  'impact',
  'cadence',
  'session',
]);
export type RecommendationSource = z.infer<typeof RecommendationSourceZ>;

export const RecommendationStatusZ = z.enum([
  'candidate',
  'accepted',
  'deferred',
  'rejected',
  'converted',
]);
export type RecommendationStatus = z.infer<typeof RecommendationStatusZ>;

export const RecommendationReadinessZ = z.enum([
  'raw-idea',
  'needs-evidence',
  'needs-decision',
  'ready-for-milestone',
  'ready-for-cadence-spec',
  'blocked',
]);
export type RecommendationReadiness = z.infer<typeof RecommendationReadinessZ>;

export const RecommendationPriorityZ = z.enum(['low', 'medium', 'high', 'critical']);
export type RecommendationPriority = z.infer<typeof RecommendationPriorityZ>;

export const RecommendationDecayStateZ = z.enum([
  'fresh',
  'aging',
  'stale',
  'superseded',
  'contradicted',
  'needs-revalidation',
]);
export type RecommendationDecayState = z.infer<typeof RecommendationDecayStateZ>;

export const RecommendationZ = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  source: RecommendationSourceZ,
  status: RecommendationStatusZ,
  readiness: RecommendationReadinessZ,
  priority: RecommendationPriorityZ,
  leverageScore: z.number().min(0).max(10),
  riskScore: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  decayState: RecommendationDecayStateZ,
  affectedAreas: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  suggestedMilestoneId: z.string().optional(),
  suggestedBackendAction: z.string().optional(),
  evidenceIds: z.array(z.string()),
  assumptionIds: z.array(z.string()),
  decisionIds: z.array(z.string()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Recommendation = z.infer<typeof RecommendationZ>;

export const EvidenceZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().min(1),
  kind: z.enum(['file', 'command', 'cadence-artifact', 'note']),
  summary: z.string().min(1),
  path: z.string().optional(),
  command: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
});
export type Evidence = z.infer<typeof EvidenceZ>;

export const AssumptionZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().min(1),
  text: z.string().min(1),
  status: z.enum(['open', 'validated', 'rejected']),
  createdAt: z.string().datetime({ offset: true }),
});
export type Assumption = z.infer<typeof AssumptionZ>;

export const IntelligenceDecisionZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().optional(),
  title: z.string().min(1),
  rationale: z.string().min(1),
  decidedAt: z.string().datetime({ offset: true }),
});
export type IntelligenceDecision = z.infer<typeof IntelligenceDecisionZ>;

export const RecommendationLedgerZ = z.object({
  schemaVersion: z.literal(1),
  recommendations: z.array(RecommendationZ),
});
export type RecommendationLedger = z.infer<typeof RecommendationLedgerZ>;

export const EvidenceLedgerZ = z.object({
  schemaVersion: z.literal(1),
  evidence: z.array(EvidenceZ),
});
export type EvidenceLedger = z.infer<typeof EvidenceLedgerZ>;

export const AssumptionLedgerZ = z.object({
  schemaVersion: z.literal(1),
  assumptions: z.array(AssumptionZ),
});
export type AssumptionLedger = z.infer<typeof AssumptionLedgerZ>;

export const IntelligenceDecisionLedgerZ = z.object({
  schemaVersion: z.literal(1),
  decisions: z.array(IntelligenceDecisionZ),
});
export type IntelligenceDecisionLedger = z.infer<typeof IntelligenceDecisionLedgerZ>;

export function emptyRecommendationLedger(): RecommendationLedger {
  return { schemaVersion: 1, recommendations: [] };
}

export function emptyEvidenceLedger(): EvidenceLedger {
  return { schemaVersion: 1, evidence: [] };
}

export function emptyAssumptionLedger(): AssumptionLedger {
  return { schemaVersion: 1, assumptions: [] };
}

export function emptyIntelligenceDecisionLedger(): IntelligenceDecisionLedger {
  return { schemaVersion: 1, decisions: [] };
}
```

- [ ] **Step 4: Export the schemas**

Modify `packages/types/src/index.ts`:

```ts
export * from './events.js';
export * from './config.js';
export * from './state.js';
export * from './plan.js';
export * from './spec.js';
export * from './summary.js';
export * from './host.js';
export * from './profile.js';
export * from './anomaly.js';
export * from './intelligence.js';
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @cadence/types test -- intelligence
pnpm --filter @cadence/types typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/intelligence.ts packages/types/src/index.ts packages/types/tests/intelligence.test.ts
git commit -m "feat(types): add intelligence recommendation schemas"
```

## Task 2: Add Intelligence Store And Renderer

**Files:**
- Create: `packages/core/src/intelligence/store.ts`
- Create: `packages/core/src/intelligence/render.ts`
- Test: `packages/core/tests/intelligence/store.test.ts`

- [ ] **Step 1: Write the failing store tests**

Create `packages/core/tests/intelligence/store.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import {
  addRecommendation,
  readRecommendationLedger,
} from '../../src/intelligence/store.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('intelligence store', () => {
  it('creates ledgers and rendered recommendations on first add', async () => {
    active = await tempRepo({ initialized: true, projectName: 'intel-store' });

    const rec = await addRecommendation(active.root, {
      title: 'Add context packets',
      summary: 'Create compact context packets for future CADENCE phases.',
      priority: 'high',
      readiness: 'raw-idea',
      affectedAreas: ['core'],
      affectedFiles: ['packages/core/src/intelligence/store.ts'],
      evidenceSummary: 'Requested during Praxis design.',
    });

    expect(rec.id).toMatch(/^rec-\d{8}-/);
    const ledger = await readRecommendationLedger(active.root);
    expect(ledger.recommendations).toHaveLength(1);
    expect(ledger.recommendations[0]?.title).toBe('Add context packets');

    const rendered = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(rendered).toMatch(/# CADENCE Recommendations/);
    expect(rendered).toMatch(/Add context packets/);
    expect(rendered).toMatch(/ready: raw-idea/);
  });
});
```

- [ ] **Step 2: Run the failing store tests**

Run:

```bash
pnpm --filter @cadence/core test -- intelligence/store
```

Expected: FAIL because `../../src/intelligence/store.js` does not exist.

- [ ] **Step 3: Implement Markdown renderer**

Create `packages/core/src/intelligence/render.ts`:

```ts
import type { RecommendationLedger } from '@cadence/types';

export function renderRecommendationsMd(ledger: RecommendationLedger): string {
  const lines: string[] = [
    '# CADENCE Recommendations',
    '',
    '> Generated from `.cadence/intelligence/recommendations.json`.',
    '',
  ];

  if (ledger.recommendations.length === 0) {
    lines.push('No recommendations recorded.', '');
    return lines.join('\n');
  }

  for (const rec of ledger.recommendations) {
    lines.push(`## ${rec.id} — ${rec.title}`);
    lines.push('');
    lines.push(`- status: ${rec.status}`);
    lines.push(`- ready: ${rec.readiness}`);
    lines.push(`- priority: ${rec.priority}`);
    lines.push(`- leverage: ${rec.leverageScore}/10`);
    lines.push(`- risk: ${rec.riskScore}/10`);
    lines.push(`- confidence: ${Math.round(rec.confidence * 100)}%`);
    lines.push(`- decay: ${rec.decayState}`);
    if (rec.affectedAreas.length > 0) lines.push(`- areas: ${rec.affectedAreas.join(', ')}`);
    if (rec.affectedFiles.length > 0) lines.push(`- files: ${rec.affectedFiles.join(', ')}`);
    if (rec.suggestedBackendAction) lines.push(`- next: ${rec.suggestedBackendAction}`);
    lines.push('');
    lines.push(rec.summary);
    lines.push('');
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Implement store**

Create `packages/core/src/intelligence/store.ts`:

```ts
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  RecommendationLedgerZ,
  emptyRecommendationLedger,
  type Recommendation,
  type RecommendationLedger,
  type RecommendationPriority,
  type RecommendationReadiness,
} from '@cadence/types';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { renderRecommendationsMd } from './render.js';

const INTELLIGENCE_DIR = '.cadence/intelligence';
const RECOMMENDATIONS_JSON = 'recommendations.json';
const RECOMMENDATIONS_MD = 'RECOMMENDATIONS.md';

export type AddRecommendationInput = {
  title: string;
  summary: string;
  priority: RecommendationPriority;
  readiness: RecommendationReadiness;
  affectedAreas: string[];
  affectedFiles: string[];
  evidenceSummary?: string;
};

export function intelligenceDir(root: string): string {
  return join(root, INTELLIGENCE_DIR);
}

function recommendationsPath(root: string): string {
  return join(intelligenceDir(root), RECOMMENDATIONS_JSON);
}

function recommendationsMdPath(root: string): string {
  return join(intelligenceDir(root), RECOMMENDATIONS_MD);
}

export async function readRecommendationLedger(root: string): Promise<RecommendationLedger> {
  const path = recommendationsPath(root);
  if (!existsSync(path)) return emptyRecommendationLedger();
  const raw = await readFile(path, 'utf8');
  return RecommendationLedgerZ.parse(JSON.parse(raw));
}

async function writeRecommendationLedger(root: string, ledger: RecommendationLedger): Promise<void> {
  const dir = intelligenceDir(root);
  await mkdir(dir, { recursive: true });
  RecommendationLedgerZ.parse(ledger);
  await atomicWriteJSON(recommendationsPath(root), ledger);
  await atomicWriteText(recommendationsMdPath(root), renderRecommendationsMd(ledger));
}

function slugDate(now: Date): string {
  return now.toISOString().slice(0, 10).replaceAll('-', '');
}

function nextRecommendationId(ledger: RecommendationLedger, now: Date): string {
  const prefix = `rec-${slugDate(now)}-`;
  const max = ledger.recommendations
    .map((r) => r.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export async function addRecommendation(
  root: string,
  input: AddRecommendationInput,
): Promise<Recommendation> {
  const ledger = await readRecommendationLedger(root);
  const now = new Date();
  const ts = now.toISOString();
  const rec: Recommendation = {
    id: nextRecommendationId(ledger, now),
    title: input.title,
    summary: input.summary,
    source: 'manual',
    status: 'candidate',
    readiness: input.readiness,
    priority: input.priority,
    leverageScore: 5,
    riskScore: 5,
    confidence: input.evidenceSummary ? 0.7 : 0.4,
    decayState: 'fresh',
    affectedAreas: input.affectedAreas,
    affectedFiles: input.affectedFiles,
    suggestedBackendAction: 'cadence milestone propose',
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: ts,
    updatedAt: ts,
  };
  ledger.recommendations.push(rec);
  await writeRecommendationLedger(root, ledger);
  return rec;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @cadence/core test -- intelligence/store
pnpm --filter @cadence/core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/intelligence/store.ts packages/core/src/intelligence/render.ts packages/core/tests/intelligence/store.test.ts
git commit -m "feat(core): add intelligence recommendation store"
```

## Task 3: Add Manual Recommendation CLI

**Files:**
- Create: `packages/core/src/cli/commands/recommendation.ts`
- Modify: `packages/core/src/cli/register.ts`
- Test: `packages/core/tests/cli/recommendation.test.ts`

- [ ] **Step 1: Write the failing CLI tests**

Create `packages/core/tests/cli/recommendation.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence recommendation', () => {
  it('adds a manual recommendation and renders it', async () => {
    active = await tempRepo({ initialized: true, projectName: 'recommendation-cli' });

    const r = await run([
      'recommendation',
      'add',
      '--title',
      'Add milestone pre-mortems',
      '--summary',
      'Capture likely failure modes before milestone export.',
      '--priority',
      'high',
      '--readiness',
      'ready-for-milestone',
      '--area',
      'core',
      '--file',
      'packages/core/src/cli/commands/recommendation.ts',
      '--evidence',
      'Approved Praxis design requires milestone pre-mortems.',
    ], active.root);

    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/Added rec-\d{8}-001/);

    const raw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'recommendations.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    expect(parsed.recommendations[0].title).toBe('Add milestone pre-mortems');

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/Add milestone pre-mortems/);
  });

  it('lists recommendations', async () => {
    active = await tempRepo({ initialized: true });
    await run([
      'recommendation',
      'add',
      '--title',
      'Add context packets',
      '--summary',
      'Create compact context packet artifacts.',
    ], active.root);

    const r = await run(['recommendation', 'list'], active.root);

    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/rec-\d{8}-001/);
    expect(r.stdout).toMatch(/Add context packets/);
  });
});
```

- [ ] **Step 2: Run failing CLI tests**

Run:

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- cli/recommendation
```

Expected: FAIL because `recommendation` is not a registered command.

- [ ] **Step 3: Implement the command**

Create `packages/core/src/cli/commands/recommendation.ts`:

```ts
import type { Command } from 'commander';
import {
  RecommendationPriorityZ,
  RecommendationReadinessZ,
} from '@cadence/types';
import {
  addRecommendation,
  readRecommendationLedger,
} from '../../intelligence/store.js';

function csv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function registerRecommendationCommand(program: Command): void {
  const cmd = program
    .command('recommendation')
    .description('Manage CADENCE strategic-intelligence recommendations');

  cmd
    .command('add')
    .description('Add a manual strategic recommendation')
    .requiredOption('--title <title>', 'Recommendation title')
    .requiredOption('--summary <summary>', 'Recommendation summary')
    .option('--priority <priority>', 'low | medium | high | critical', 'medium')
    .option(
      '--readiness <readiness>',
      'raw-idea | needs-evidence | needs-decision | ready-for-milestone | ready-for-cadence-spec | blocked',
      'raw-idea',
    )
    .option('--area <areas>', 'Comma-separated affected areas')
    .option('--file <files>', 'Comma-separated affected file paths')
    .option('--evidence <summary>', 'Short evidence note')
    .action(
      async (opts: {
        title: string;
        summary: string;
        priority: string;
        readiness: string;
        area?: string;
        file?: string;
        evidence?: string;
      }) => {
        try {
          const priority = RecommendationPriorityZ.parse(opts.priority);
          const readiness = RecommendationReadinessZ.parse(opts.readiness);
          const rec = await addRecommendation(process.cwd(), {
            title: opts.title,
            summary: opts.summary,
            priority,
            readiness,
            affectedAreas: csv(opts.area),
            affectedFiles: csv(opts.file),
            evidenceSummary: opts.evidence,
          });
          process.stdout.write(`Added ${rec.id}: ${rec.title}\n`);
          process.stdout.write(`Next: cadence recommendation list\n`);
        } catch (err) {
          process.stderr.write(
            `recommendation add failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );

  cmd
    .command('list')
    .description('List recorded recommendations')
    .action(async () => {
      try {
        const ledger = await readRecommendationLedger(process.cwd());
        if (ledger.recommendations.length === 0) {
          process.stdout.write('No recommendations recorded.\n');
          return;
        }
        for (const rec of ledger.recommendations) {
          process.stdout.write(
            `${rec.id}  ${rec.priority}  ${rec.readiness}  ${rec.title}\n`,
          );
        }
      } catch (err) {
        process.stderr.write(
          `recommendation list failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```

- [ ] **Step 4: Register the command**

Modify `packages/core/src/cli/register.ts`:

```ts
import type { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerInitCommand } from './commands/init.js';
import { registerDraftCommand } from './commands/draft.js';
import { registerSpecCommand } from './commands/spec.js';
import { registerHookCommand } from './commands/hook.js';
import { registerBuildCommand } from './commands/build.js';
import { registerDoneCommand } from './commands/done.js';
import { registerBlockCommand } from './commands/block.js';
import { registerNeedsContextCommand } from './commands/needs-context.js';
import { registerSettleCommand } from './commands/settle.js';
import { registerProgressCommand } from './commands/progress.js';
import { registerStatusCommand } from './commands/status.js';
import { registerRecommendationCommand } from './commands/recommendation.js';

export function registerAllCommands(program: Command): void {
  registerConfigCommand(program);
  registerInitCommand(program);
  registerDraftCommand(program);
  registerSpecCommand(program);
  registerHookCommand(program);
  registerBuildCommand(program);
  registerDoneCommand(program);
  registerBlockCommand(program);
  registerNeedsContextCommand(program);
  registerSettleCommand(program);
  registerProgressCommand(program);
  registerStatusCommand(program);
  registerRecommendationCommand(program);
}
```

- [ ] **Step 5: Run CLI tests**

Run:

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- cli/recommendation
pnpm --filter @cadence/core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cli/commands/recommendation.ts packages/core/src/cli/register.ts packages/core/tests/cli/recommendation.test.ts
git commit -m "feat(core): add recommendation intake command"
```

## Task 4: Document The First Intelligence Command

**Files:**
- Modify: `docs/reference/commands.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update the command drift marker list**

Update the marker block in `docs/reference/commands.md` so the drift guard sees the new top-level command. The block should include `recommendation`:

```md
<!-- cadence:commands:start -->
config
init
draft
spec
hook
build
done
block
needs-context
settle
progress
status
recommendation
<!-- cadence:commands:end -->
```

- [ ] **Step 2: Update command docs**

Add this section to `docs/reference/commands.md` near the other top-level command references:

```md
## `cadence recommendation`

Manage CADENCE strategic-intelligence recommendations. Recommendations are stored under `.cadence/intelligence/` and are not execution state; they become execution input only after a later milestone/SPEC export step.

### `cadence recommendation add`

Adds a manual recommendation.

```sh
cadence recommendation add \
  --title "Add milestone pre-mortems" \
  --summary "Capture likely failure modes before milestone export." \
  --priority high \
  --readiness ready-for-milestone \
  --area core \
  --file packages/core/src/intelligence/store.ts \
  --evidence "Approved Praxis design requires milestone pre-mortems."
```

Writes:

- `.cadence/intelligence/recommendations.json`
- `.cadence/intelligence/RECOMMENDATIONS.md`

### `cadence recommendation list`

Prints recorded recommendations in a compact table.

```sh
cadence recommendation list
```
```

- [ ] **Step 3: Update changelog**

Add an Unreleased entry near the top of `CHANGELOG.md`:

```md
## Unreleased

### Added

- Added the first CADENCE strategic-intelligence ledger: typed recommendation records, rendered `.cadence/intelligence/RECOMMENDATIONS.md`, and `cadence recommendation add/list` for manual intake.
```

- [ ] **Step 4: Run docs-related tests**

Run:

```bash
pnpm --filter @cadence/core test -- docs
pnpm --filter @cadence/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/reference/commands.md CHANGELOG.md packages/core/tests/docs/cli-reference.test.ts
git commit -m "docs: document recommendation intake"
```

If `packages/core/tests/docs/cli-reference.test.ts` was not changed, omit it from `git add`.

## Task 5: Final Verification

**Files:**
- No new files unless verification reveals a failure.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter @cadence/types test -- intelligence
pnpm --filter @cadence/core test -- intelligence/store cli/recommendation
```

Expected: PASS.

- [ ] **Step 2: Run package checks**

Run:

```bash
pnpm --filter @cadence/types typecheck
pnpm --filter @cadence/core typecheck
pnpm --filter @cadence/core build
```

Expected: PASS.

- [ ] **Step 3: Run full repo gate**

Run:

```bash
pnpm turbo run lint typecheck test build
```

Expected: PASS. If this fails outside the touched intelligence files, capture the failure in the handoff and do not change unrelated code without a separate decision.

- [ ] **Step 4: Confirm git state**

Run:

```bash
git status --short --branch
```

Expected: only intentional untracked files, or a clean tree after commits.

## Follow-On Plans

Do not add these in this phase:

- code-analysis-derived recommendations
- milestone proposal and pre-mortem
- CADENCE SPEC export
- context packets
- multi-backend abstraction implementation

Recommended next plan after this lands:

`CADENCE Intelligence Inspection And Status Synthesis`
