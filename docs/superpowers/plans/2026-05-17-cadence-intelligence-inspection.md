# CADENCE Intelligence Inspection & Status Synthesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cadence inspect` — a read-only strategic-status synthesizer that scans the repo, reads CADENCE loop state without mutating it, folds in ledger decay counts, emits four conservative flags, and persists `inspection.json` + `STRATEGY.md`.

**Architecture:** Second Praxis slice, mirroring the shipped ledger layout under `packages/core/src/intelligence/`. New `@cadence/types` schemas (`RepoScanZ`, `BackendStatusZ`, `InspectionFlagZ`, `InspectionZ`). A Project Scanner (`scan.ts`), a thin read-only `PraxisBackend` + CADENCE impl (`backend/cadence.ts`), a pure synthesizer + store glue (`inspect.ts`), a pure renderer (`render-inspection.ts`), and a `cadence inspect` CLI. Strategic layer only — reuses `SimpleStateBackend.readState()` + `nextAction()`; never writes `state.json` or transitions the loop.

**Tech Stack:** TypeScript, Zod, Commander, Vitest, `node:child_process` (`spawn`), existing CADENCE `atomicWriteJSON`/`atomicWriteText`, `@cadence/testkit` `tempRepo`.

**Spec:** `docs/superpowers/specs/2026-05-17-cadence-intelligence-inspection-design.md`

---

## Spec elaboration (faithful, not a scope change)

The spec lists `readArtifacts` as an in-scope backend method but its `BackendStatusZ` sketch did not surface the result. To avoid dead code (YAGNI), this plan surfaces it: `BackendStatusZ` gains an optional `artifacts: { phaseCount, roadmap, state, milestones }`, populated by `readArtifacts` and rendered in `STRATEGY.md`. This is the natural consumer of the method the spec already mandated.

`profile` is intentionally left `undefined` this slice (it is not on `CadenceState`; schema-optional per spec). Only `tier` is read from state (nullable). `listLegalActions` wraps `nextAction(state)`'s single `{command}` into a one-element array.

## File Structure

- Modify: `packages/types/src/intelligence.ts` (append inspection schemas)
- Verify/Modify: `packages/types/src/index.ts` (already `export * from './intelligence.js'` from the ledger slice — verify, edit only if missing)
- Test: `packages/types/tests/intelligence.test.ts` (extend)
- Create: `packages/core/src/intelligence/scan.ts` (Project Scanner)
- Test: `packages/core/tests/intelligence/scan.test.ts`
- Create: `packages/core/src/intelligence/backend/cadence.ts` (`PraxisBackend` interface + CADENCE impl)
- Test: `packages/core/tests/intelligence/backend-cadence.test.ts`
- Create: `packages/core/src/intelligence/render-inspection.ts` (pure renderer)
- Test: `packages/core/tests/intelligence/render-inspection.test.ts`
- Create: `packages/core/src/intelligence/inspect.ts` (pure `synthesizeInspection` + `runInspect` glue)
- Test: `packages/core/tests/intelligence/inspect.test.ts`
- Create: `packages/core/src/cli/commands/inspect.ts`
- Modify: `packages/core/src/cli/register.ts` (+1 import, +1 call)
- Test: `packages/core/tests/cli/inspect.test.ts` (spawned CLI)
- Modify: `docs/reference/commands.md` (drift-marker block + ToC + `### inspect`)
- Modify: `CHANGELOG.md` (Unreleased)

## Storage Contract

- `.cadence/intelligence/inspection.json`
- `.cadence/intelligence/STRATEGY.md`

Reuse `intelligenceDir(root)` from `packages/core/src/intelligence/store.js`. Never `.synth/`.

---

## Task 1: Add inspection types

**Files:**
- Modify: `packages/types/src/intelligence.ts`
- Verify: `packages/types/src/index.ts`
- Test: `packages/types/tests/intelligence.test.ts`

- [ ] **Step 1: Append failing tests** to `packages/types/tests/intelligence.test.ts` (add at end of the file, before the final closing — keep existing tests intact). Add a new `describe` block:

```ts
import {
  InspectionZ,
} from '../src/intelligence.js';

describe('inspection schemas', () => {
  const validInspection = {
    schemaVersion: 1 as const,
    generatedAt: '2026-05-17T00:00:00.000Z',
    repo: {
      git: { available: false },
      pkg: { scripts: {} },
      docs: { readme: true, design: true, roadmap: true, changelog: true, docsDir: true },
      surfaces: { turbo: true },
      phases: { count: 0 },
    },
    backend: { present: false, kind: null, legalActions: [] },
    ledger: { recommendations: 0, byDecay: {}, evidence: 0 },
    flags: [],
  };

  it('accepts a valid inspection', () => {
    const parsed = InspectionZ.parse(validInspection);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.flags).toEqual([]);
  });

  it('rejects a wrong schemaVersion', () => {
    const r = InspectionZ.safeParse({ ...validInspection, schemaVersion: 2 });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown flag code', () => {
    const r = InspectionZ.safeParse({
      ...validInspection,
      flags: [{ code: 'not-a-real-flag', severity: 'warn', message: 'x' }],
    });
    expect(r.success).toBe(false);
  });
});
```

(Place the new `import` next to the existing `from '../src/intelligence.js'` import — merge into one import statement if the file already imports from that path; do not duplicate the import line.)

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @cadence/types test -- intelligence`
Expected: FAIL — `InspectionZ` is not exported.

- [ ] **Step 3: Append schemas** to the END of `packages/types/src/intelligence.ts`:

```ts
export const RepoScanZ = z.object({
  git: z.object({
    available: z.boolean(),
    branch: z.string().optional(),
    dirty: z.boolean().optional(),
    ahead: z.number().int().optional(),
    behind: z.number().int().optional(),
    recentCommits: z.array(z.string()).optional(),
  }),
  pkg: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    workspaces: z.boolean().optional(),
    scripts: z.object({
      test: z.boolean().optional(),
      build: z.boolean().optional(),
      lint: z.boolean().optional(),
      typecheck: z.boolean().optional(),
    }),
  }),
  docs: z.object({
    readme: z.boolean(),
    design: z.boolean(),
    roadmap: z.boolean(),
    changelog: z.boolean(),
    docsDir: z.boolean(),
  }),
  surfaces: z.object({ turbo: z.boolean() }),
  phases: z.object({ count: z.number().int(), latestId: z.string().optional() }),
});
export type RepoScan = z.infer<typeof RepoScanZ>;

export const BackendStatusZ = z.object({
  present: z.boolean(),
  kind: z.literal('cadence').nullable(),
  loopPosition: z.string().optional(),
  activePhase: z.string().nullable().optional(),
  activeDraft: z.string().nullable().optional(),
  profile: z.string().optional(),
  tier: z.string().nullable().optional(),
  legalActions: z.array(z.string()),
  artifacts: z
    .object({
      phaseCount: z.number().int(),
      roadmap: z.boolean(),
      state: z.boolean(),
      milestones: z.boolean(),
    })
    .optional(),
  stateError: z.string().optional(),
});
export type BackendStatus = z.infer<typeof BackendStatusZ>;

export const InspectionFlagCodeZ = z.enum([
  'git-dirty-or-diverged',
  'loop-state-inconsistent',
  'ledger-decay',
  'docs-missing',
]);
export type InspectionFlagCode = z.infer<typeof InspectionFlagCodeZ>;

export const InspectionFlagZ = z.object({
  code: InspectionFlagCodeZ,
  severity: z.enum(['info', 'warn']),
  message: z.string().min(1),
  evidence: z.string().optional(),
});
export type InspectionFlag = z.infer<typeof InspectionFlagZ>;

export const InspectionZ = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  repo: RepoScanZ,
  backend: BackendStatusZ,
  ledger: z.object({
    recommendations: z.number().int(),
    byDecay: z.record(z.string(), z.number().int()),
    evidence: z.number().int(),
  }),
  flags: z.array(InspectionFlagZ),
});
export type Inspection = z.infer<typeof InspectionZ>;
```

- [ ] **Step 4: Verify the index export exists**

Run: `pnpm exec grep -n "intelligence" packages/types/src/index.ts` (or open the file).
Expected: a line `export * from './intelligence.js';` already exists (added by the ledger slice). If — and only if — it is missing, add it.

- [ ] **Step 5: Build types + run tests**

Run:
```bash
pnpm --filter @cadence/types build
pnpm --filter @cadence/types test -- intelligence
pnpm --filter @cadence/types typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/intelligence.ts packages/types/tests/intelligence.test.ts
git commit -m "feat(types): add inspection + repo-scan + backend-status schemas"
```
(Include `packages/types/src/index.ts` in the `git add` only if Step 4 required editing it.)

---

## Task 2: Project Scanner

**Files:**
- Create: `packages/core/src/intelligence/scan.ts`
- Test: `packages/core/tests/intelligence/scan.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/intelligence/scan.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { RepoScanZ } from '@cadence/types';
import { scanRepo } from '../../src/intelligence/scan.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('scanRepo', () => {
  it('scans an initialized temp repo (no git) deterministically', async () => {
    active = await tempRepo({ initialized: true, projectName: 'scan-fix' });

    const scan = await scanRepo(active.root);

    // Scanner output must satisfy the shared schema (catches shape drift early).
    expect(() => RepoScanZ.parse(scan)).not.toThrow();
    // tempRepo is not a git work tree → git unavailable, no throw.
    expect(scan.git.available).toBe(false);
    // tempRepo initialized scaffolds .cadence/ROADMAP.md but not README/DESIGN/CHANGELOG.
    expect(scan.docs.roadmap).toBe(true);
    expect(scan.docs.readme).toBe(false);
    expect(scan.docs.design).toBe(false);
    expect(scan.docs.changelog).toBe(false);
    expect(scan.phases.count).toBe(0);
    expect(typeof scan.surfaces.turbo).toBe('boolean');
    expect(scan.pkg.scripts).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/scan`
Expected: FAIL — `../../src/intelligence/scan.js` does not exist.

- [ ] **Step 3: Implement** `packages/core/src/intelligence/scan.ts`:

```ts
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoScan } from '@cadence/types';

function git(root: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const p = spawn('git', args, { cwd: root });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', () => resolve({ ok: false, out: '' }));
    p.on('exit', (code) => resolve({ ok: code === 0, out: out.trim() || err.trim() }));
  });
}

async function scanGit(root: string): Promise<RepoScan['git']> {
  const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.out !== 'true') return { available: false };

  const branch = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const porcelain = await git(root, ['status', '--porcelain']);
  const counts = await git(root, [
    'rev-list',
    '--left-right',
    '--count',
    'origin/main...HEAD',
  ]);
  const log = await git(root, ['log', '--oneline', '-5']);

  const result: RepoScan['git'] = {
    available: true,
    branch: branch.ok ? branch.out : undefined,
    dirty: porcelain.ok ? porcelain.out.length > 0 : undefined,
    recentCommits: log.ok && log.out.length > 0 ? log.out.split('\n') : undefined,
  };
  if (counts.ok) {
    const [behindStr, aheadStr] = counts.out.split(/\s+/);
    const behind = Number.parseInt(behindStr ?? '', 10);
    const ahead = Number.parseInt(aheadStr ?? '', 10);
    if (Number.isFinite(behind)) result.behind = behind;
    if (Number.isFinite(ahead)) result.ahead = ahead;
  }
  return result;
}

async function scanPkg(root: string): Promise<RepoScan['pkg']> {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return { scripts: {} };
  try {
    const pkg = JSON.parse(await readFile(path, 'utf8')) as {
      name?: string;
      version?: string;
      workspaces?: unknown;
      scripts?: Record<string, unknown>;
    };
    const s = pkg.scripts ?? {};
    return {
      name: typeof pkg.name === 'string' ? pkg.name : undefined,
      version: typeof pkg.version === 'string' ? pkg.version : undefined,
      workspaces: pkg.workspaces !== undefined ? true : undefined,
      scripts: {
        test: 'test' in s ? true : undefined,
        build: 'build' in s ? true : undefined,
        lint: 'lint' in s ? true : undefined,
        typecheck: 'typecheck' in s ? true : undefined,
      },
    };
  } catch {
    return { scripts: {} };
  }
}

async function scanPhases(root: string): Promise<RepoScan['phases']> {
  const dir = join(root, '.cadence', 'phases');
  if (!existsSync(dir)) return { count: 0 };
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const phaseDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    return {
      count: phaseDirs.length,
      latestId: phaseDirs.length > 0 ? phaseDirs[phaseDirs.length - 1] : undefined,
    };
  } catch {
    return { count: 0 };
  }
}

export async function scanRepo(root: string): Promise<RepoScan> {
  const has = (rel: string): boolean => existsSync(join(root, rel));
  return {
    git: await scanGit(root),
    pkg: await scanPkg(root),
    docs: {
      readme: has('README.md'),
      design: has('DESIGN.md'),
      roadmap: has(join('.cadence', 'ROADMAP.md')),
      changelog: has('CHANGELOG.md'),
      docsDir: has('docs'),
    },
    surfaces: { turbo: has('turbo.json') },
    phases: await scanPhases(root),
  };
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/scan
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/scan.ts packages/core/tests/intelligence/scan.test.ts
git commit -m "feat(core): add intelligence project scanner"
```

---

## Task 3: CADENCE backend adapter

**Files:**
- Create: `packages/core/src/intelligence/backend/cadence.ts`
- Test: `packages/core/tests/intelligence/backend-cadence.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/intelligence/backend-cadence.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { cadenceBackend } from '../../src/intelligence/backend/cadence.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadenceBackend', () => {
  it('detects an initialized repo and reports IDLE status + legal action', async () => {
    active = await tempRepo({ initialized: true, projectName: 'backend-fix' });

    expect((await cadenceBackend.detect(active.root)).present).toBe(true);

    const status = await cadenceBackend.readStatus(active.root);
    expect(status.present).toBe(true);
    expect(status.kind).toBe('cadence');
    expect(status.loopPosition).toBe('IDLE');
    expect(status.tier).toBeNull();
    expect(status.stateError).toBeUndefined();

    const legal = await cadenceBackend.listLegalActions(active.root);
    expect(legal).toHaveLength(1);
    expect(legal[0]).toMatch(/cadence draft new/);

    const artifacts = await cadenceBackend.readArtifacts(active.root);
    expect(artifacts.phaseCount).toBe(0);
    expect(typeof artifacts.roadmap).toBe('boolean');
  });

  it('surfaces a corrupt state.json as stateError without throwing', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, '.cadence', 'state.json'), '{ not json', 'utf8');

    const status = await cadenceBackend.readStatus(active.root);
    expect(status.present).toBe(true);
    expect(status.stateError).toBeTruthy();
    expect(status.loopPosition).toBeUndefined();
  });

  it('reports not present when .cadence is absent', async () => {
    active = await tempRepo({ initialized: false });
    expect((await cadenceBackend.detect(active.root)).present).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/backend-cadence`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `packages/core/src/intelligence/backend/cadence.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BackendStatus } from '@cadence/types';
import { SimpleStateBackend } from '../../state/simple.js';
import { nextAction } from '../../progress.js';

export type BackendDetection = { present: boolean; kind: 'cadence' | null };
export type BackendArtifacts = {
  phaseCount: number;
  roadmap: boolean;
  state: boolean;
  milestones: boolean;
};

export interface PraxisBackend {
  id: string;
  detect(root: string): Promise<BackendDetection>;
  readStatus(root: string): Promise<BackendStatus>;
  readArtifacts(root: string): Promise<BackendArtifacts>;
  listLegalActions(root: string): Promise<string[]>;
}

function cadenceDir(root: string): string {
  return join(root, '.cadence');
}

export const cadenceBackend: PraxisBackend = {
  id: 'cadence',

  async detect(root: string): Promise<BackendDetection> {
    const present =
      existsSync(cadenceDir(root)) && existsSync(join(cadenceDir(root), 'state.json'));
    return { present, kind: present ? 'cadence' : null };
  },

  async readStatus(root: string): Promise<BackendStatus> {
    const detection = await this.detect(root);
    if (!detection.present) {
      return { present: false, kind: null, legalActions: [] };
    }
    try {
      const state = await new SimpleStateBackend(root).readState();
      return {
        present: true,
        kind: 'cadence',
        loopPosition: state.loopPosition,
        activePhase: state.activePhase,
        activeDraft: state.activeDraft,
        tier: state.tier,
        legalActions: [nextAction(state).command],
        artifacts: await this.readArtifacts(root),
      };
    } catch (err) {
      return {
        present: true,
        kind: 'cadence',
        legalActions: [],
        stateError: err instanceof Error ? err.message : String(err),
        artifacts: await this.readArtifacts(root),
      };
    }
  },

  async readArtifacts(root: string): Promise<BackendArtifacts> {
    const d = cadenceDir(root);
    const phasesDir = join(d, 'phases');
    let phaseCount = 0;
    if (existsSync(phasesDir)) {
      const { readdir } = await import('node:fs/promises');
      try {
        const entries = await readdir(phasesDir, { withFileTypes: true });
        phaseCount = entries.filter((e) => e.isDirectory()).length;
      } catch {
        phaseCount = 0;
      }
    }
    return {
      phaseCount,
      roadmap: existsSync(join(d, 'ROADMAP.md')),
      state: existsSync(join(d, 'STATE.md')),
      milestones: existsSync(join(d, 'MILESTONES.md')),
    };
  },

  async listLegalActions(root: string): Promise<string[]> {
    const status = await this.readStatus(root);
    return status.legalActions;
  },
};
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/backend-cadence
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/backend/cadence.ts packages/core/tests/intelligence/backend-cadence.test.ts
git commit -m "feat(core): add thin read-only CADENCE praxis backend"
```

---

## Task 4: Strategic-status renderer

**Files:**
- Create: `packages/core/src/intelligence/render-inspection.ts`
- Test: `packages/core/tests/intelligence/render-inspection.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/intelligence/render-inspection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Inspection } from '@cadence/types';
import { renderStrategyMd } from '../../src/intelligence/render-inspection.js';

const base: Inspection = {
  schemaVersion: 1,
  generatedAt: '2026-05-17T00:00:00.000Z',
  repo: {
    git: { available: true, branch: 'main', dirty: false, ahead: 0, behind: 0 },
    pkg: { name: 'demo', scripts: { test: true } },
    docs: { readme: true, design: true, roadmap: true, changelog: true, docsDir: true },
    surfaces: { turbo: true },
    phases: { count: 2, latestId: '38-x' },
  },
  backend: {
    present: true,
    kind: 'cadence',
    loopPosition: 'IDLE',
    activePhase: null,
    activeDraft: null,
    tier: null,
    legalActions: ['cadence draft new <phase> <num> --title=…'],
    artifacts: { phaseCount: 2, roadmap: true, state: true, milestones: true },
  },
  ledger: { recommendations: 3, byDecay: { fresh: 2, stale: 1 }, evidence: 1 },
  flags: [],
};

describe('renderStrategyMd', () => {
  it('renders heading, facts, and a no-flags line', () => {
    const md = renderStrategyMd(base);
    expect(md).toMatch(/^# CADENCE Strategic Status/m);
    expect(md).toMatch(/loop: IDLE/);
    expect(md).toMatch(/recommendations: 3/);
    expect(md).toMatch(/No flags raised\./);
  });

  it('renders flags when present', () => {
    const md = renderStrategyMd({
      ...base,
      flags: [
        { code: 'docs-missing', severity: 'info', message: 'Missing: DESIGN.md', evidence: 'DESIGN.md' },
      ],
    });
    expect(md).toMatch(/## Flags/);
    expect(md).toMatch(/\[info\] docs-missing — Missing: DESIGN\.md/);
  });

  it('renders a degraded backend', () => {
    const md = renderStrategyMd({
      ...base,
      backend: { present: false, kind: null, legalActions: [] },
    });
    expect(md).toMatch(/no CADENCE backend detected/i);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/render-inspection`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `packages/core/src/intelligence/render-inspection.ts`:

```ts
import type { Inspection } from '@cadence/types';

export function renderStrategyMd(inspection: Inspection): string {
  const { repo, backend, ledger, flags } = inspection;
  const lines: string[] = [
    '# CADENCE Strategic Status',
    '',
    '> Generated from `.cadence/intelligence/inspection.json`.',
    '',
    `Generated at: ${inspection.generatedAt}`,
    '',
    '## Repository',
    '',
  ];

  if (repo.git.available) {
    lines.push(`- branch: ${repo.git.branch ?? '(unknown)'}`);
    lines.push(`- dirty: ${repo.git.dirty ? 'yes' : 'no'}`);
    if (repo.git.ahead !== undefined || repo.git.behind !== undefined) {
      lines.push(`- vs origin/main: ahead ${repo.git.ahead ?? 0}, behind ${repo.git.behind ?? 0}`);
    }
  } else {
    lines.push('- git: not a git work tree');
  }
  if (repo.pkg.name) lines.push(`- package: ${repo.pkg.name}${repo.pkg.version ? `@${repo.pkg.version}` : ''}`);
  lines.push(`- phases on disk: ${repo.phases.count}${repo.phases.latestId ? ` (latest ${repo.phases.latestId})` : ''}`);
  const missingDocs = (['readme', 'design', 'roadmap', 'changelog'] as const).filter(
    (k) => !repo.docs[k],
  );
  lines.push(`- docs present: ${missingDocs.length === 0 ? 'all' : `missing ${missingDocs.join(', ')}`}`);
  lines.push('');

  lines.push('## CADENCE backend', '');
  if (!backend.present) {
    lines.push('- no CADENCE backend detected (degraded strategic status)');
  } else if (backend.stateError) {
    lines.push(`- state error: ${backend.stateError}`);
  } else {
    lines.push(`- loop: ${backend.loopPosition ?? '(unknown)'}`);
    lines.push(`- active phase: ${backend.activePhase ?? '(none)'}`);
    lines.push(`- active draft: ${backend.activeDraft ?? '(none)'}`);
    lines.push(`- tier: ${backend.tier ?? '(none)'}`);
    if (backend.legalActions.length > 0) {
      lines.push(`- next legal action: ${backend.legalActions[0]}`);
    }
  }
  lines.push('');

  lines.push('## Ledger', '');
  lines.push(`- recommendations: ${ledger.recommendations}`);
  lines.push(`- evidence records: ${ledger.evidence}`);
  const decayKeys = Object.keys(ledger.byDecay).sort();
  if (decayKeys.length > 0) {
    lines.push(`- by decay: ${decayKeys.map((k) => `${k} ${ledger.byDecay[k]}`).join(', ')}`);
  }
  lines.push('');

  lines.push('## Flags', '');
  if (flags.length === 0) {
    lines.push('No flags raised.');
  } else {
    for (const f of flags) {
      lines.push(
        `- [${f.severity}] ${f.code} — ${f.message}${f.evidence ? ` (${f.evidence})` : ''}`,
      );
    }
  }
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/render-inspection
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/render-inspection.ts packages/core/tests/intelligence/render-inspection.test.ts
git commit -m "feat(core): add strategic-status renderer"
```

---

## Task 5: Synthesizer + store glue

**Files:**
- Create: `packages/core/src/intelligence/inspect.ts`
- Test: `packages/core/tests/intelligence/inspect.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/intelligence/inspect.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import type { RepoScan, BackendStatus } from '@cadence/types';
import { synthesizeInspection, runInspect } from '../../src/intelligence/inspect.js';

const cleanScan: RepoScan = {
  git: { available: true, branch: 'main', dirty: false, ahead: 0, behind: 0 },
  pkg: { scripts: {} },
  docs: { readme: true, design: true, roadmap: true, changelog: true, docsDir: true },
  surfaces: { turbo: true },
  phases: { count: 0 },
};
const cleanBackend: BackendStatus = {
  present: true,
  kind: 'cadence',
  loopPosition: 'IDLE',
  activePhase: null,
  activeDraft: null,
  tier: null,
  legalActions: ['cadence draft new <phase> <num> --title=…'],
};
const NOW = new Date('2026-05-17T00:00:00.000Z');

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('synthesizeInspection', () => {
  it('raises no flags for a clean repo', () => {
    const i = synthesizeInspection(
      cleanScan,
      cleanBackend,
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags).toEqual([]);
    expect(i.generatedAt).toBe('2026-05-17T00:00:00.000Z');
  });

  it('flags a dirty/diverged git tree', () => {
    const i = synthesizeInspection(
      { ...cleanScan, git: { available: true, dirty: true, ahead: 2, behind: 0 } },
      cleanBackend,
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).toContain('git-dirty-or-diverged');
  });

  it('flags loop-state inconsistency (DRAFT with no active draft)', () => {
    const i = synthesizeInspection(
      cleanScan,
      { ...cleanBackend, loopPosition: 'DRAFT', activeDraft: null },
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).toContain('loop-state-inconsistent');
  });

  it('flags a stateError', () => {
    const i = synthesizeInspection(
      cleanScan,
      { present: true, kind: 'cadence', legalActions: [], stateError: 'boom' },
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).toContain('loop-state-inconsistent');
  });

  it('flags ledger decay', () => {
    const i = synthesizeInspection(
      cleanScan,
      cleanBackend,
      { recommendations: 4, byDecay: { fresh: 2, stale: 1, contradicted: 1 }, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).toContain('ledger-decay');
  });

  it('flags missing docs', () => {
    const i = synthesizeInspection(
      { ...cleanScan, docs: { readme: true, design: false, roadmap: true, changelog: true, docsDir: true } },
      cleanBackend,
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    const docs = i.flags.find((f) => f.code === 'docs-missing');
    expect(docs?.severity).toBe('info');
    expect(docs?.evidence).toMatch(/DESIGN\.md/);
  });

  it('does not raise git flag when git unavailable', () => {
    const i = synthesizeInspection(
      { ...cleanScan, git: { available: false } },
      cleanBackend,
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).not.toContain('git-dirty-or-diverged');
  });
});

describe('runInspect', () => {
  it('writes inspection.json + STRATEGY.md and returns the inspection', async () => {
    active = await tempRepo({ initialized: true, projectName: 'inspect-fix' });

    const inspection = await runInspect(active.root);
    expect(inspection.schemaVersion).toBe(1);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'inspection.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'STRATEGY.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Strategic Status/);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/inspect`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `packages/core/src/intelligence/inspect.ts`:

```ts
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  InspectionZ,
  type BackendStatus,
  type Inspection,
  type InspectionFlag,
  type RepoScan,
} from '@cadence/types';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import {
  intelligenceDir,
  readEvidenceLedger,
  readRecommendationLedger,
} from './store.js';
import { scanRepo } from './scan.js';
import { cadenceBackend } from './backend/cadence.js';
import { renderStrategyMd } from './render-inspection.js';

const DECAY_AT_RISK = new Set(['stale', 'needs-revalidation', 'contradicted']);

export type LedgerSummary = {
  recommendations: number;
  byDecay: Record<string, number>;
  evidence: number;
};

export function synthesizeInspection(
  repo: RepoScan,
  backend: BackendStatus,
  ledger: LedgerSummary,
  now: Date = new Date(),
): Inspection {
  const flags: InspectionFlag[] = [];

  if (
    repo.git.available &&
    (repo.git.dirty === true || (repo.git.ahead ?? 0) > 0 || (repo.git.behind ?? 0) > 0)
  ) {
    flags.push({
      code: 'git-dirty-or-diverged',
      severity: 'warn',
      message: 'Git working tree is dirty or diverged from origin/main.',
      evidence: `dirty=${repo.git.dirty ? 'yes' : 'no'}, ahead=${repo.git.ahead ?? 0}, behind=${repo.git.behind ?? 0}`,
    });
  }

  const loopInconsistent =
    backend.stateError !== undefined ||
    (backend.present &&
      (backend.loopPosition === 'DRAFT' || backend.loopPosition === 'BUILD') &&
      !backend.activeDraft);
  if (loopInconsistent) {
    flags.push({
      code: 'loop-state-inconsistent',
      severity: 'warn',
      message: 'CADENCE loop state is inconsistent or unreadable.',
      evidence:
        backend.stateError ??
        `loopPosition=${backend.loopPosition ?? '(none)'} but no active draft`,
    });
  }

  const atRisk = Object.entries(ledger.byDecay).filter(
    ([k, n]) => DECAY_AT_RISK.has(k) && n > 0,
  );
  if (atRisk.length > 0) {
    flags.push({
      code: 'ledger-decay',
      severity: 'warn',
      message: 'Recommendations need revalidation or are stale/contradicted.',
      evidence: atRisk.map(([k, n]) => `${k}=${n}`).join(', '),
    });
  }

  const missingDocs = (['readme', 'design', 'roadmap', 'changelog'] as const).filter(
    (k) => !repo.docs[k],
  );
  if (missingDocs.length > 0) {
    const names = missingDocs.map((k) =>
      k === 'readme'
        ? 'README.md'
        : k === 'design'
          ? 'DESIGN.md'
          : k === 'roadmap'
            ? '.cadence/ROADMAP.md'
            : 'CHANGELOG.md',
    );
    flags.push({
      code: 'docs-missing',
      severity: 'info',
      message: `Missing: ${names.join(', ')}`,
      evidence: names.join(', '),
    });
  }

  return InspectionZ.parse({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    repo,
    backend,
    ledger,
    flags,
  });
}

export async function runInspect(root: string, now: Date = new Date()): Promise<Inspection> {
  const repo = await scanRepo(root);
  const backend = await cadenceBackend.readStatus(root);
  const recLedger = await readRecommendationLedger(root);
  const evLedger = await readEvidenceLedger(root);

  const byDecay: Record<string, number> = {};
  for (const rec of recLedger.recommendations) {
    byDecay[rec.decayState] = (byDecay[rec.decayState] ?? 0) + 1;
  }
  const ledger: LedgerSummary = {
    recommendations: recLedger.recommendations.length,
    byDecay,
    evidence: evLedger.evidence.length,
  };

  const inspection = synthesizeInspection(repo, backend, ledger, now);

  const dir = intelligenceDir(root);
  await mkdir(dir, { recursive: true });
  await atomicWriteJSON(join(dir, 'inspection.json'), inspection);
  await atomicWriteText(join(dir, 'STRATEGY.md'), renderStrategyMd(inspection));

  return inspection;
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/inspect
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/inspect.ts packages/core/tests/intelligence/inspect.test.ts
git commit -m "feat(core): add inspection synthesizer + store glue"
```

---

## Task 6: `cadence inspect` CLI

**Files:**
- Create: `packages/core/src/cli/commands/inspect.ts`
- Modify: `packages/core/src/cli/register.ts`
- Test: `packages/core/tests/cli/inspect.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/cli/inspect.test.ts`:

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

describe('cadence inspect', () => {
  it('writes artifacts and prints the strategic status', async () => {
    active = await tempRepo({ initialized: true, projectName: 'inspect-cli' });

    const r = await run(['inspect'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/# CADENCE Strategic Status/);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'inspection.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'STRATEGY.md'),
      'utf8',
    );
    expect(md).toMatch(/## Flags/);
  });

  it('--json emits parseable JSON to stdout', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['inspect', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.flags)).toBe(true);
  });

  it('degrades cleanly with no .cadence backend', async () => {
    active = await tempRepo({ initialized: false });
    const r = await run(['inspect'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/no CADENCE backend detected/i);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- cli/inspect
```
Expected: FAIL — `inspect` is not a registered command.

- [ ] **Step 3: Implement** `packages/core/src/cli/commands/inspect.ts`:

```ts
import type { Command } from 'commander';
import { runInspect } from '../../intelligence/inspect.js';
import { renderStrategyMd } from '../../intelligence/render-inspection.js';

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('Scan the project and synthesize strategic status (read-only)')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const inspection = await runInspect(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(inspection) + '\n');
        } else {
          process.stdout.write(renderStrategyMd(inspection));
        }
      } catch (err) {
        process.stderr.write(
          `inspect failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```

- [ ] **Step 4: Register the command** — modify `packages/core/src/cli/register.ts`:

Add the import next to the other command imports:
```ts
import { registerInspectCommand } from './commands/inspect.js';
```
Add the call at the end of `registerAllCommands` (after `registerRecommendationCommand(program);`):
```ts
  registerInspectCommand(program);
```

- [ ] **Step 5: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- cli/inspect
pnpm --filter @cadence/core typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cli/commands/inspect.ts packages/core/src/cli/register.ts packages/core/tests/cli/inspect.test.ts
git commit -m "feat(core): add cadence inspect command"
```

---

## Task 7: Documentation + drift guard

**Files:**
- Modify: `docs/reference/commands.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update the drift-marker block** in `docs/reference/commands.md` — add `inspect` as the last line inside the marker block:

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
inspect
<!-- cadence:commands:end -->
```

- [ ] **Step 2: Add the ToC entry** — in the `## Table of contents` list, add under `cadence` after `- [recommendation](#recommendation)`:

```md
  - [inspect](#inspect)
```

- [ ] **Step 3: Add the command section** — insert after the `### recommendation` section and before `## cadence-host-claude-code` (i.e. after the `recommendation list` block and its trailing `---`):

```md
### inspect

```
Usage: cadence inspect [options]

Scan the project and synthesize strategic status (read-only)
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
Scans the repository (git, package metadata, doc presence, build surfaces,
phase artifacts), reads CADENCE loop state **read-only** (never mutates
`state.json` or transitions the loop), folds in recommendation-ledger decay
counts, and synthesizes a strategic status with up to four conservative flags
(git dirty/diverged, loop-state inconsistency, ledger decay, missing docs).

Writes:

- `.cadence/intelligence/inspection.json`
- `.cadence/intelligence/STRATEGY.md`

With `--json`, the inspection object is emitted to stdout instead of the
rendered text. This command is distinct from `cadence status`/`progress`,
which report execution-loop position; `inspect` is the strategic layer.

**Exit codes** — exits non-zero only on a genuine failure (e.g. artifact
write error). A missing git repo or missing `.cadence/` backend degrades
gracefully and still exits 0.

---
```

(Note: write a plain three-backtick ```` ``` ```` fence for the `Usage:` block,
exactly matching the existing `### status` / `### recommendation` sections in
this file. The file does NOT use nested fences — the four-backtick wrapper above
is only this plan document's mechanism for displaying a snippet that itself
contains a fence. Insert the inner content verbatim and match the surrounding
`### status` style.)

- [ ] **Step 4: Update CHANGELOG** — add to the `## Unreleased` → `### Added` list in `CHANGELOG.md` (create the `## Unreleased` / `### Added` headings only if absent, matching the existing changelog style):

```md
- Added `cadence inspect`: read-only strategic-status synthesis (project scanner, thin CADENCE backend adapter, four conservative flags) writing `.cadence/intelligence/inspection.json` + `STRATEGY.md`.
```

- [ ] **Step 5: Run the drift guard + docs tests**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- docs
```
Expected: PASS — `cli-reference.test.ts` sees `inspect` in both `registerAllCommands` and the marker block.

- [ ] **Step 6: Commit**

```bash
git add docs/reference/commands.md CHANGELOG.md
git commit -m "docs: document cadence inspect"
```

---

## Task 8: Final verification

**Files:** none unless verification reveals a failure.

- [ ] **Step 1: Focused tests**

Run:
```bash
pnpm --filter @cadence/types test -- intelligence
pnpm --filter @cadence/core test -- intelligence cli/inspect docs
```
Expected: PASS.

- [ ] **Step 2: Package checks**

Run:
```bash
pnpm --filter @cadence/types typecheck
pnpm --filter @cadence/core typecheck
pnpm --filter @cadence/core build
```
Expected: PASS.

- [ ] **Step 3: Full repo gate (the real done-bar — mirrors `.githooks/pre-push`)**

Run:
```bash
pnpm turbo run lint typecheck test build
```
Expected: PASS (all tasks). If this fails outside the touched intelligence files, capture the failure in the handoff and do not change unrelated code without a separate decision. Per the durable lesson: the done-bar is the full four-task turbo run, not a subset.

- [ ] **Step 4: Confirm git state**

Run:
```bash
git status --short --branch
git log --oneline -10
```
Expected: branch `praxis-intelligence-ledger`, clean tree (only `graphify-out/` untracked is acceptable), the new feat/docs commits present, nothing pushed.

---

## Follow-On (not in this slice)

- `cadence recommend` (ranked next-moves; Intelligence Engine).
- `PraxisBackend.renderSpecDraft` / `exportMilestone` + `cadence milestone propose/export`.
- Context packets; milestone pre-mortems; doc-staleness/ROADMAP-contradiction flags.
