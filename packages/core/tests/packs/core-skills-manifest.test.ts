import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PackManifestZ } from '@thomas-powers-jr/cadence-types';
import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';
import { resolvePacks } from '../../src/packs/resolve.js';
import { runSkillAuditCheck } from '../../src/checks/skill-audit.js';
import { checkPacks, checkPackCommands } from '../../src/doctor/run.js';
import type { SettleContext } from '../../src/gates/types.js';

/**
 * Slice 5 (phase 294): tests against the real, committed
 * `.cadence/packs/cadence/core-skills/pack.json` and the real repo root --
 * not `tempRepo` fixtures -- proving AC-1/AC-3/AC-4/AC-5 against the actual
 * shipped manifest, distinct from `resolve.test.ts`'s fixture-based suite.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PACK_ID = 'cadence/core-skills';
const MANIFEST_PATH = join(REPO_ROOT, '.cadence/packs/cadence/core-skills/pack.json');

/** Minimal `SettleContext` stub covering only the fields `runSkillAuditCheck`
 *  reads. Mirrors the `ctx()` factory in `checks/skill-audit.test.ts`. */
function minimalCtx(): SettleContext {
  return {
    config: {
      skillAudit: { required: [] },
      telemetry: { skillInvocations: true },
    } as never,
    state: { skillAudit: { required: [], invoked: [] } } as never,
    draft: { requiredSkills: [] } as never,
    opts: {},
    emit: { skillAuditMiss: async () => {} },
    io: { err: () => {} },
  } as unknown as SettleContext;
}

describe('294-01 — cadence/core-skills: the first real pack', () => {
  it('294-01/AC-1: resolvePacks resolves the real committed manifest with source local', async () => {
    const config: Pick<CadenceConfig, 'packs'> = { packs: { enabled: [PACK_ID], disabled: [] } };
    const result = await resolvePacks(REPO_ROOT, config);
    expect(result).toHaveLength(1);
    const raw = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    expect(result[0]).toEqual({ id: PACK_ID, source: 'local', manifest: raw });

    // Pin the manifest's actual shape (D-AV/D-AW): commands only, no
    // skillAudit or gates key, so the resolved-pack fixture above can't
    // silently drift from the design intent it's supposed to prove.
    const resolved = result[0];
    if (resolved && 'manifest' in resolved) {
      expect(resolved.manifest.skillAudit).toBeUndefined();
      expect(resolved.manifest.gates).toBeUndefined();
      expect(resolved.manifest.commands).toEqual([
        'cadence-draft',
        'cadence-approve',
        'cadence-build',
        'cadence-settle',
      ]);
    } else {
      throw new Error('expected resolved[0] to carry a manifest');
    }
  });

  it('294-01/AC-4: disabled wins over enabled for the real manifest', async () => {
    const config: Pick<CadenceConfig, 'packs'> = {
      packs: { enabled: [PACK_ID], disabled: [PACK_ID] },
    };
    const result = await resolvePacks(REPO_ROOT, config);
    expect(result).toHaveLength(0);
  });

  it('294-01/AC-5: a malformed copy of the real manifest fails closed under .strict()', async () => {
    const raw = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    const malformed = { ...raw, unrecognizedTopLevelKey: true };
    const parsed = PackManifestZ.safeParse(malformed);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some(
          (i) => i.code === 'unrecognized_keys' && i.keys.includes('unrecognizedTopLevelKey'),
        ),
      ).toBe(true);
    }
  });

  it('294-01/AC-2: cadence doctor reports the enabled pack resolved with no command warning', async () => {
    const packsCheck = await checkPacks(REPO_ROOT);
    expect(packsCheck.severity).toBe('ok');
    expect(packsCheck.detail).toContain(PACK_ID);

    const commandsCheck = await checkPackCommands(REPO_ROOT);
    expect(commandsCheck.severity).toBe('ok');
  });

  it('294-01/AC-3: a commands-only pack contributes zero skillAudit.provenance entries', async () => {
    const config: Pick<CadenceConfig, 'packs'> = { packs: { enabled: [PACK_ID], disabled: [] } };
    const resolved = await resolvePacks(REPO_ROOT, config);
    // Prove the pack actually resolved -- otherwise an empty provenance
    // result would be equally consistent with "never resolved" as with
    // "resolved but declares no skillAudit.required", and this test
    // wouldn't distinguish the two.
    expect(resolved).toHaveLength(1);
    expect(resolved[0] && 'manifest' in resolved[0]).toBe(true);

    const result = await runSkillAuditCheck(minimalCtx(), resolved);
    expect(result.outcome).toBe('pass');
    expect(
      result.requiredWithProvenance.some((entry) => entry.source === `pack:${PACK_ID}`),
    ).toBe(false);
  });

  it('294-01/AC-6: docs/packs-design.md records Slice 5', async () => {
    const doc = await readFile(join(REPO_ROOT, 'docs/packs-design.md'), 'utf8');
    expect(doc).toContain('Slice 5 shipped (phase');
    expect(doc).toContain('the first real pack, `cadence/core-skills`');
  });
});
