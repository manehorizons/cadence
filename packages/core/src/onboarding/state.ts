import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { atomicWriteJSON } from '../state/atomic-write.js';

/**
 * Progressive-disclosure onboarding stage (phase 278). A single small
 * integer, user-global (not per-repo), that `cadence help`/`cadence start`
 * gate their advanced surface on:
 *
 *   0 — First Contact   1 — Driver   2 — Operator   3 — Power User
 *
 * The stage only ever ratchets forward (`advanceStage`) — nothing in this
 * module ever lowers it.
 */
export const ONBOARDING_STAGE_FIRST_CONTACT = 0;
export const ONBOARDING_STAGE_DRIVER = 1;
export const ONBOARDING_STAGE_OPERATOR = 2;
export const ONBOARDING_STAGE_POWER_USER = 3;

const STAGE_MIN = ONBOARDING_STAGE_FIRST_CONTACT;
const STAGE_MAX = ONBOARDING_STAGE_POWER_USER;

interface OnboardingFile {
  stage: number;
}

function clampStage(value: number): number {
  if (!Number.isFinite(value)) return STAGE_MIN;
  return Math.min(STAGE_MAX, Math.max(STAGE_MIN, Math.trunc(value)));
}

/**
 * `$CADENCE_HOME/onboarding.json` if `CADENCE_HOME` is set, else
 * `~/.cadence/onboarding.json`. Deliberately user-global rather than nested
 * under any single project's `.cadence/` — onboarding stage tracks the
 * operator across repos, not one repo's loop state.
 */
export function onboardingStatePath(): string {
  const home = process.env.CADENCE_HOME ?? join(homedir(), '.cadence');
  return join(home, 'onboarding.json');
}

/**
 * Best-effort read. A missing file, an unreadable file, or corrupt/invalid
 * JSON all default to stage 0 (First Contact) rather than throwing — this
 * is onboarding UX state, not authoritative project state, so "no
 * information" is a safe, silent default rather than a hard failure.
 *
 * Deliberately synchronous (`readFileSync`, precedented elsewhere in this
 * package — `cli/index.ts`, `version.ts`, `activate/key-discovery.ts`):
 * downstream consumers (`cadence help`'s Commander `configureHelp`/
 * `formatHelp`, `cadence start`'s menu render) need the stage inside
 * synchronous formatting callbacks that cannot await.
 */
export function readStage(): number {
  const path = onboardingStatePath();
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<OnboardingFile>;
    if (typeof parsed.stage !== 'number') return STAGE_MIN;
    return clampStage(parsed.stage);
  } catch {
    return STAGE_MIN;
  }
}

/**
 * Raises the stored stage to at least `min`, atomically. Never lowers the
 * stage: `advanceStage(1)` when the current stage is already 2 leaves it at
 * 2. Writes via the shared atomic-write helper (`state/atomic-write.ts`)
 * rather than rolling its own write-then-rename logic — that helper is
 * async, so this function is too.
 */
export async function advanceStage(min: number): Promise<void> {
  const path = onboardingStatePath();
  const current = readStage();
  const next = clampStage(Math.max(current, min));
  await mkdir(dirname(path), { recursive: true });
  const file: OnboardingFile = { stage: next };
  await atomicWriteJSON(path, file);
}
