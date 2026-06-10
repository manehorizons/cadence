import { describe, it, expect } from 'vitest';
import { runWizard, type Ask, type Confirm } from '../../src/config-edit/wizard.js';
import { EDITABLE_FIELDS } from '../../src/config-edit/fields.js';
import { defaultConfig } from '@manehorizons/cadence-types';
import { bufferIO } from '../../src/services/io.js';

/** Build an `ask` that returns the queued answer for each field in order. */
function scriptedAsk(answers: string[]): Ask {
  let i = 0;
  return async () => answers[i++] ?? '';
}
const yes: Confirm = async () => true;
const no: Confirm = async () => false;

describe('runWizard', () => {
  // AC-8: a full walk with one change → apply, with the validated config + diff.
  it('AC-8: applies a confirmed change', async () => {
    const io = bufferIO();
    // profile keep, loopEnforcement→strict(1), rest keep
    const ask = scriptedAsk(['', '1', '', '', '']);
    const res = await runWizard(defaultConfig, EDITABLE_FIELDS, io, { ask, confirm: yes });
    expect(res.status).toBe('apply');
    if (res.status === 'apply') {
      expect(res.config.loopEnforcement).toBe('strict');
      expect(res.changes).toEqual([{ key: 'loopEnforcement', from: 'soft', to: 'strict' }]);
    }
  });

  // AC-8: declining at confirm → noop (no write).
  it('AC-8: decline yields noop', async () => {
    const io = bufferIO();
    const res = await runWizard(defaultConfig, EDITABLE_FIELDS, io, { ask: scriptedAsk(['1','','','','']), confirm: no });
    expect(res.status).toBe('noop');
  });

  // AC-8: no changes (all kept) → noop without calling confirm.
  it('AC-8: all-keep yields noop', async () => {
    const io = bufferIO();
    let confirmCalled = false;
    const confirm: Confirm = async () => { confirmCalled = true; return true; };
    const res = await runWizard(defaultConfig, EDITABLE_FIELDS, io, { ask: scriptedAsk(['','','','','']), confirm });
    expect(res.status).toBe('noop');
    expect(confirmCalled).toBe(false);
  });

  // AC-3: an invalid answer re-prompts (the loop uses parseChoice).
  it('AC-3: re-prompts on an invalid answer for the same field', async () => {
    const io = bufferIO();
    // profile: first 'x' (invalid) then '1' (strict); rest keep
    const res = await runWizard(defaultConfig, EDITABLE_FIELDS, io, { ask: scriptedAsk(['x','1','','','','']), confirm: yes });
    expect(io.stderr()).toMatch(/number/i); // error surfaced before re-ask
    expect(res.status).toBe('apply');
    if (res.status === 'apply') expect(res.config.profile).toBe('strict');
  });

  // AC-8: a single-field walk only prompts that field.
  it('AC-8: a narrowed field list walks just that field', async () => {
    const io = bufferIO();
    const verifierOnly = EDITABLE_FIELDS.filter((f) => f.name === 'verifier');
    const res = await runWizard(defaultConfig, verifierOnly, io, { ask: scriptedAsk(['2']), confirm: yes });
    expect(res.status).toBe('apply');
    if (res.status === 'apply') expect(res.config.verifier.provider).toBe('anthropic');
  });
});
