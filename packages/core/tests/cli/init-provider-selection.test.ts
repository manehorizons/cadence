import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

function readConfig(root: string): { text: string; cfg: any } {
  const text = readFileSync(join(root, '.cadence/config.json'), 'utf8');
  return { text, cfg: JSON.parse(text) };
}

function readDecisions(root: string): any[] {
  const path = join(root, '.cadence/intelligence/decisions.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return raw.decisions;
}

/** Writes a sentinel script + returns the CADENCE_HOST_WIRE_CMD override env
 * that makes `maybeWireHost`'s spawn write a WIRED marker file instead of
 * actually invoking the real host-install subprocess (mirrors the pattern in
 * init-full.test.ts / onboard.test.ts). */
async function sentinelHostWireEnv(root: string): Promise<NodeJS.ProcessEnv> {
  const sentinel = join(root, 'sentinel.cjs');
  await writeFile(
    sentinel,
    "require('fs').writeFileSync(require('path').join(process.cwd(),'WIRED'),'ok');",
  );
  return { CADENCE_HOST_WIRE_CMD: JSON.stringify([process.execPath, sentinel]) };
}

const FAKE_KEY = 'sk-ant-test-DO-NOT-PERSIST';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence init --verifier-provider (phase 265, T3)', () => {
  it('265-01/AC-2: --verifier-provider host-cli writes host-cli to config.json (this repo\'s own live deep-verify provider)', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--verifier-provider', 'host-cli'], active.root, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('host-cli');
  });

  it('265-01/AC-3: --verifier-provider host-cli records a retrievable decision, without a recommendationId', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--verifier-provider', 'host-cli'], active.root, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    const decisions = readDecisions(active.root);
    expect(decisions).toHaveLength(1);
    const d = decisions[0];
    expect(d.recommendationId).toBeUndefined();
    expect(d.title).toMatch(/host-cli/);
    expect(d.rationale.length).toBeGreaterThan(0);
    expect(d.status).toBe('active');
  });

  it('265-01/AC-2: --verifier-provider wins over --activate even when a key is present', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--activate', '--verifier-provider', 'local'],
      active.root,
      { ANTHROPIC_API_KEY: FAKE_KEY },
    );
    expect(r.code).toBe(0);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('local');
  });

  it('265-01/AC-2: an unknown --verifier-provider value is refused with exit 2 and a clear stderr message, without writing anything', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--verifier-provider', 'bogus'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/Unknown --verifier-provider: bogus/);
  });

  it('265-01/AC-2: --verifier-provider never prompts, even when CADENCE_PROMPTER_SCRIPT is set (the flag settles it outright)', async () => {
    active = await tempRepo();
    // A single scripted answer that is NOT a valid provider name — if the
    // resolver mistakenly fell through to the prompt path anyway, this
    // answer would either get rejected (still consumed) or, if further
    // ask() calls happened, exhaust the prompter. Asserting the flag's own
    // value won regardless proves the prompt path was never entered.
    const r = await run(
      ['init', '--name=demo', '--verifier-provider', 'anthropic'],
      active.root,
      { CADENCE_PROMPTER_SCRIPT: 'GARBAGE-NOT-A-PROVIDER', ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/exhausted/);
    expect(r.stderr).not.toMatch(/Not a provider/);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('anthropic');
  });
});

describe('cadence init non-interactive default-mock path (phase 265, T3, AC-2/AC-3)', () => {
  it('265-01/AC-2: non-TTY with no flags completes fast, writes mock, and prints nothing alarming', async () => {
    active = await tempRepo();
    const start = Date.now();
    const r = await run(['init', '--name=demo'], active.root, { ANTHROPIC_API_KEY: '' });
    const elapsedMs = Date.now() - start;
    expect(r.code).toBe(0);
    expect(elapsedMs).toBeLessThan(5000);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    // No interactive artifact and no ledger-write failure notice.
    expect(r.stdout).not.toMatch(/choose|select a provider/i);
    expect(r.stderr).not.toMatch(/could not record the provider-selection decision/);
  });

  it('265-01/AC-3: the non-interactive default-mock path still records a retrievable decision, without a recommendationId', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root, { ANTHROPIC_API_KEY: '' });
    expect(r.code).toBe(0);
    const decisions = readDecisions(active.root);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].recommendationId).toBeUndefined();
    expect(decisions[0].title).toMatch(/mock/);
  });
});

describe('cadence init interactive provider prompt (phase 265, T3, AC-1/AC-3)', () => {
  it("265-01/AC-1: the prompt's own question text lists all four providers with mock as a plain listed option, not singled out or shamed", () => {
    // ScriptedPrompter (used by every CADENCE_PROMPTER_SCRIPT-driven test in
    // this file) deliberately never echoes the question text to stdout —
    // only a real StdinPrompter does that (readline's own `question()`
    // writes the prompt to its output stream before waiting on stdin), so
    // asserting the wording is a source-level check, the same pattern
    // init-activate.test.ts's AC-3 already uses for planActivation/setPath.
    const src = readFileSync(join(__dirname, '../../src/cli/commands/init.ts'), 'utf8');
    expect(src).toMatch(/\[mock\/anthropic\/local\/host-cli\]/);
  });

  it('265-01/AC-1: mock is a normal, first-class answer through the prompt — no refusal, no extra confirmation, applies cleanly', async () => {
    active = await tempRepo();
    // No .claude/ workspace, so the host-wire step never prompts at all —
    // this test only exercises the provider-selection prompt's own two
    // answers. (The prompter-sharing regression coverage further down in
    // this file exercises the case where both prompts DO fire in one run.)
    const r = await run(['init', '--name=demo'], active.root, {
      CADENCE_PROMPTER_SCRIPT: 'mock\nn',
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/Not a provider/);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
  });

  it('265-01/AC-1: choosing a real provider through the prompt, with the broaden follow-up answered "y", applies it to every verifier gate (scope: all)', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root, {
      CADENCE_PROMPTER_SCRIPT: 'anthropic\ny',
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('anthropic');
    expect(cfg.codeReview.provider).toBe('anthropic');
    expect(cfg.planReview.provider).toBe('anthropic');
    expect(cfg.securityAudit.provider).toBe('anthropic');
    expect(cfg.perTaskVerifier.provider).toBe('anthropic');
    expect(r.stdout).toMatch(/real verification on: anthropic \(scope: all\)/);
  });

  it('265-01/AC-1: answering "N" (default) to the broaden follow-up keeps scope to deep-verify only', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root, {
      CADENCE_PROMPTER_SCRIPT: 'local\nN',
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('local');
    expect(cfg.codeReview.provider).toBe('mock');
  });

  it('265-01/AC-3: a prompt-driven selection is recorded as a decision reflecting the chosen provider and scope, without a recommendationId', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root, {
      CADENCE_PROMPTER_SCRIPT: 'local\ny',
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    const decisions = readDecisions(active.root);
    expect(decisions).toHaveLength(1);
    const d = decisions[0];
    expect(d.recommendationId).toBeUndefined();
    expect(d.title).toMatch(/local/);
    expect(d.title).toMatch(/all/);
  });

  it('265-01/AC-1: an unrecognized scripted answer to the provider question is rejected and defaults to mock rather than crashing or hanging', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root, {
      CADENCE_PROMPTER_SCRIPT: 'not-a-real-provider',
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/Not a provider: not-a-real-provider/);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
  });

  it("265-01/AC-3: an unrecognized scripted answer still records a decision, but its rationale honestly reflects that a prompter WAS invoked — not the 'no prompter available' default-path story", async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root, {
      CADENCE_PROMPTER_SCRIPT: 'not-a-real-provider',
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    const decisions = readDecisions(active.root);
    expect(decisions).toHaveLength(1);
    const d = decisions[0];
    expect(d.recommendationId).toBeUndefined();
    expect(d.title).toMatch(/mock/);
    // Must NOT claim the genuine non-interactive default-path story (that
    // path is exercised by the "non-TTY with no flags" describe block
    // above, whose rationale legitimately says exactly this) — a prompter
    // was available and asked here; only the answer was unrecognized.
    expect(d.rationale).not.toMatch(/no prompter available/);
    expect(d.rationale).not.toMatch(/non-interactive default/);
    // Positively identifies the invalid-answer story instead.
    expect(d.rationale).toMatch(/unrecognized answer/);
    expect(d.rationale).toMatch(/interactive init prompt/);
  });
});

describe('cadence init --activate / --full regression (phase 265, T3 — must stay unchanged)', () => {
  it('265-01/AC-2: --activate with a key still wires anthropic and never persists the key (unchanged from phase 110)', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--activate'], active.root, {
      ANTHROPIC_API_KEY: FAKE_KEY,
    });
    expect(r.code).toBe(0);
    const { text, cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('anthropic');
    expect(text).not.toContain(FAKE_KEY);
    expect(r.stdout).toMatch(/real verification on: anthropic/);
    expect(r.stdout).not.toMatch(/not real verification/i);
  });

  it('265-01/AC-2: --activate without a key still stays mock and prints the export hint (unchanged from phase 110)', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--activate'], active.root, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    expect(r.stdout).toMatch(/export ANTHROPIC_API_KEY/);
    expect(r.stdout).toMatch(/staying on mock/i);
  });

  it('265-01/AC-3: an --activate run also records a provider-selection decision alongside its unchanged config behavior', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--activate'], active.root, {
      ANTHROPIC_API_KEY: FAKE_KEY,
    });
    expect(r.code).toBe(0);
    const decisions = readDecisions(active.root);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].recommendationId).toBeUndefined();
    expect(decisions[0].title).toMatch(/anthropic/);
  });
});

describe('cadence init --full --verifier-provider interaction (phase 265, T3)', () => {
  it("265-01/AC-2: --full --verifier-provider local applies the flag (winning over --full's own activation) and the Full setup summary's activation line does not contradict the 'real verification on' block", async () => {
    active = await tempRepo();
    // ANTHROPIC_API_KEY unset so --full's own would-be anthropic activation
    // is not in play — isolates this to the explicit-flag-wins-over-full
    // interaction the review finding was about.
    const r = await run(
      ['init', '--name=demo', '--full', '--verifier-provider', 'local'],
      active.root,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).toBe(0);
    // The flag really won: config.json reflects local, not mock.
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('local');
    // "Real verification on" block correctly fired (resolvedProvider !== mock).
    expect(r.stdout).toMatch(/real verification on: local/);
    // The "Full setup summary" activation line must not contradict that —
    // it must not fall through to the --activate-only "not requested" text,
    // and must instead reflect that local was actually applied.
    expect(r.stdout).toContain('Full setup summary');
    expect(r.stdout).not.toContain('activation    skipped: --activate not requested');
    expect(r.stdout).toMatch(/activation\s+done: local/);
  });

  it('265-01/AC-2: --full --verifier-provider mock reports "done: mock (via --verifier-provider)", not the "skipped: --activate not requested" line (whole-branch review, Minor finding)', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--full', '--verifier-provider', 'mock'],
      active.root,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).toBe(0);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    expect(r.stdout).toContain('Full setup summary');
    expect(r.stdout).toContain('activation    done: mock (via --verifier-provider)');
    expect(r.stdout).not.toContain('activation    skipped: --activate not requested');
  });
});

describe('cadence init prompter-sharing regression (phase 265, whole-branch review, Important finding)', () => {
  it("265-01/AC-1: one CADENCE_PROMPTER_SCRIPT is shared correctly across both the provider prompt and the host-wire prompt in the same run — the host-wire question receives the LAST scripted answer, not an earlier provider-prompt answer", async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    const wireEnv = await sentinelHostWireEnv(active.root);
    // Three scripted answers, in the order the two prompts fire within one
    // run:
    //   1) "mock" — provider prompt, question 1 (provider name)
    //   2) "n"    — provider prompt, question 2 (broaden y/N)
    //   3) "y"    — host-wire prompt, its own single [Y/n] question
    // Before the fix, the host-wire step built a SECOND, independent
    // ScriptedPrompter starting back at cursor 0 (a fresh `makePrompter()`
    // call reading the same env var) — so its [Y/n] question would have
    // silently received answer #1 ("mock"), which is neither "" nor
    // "y"/"yes", so `doWire` would resolve false and the host would stay
    // unwired despite the script's real intent (answer #3, "y"). No crash,
    // no error — just a silently wrong answer applied to the wrong prompt.
    const r = await run(['init', '--name=demo'], active.root, {
      ...wireEnv,
      CADENCE_PROMPTER_SCRIPT: 'mock\nn\ny',
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/exhausted/);
    // Provider prompt correctly consumed answers 1 and 2.
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    // Host-wire prompt correctly received answer 3 ("y") — proof the same
    // prompter instance (not a fresh, cursor-reset one) served both prompts.
    expect(existsSync(join(active.root, 'WIRED'))).toBe(true);
  });

  it('265-01/AC-1: when the provider resolves via a flag (no provider prompt fires at all), the host-wire step still gets its own single prompt answer', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    const wireEnv = await sentinelHostWireEnv(active.root);
    // --verifier-provider settles the provider outright (selection.action
    // === 'use', never 'prompt'), so getPrompter() is never invoked during
    // provider resolution — the host-wire step must still be able to call
    // it for the first time here and get a working, non-exhausted prompter.
    const r = await run(
      ['init', '--name=demo', '--verifier-provider', 'mock'],
      active.root,
      { ...wireEnv, CADENCE_PROMPTER_SCRIPT: 'y', ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/exhausted/);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    expect(existsSync(join(active.root, 'WIRED'))).toBe(true);
  });
});

describe('cadence init host-wire prompter exhaustion degrades gracefully (phase 265, second whole-branch review pass, Finding 1)', () => {
  it("265-01/AC-1: a single-answer CADENCE_PROMPTER_SCRIPT written for the pre-existing host-wire [Y/n] prompt (e.g. 'y') is consumed by the NEW provider-selection prompt instead, exhausting the prompter before the host-wire step runs — init must still exit 0 with the scaffold intact and a loud stderr notice, not crash", async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    // Exactly ONE scripted answer, not a valid provider name and not
    // satisfying the provider+broaden question pair — reproduces the
    // reviewer's exact repro. No --wire-host/--skip-host-wire/--host flag:
    // this must go through the real interactive-decision path in
    // maybeWireHost, not an explicit-flag shortcut.
    const r = await run(['init', '--name=demo'], active.root, {
      CADENCE_PROMPTER_SCRIPT: 'y',
      ANTHROPIC_API_KEY: '',
    });
    // The scaffold succeeded — only the optional host-wire step degraded —
    // so the overall run must still report success.
    expect(r.code).toBe(0);
    // The provider prompt consumed the single answer, rejected it (not a
    // valid provider name), and fell through to the default-mock
    // resolution — proving the scaffold's own logic ran to completion
    // before the host-wire step ever touched the (now exhausted) prompter.
    expect(r.stderr).toMatch(/Not a provider: y/);
    // The scaffold itself is intact and valid.
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    // A loud, specific stderr notice about the host-wire failure — never a
    // silent swallow — naming the underlying exhaustion error and pointing
    // at the manual fallback.
    expect(r.stderr).toMatch(/could not complete host wiring/);
    expect(r.stderr).toMatch(/exhausted/);
    expect(r.stderr).toMatch(/Wire the host manually when ready/);
    // Must NOT have hit the CLI's top-level uncaught-error backstop (which
    // would print no "could not complete host wiring" context and exit 1
    // instead) — the pre-fix behavior this regression test guards against.
    expect(r.stderr).not.toMatch(/^ScriptedPrompter exhausted/m);
  });

  it('265-01/AC-1: after the degraded host-wire step, a second init refuses through the ordinary "already initialized" path (exit 2) — proof run 1 left a complete scaffold, not a partial one', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    const first = await run(['init', '--name=demo'], active.root, {
      CADENCE_PROMPTER_SCRIPT: 'y',
      ANTHROPIC_API_KEY: '',
    });
    expect(first.code).toBe(0);
    // A second `cadence init` against the same repo must refuse with the
    // ordinary "already initialized" signal (a *complete* scaffold from
    // run 1), not silently re-succeed or crash differently — proving run 1
    // did not leave a half-written `.cadence/` behind.
    const second = await run(['init', '--name=demo'], active.root, {});
    expect(second.code).toBe(2);
    expect(second.stderr).toMatch(/already initialized/i);
  });
});
