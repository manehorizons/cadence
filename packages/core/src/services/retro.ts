import type { CadenceConfig, RetroDigest, Summary } from '@thomas-powers-jr/cadence-types';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { renderRetroMd } from '../parse/retro-writer.js';
import type { CommandIO } from './io.js';
import type { Prompter } from '../verify/prompter.js';
import type { Interactivity } from '../gates/interactivity.js';

/**
 * Phase 174: friction digest purely derived from an already-assembled
 * `Summary` — no extra I/O. Gate bypasses, tasks whose terminal status
 * wasn't a clean DONE, and any present code-review / security-audit /
 * boundary-scan findings.
 */
export function buildRetroDigest(summary: Summary): RetroDigest {
  const roughTasks = summary.taskResults
    .filter((t) => t.status !== 'DONE')
    .map((t) => ({ id: t.id, status: t.status, notes: t.notes }));
  // A clean settle can still leave `codeReview`/`securityAudit` present-but-empty
  // on the Summary (e.g. the mock code-review verifier returns `{}` on a pass,
  // not `undefined`) — omit them here so a truthiness check downstream can't
  // misread "gate ran and found nothing" as friction. `boundaryScan` doesn't
  // need this: its gate already omits the field entirely when there are zero
  // offenders (`gates/boundary-scan.ts`).
  const codeReview =
    summary.codeReview && Object.keys(summary.codeReview).length > 0 ? summary.codeReview : undefined;
  const securityAudit =
    summary.securityAudit && summary.securityAudit.length > 0 ? summary.securityAudit : undefined;
  const findings: RetroDigest['findings'] = {
    ...(codeReview ? { codeReview } : {}),
    ...(securityAudit ? { securityAudit } : {}),
    ...(summary.boundaryScan ? { boundaryScan: summary.boundaryScan } : {}),
  };
  return {
    bypasses: summary.gateBypasses ?? [],
    roughTasks,
    findings,
  };
}

export type RetroFindingCategory = 'codeReview' | 'securityAudit' | 'boundaryScan';

/**
 * Which of the three finding categories are genuinely non-empty on this
 * digest. Presence isn't enough — `RetroFindings` permits schema-valid-but-
 * empty shapes (`codeReview: {}`, `securityAudit: []`,
 * `boundaryScan: { offenders: [] }`), all truthy in JS despite representing
 * "gate ran and found nothing" rather than an actual finding (see
 * `buildRetroDigest`'s comment). Single source of truth for that per-
 * category emptiness check — reused by `isDigestEmpty` and by
 * `computeRetroRollup`'s `findingCategories` frequency bucket, so neither
 * can drift from the other.
 */
export function nonEmptyFindingCategories(digest: RetroDigest): RetroFindingCategory[] {
  const categories: RetroFindingCategory[] = [];
  if (digest.findings.codeReview && Object.keys(digest.findings.codeReview).length > 0) {
    categories.push('codeReview');
  }
  if (digest.findings.securityAudit && digest.findings.securityAudit.length > 0) {
    categories.push('securityAudit');
  }
  if (digest.findings.boundaryScan && digest.findings.boundaryScan.offenders.length > 0) {
    categories.push('boundaryScan');
  }
  return categories;
}

export function isDigestEmpty(digest: RetroDigest): boolean {
  return (
    digest.bypasses.length === 0 &&
    digest.roughTasks.length === 0 &&
    nonEmptyFindingCategories(digest).length === 0
  );
}

/** Flat friction count across every populated digest field, for the issue title. */
export function retroFrictionCount(digest: RetroDigest): number {
  const codeReviewCount = digest.findings.codeReview
    ? Object.values(digest.findings.codeReview).reduce((n, findings) => n + findings.length, 0)
    : 0;
  return (
    digest.bypasses.length +
    digest.roughTasks.length +
    codeReviewCount +
    (digest.findings.securityAudit?.length ?? 0) +
    (digest.findings.boundaryScan?.offenders.length ?? 0)
  );
}

export interface RetroWriteContext {
  cwd: string;
  activePhase: string;
  draftId: string;
  io: CommandIO;
}

/**
 * Writes `<draftId>-RETRO.json` then `.md` under `.cadence/phases/<phase>/`,
 * mirroring the SUMMARY.json/.md pattern. JSON first: it's the machine
 * artifact a future rollup would consume, so a crash between the two writes
 * leaves the more load-bearing file in place.
 */
export async function writeRetroArtifacts(digest: RetroDigest, ctx: RetroWriteContext): Promise<void> {
  const base = join(ctx.cwd, '.cadence/phases', ctx.activePhase, `${ctx.draftId}-RETRO`);
  await atomicWriteJSON(`${base}.json`, digest);
  await atomicWriteText(`${base}.md`, renderRetroMd(digest));
}

/**
 * Minimal shape of a spawned child process this module needs — narrowed from
 * `node:child_process`'s `ChildProcess` so tests can inject a lightweight
 * fake, mirroring `verify/host-cli-client.ts`'s `SpawnedProcessLike`/`SpawnFn`
 * seam (not imported directly: that module's version and its capture helper
 * are private to it, and this module's failure handling is simpler — every
 * `gh` failure here is caught and turned into a stderr notice, never a typed
 * error propagated to a caller).
 */
export interface SpawnedProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
}
export type SpawnFn = (bin: string, args: string[]) => SpawnedProcessLike;

const defaultSpawn: SpawnFn = (bin, args) => spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

function ghCapture(
  spawnImpl: SpawnFn,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let child: SpawnedProcessLike;
    try {
      child = spawnImpl('gh', args);
    } catch {
      resolve({ code: null, stdout: '', stderr: 'gh: spawn failed' });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => resolve({ code: null, stdout, stderr: err.message }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** Best-effort: what repo would `gh` file an issue against right now? `undefined` on any failure. */
export async function resolveIssueTarget(spawnImpl: SpawnFn = defaultSpawn): Promise<string | undefined> {
  const { code, stdout } = await ghCapture(spawnImpl, [
    'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner',
  ]);
  if (code !== 0) return undefined;
  const trimmed = stdout.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * `--repo` is always passed explicitly (the already-resolved target), which
 * makes this call fully non-interactive — `gh` never needs to prompt for
 * anything we haven't supplied. No `--label` here: a repo without that label
 * would fail issue creation entirely (see `addIssueLabel`).
 */
export async function createGithubIssue(
  target: string,
  title: string,
  body: string,
  spawnImpl: SpawnFn = defaultSpawn,
): Promise<{ url: string } | { error: string }> {
  const { code, stdout, stderr } = await ghCapture(spawnImpl, [
    'issue', 'create', '--repo', target, '--title', title, '--body', body,
  ]);
  if (code !== 0) return { error: stderr.trim() || `gh issue create exited ${String(code)}` };
  const url = stdout.trim().split('\n').pop() ?? '';
  return url ? { url } : { error: 'gh issue create produced no URL' };
}

/** Best-effort, separate call — a missing label must not undo the already-created issue. */
export async function addIssueLabel(
  target: string,
  issueUrl: string,
  label: string,
  spawnImpl: SpawnFn = defaultSpawn,
): Promise<{ ok: true } | { error: string }> {
  const { code, stderr } = await ghCapture(spawnImpl, [
    'issue', 'edit', issueUrl, '--repo', target, '--add-label', label,
  ]);
  if (code !== 0) return { error: stderr.trim() || `gh issue edit exited ${String(code)}` };
  return { ok: true };
}

const RETRO_LABEL = 'needs-triage';

/** Same shape as `gates/approve.ts`'s `askApproveVerdict`: 3 retries, y/yes/n/no, defaults to no. */
export async function askRetroIssueVerdict(prompter: Prompter, target: string): Promise<'yes' | 'no'> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const question =
      attempt === 1
        ? `File a GitHub issue on ${target}? [y/n]: `
        : `Please answer y or n (attempt ${attempt}/3): `;
    const raw = (await prompter.ask(question)).trim().toLowerCase();
    if (raw === 'y' || raw === 'yes') return 'yes';
    if (raw === 'n' || raw === 'no') return 'no';
  }
  return 'no';
}

export interface RetroOfferContext {
  cwd: string;
  activePhase: string;
  draftId: string;
  io: CommandIO;
  interactivity: Interactivity;
  /**
   * Genuine `process.stdin.isTTY`, independent of `interactivity` — required
   * in addition to `interactivity !== 'bypass'` before this offer will spawn
   * `gh` or prompt at all. `resolveInteractivity` resolves to `'interactive'`
   * whenever `CADENCE_PROMPTER_SCRIPT` is set, even off a real TTY — that env
   * var is this codebase's *test-only* seam for scripting gate prompt
   * answers deterministically (`CLAUDE.md`: "Tests never call real
   * providers... plus the CADENCE_PROMPTER_SCRIPT seam for interactive
   * flows"), not a license to spawn a real external process. Without this
   * flag, any existing (or future) test/script that drives the interactive-
   * verdict gate via `CADENCE_PROMPTER_SCRIPT` and happens to also produce
   * settle-time friction (e.g. a `force-used` bypass from a failed AC
   * verdict) would trigger a real, unmocked `gh repo view` spawn — this is
   * exactly what caused a ~71s hang on Windows CI in
   * `tests/cli/settle-interactive.test.ts`'s `--force bypasses interactive
   * refusal` test, discovered post-implementation, not by design.
   */
  isRealTTY: boolean;
  createPrompter: () => Prompter;
  cadenceConfig?: CadenceConfig;
  spawn?: SpawnFn;
}

/**
 * The resolve-target → maybe-prompt → maybe-create-and-label sequence.
 * Best-effort throughout — every failure is a stderr notice, never a throw
 * that could propagate to the caller (`settle.ts` still wraps the call, but
 * nothing here is expected to reach it).
 */
export async function runRetroOffer(digest: RetroDigest, ctx: RetroOfferContext): Promise<void> {
  if (ctx.cadenceConfig?.retro.enabled === false) return;
  if (ctx.cadenceConfig?.retro.offerGithubIssue === false) return;
  if (isDigestEmpty(digest)) return;
  if (ctx.interactivity === 'bypass') return;
  if (!ctx.isRealTTY) return;

  const spawnImpl = ctx.spawn ?? defaultSpawn;
  const target = await resolveIssueTarget(spawnImpl);
  if (!target) {
    ctx.io.err('note: gh CLI unavailable or repo unresolved — skipping issue offer\n');
    return;
  }

  let prompter: Prompter;
  try {
    prompter = ctx.createPrompter();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.io.err(`note: ${msg} — skipping issue offer\n`);
    return;
  }
  let verdict: 'yes' | 'no';
  try {
    verdict = await askRetroIssueVerdict(prompter, target);
  } finally {
    await prompter.close?.();
  }
  if (verdict === 'no') return;

  const title = `Retro: ${ctx.activePhase}/${ctx.draftId} — ${retroFrictionCount(digest)} friction item(s)`;
  const body = renderRetroMd(digest);
  const created = await createGithubIssue(target, title, body, spawnImpl);
  if ('error' in created) {
    ctx.io.err(`note: gh issue create failed — ${created.error}\n`);
    return;
  }
  ctx.io.out(`Filed ${created.url}\n`);
  const labeled = await addIssueLabel(target, created.url, RETRO_LABEL, spawnImpl);
  if ('error' in labeled) {
    ctx.io.err(`note: created ${created.url}, but could not add '${RETRO_LABEL}' label — ${labeled.error}\n`);
  }
}
