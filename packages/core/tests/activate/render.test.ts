import { describe, it, expect } from 'vitest';
import { CadenceConfigZ, defaultConfig } from '@thomas-powers-jr/cadence-types';
import { planActivation } from '../../src/activate/plan.js';
import { renderText, renderJson } from '../../src/activate/render.js';
import type { ActivationResult } from '../../src/activate/render.js';

const base = CadenceConfigZ.parse({ ...defaultConfig });
const plan = planActivation({ provider: 'anthropic', scope: 'deep-verify', currentConfig: base });

describe('activate render (AC-3, AC-6)', () => {
  it('text shows the provider, next step, and a ping ✓', () => {
    const result: ActivationResult = { plan, wrote: true, keyMissing: false, ping: { ok: true } };
    const out = renderText(result);
    expect(out).toMatch(/anthropic/);
    expect(out).toMatch(/cadence settle run --deep/);
    expect(out).toMatch(/✓|verified|works/i);
  });

  it('text prints the export line when the key is missing', () => {
    const result: ActivationResult = { plan, wrote: true, keyMissing: true };
    expect(renderText(result)).toMatch(/export ANTHROPIC_API_KEY/);
  });

  it('text says "Already active" on a no-op (no changes)', () => {
    const noChange = planActivation({ provider: 'mock', scope: 'deep-verify', currentConfig: base });
    const out = renderText({ plan: noChange, wrote: false, keyMissing: false });
    expect(out).toMatch(/Already active/);
  });

  it('json carries provider, changed seams, keyMissing, and ping', () => {
    const result: ActivationResult = { plan, wrote: true, keyMissing: false, ping: { ok: false, reason: '401: bad key' } };
    const data = renderJson(result);
    expect(data).toMatchObject({
      provider: 'anthropic',
      changed: ['verifier'],
      keyMissing: false,
      ping: { ok: false, reason: '401: bad key' },
    });
  });
});

// Phase 211-01. AC-2: `cadence activate`'s key-missing message is
// CLAUDECODE-aware — when the resolved provider is `anthropic`, the key is
// missing, and the run is inside a live Claude Code session
// (`claudeCodeSession: true` on the ActivationResult), the human text names
// the Claude-Code-login-doesn't-supply-the-key confusion directly and
// suggests `--provider host-cli`, and the JSON carries
// `claudeCodeHostCliSuggested: true`. Absent/false must be byte-identical to
// today.
//
// NOTE: `claudeCodeSession` does not exist on `ActivationResult` yet (it is
// added in a later task) — these assertions are expected to fail until then.
describe('activate render — CLAUDECODE-aware messaging (AC-2)', () => {
  function anthropicResult(claudeCodeSession?: boolean): ActivationResult {
    return {
      plan,
      wrote: true,
      keyMissing: true,
      ...(claudeCodeSession !== undefined ? { claudeCodeSession } : {}),
    } as ActivationResult;
  }

  it('AC-2: text names the Claude Code login confusion and suggests host-cli when claudeCodeSession is true', () => {
    const out = renderText(anthropicResult(true));
    expect(out).toMatch(/host-cli/);
    expect(out).toMatch(/Claude Code/);
  });

  it('AC-2: json includes claudeCodeHostCliSuggested: true when claudeCodeSession is true', () => {
    const data = renderJson(anthropicResult(true));
    expect(data).toMatchObject({ claudeCodeHostCliSuggested: true });
  });

  it('AC-2: text and json omit the Claude Code clause / host-cli suggestion when claudeCodeSession is false or omitted', () => {
    for (const result of [anthropicResult(false), anthropicResult(undefined)]) {
      const out = renderText(result);
      expect(out).not.toMatch(/host-cli/);
      expect(out).not.toMatch(/Claude Code/);
      const data = renderJson(result);
      expect(data).not.toHaveProperty('claudeCodeHostCliSuggested');
    }
  });
});
