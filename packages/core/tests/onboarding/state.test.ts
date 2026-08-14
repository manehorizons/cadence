import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readStage,
  advanceStage,
  onboardingStatePath,
  ONBOARDING_STAGE_FIRST_CONTACT,
  ONBOARDING_STAGE_DRIVER,
  ONBOARDING_STAGE_OPERATOR,
} from '../../src/onboarding/state.js';

// Every test points CADENCE_HOME at a fresh mkdtemp dir so this suite never
// reads or writes the real $HOME/.cadence/onboarding.json.
let dir: string;
let savedCadenceHome: string | undefined;

beforeEach(async () => {
  savedCadenceHome = process.env.CADENCE_HOME;
  dir = await mkdtemp(join(tmpdir(), 'cadence-onboarding-'));
  process.env.CADENCE_HOME = dir;
});

afterEach(async () => {
  if (savedCadenceHome === undefined) {
    delete process.env.CADENCE_HOME;
  } else {
    process.env.CADENCE_HOME = savedCadenceHome;
  }
  await rm(dir, { recursive: true, force: true });
});

describe('onboarding state (278-01/AC-9: demo completion advances onboarding stage)', () => {
  it('278-01/AC-9: readStage() defaults to 0 when no onboarding.json file exists', () => {
    expect(readStage()).toBe(ONBOARDING_STAGE_FIRST_CONTACT);
  });

  it('onboardingStatePath() resolves under $CADENCE_HOME when set', () => {
    expect(onboardingStatePath()).toBe(join(dir, 'onboarding.json'));
  });

  it('278-01/AC-9: advanceStage(1) then readStage() returns 1', async () => {
    await advanceStage(ONBOARDING_STAGE_DRIVER);
    expect(readStage()).toBe(ONBOARDING_STAGE_DRIVER);
  });

  it('278-01/AC-9: advanceStage never decreases an already-higher stage', async () => {
    await advanceStage(ONBOARDING_STAGE_OPERATOR);
    expect(readStage()).toBe(ONBOARDING_STAGE_OPERATOR);

    // advanceStage(1) while stage is already 2 must leave it at 2.
    await advanceStage(ONBOARDING_STAGE_DRIVER);
    expect(readStage()).toBe(ONBOARDING_STAGE_OPERATOR);
  });

  it('278-01/AC-9: onboarding stage persists across separate readStage() calls — really reads from disk, not an in-memory cache', async () => {
    await advanceStage(ONBOARDING_STAGE_DRIVER);

    // Two independent reads, each re-parsing the file from scratch.
    expect(readStage()).toBe(ONBOARDING_STAGE_DRIVER);
    expect(readStage()).toBe(ONBOARDING_STAGE_DRIVER);

    // Confirm it is genuinely on disk at the documented path, not held in
    // an in-memory cache inside the module.
    const raw = await readFile(onboardingStatePath(), 'utf8');
    expect(JSON.parse(raw)).toEqual({ stage: ONBOARDING_STAGE_DRIVER });
  });

  it('278-01/AC-9: creates the parent directory when $CADENCE_HOME itself is missing', async () => {
    const nested = join(dir, 'nested', 'home');
    process.env.CADENCE_HOME = nested;
    await advanceStage(ONBOARDING_STAGE_DRIVER);
    expect(readStage()).toBe(ONBOARDING_STAGE_DRIVER);
  });

  it('advanceStage(0) on a fresh (stage-0) store stays at 0, still creating the file', async () => {
    await advanceStage(ONBOARDING_STAGE_FIRST_CONTACT);
    expect(readStage()).toBe(ONBOARDING_STAGE_FIRST_CONTACT);
    const raw = await readFile(onboardingStatePath(), 'utf8');
    expect(JSON.parse(raw)).toEqual({ stage: ONBOARDING_STAGE_FIRST_CONTACT });
  });
});
