import { z } from 'zod';
import { ProfileZ, GateZ } from './profile.js';
import { TierZ } from './state.js';

/**
 * Grammar for a pack id: `<scope>/<name>`, mirroring npm scoping.
 * Internal packs use the `cadence` scope (e.g. `cadence/core-skills`);
 * `@scope/name` is reserved for third-party packs later — same grammar,
 * no special-casing. See docs/packs-design.md §5 I-1.
 *
 * Exported so resolvers can validate a config-supplied id *before* using it
 * to build a filesystem path — a config id never passes through
 * `PackManifestZ` itself (that only validates the manifest's own `id`
 * field, a different string), so without this a malformed
 * `config.packs.enabled` entry (e.g. `../../etc`) would reach a path join
 * unchecked.
 */
export const PACK_ID_GRAMMAR = /^@?[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;

/** Validate a bare pack id string (e.g. a `config.packs.enabled` entry) against {@link PACK_ID_GRAMMAR}. */
export function isValidPackId(id: string): boolean {
  return PACK_ID_GRAMMAR.test(id);
}

/**
 * A single additive gate delta a pack contributes for one (profile, tier)
 * cell. Additive only — there is deliberately no `remove`/`override`/`set`
 * key anywhere in this schema. See docs/packs-design.md §3, §5 I-3.
 */
const PackGateDeltaZ = z
  .object({
    profile: ProfileZ,
    tier: TierZ,
    add: z.array(GateZ),
  })
  .strict();

/**
 * A pack manifest: the resolved shape a pack id points to on disk.
 * `.strict()` deliberately fails closed on any unrecognized top-level key —
 * see docs/packs-design.md §5 I-2/I-3 and dec-20260822-018. There is no
 * `remove`, `override`, or `set` key to leave unenforced by mistake.
 */
export const PackManifestZ = z
  .object({
    id: z.string().regex(PACK_ID_GRAMMAR),
    version: z.string(),
    integrity: z.string().optional(),
    skillAudit: z
      .object({
        required: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    gates: z.array(PackGateDeltaZ).optional(),
    commands: z.array(z.string()).optional(),
  })
  .strict();

export type PackManifest = z.infer<typeof PackManifestZ>;
